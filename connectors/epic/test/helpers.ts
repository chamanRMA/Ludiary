import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ScanRoot } from "@ludiary/contracts";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
export const readFixture = (...parts: string[]): string => readFileSync(join(fixtures, ...parts), "utf8");
export const readJson = (...parts: string[]): unknown => JSON.parse(readFixture(...parts));

// Invented values (ADR 78, point 10): hexadecimals of 32 that start with 24 zeros.
export const NS = "000000000000000000000000000000a1";
export const CAT = "00000000000000000000000000000001";
export const APP = "TestGame01";
export const ID = `${NS}:${CAT}:${APP}`;
export const CODE = "00000000000000000000000000c0de01";
export const ACCESS = "eg1~epic-test.access.token";
export const REFRESH = "eg1~epic-test.refresh.token";
export const REFRESH_2 = "eg1~epic-test.refresh.token-2";
export const APP_TOKEN = "eg1~epic-test.client.token";

export const DATA = "C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data";
export const MANIFESTS = `${DATA}\\Manifests`;
export const LIB = "D:\\Epic Games ñ";
export const dataRoot: ScanRoot = { origin: "discovered", declarationId: "epic-launcher-data", path: DATA, tag: "manifests" };
export const libRoot: ScanRoot = { origin: "discovered", declarationId: "epic-launcher-data", path: LIB, tag: "library" };

/** A .item as JSON text; `over` replaces or (with undefined) removes fields. */
export const item = (over: Record<string, unknown> = {}): string => {
  const base: Record<string, unknown> = JSON.parse(readFixture("items", "game.item"));
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete base[k];
    else base[k] = v;
  }
  return JSON.stringify(base);
};
