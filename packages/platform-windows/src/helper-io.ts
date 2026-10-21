import { spawn } from "node:child_process";

/** Runs a one-shot mode of ludiary-tray.exe: writes `input` to stdin, returns stdout (UTF-8). */
export type HelperRunner = (args: readonly string[], input: string, opts?: { timeoutMs?: number; visible?: boolean }) => Promise<string>;

/** A runner that also owns the processes it started, so the server can end them on shutdown. */
export interface DisposableHelperRunner extends HelperRunner {
  /** Kills every helper still running (e.g. an open folder dialog) and rejects further calls. Idempotent. */
  dispose(): void;
}

const MAX_OUTPUT_BYTES = 256 * 1024;

export function createHelperRunner(helperPath: string): DisposableHelperRunner {
  const running = new Set<{ kill: () => void; abort: () => void }>();
  let disposed = false;
  const run: HelperRunner = (args, input, opts = {}) =>
    new Promise((resolve, reject) => {
      if (disposed) {
        reject(new Error("helper runner disposed"));
        return;
      }
      // The folder dialog is a GUI program and must stay visible; the registry mode has no window anyway.
      const child = spawn(helperPath, [...args], {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: opts.visible !== true,
      });
      let output = "";
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        running.delete(handle);
        if (timer) clearTimeout(timer);
        fn();
      };
      const handle = {
        kill: () => child.kill(),
        abort: () => finish(() => reject(new Error("helper runner disposed"))),
      };
      running.add(handle);
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            child.kill();
            finish(() => reject(new Error("helper timed out")));
          }, opts.timeoutMs)
        : null;
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        output += chunk;
        if (output.length > MAX_OUTPUT_BYTES) {
          child.kill();
          finish(() => reject(new Error("helper output too large")));
        }
      });
      child.once("error", (err) => finish(() => reject(err)));
      // Exit codes 1 and 2 still carry a JSON error body, so the caller parses stdout whatever the code.
      child.once("close", () => finish(() => resolve(output)));
      child.stdin.on("error", () => {});
      child.stdin.end(input + "\n");
    });
  return Object.assign(run, {
    dispose() {
      disposed = true;
      for (const h of [...running]) {
        h.abort(); // reject first: the 'close' that follows the kill must not read as an empty answer
        h.kill();
      }
    },
  });
}
