import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spaCsp } from "@ludiary/api";
import { expect, it } from "vitest";
import { createConnectors, createPriceServices, unionMediaHosts } from "../src/connectors";

const viteConfig = join(dirname(fileURLToPath(import.meta.url)), "../../../apps/web/vite.config.ts");

/** Directive -> sorted sources, so the order inside the policy does not matter. */
function directives(policy: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const part of policy.split(";").map((p) => p.trim()).filter(Boolean)) {
    const [name, ...sources] = part.split(/\s+/);
    out[name!] = sources.sort();
  }
  return out;
}

/** Reads the `const csp = [ ... ].join(...)` literal of vite.config.ts without importing it. */
function viteCsp(): string {
  const source = readFileSync(viteConfig, "utf8");
  const match = /const csp = \[([\s\S]*?)\]\.join\(/.exec(source);
  if (!match) throw new Error("apps/web/vite.config.ts no longer has `const csp = [...].join(...)`: update this parity test");
  const items = match[1]!
    .replace(/^\s*\/\/.*$/gm, "") // whole-line comments only: "https://" lives inside the strings
    .trim()
    .replace(/,\s*$/, "");
  return (JSON.parse(`[${items}]`) as string[]).join("; ");
}

it("the CSP of apps/web/vite.config.ts (preview) equals the one the server builds from the mediaHosts of connectors and price services (ADR 71, ADR 86 point 17)", () => {
  expect(directives(spaCsp(unionMediaHosts(createConnectors(), createPriceServices())))).toEqual(directives(viteCsp()));
});
