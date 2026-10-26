import { describe, expect, it } from "vitest";
import { indexBaseTitles, inferBaseGame } from "../src/dlc";

describe("inferBaseGame performance (ADR 83, M2)", () => {
  it("50 000 invented base games and 50 000 candidates run in linear time", () => {
    const bases = Array.from({ length: 50_000 }, (_, i) => ({ id: String(i), title: `Invented Game ${i} ${"word ".repeat(10)}Edition` }));
    const index = indexBaseTitles(bases);
    const t0 = performance.now();
    let found = 0;
    for (let i = 0; i < 50_000; i++) if (inferBaseGame(`Invented Game ${i} ${"word ".repeat(10)}Edition Pack ${"x ".repeat(40)}`, index) !== undefined) found++;
    expect(found).toBe(50_000);
    expect(performance.now() - t0).toBeLessThan(10_000);
  });
});
