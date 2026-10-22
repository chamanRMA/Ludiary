import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { webCatalogs } from "../src/web";

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

it("every literal t(\"…\") / key string used by the web exists in the catalog (invariant 6)", () => {
  const keys = new Set(Object.keys(webCatalogs.es));
  const missing: string[] = [];
  for (const file of sources(join(import.meta.dirname, "../../../apps/web/src"))) {
    const text = readFileSync(file, "utf8");
    // t("key"), labelKey/titleKey/bodyKey: "key" and connectors.<id>.* literals
    for (const m of text.matchAll(/\bt\(\s*"([a-zA-Z][\w.-]*)"/g)) if (!keys.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
    for (const m of text.matchAll(/(?:labelKey|titleKey|bodyKey)[:=]\s*"([\w.-]+)"/g)) if (!keys.has(m[1] as string)) missing.push(`${file}: ${m[1]}`);
  }
  expect(missing).toEqual([]);
});
