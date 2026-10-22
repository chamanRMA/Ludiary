import { describe, expect, it } from "vitest";
import { matchesWizard, openIdQuery, parseReturnTo, returnPath } from "./connectReturn";

describe("OpenID return", () => {
  it("keeps only the openid.* parameters", () => {
    const q = openIdQuery("?w=abc&openid.mode=id_res&openid.sig=x%2By&evil=1&xopenid.a=2");
    expect(q).toEqual({ "openid.mode": "id_res", "openid.sig": "x+y" });
  });
  it("sends at most 32 parameters", () => {
    const search = "?" + Array.from({ length: 40 }, (_, i) => `openid.p${i}=1`).join("&");
    expect(Object.keys(openIdQuery(search))).toHaveLength(32);
  });
  it("an empty or foreign query gives an empty object", () => {
    expect(openIdQuery("")).toEqual({});
    expect(openIdQuery("?w=1")).toEqual({});
  });
  it("the return destination comes from a closed list, Settings by default", () => {
    expect(parseReturnTo("welcome")).toBe("welcome");
    expect(parseReturnTo("settings")).toBe("settings");
    expect(parseReturnTo("//evil.example")).toBe("settings");
    expect(parseReturnTo(null)).toBe("settings");
    expect(returnPath("welcome")).toBe("/welcome?step=stores");
    expect(returnPath("settings")).toBe("/settings/stores");
  });

  it("requires the stored wizard id to match the page's w and the w inside return_to", () => {
    const rt = (w: string) => encodeURIComponent(`http://127.0.0.1:1/connect/return?w=${w}`);
    expect(matchesWizard(`?w=a1&openid.mode=id_res&openid.return_to=${rt("a1")}`, "a1")).toBe(true);
    expect(matchesWizard("?w=a1&openid.mode=cancel", "a1")).toBe(true);
    expect(matchesWizard(`?w=a1&openid.return_to=${rt("b2")}`, "a1")).toBe(false);
    expect(matchesWizard(`?w=b2&openid.return_to=${rt("b2")}`, "a1")).toBe(false);
    expect(matchesWizard("?openid.mode=id_res", "a1")).toBe(false);
    expect(matchesWizard("?w=a1&openid.return_to=not-a-url", "a1")).toBe(false);
    expect(matchesWizard("?w=a1", null)).toBe(false);
  });
});
