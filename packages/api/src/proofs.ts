import { createHmac, timingSafeEqual } from "node:crypto";

/** Actions the launcher may ask for (ADR 63). Nothing else is reachable through the launcher protocol. */
export type LauncherAction = "open-link" | "shutdown" | "version";
export const LAUNCHER_ACTIONS: readonly LauncherAction[] = ["open-link", "shutdown", "version"];

const mac = (key: Uint8Array, text: string) => createHmac("sha256", key).update(text, "utf8").digest("base64url");

/** Launcher -> server: proves knowledge of the installation token for this action, port and one-use nonce. */
export const launcherProof = (key: Uint8Array, action: LauncherAction, port: number, nonce: string) =>
  mac(key, `ludiary-launcher-v1\n${action}\n${port}\n${nonce}`);

/** Server -> launcher: proves the answer comes from the real server, bound to the same nonce. */
export const serverProof = (key: Uint8Array, action: LauncherAction, port: number, nonce: string, result: string) =>
  mac(key, `ludiary-server-v1\n${action}\n${port}\n${nonce}\n${result}`);

/** Constant-time comparison of two base64url proofs. */
export function proofsEqual(a: unknown, b: string): boolean {
  if (typeof a !== "string") return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
