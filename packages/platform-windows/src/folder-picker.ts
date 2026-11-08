import type { FilePicker, FolderPicker } from "@ludiary/contracts";
import type { HelperRunner } from "./helper-io";

const MAX_DIALOG_MS = 15 * 60_000;

/** Parses the answer of `ludiary-tray.exe --pick-folder`: {"path"} | {"cancelled":true} | {"error"}. */
export function parsePickFolderResponse(text: string): string | null {
  let data: unknown;
  try {
    data = JSON.parse(text.trim().split("\n")[0] ?? "");
  } catch {
    throw new Error("folder helper returned invalid JSON");
  }
  const obj = (data ?? {}) as { path?: unknown; cancelled?: unknown; error?: unknown };
  if (obj.cancelled === true) return null;
  if (typeof obj.path === "string" && /^([a-z]:[\\/]|\\\\[^\\/])/i.test(obj.path) && !obj.path.includes("\0")) {
    return obj.path;
  }
  throw new Error(`folder dialog failed (${typeof obj.error === "string" ? obj.error : "unexpected answer"})`);
}

/**
 * FolderPicker through `ludiary-tray.exe --pick-folder` (ADR 72). Only one dialog exists at a time: a second call
 * while one is open joins the same dialog instead of opening another.
 */
export class HelperProcessFolderPicker implements FolderPicker {
  private inFlight: Promise<string | null> | null = null;

  constructor(private readonly runHelper: HelperRunner) {}

  pick(opts: { title: string }): Promise<string | null> {
    if (this.inFlight) return this.inFlight;
    const run = this.runHelper(["--pick-folder"], JSON.stringify({ title: opts.title }), {
      timeoutMs: MAX_DIALOG_MS,
      visible: true,
    })
      .then(parsePickFolderResponse)
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = run;
    return run;
  }
}

/**
 * FilePicker through `ludiary-tray.exe --pick-file` (ADR 93): one .exe. The answer is untrusted like the folder one
 * (the core still checks extension, local disk and real path); the `*.exe` filter lives in the Go helper.
 */
export class HelperProcessFilePicker implements FilePicker {
  private inFlight: Promise<string | null> | null = null;

  constructor(private readonly runHelper: HelperRunner) {}

  pickExecutable(opts: { title: string; filterName: string }): Promise<string | null> {
    if (this.inFlight) return this.inFlight;
    const run = this.runHelper(["--pick-file"], JSON.stringify({ title: opts.title, filterName: opts.filterName }), {
      timeoutMs: MAX_DIALOG_MS,
      visible: true,
    })
      .then(parsePickFolderResponse)
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = run;
    return run;
  }
}
