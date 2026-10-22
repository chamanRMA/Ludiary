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
    });
  });
  it("never exposes LastOwner", () => {
    const owner = "7656119" + "8".repeat(10);
    const m = parseAppManifest(acf(`"appid" "1" "LastOwner" "${owner}" "installdir" "X"`));
    expect(JSON.stringify(m)).not.toContain(owner);
    expect(Object.keys(m).sort()).toEqual(["appId", "installDir", "name"]);
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
