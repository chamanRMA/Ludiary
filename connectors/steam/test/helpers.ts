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
