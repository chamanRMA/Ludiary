import { describe, expect, it } from "vitest";
import { startLoad, type QueryState } from "./hooks";

const run = async <T>(load: () => Promise<T>, from: QueryState<T>) => {
  let state = from;
  startLoad(load, 3, (update) => void (state = update(state)));
  await new Promise((r) => setTimeout(r, 0));
  return state;
};

describe("startLoad", () => {
  it("exposes the failure and keeps the previous data", async () => {
    const boom = new Error("500");
    expect(await run(() => Promise.reject(boom), { data: "old", version: 2 })).toEqual({ data: "old", version: 2, error: boom });
  });

  it("a later success clears the error", async () => {
    expect(await run(() => Promise.resolve("new"), { data: "old", version: 2, error: new Error("x") })).toEqual({ data: "new", version: 3 });
  });
});
