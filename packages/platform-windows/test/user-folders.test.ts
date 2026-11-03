import { describe, expect, it } from "vitest";
import { HelperProcessUserFolders, parseKnownFolderResponse } from "../src/user-folders";

describe("UserFolders (ADR 89)", () => {
  it("parses a path and refuses everything else", () => {
    expect(parseKnownFolderResponse('{"path":"C:\\\\Users\\\\x\\\\Documents"}\n')).toBe("C:\\Users\\x\\Documents");
    expect(parseKnownFolderResponse('{"error":"failed"}\n')).toBeNull();
    expect(parseKnownFolderResponse("not json")).toBeNull();
    expect(parseKnownFolderResponse('{"path":"relative"}')).toBeNull();
  });

  it("asks the helper for the documents mode and maps a failed run to null", async () => {
    const calls: string[][] = [];
    const ok = new HelperProcessUserFolders(async (args) => (calls.push([...args]), '{"path":"D:\\\\Docs"}'));
    expect(await ok.documents()).toBe("D:\\Docs");
    expect(calls[0]).toEqual(["--known-folder", "documents"]);
    expect(await new HelperProcessUserFolders(() => Promise.reject(new Error("x"))).documents()).toBeNull();
  });
});
