import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const info = (o: Record<string, unknown>): string => JSON.stringify(o);
export const task = (path: string, extra: Record<string, unknown> = {}) => ({ isPrimary: true, type: "FileTask", path, ...extra });
export const GAME = "C:\\Games\\Fake Quest";
export const gameInfo = (id: string, extra: Record<string, unknown> = {}) =>
  info({ gameId: id, rootGameId: id, name: `Fake ${id}`, playTasks: [task("game.exe")], ...extra });

// ---- ADR 77: invented account values. Token answers are built here, not stored as fixtures, because the fixture
// privacy check rejects any access_token/refresh_token with a value.
export const CODE = "gog-test-auth-code-0001";
export const ACCESS = "gog-test-access-token-" + "a".repeat(64);
export const REFRESH = "gog-test-refresh-token-" + "b".repeat(64);
export const REFRESH_2 = "gog-test-refresh-token-2-" + "c".repeat(64);
export const tokenBody = (refresh = REFRESH_2, access = ACCESS) => ({
  access_token: access,
  refresh_token: refresh,
  expires_in: 3600,
  token_type: "bearer",
  user_id: "10000000000000001",
  session_id: "fictional",
});
export const readJson = (...parts: string[]): unknown =>
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", ...parts), "utf8"));

// libuv quote_cmd_arg, reimplemented: the inverse of the CRT rules (ADR 76).
export function quote(arg: string): string {
  if (arg === "") return '""';
  if (!/[	 "]/.test(arg)) return arg;
  let out = '"';
  let n = 0;
  for (const ch of arg) {
    if (ch === "\\") n++;
    else if (ch === '"') {
      out += "\\".repeat(n * 2 + 1) + '"';
      n = 0;
    } else {
      out += "\\".repeat(n) + ch;
      n = 0;
    }
  }
  return out + "\\".repeat(n * 2) + '"';
}
