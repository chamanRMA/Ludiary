import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { UpdateSettingsSchema, UpdateStatusSchema } from "../src";

const base = { mode: "notify", current: "0.2.0", state: "ready" };

describe("UpdateStatusSchema versions", () => {
  it("accepts x.y.z and refuses anything else", () => {
    expect(Value.Check(UpdateStatusSchema, { ...base, latest: "0.3.0", updated: "10.20.30" })).toBe(true);
    for (const v of ["0.3", "v0.3.0", "0.3.0-rc1", "0.3.0/../x", "ddd", "0.3.0\n"]) {
      expect(Value.Check(UpdateStatusSchema, { ...base, latest: v }), v).toBe(false);
    }
  });
});

describe("point 20", () => {
  it("the mode always has a value and the one-time card is gone", () => {
    expect(Value.Check(UpdateStatusSchema, { ...base, mode: null })).toBe(false);
    expect(Value.Check(UpdateStatusSchema, { ...base, noticeSeen: true })).toBe(false);
    expect(Value.Check(UpdateStatusSchema, { ...base, snoozed: true })).toBe(true);
    expect(Value.Check(UpdateStatusSchema, { ...base, snoozed: false })).toBe(false);
  });
  it("settings accept mode, ack and later, and refuse noticeSeen and the empty object", () => {
    expect(Value.Check(UpdateSettingsSchema, { later: true })).toBe(true);
    expect(Value.Check(UpdateSettingsSchema, { mode: "auto" })).toBe(true);
    expect(Value.Check(UpdateSettingsSchema, { noticeSeen: true })).toBe(false);
    expect(Value.Check(UpdateSettingsSchema, {})).toBe(false);
  });
});
