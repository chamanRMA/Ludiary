import { describe, expect, it } from "vitest";
import { needsAutoDetection, scanWarningKey } from "./storeNotices";

describe("scanWarningKey", () => {
  const error = { code: "scan.discovery-unavailable", key: "connectors.common.errors.scan.discovery-unavailable" };
  it("returns the key of an error that comes with state idle", () => {
    expect(scanWarningKey({ sync: [{ operation: "scan", state: "idle", error }] } as never)).toBe(error.key);
  });
  it("ignores real failures and clean states", () => {
    expect(scanWarningKey({ sync: [{ operation: "scan", state: "error", error }] } as never)).toBeNull();
    expect(scanWarningKey({ sync: [{ operation: "scan", state: "idle" }] } as never)).toBeNull();
    expect(scanWarningKey({ sync: [] })).toBeNull();
  });
});

describe("needsAutoDetection", () => {
  it("is true for Ubisoft unless detection is automatic, and waits for the settings", () => {
    expect(needsAutoDetection("ubisoft", "manual-only")).toBe(true);
    expect(needsAutoDetection("ubisoft", "later")).toBe(true);
    expect(needsAutoDetection("ubisoft", null)).toBe(true);
    expect(needsAutoDetection("ubisoft", "auto-and-manual")).toBe(false);
    expect(needsAutoDetection("ubisoft", undefined)).toBe(false);
    expect(needsAutoDetection("steam", "manual-only")).toBe(false);
  });
});
