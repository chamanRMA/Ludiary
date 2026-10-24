import { describe, expect, it } from "vitest";
import { needsAutoDetection, recentlySynced, scanWarningKey, syncWaits } from "./storeNotices";

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

describe("recentlySynced and syncWaits", () => {
  const lib = (o: { nextAllowedAt?: number; lastAttemptAt?: number }) => [{ operation: "library" as const, state: "idle" as const, ...o }];
  const stores = [
    { store: "ea" as const, connection: "connected" as const, sync: lib({ nextAllowedAt: 2000, lastAttemptAt: 1000 }) },
    { store: "ubisoft" as const, connection: "disconnected" as const, sync: lib({ nextAllowedAt: 2000, lastAttemptAt: 1000 }) }, // not connected: no notice
    { store: "gog" as const, connection: "connected" as const, sync: lib({ nextAllowedAt: 500, lastAttemptAt: 100 }) },
    { store: "steam" as const, connection: "connected" as const, sync: lib({}) },
    { store: "epic" as const, connection: "connected" as const, sync: [{ operation: "scan" as const, state: "idle" as const, nextAllowedAt: 9000, lastAttemptAt: 900 }] },
  ];
  it("asks for confirmation only for connected stores still inside their interval", () => {
    expect(recentlySynced(stores, 1000)).toEqual(["ea"]);
    expect(recentlySynced(stores, 2000)).toEqual([]);
  });
  it("waits are the stores inside the minute after their last attempt", () => {
    expect(syncWaits(stores, 1000)).toEqual([
      { store: "ea", at: 61_000 },
      { store: "gog", at: 60_100 },
    ]);
    expect(syncWaits(stores, 60_500)).toEqual([{ store: "ea", at: 61_000 }]);
  });
});
