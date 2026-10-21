import { describe, expect, it } from "vitest";
import { matchRoute } from "./router";

describe("matchRoute (ADR 68)", () => {
  it("matches static routes and ignores trailing slashes", () => {
    expect(matchRoute("/library", "/library")).toEqual({});
    expect(matchRoute("/library", "/library/")).toEqual({});
    expect(matchRoute("/", "/")).toEqual({});
  });

  it("extracts and decodes :params", () => {
    expect(matchRoute("/game/:id", "/game/elden-ring")).toEqual({ id: "elden-ring" });
    expect(matchRoute("/settings/:section", "/settings/stores")).toEqual({ section: "stores" });
    expect(matchRoute("/game/:id", "/game/a%20b")).toEqual({ id: "a b" });
  });

  it("does not match different shapes", () => {
    expect(matchRoute("/game/:id", "/game")).toBeNull();
    expect(matchRoute("/game/:id", "/game/1/extra")).toBeNull();
    expect(matchRoute("/library", "/libraries")).toBeNull();
    expect(matchRoute("/", "/library")).toBeNull();
  });

  it("rejects malformed escapes instead of throwing", () => {
    expect(matchRoute("/game/:id", "/game/%E0%A4%A")).toBeNull();
  });
});
