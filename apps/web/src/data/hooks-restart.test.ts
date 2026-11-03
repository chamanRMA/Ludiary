import { expect, it } from "vitest";
import { setRestarting, startLoad } from "./hooks";

it("after a restoration no query loads any more (ADR 89 point 6.5)", async () => {
  let calls = 0;
  const load = async () => ++calls;
  startLoad(load, 1, () => {});
  expect(calls).toBe(1);
  setRestarting();
  startLoad(load, 2, () => {});
  expect(calls).toBe(1);
});
