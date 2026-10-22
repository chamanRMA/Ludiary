import { expect, it } from "vitest";
import { connectorCatalogs } from "../src/connectors";

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
const es = connectorCatalogs.es as Record<string, string>;
const en = connectorCatalogs.en as Record<string, string>;

it("connector catalogs: same keys in Spanish and English", () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
});

it("connector catalogs: keys under connectors.*, no empty texts, same placeholders", () => {
  for (const key of Object.keys(es)) {
    expect(key.startsWith("connectors."), key).toBe(true);
    expect(es[key]?.trim(), key).not.toBe("");
    expect(en[key]?.trim(), key).not.toBe("");
    expect(placeholders(es[key] ?? ""), key).toEqual(placeholders(en[key] ?? ""));
  }
});
