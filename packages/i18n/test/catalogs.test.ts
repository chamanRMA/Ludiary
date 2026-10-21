import { expect, it } from "vitest";
import en from "../locales/en.json";
import es from "../locales/es.json";

it("Spanish and English catalogs have the same keys and no empty texts (ADR 33, 49)", () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  for (const value of [...Object.values(es), ...Object.values(en)]) expect(value.trim()).not.toBe("");
});
