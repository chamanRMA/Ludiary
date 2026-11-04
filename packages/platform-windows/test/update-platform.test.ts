import { describe, expect, it } from "vitest";
import { createWindowsUpdatePlatform } from "../src/update-platform";

describe("createWindowsUpdatePlatform (ADR 90 point 12)", () => {
  it("is managed by the stable launcher only from app-<version> of the same version", () => {
    expect(createWindowsUpdatePlatform({ installDir: "C:\\Programs\\Ludiary\\app-0.3.0", version: "0.3.0" }).installRoot).toBe("C:\\Programs\\Ludiary");
    expect(createWindowsUpdatePlatform({ installDir: "C:\\Programs\\Ludiary\\app-0.2.0", version: "0.3.0" }).installRoot).toBeNull();
    expect(createWindowsUpdatePlatform({ installDir: "C:\\Programs\\Ludiary", version: "0.3.0" }).installRoot).toBeNull();
  });
  it("reports free space of a real folder", async () => {
    expect(await createWindowsUpdatePlatform({ installDir: "x", version: "0.3.0" }).freeBytes(process.cwd())).toBeGreaterThan(0);
  });
  it("refuses to restart when it does not run from an app folder", async () => {
    await expect(createWindowsUpdatePlatform({ installDir: "C:\\x", version: "0.3.0" }).restartIntoLauncher()).rejects.toThrow();
  });
});
