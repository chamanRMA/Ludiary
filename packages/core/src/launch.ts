// Launching a game (ADR 40 rule 5, invariant 3, ADR 72). The only input is stored ids; the LaunchSpec never leaves here.
import { ConnectorError } from "@ludiary/contracts";
import type { LaunchContext, LaunchSpec, ResolvedLocation, StoreConnector } from "@ludiary/contracts";
import { DOUBLE_LAUNCH_MS, LAUNCH_ORDER, type Env } from "./env";
import { CoreError, toCoreError } from "./errors";
import type { LaunchTarget } from "./model";
import { effectiveLocale, readSettings } from "./settings";
import { insideAny } from "./validate";

const CONTROL = /\p{Cc}/u;
const URI_BAD = /[\p{Cc}\s"'<>\\^`{|}]/u;
const MAX_URI = 2048;
const MAX_ARGS = 64;
const MAX_ARG_LEN = 8192;

export interface LaunchService {
  launch(canonicalId: string, propertyId?: string, action?: "play" | "install"): Promise<{ status: "started" | "already-starting" }>;
}

function pickTarget(targets: readonly LaunchTarget[], propertyId: string | undefined, action: "play" | "install"): LaunchTarget {
  if (propertyId !== undefined) {
    const t = targets.find((x) => x.property.id === propertyId);
    if (!t) throw new CoreError("not-found", "Property does not belong to this game");
    return t;
  }
  const live = targets.filter(
    (t) =>
      t.property.kind === "game" &&
      t.property.removedAt === null &&
      (action === "play" ? t.installation !== null : t.installation === null && t.property.owned),
  );
  for (const store of LAUNCH_ORDER) {
    const t = live.find((x) => x.property.store === store);
    if (t) return t;
  }
  throw new CoreError(action === "play" ? "not-installed" : "action-unavailable", action === "play" ? "No installed property to launch" : "No owned, uninstalled property to install");
}

export function createLaunchService(env: Env): LaunchService {
  const { deps } = env;
  const lastStart = new Map<string, number>();

  async function resolveLauncherLocations(c: StoreConnector): Promise<{ launchers: ResolvedLocation[]; resolved: boolean }> {
    const mode = (await readSettings(env)).detection;
    if (mode !== "auto-and-manual" || !deps.locations) return { launchers: [], resolved: false };
    const out: ResolvedLocation[] = [];
    for (const decl of c.locations.filter((l) => l.purpose === "launcher")) {
      try {
        out.push(...(await deps.locations.resolve(decl)));
      } catch (e) {
        deps.log.warn("Could not resolve a launcher location", { connector: c.id, location: decl.id, error: e instanceof Error ? e.name : "unknown" });
      }
    }
    return { launchers: out, resolved: true };
  }

  function reject(c: StoreConnector, why: string): never {
    deps.log.warn("Launch specification rejected", { connector: c.id, reason: why });
    throw new CoreError("launch.rejected", `Launch specification rejected: ${why}`);
  }

  /** Rule 5 of ADR 40. Throws launch.rejected; otherwise the spec is safe to hand to ProcessLauncher. */
  async function checkSpec(c: StoreConnector, spec: unknown, allowedRoots: readonly string[]): Promise<LaunchSpec> {
    const launcher = deps.launcher;
    if (!launcher) throw new CoreError("action-unavailable", "This mode cannot launch games");
    if (!spec || typeof spec !== "object") return reject(c, "not an object");
    const s = spec as Record<string, unknown>;
    const kind = s.kind;
    if (kind !== "uri" && kind !== "exec") return reject(c, "unknown kind");
    if (!c.capabilities.launchKinds.includes(kind)) return reject(c, "kind not in launchKinds");
    if (!launcher.kinds.includes(kind)) return reject(c, "kind not supported by the platform");

    if (kind === "uri") {
      const uri = s.uri;
      if (typeof uri !== "string" || uri.length === 0 || uri.length > MAX_URI || URI_BAD.test(uri)) return reject(c, "malformed uri");
      const m = /^([a-z][a-z0-9+.-]*):/i.exec(uri);
      if (!m || !c.capabilities.uriSchemes.includes((m[1] ?? "").toLowerCase()) || m[1] !== (m[1] ?? "").toLowerCase()) {
        return reject(c, "uri scheme not allowed");
      }
      return { kind: "uri", uri };
    }

    const { executable, args, cwd } = s;
    if (typeof executable !== "string" || executable === "" || CONTROL.test(executable)) return reject(c, "bad executable");
    if (!deps.files.isAbsolute(executable)) return reject(c, "executable is not absolute");
    if (!Array.isArray(args) || args.length > MAX_ARGS) return reject(c, "bad args");
    for (const a of args) {
      if (typeof a !== "string" || a.length > MAX_ARG_LEN || CONTROL.test(a)) return reject(c, "argument with control characters");
    }
    if (!(await insideAny(deps.files, executable, allowedRoots))) return reject(c, "executable outside the allowed locations");
    let exists = false;
    try {
      exists = (await deps.files.scoped(allowedRoots).exists(executable)) && !(await deps.files.isDirectory(executable));
    } catch {
      exists = false;
    }
    if (!exists) return reject(c, "executable does not exist");
    if (cwd !== undefined) {
      if (typeof cwd !== "string" || CONTROL.test(cwd) || !deps.files.isAbsolute(cwd)) return reject(c, "bad cwd");
      if (!(await insideAny(deps.files, cwd, allowedRoots)) || !(await deps.files.isDirectory(cwd))) return reject(c, "cwd outside the allowed locations");
    }
    return { kind: "exec", executable, args: [...(args as string[])], ...(cwd !== undefined ? { cwd: cwd as string } : {}) };
  }

  return {
    async launch(canonicalId, propertyId, action = "play") {
      if (action !== "play" && action !== "install") throw new CoreError("invalid-input", "Unknown launch action");
      if (typeof canonicalId !== "string" || canonicalId === "") throw new CoreError("invalid-input", "Missing game id");
      if (propertyId !== undefined && (typeof propertyId !== "string" || propertyId === "")) {
        throw new CoreError("invalid-input", "Invalid property id");
      }
      const targets = await deps.library.getLaunchTargets(canonicalId);
      if (targets.length === 0) throw new CoreError("not-found", "Game not found");
      const target = pickTarget(targets, propertyId, action);
      const { property, installation } = target;
      if (property.kind === "dlc") throw new CoreError("action-unavailable", "Additional content cannot be played");
      if (action === "play") {
        if (property.removedAt !== null || installation === null) throw new CoreError("not-installed", "The game is not installed");
      } else {
        // ADR 74 point 7: install is for an owned property that is not installed.
        if (installation !== null) throw new CoreError("action-unavailable", "The game is already installed");
        if (!property.owned || property.removedAt !== null) throw new CoreError("action-unavailable", "The game is not owned");
      }
      if (property.store === "manual") throw new CoreError("action-unavailable", "Manual entries cannot be launched yet");

      const connector = env.connectors.get(property.store);
      if (!connector) throw new CoreError("action-unavailable", "No connector for this store");
      if (!connector.capabilities.actions.includes(action)) throw new CoreError("action-unavailable", `The store does not support ${action}`);
      if (!deps.launcher) throw new CoreError("action-unavailable", "This mode cannot launch games");

      const now = deps.clock.now();
      const clickKey = `${canonicalId}|${action}`;
      const last = lastStart.get(clickKey);
      if (last !== undefined && now - last < DOUBLE_LAUNCH_MS) return { status: "already-starting" };
      lastStart.set(clickKey, now); // also covers a second click while this one is still being resolved

      try {
        const { launchers, resolved } = await resolveLauncherLocations(connector);
        const allowedRoots = [...(installation ? [installation.installPath] : []), ...launchers.map((l) => l.path)];
        const ctx: LaunchContext = {
          signal: deps.clock.timeout(30_000),
          log: {
            debug: (m, f) => deps.log.debug(m, { connector: connector.id, ...f }),
            info: (m, f) => deps.log.info(m, { connector: connector.id, ...f }),
            warn: (m, f) => deps.log.warn(m, { connector: connector.id, ...f }),
          },
          locale: await effectiveLocale(env),
          launchers,
          launchersResolved: resolved,
          fs: deps.files.scoped(allowedRoots),
        };
        let spec: LaunchSpec | null;
        try {
          spec = await connector.resolveAction(
            {
              storeGameId: property.storeGameId,
              installed: installation !== null,
              installPath: installation?.installPath ?? null,
              launchData: installation?.launchData ?? null,
            },
            action,
            ctx,
          );
        } catch (e) {
          if (e instanceof ConnectorError) deps.log.warn("Connector could not resolve the action", { connector: connector.id, code: e.code });
          else deps.log.error("Connector failed while resolving the action", { connector: connector.id });
          throw toCoreError(e);
        }
        if (spec === null) throw new CoreError("action-unavailable", `The connector has no ${action} action for this property`);

        const safe = await checkSpec(connector, spec, allowedRoots);
        try {
          if (safe.kind === "uri") await deps.launcher.openUri(safe.uri);
          else await deps.launcher.exec({ executable: safe.executable, args: safe.args, ...(safe.cwd !== undefined ? { cwd: safe.cwd } : {}) });
        } catch (e) {
          deps.log.error("The platform could not start the game", { connector: connector.id, error: e instanceof Error ? e.name : "unknown" });
          throw new CoreError("internal", "The platform could not start the game", { cause: e });
        }
        return { status: "started" };
      } catch (e) {
        lastStart.delete(clickKey); // a failed attempt must not block the retry
        throw e;
      }
    },
  };
}
