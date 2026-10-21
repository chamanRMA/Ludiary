import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConnectorError } from "@ludiary/contracts";
import { parseLibraryFolders } from "../src/libraryfolders";
import { FIXTURES, LIB_D, LIB_E, STEAM_ROOT, steamTree } from "./helpers";

describe("parseLibraryFolders", () => {
  it("reads the new format (path and apps)", () => {
    const text = steamTree()[`${STEAM_ROOT}\\steamapps\\libraryfolders.vdf`] as string;
    expect(parseLibraryFolders(text)).toEqual([STEAM_ROOT, LIB_D, LIB_E]);
  });
  it("reads the old format and ignores non-numeric keys", () => {
    const text = readFileSync(join(FIXTURES, "vdf", "libraryfolders-old.vdf"), "utf8");
    expect(parseLibraryFolders(text)).toEqual([LIB_D, LIB_E]);
  });
  it("drops relative paths, empty paths, control characters and duplicates", () => {
    const text =
      '"libraryfolders" { "0" { "path" "relative\\\\x" } "1" "" "2" "D:\\\\a\\nb" "3" "D:\\\\Lib" "4" "d:/lib/" }';
    expect(parseLibraryFolders(text)).toEqual(["D:\\Lib"]);
  });
  it("returns nothing without the root key and fails on malformed text", () => {
    expect(parseLibraryFolders('"other" { "0" "D:\\\\x" }')).toEqual([]);
    expect(() => parseLibraryFolders('"libraryfolders" {')).toThrow(ConnectorError);
  });
  it("caps the number of libraries at 64", () => {
    let body = "";
    for (let i = 0; i < 100; i++) body += `"${i}" "D:\\\\L${i}" `;
    expect(parseLibraryFolders(`"libraryfolders" { ${body} }`)).toHaveLength(64);
  });
});

describe("UNC and device paths", () => {
  // VDF escapes every backslash, so the decoded value is exactly the path given here.
  const vdf = (p: string): string => p.split(String.fromCharCode(92)).join(String.fromCharCode(92, 92));
  it("are dropped so the core never stats the network (ADR 72)", () => {
    const bs = String.fromCharCode(92);
    const bad = [
      `${bs}${bs}server${bs}share`,
      `${bs}${bs}?${bs}D:${bs}Lib`,
      `${bs}${bs}.${bs}D:${bs}Lib`,
      `${bs}${bs}?${bs}UNC${bs}server${bs}share`,
      "//server/share",
    ];
    const entries = [...bad, `D:${bs}Lib`].map((p, n) => `"${n}" "${vdf(p)}"`).join(" ");
    expect(parseLibraryFolders(`"libraryfolders" { ${entries} }`)).toEqual([`D:${bs}Lib`]);
  });
});
