import { ConnectorError } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { findPrivacyViolations, memoryFiles, READ_TEXT_MAX_BYTES, scanContext } from "../src";

describe("memoryFiles", () => {
  const tree = { "C:\\Games\\A\\a.txt": "hi", "D:\\Lib\\": "", "C:\\Games2\\x.txt": "x" };
  it("is case- and separator-insensitive and lists directories", async () => {
    const fs = memoryFiles(tree);
    expect(await fs.readText("c:/GAMES/a/A.TXT")).toBe("hi");
    expect(await fs.exists("C:\\games")).toBe(true);
    expect(await fs.exists("C:\\nope")).toBe(false);
    expect(await fs.readDir("C:\\Games")).toEqual([{ name: "A", isDirectory: true }]);
    expect(await fs.readDir("D:\\Lib")).toEqual([]);
    expect(fs.join("C:\\Games", "A", "..", "A", "a.txt")).toBe("C:\\Games\\A\\a.txt");
  });
  it("confines to roots (prefix trap and ..) with 'internal'", async () => {
    const fs = memoryFiles(tree, { roots: ["C:\\Games"] });
    for (const p of ["C:\\Games2\\x.txt", "C:\\Games\\..\\Games2\\x.txt", "D:\\Lib"]) {
      await expect(fs.readText(p)).rejects.toMatchObject({ code: "internal" });
    }
    expect(await fs.readText("C:\\Games\\A\\a.txt")).toBe("hi");
    await expect(fs.exists("relative")).rejects.toBeInstanceOf(ConnectorError);
  });
  it("applies the size limits and unreadable paths", async () => {
    const fs = memoryFiles({ "C:\\big.txt": "a".repeat(READ_TEXT_MAX_BYTES + 1), "C:\\p\\x": "" }, { unreadable: ["C:\\p"] });
    await expect(fs.readText("C:\\big.txt")).rejects.toMatchObject({ code: "scan.root-unreadable" });
    await expect(fs.readText("C:\\missing.txt")).rejects.toMatchObject({ code: "scan.root-unreadable" });
    await expect(fs.readDir("C:\\p")).rejects.toMatchObject({ code: "scan.root-unreadable" });
    const many: Record<string, string> = {};
    for (let i = 0; i < 10_001; i++) many[`C:\\d\\f${i}`] = "";
    await expect(memoryFiles(many).readDir("C:\\d")).rejects.toMatchObject({ code: "scan.root-unreadable" });
  });
});

describe("contexts", () => {
  it("capture logs and progress", () => {
    const ctx = scanContext({ roots: ["C:\\x"] });
    ctx.log.warn("m", { a: 1 });
    ctx.progress.report({ done: 1 });
    expect(ctx.logs).toEqual([{ level: "warn", msg: "m", fields: { a: 1 } }]);
    expect(ctx.progressEvents).toEqual([{ done: 1 }]);
    expect(ctx.roots).toEqual([{ origin: "user", path: "C:\\x" }]);
  });
});

describe("findPrivacyViolations", () => {
  const find = (content: string): string[] => findPrivacyViolations([{ path: "f", content }]).map((v) => v.rule);
  it("detects the patterns of ADR 48 and 72", () => {
    expect(find("id 7656119" + "1".repeat(10))).toEqual(["SteamID64"]);
    expect(find('"LastOwner" "0"')).toEqual(["LastOwner"]);
    expect(find("C:\\Users\\bob\\x")).toContain("user profile path");
    expect(find("C:\\\\Users\\\\bob")).toContain("user profile path");
    expect(find("a@b.com")).toEqual(["email address"]);
    expect(find('"access_token": "abcdef123456"')).toContain("credential field");
    expect(find("clean text, D:\\SteamLibrary")).toEqual([]);
  });
});
