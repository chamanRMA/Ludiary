import { describe, expect, it } from "vitest";
import { ConnectorError } from "@ludiary/contracts";
import { parseAppManifest } from "../src/appmanifest";

const acf = (inner: string): string => `"AppState" { ${inner} }`;

describe("parseAppManifest", () => {
  it("reads appid, name and installdir", () => {
    expect(parseAppManifest(acf('"appid" "400" "name" "Portal" "installdir" "Portal"'))).toEqual({
      appId: "400",
      name: "Portal",
      installDir: "Portal",
      dlcAppIds: [],
      dlcDropped: 0,
    });
  });
  it("never exposes LastOwner", () => {
    const owner = "7656119" + "8".repeat(10);
    const m = parseAppManifest(acf(`"appid" "1" "LastOwner" "${owner}" "installdir" "X"`));
    expect(JSON.stringify(m)).not.toContain(owner);
    expect(Object.keys(m).sort()).toEqual(["appId", "dlcAppIds", "dlcDropped", "installDir", "name"]);
  });
  it("rejects a missing or non-numeric appid and a wrong root", () => {
    for (const t of [acf('"name" "x"'), acf('"appid" "12a"'), acf('"appid" "12345678901"'), '"Other" { "appid" "1" }']) {
      expect(() => parseAppManifest(t)).toThrow(ConnectorError);
    }
  });
  it("treats unsafe installdir values as absent", () => {
    for (const d of ["..", ".", "..\\\\x", "a/b", "C:\\\\x", ""]) {
      expect(parseAppManifest(acf(`"appid" "1" "installdir" "${d}"`)).installDir).toBeNull();
    }
  });
  it("cleans the name", () => {
    expect(parseAppManifest(acf('"appid" "1" "name" "  A\\nB  "')).name).toBe("A B");
    expect(parseAppManifest(acf('"appid" "1" "name" ""')).name).toBeNull();
  });
});

describe("InstalledDepots.dlcappid (ADR 84)", () => {
  const acf = (depots: string) => `"AppState" { "appid" "10" "InstalledDepots" { ${depots} } }`;
  it("keeps valid distinct ids in order and ignores the rest", () => {
    const m = parseAppManifest(
      acf('"1" { "dlcappid" "11" } "2" { "manifest" "9" } "3" { "dlcappid" "x" } "4" { "dlcappid" "10" } "5" { "dlcappid" "11" } "6" "text" "7" { "dlcappid" "12" }'),
    );
    expect(m.dlcAppIds).toEqual(["11", "12"]);
  });
  it("no InstalledDepots gives none, and a deep or huge file is rejected by the parser", () => {
    expect(parseAppManifest('"AppState" { "appid" "10" }').dlcAppIds).toEqual([]);
    expect(() => parseAppManifest(acf('"1" '.repeat(1) + "{ ".repeat(40)))).toThrow();
  });
});
