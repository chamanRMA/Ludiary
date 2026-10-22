import { describe, expect, it } from "vitest";
import { isUnsynced, primaryAction } from "./library";

describe("main action and unsynced veil (ADR 74)", () => {
  it("mainAction decides the button; without it the old rule holds", () => {
    expect(primaryAction({ installed: false, mainAction: "install" })).toBe("install");
    expect(primaryAction({ installed: true, mainAction: "play" })).toBe("play");
    expect(primaryAction({ installed: true })).toBe("play");
    expect(primaryAction({ installed: false })).toBe("store");
    expect(primaryAction({ installed: false, mainAction: null })).toBe("store");
    expect(primaryAction({ installed: true, mainAction: null })).toBe("play");
  });
  it("only an explicit true shows the veil", () => {
    expect(isUnsynced({ unsynced: true })).toBe(true);
    expect(isUnsynced({ unsynced: false })).toBe(false);
    expect(isUnsynced({})).toBe(false);
  });
});
