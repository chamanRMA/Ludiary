import { expect, it } from "vitest";
import en from "../locales/web/en.json";
import es from "../locales/web/es.json";

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();

it("web catalogs: Spanish and English have the same keys (ADR 68)", () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
});

it("web catalogs: no empty texts and the same {placeholders} in both languages", () => {
  const spanish = es as Record<string, string>;
  const english = en as Record<string, string>;
  for (const key of Object.keys(spanish)) {
    expect(spanish[key]?.trim(), key).not.toBe("");
    expect(english[key]?.trim(), key).not.toBe("");
    expect(placeholders(spanish[key] ?? ""), key).toEqual(placeholders(english[key] ?? ""));
  }
});

import coreEn from "../locales/en.json";
import coreEs from "../locales/es.json";
import { connectorCatalogs } from "../src/connectors";
import { webCatalogs } from "../src/web";

it("web: nothing the server owns is defined twice, and every key the server can return has a text in es and en (ADR 74)", () => {
  const owned = (c: Record<string, string>, d: Record<string, string>) =>
    [...Object.keys(c).filter((k) => k.startsWith("core.errors.") || k.startsWith("connectors.common.errors.")), ...Object.keys(d)];
  for (const [lang, own, core, conn, web] of [
    ["es", es, coreEs, connectorCatalogs.es, webCatalogs.es],
    ["en", en, coreEn, connectorCatalogs.en, webCatalogs.en],
  ] as const) {
    const keys = owned(core as Record<string, string>, conn as Record<string, string>);
    expect(Object.keys(own).filter((k) => keys.includes(k)), `${lang} duplicated in web json`).toEqual([]);
    for (const k of keys) expect((web as Record<string, string>)[k], `${lang} ${k}`).toBeTruthy();
  }
});
