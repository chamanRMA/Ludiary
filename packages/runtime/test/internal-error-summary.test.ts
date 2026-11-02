import { expect, it } from "vitest";
import { internalErrorSummary } from "../src/server-role";

it("logs the name and the frames of an unexpected route error, never its message (ADR 87 point 13)", () => {
  let err: unknown;
  try {
    JSON.parse("Secret Collection");
  } catch (e) {
    err = e;
  }
  const text = internalErrorSummary(err);
  expect(text).toMatch(/^SyntaxError/);
  expect(text).not.toContain("Secret Collection");
  expect(internalErrorSummary("plain string")).toBe("unknown");
  const tricky = new Error("x\n    at Secret");
  expect(internalErrorSummary(tricky)).not.toContain("Secret");
});
