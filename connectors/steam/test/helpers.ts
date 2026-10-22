import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadFixtureTree } from "@ludiary/connector-testkit";

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
export const STEAM_ROOT = "C:\\Program Files (x86)\\Steam";
export const LIB_D = "D:\\SteamLibrary";
export const LIB_E = "E:\\Juegos Ñandú\\SteamLibrary";

export function steamTree(): Record<string, string> {
  return loadFixtureTree(join(FIXTURES, "tree"));
}

export const STEAM_ID = "76561190000000000";
export const API_KEY = "0123456789abcdef0123456789abcdef";
export const NOW = Date.parse("2026-10-22T12:00:00Z");
export const CALLBACK = "http://ludiary.localhost:4780/connect/return?w=00000000-0000-4000-8000-000000000000";

export const readFixture = (...parts: string[]): string => readFileSync(join(FIXTURES, ...parts), "utf8");
export const readJson = <T = Record<string, unknown>>(...parts: string[]): T => JSON.parse(readFixture(...parts)) as T;
