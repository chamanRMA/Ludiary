import { Value } from "typebox/value";
import { describe, expect, it } from "vitest";
import { UpdateStatusSchema } from "../src";

const base = { mode: null, current: "0.2.0", state: "ready", noticeSeen: true };

describe("UpdateStatusSchema versions", () => {
  it("accepts x.y.z and refuses anything else", () => {
    expect(Value.Check(UpdateStatusSchema, { ...base, latest: "0.3.0", updated: "10.20.30" })).toBe(true);
    for (const v of ["0.3", "v0.3.0", "0.3.0-rc1", "0.3.0/../x", "ddd", "0.3.0\n"]) {
      expect(Value.Check(UpdateStatusSchema, { ...base, latest: v }), v).toBe(false);
    }
  });
});
