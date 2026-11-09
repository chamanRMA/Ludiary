// updates/state.json (Node writes it; ADR 90 point 12 and point 18, M3) and versions.json (Go writes it; Node only reads it).
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { join } from "node:path";
import { compareVersions, isVersion } from "./version";

export type UpdatePhase = "idle" | "downloading" | "ready" | "applying" | "failed" | "rolled-back";
const PHASES: readonly string[] = ["idle", "downloading", "ready", "applying", "failed", "rolled-back"];

export interface UpdateState {
  state: UpdatePhase;
  /** The version downloaded or being downloaded. */
  version?: string;
  from?: string;
  to?: string;
  /** Error or reason code, e.g. `hash-mismatch`, `install-interrupted`; for `rolled-back` the exit code of the failed start. */
  code?: string;
  /** M4: "Buscar ahora" may retry a version that already failed; Go accepts a bad version only when it is named here. */
  retryBad?: string;
  /** Version installed by the last update, shown once (point 10). */
  updated?: string;
  /** Downgrade by hand (M8): shown once. */
  downgraded?: boolean;
}

export const updatesDir = (dataDir: string) => join(dataDir, "updates");
export const updateFolder = (dataDir: string, version: string) => join(updatesDir(dataDir), version);
const statePath = (dataDir: string) => join(updatesDir(dataDir), "state.json");

/** Anything unreadable or odd counts as idle (point 12). */
export function readState(dataDir: string): UpdateState {
  try {
    const p = JSON.parse(readFileSync(statePath(dataDir), "utf8")) as Record<string, unknown>;
    if (typeof p["state"] !== "string" || !PHASES.includes(p["state"])) return { state: "idle" };
    const out: UpdateState = { state: p["state"] as UpdatePhase };
    for (const k of ["version", "from", "to", "retryBad", "updated"] as const) if (isVersion(p[k])) out[k] = p[k];
    if (typeof p["code"] === "string" && p["code"].length <= 64) out.code = p["code"];
    if (p["downgraded"] === true) out.downgraded = true;
    return out;
  } catch {
    return { state: "idle" };
  }
}

/** Temporary file, flush, rename (M3). */
export function writeState(dataDir: string, state: UpdateState): void {
  mkdirSync(updatesDir(dataDir), { recursive: true });
  const tmp = `${statePath(dataDir)}.tmp`;
  const fd = openSync(tmp, "w");
  try {
    writeSync(fd, JSON.stringify(state));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, statePath(dataDir));
}

export interface VersionsFile {
  active: string;
  previous: string | null;
  trial: boolean;
  rollingBack: { from: string; to: string } | null;
  applyingTo: string | null;
  badVersions: string[];
}

/** Read-only view of Go's file. null: absent or invalid (a development build, or a flat installation). */
export function readVersionsFile(installRoot: string): VersionsFile | null {
  try {
    const p = JSON.parse(readFileSync(join(installRoot, "versions.json"), "utf8")) as Record<string, unknown>;
    if (!isVersion(p["active"])) return null;
    const rb = p["rollingBack"] as { from?: unknown; to?: unknown } | undefined | null;
    const ap = p["applying"] as { to?: unknown } | undefined | null;
    return {
      active: p["active"],
      previous: isVersion(p["previous"]) ? p["previous"] : null,
      trial: p["trial"] === true,
      rollingBack: rb && isVersion(rb.from) && isVersion(rb.to) ? { from: rb.from, to: rb.to } : null,
      applyingTo: ap && isVersion(ap.to) ? ap.to : null,
      badVersions: Array.isArray(p["badVersions"]) ? p["badVersions"].filter(isVersion) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Brings state.json in line with what the stable launcher did (Go writes versions.json; point 18, A1/M8). Runs at every start
 * of the server and of the inner launcher. Returns the (possibly rewritten) state.
 */
export function reconcileState(dataDir: string, installRoot: string, current: string, log: (level: "info" | "warn" | "error", msg: string) => void): UpdateState {
  const st = readState(dataDir);
  const vf = readVersionsFile(installRoot);
  let next: UpdateState | null = null;
  if (st.state === "applying" && st.to) {
    if (vf?.rollingBack) {
      next = { state: "failed", to: st.to, code: "rollback-interrupted" };
    } else if (vf && vf.active === st.to) {
      if (!vf.trial) next = { state: "idle", updated: st.to }; // the trial passed
      // trial still running: leave it
    } else if (compareVersions(st.to, current) <= 0) {
      next = compareVersions(st.to, current) === 0 ? { state: "idle", updated: st.to } : { state: "idle" }; // stale (point 23): the target is already installed or older, e.g. a manual install after a finished update
    } else if (!vf?.badVersions.includes(st.to) && existsSync(updateFolder(dataDir, st.to))) {
      next = { state: "ready", version: st.to }; // the installation was cut: the next cold start tries again, Go counts the attempts
    } else {
      // Go deletes the folder when the signature or the hash did not check out again, before it counts any attempt.
      next = { state: "failed", to: st.to, code: vf?.applyingTo === st.to || vf?.badVersions.includes(st.to) ? "install-interrupted" : "verify-failed" };
    }
  } else if ((st.state === "ready" || st.state === "downloading" || (st.state === "failed" && !vf?.rollingBack)) && (!(st.version ?? st.to) || compareVersions((st.version ?? st.to)!, current) <= 0)) {
    next = { state: "idle" };
  }
  // M8: a manual installation of an older version than the one it replaced.
  if (vf?.trial && vf.previous && compareVersions(vf.active, vf.previous) < 0 && vf.active === current && !st.downgraded) {
    next = { ...(next ?? st), downgraded: true };
  }
  if (!next) return st;
  log("info", `update state ${st.state} -> ${next.state}${next.code ? ` (${next.code})` : ""}`);
  writeState(dataDir, next);
  return next;
}
