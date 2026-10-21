import { spawn } from "node:child_process";
import type { UserDialogs } from "@ludiary/contracts";

/** UserDialogs through `ludiary-tray.exe --dialog` (ADR 64): Ludiary.exe has no console and no window of its own. */
export class HelperProcessDialogs implements UserDialogs {
  constructor(private readonly helperPath: string) {}

  showError(title: string, body: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Not windowsHide: the helper is a GUI program and the message box must be visible.
      const child = spawn(this.helperPath, ["--dialog"], { stdio: ["pipe", "ignore", "ignore"] });
      child.once("error", reject);
      child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`dialog helper exited with code ${code}`))));
      child.stdin.end(JSON.stringify({ kind: "error", title, body }) + "\n");
    });
  }
}
