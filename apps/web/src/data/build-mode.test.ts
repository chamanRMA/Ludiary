import i18next from "i18next";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { webCatalogs } from "@ludiary/i18n/web";

const es: Record<string, string> = webCatalogs.es;
import { errorText } from "../app/errors";
import { isSimulated } from "./api";
import { ApiError } from "./http";
import { createMockApi } from "./mock";

const web = join(import.meta.dirname, "../..");

describe("build mode (ADR 72)", () => {
  it("isSimulated is a build-time constant that is false unless the mode is simulator", () => {
    expect(isSimulated).toBe(false);
    const config = readFileSync(join(web, "vite.config.ts"), "utf8");
    expect(config).toContain('"import.meta.env.VITE_LUDIARY_SIMULATOR"');
    expect(config).toContain('mode === "simulator"');
    const source = readFileSync(join(web, "src/data/api.ts"), "utf8");
    expect(source).toContain('import.meta.env.VITE_LUDIARY_SIMULATOR === "1"');
  });

  it("only dev and preview turn the simulator on; build does not", () => {
    const scripts = (JSON.parse(readFileSync(join(web, "package.json"), "utf8")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["dev"]).toContain("--mode simulator");
    expect(scripts["preview"]).toContain("--mode simulator");
    expect(scripts["build"]).toBe("vite build");
  });
});

describe("Play", () => {
  it("the simulator launches nothing and says it started", async () => {
    const sim = createMockApi({ getItem: () => null, setItem: () => undefined });
    await expect(sim.launchGame("elden-ring")).resolves.toEqual({ status: "started" });
  });

  it("the error shown uses the server's key when the catalog has it, and a generic text otherwise", async () => {
    await i18next.init({ lng: "es", resources: { es: { translation: es } }, keySeparator: false, nsSeparator: false, interpolation: { prefix: "{", suffix: "}" } });
    const t = i18next.t.bind(i18next);
    expect(errorText(t, new ApiError(409, "busy", "core.errors.busy"))).toBe(es["core.errors.busy"]);
    expect(errorText(t, new ApiError(422, "x", "connectors.steam.errors.launcherMissing"))).toBe(es["connectors.steam.errors.launcherMissing"]);
    expect(errorText(t, new ApiError(422, "x", "some.unknown.key"))).toBe(es["errors.generic"]);
    expect(errorText(t, new Error("boom"))).toBe(es["errors.generic"]);
  });
});
