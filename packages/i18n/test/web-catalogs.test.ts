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
