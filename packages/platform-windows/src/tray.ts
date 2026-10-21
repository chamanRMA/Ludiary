import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import type { TrayHost, TrayState } from "@ludiary/contracts";

interface HelperMessage {
  type: "ready" | "click" | "error";
  id?: string;
  message?: string;
}

/**
 * TrayHost that drives the Go helper (ludiary-tray.exe) over stdio, one JSON object per line (ADR 45).
 * The helper dies when our stdin closes, so it cannot outlive the server.
 */
export class HelperProcessTrayHost implements TrayHost {
  private child: ChildProcessByStdio<Writable, Readable, null> | null = null;
  private clickHandler: (id: string) => void = () => {};
  private lostHandler: (reason: string) => void = () => {};
  private stopping = false;

  constructor(private readonly helperPath: string) {}

  onClick(handler: (itemId: string) => void): void {
    this.clickHandler = handler;
  }

  onLost(handler: (reason: string) => void): void {
    this.lostHandler = handler;
  }

  start(state: TrayState): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.helperPath, [], {
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
      this.child = child;
      let ready = false;
      let buffer = "";

      const timer = setTimeout(() => reject(new Error("tray helper did not report ready in 10 s")), 10_000);
      child.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        if (!ready) reject(new Error(`tray helper exited before ready (code ${code})`));
        else if (!this.stopping) this.lostHandler(`tray helper exited (code ${code})`);
      });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buffer += chunk;
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let msg: HelperMessage;
          try {
            msg = JSON.parse(line) as HelperMessage;
          } catch {
            continue;
          }
          if (msg.type === "ready" && !ready) {
            ready = true;
            clearTimeout(timer);
            resolve();
          } else if (msg.type === "click" && msg.id) {
            this.clickHandler(msg.id);
          }
        }
      });
      this.update(state);
    });
  }

  update(state: TrayState): void {
    const stdin = this.child?.stdin;
    if (!stdin || stdin.destroyed) return;
    stdin.write(JSON.stringify({ type: "state", tooltip: state.tooltip, items: state.items }) + "\n");
  }

  stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (!child || child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      child.once("exit", () => resolve());
      child.stdin.write(JSON.stringify({ type: "quit" }) + "\n");
      child.stdin.end();
      setTimeout(() => {
        child.kill();
        resolve();
      }, 2_000).unref();
    });
  }
}
