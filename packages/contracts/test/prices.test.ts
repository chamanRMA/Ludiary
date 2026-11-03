import { describe, expect, it } from "vitest";
import { checkPriceServiceManifest, type I18nKey, type PriceService } from "../src";

const good = {
  id: "itad",
  nameKey: "connectors.itad.name" as I18nKey,
  apiHosts: ["api.isthereanydeal.com"],
  authHosts: ["isthereanydeal.com"],
  linkHosts: ["itad.link", "isthereanydeal.com"],
  mediaHosts: ["assets.isthereanydeal.com"],
  connection: { steps: [] },
} as unknown as PriceService;

describe("checkPriceServiceManifest (ADR 86)", () => {
  it("accepts a well-formed manifest", () => {
    expect(checkPriceServiceManifest(good)).toEqual([]);
  });
  it.each(["apiHosts", "authHosts", "linkHosts"] as const)("rejects empty and malformed %s", (field) => {
    expect(checkPriceServiceManifest({ ...good, [field]: [] })).toEqual([`${field} must not be empty`]);
    for (const bad of ["https://x.com", "X.com", "x.com:443", "localhost"]) {
      expect(checkPriceServiceManifest({ ...good, [field]: [bad] })).toHaveLength(1);
    }
  });
  it("accepts empty mediaHosts and rejects malformed ones (ADR 86 point 17)", () => {
    expect(checkPriceServiceManifest({ ...good, mediaHosts: [] })).toEqual([]);
    for (const bad of ["https://x.com", "X.com", "x.com:443", "localhost"]) {
      expect(checkPriceServiceManifest({ ...good, mediaHosts: [bad] })).toHaveLength(1);
    }
  });
  it("rejects a missing connection, an empty nameKey and an unknown id", () => {
    expect(checkPriceServiceManifest({ ...good, connection: undefined } as unknown as PriceService)).toHaveLength(1);
    expect(checkPriceServiceManifest({ ...good, nameKey: "" as I18nKey })).toHaveLength(1);
    expect(checkPriceServiceManifest({ ...good, id: "x" } as unknown as PriceService)).toHaveLength(1);
  });
});
