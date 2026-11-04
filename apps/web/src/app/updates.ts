// Texts of the updater (ADR 90 point 10). Pure functions: the components only render what they return.
import type { UpdateModeDto, UpdateStatusDto } from "@ludiary/api-contract";

export const UPDATE_MODES: readonly UpdateModeDto[] = ["auto", "notify", "off"];
/** Where "Novedades" opens (outside the app: the SPA never paints remote text, CSP of ADR 68 and invariant 9). */
export const releaseNotesUrl = (version: string): string => `https://github.com/chamanRMA/Ludiary/releases/tag/v${version}`;

export interface StatusLine {
  key: string;
  params: Record<string, string | number>;
}

/** The one line of the status area. `time` is the already formatted "x ago". */
export function statusLine(s: UpdateStatusDto, time: string): StatusLine {
  const version = s.latest ?? "";
  switch (s.state) {
    case "unsupported":
      return { key: "updates.state.unsupported", params: {} };
    case "checking":
      return { key: "updates.state.checking", params: {} };
    case "up-to-date":
      return { key: "updates.state.upToDate", params: { time } };
    case "available":
      return { key: s.latestFailedBefore ? "updates.state.availableFailedBefore" : "updates.state.available", params: { version } };
    case "downloading":
      return { key: "updates.state.downloading", params: { version, percent: s.progress ?? 0 } };
    case "ready":
      return { key: "updates.state.ready", params: { version } };
    case "failed":
      return { key: "updates.state.failed", params: { code: s.error ?? "unknown" } };
    case "rolled-back":
    case "idle":
      return { key: "updates.state.idle", params: {} };
  }
}

/** Text key for an error code of the status, falling back to the generic one. */
export const errorKey = (code: string | undefined, exists: (key: string) => boolean): string => (code && exists(`updates.error.${code}`) ? `updates.error.${code}` : "updates.error.unknown");

/** The notice card (one time): asks for a mode when the user has not chosen one and never saw the card (point 5). */
export const needsChoice = (s: UpdateStatusDto): boolean => s.state !== "unsupported" && s.mode === null && !s.noticeSeen;

/** Notices of the last update, shown once until acknowledged (point 10). */
export function updateNotices(s: UpdateStatusDto): { kind: "updated" | "rolledBack" | "downgraded"; params: Record<string, string> }[] {
  return [
    ...(s.updated ? [{ kind: "updated" as const, params: { version: s.updated } }] : []),
    ...(s.rolledBack ? [{ kind: "rolledBack" as const, params: { to: s.rolledBack.to, from: s.rolledBack.from } }] : []),
    ...(s.downgraded ? [{ kind: "downgraded" as const, params: {} }] : []),
  ];
}

/** Polling is only needed while something is moving. */
export const isBusy = (s: UpdateStatusDto | undefined): boolean => s?.state === "checking" || s?.state === "downloading";
