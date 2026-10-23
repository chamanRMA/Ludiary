import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConnectorError, PathEscapesRootsError } from "@ludiary/contracts";
import { createNodeLocalFiles, MAX_DIR_ENTRIES, MAX_TEXT_BYTES, systemClock } from "../src";

const files = createNodeLocalFiles();
const win = process.platform === "win32";
let base: string;
let root: string;
let outside: string;

beforeAll(() => {
  base = mkdtempSync(path.join(tmpdir(), "ludiary-fs-"));
  root = path.join(base, "Games");
  outside = path.join(base, "Games2"); // shares the prefix of root
  mkdirSync(path.join(root, "sub"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(path.join(root, "a.txt"), "hello");
  writeFileSync(path.join(root, "bom.txt"), "\uFEFFbom");
  writeFileSync(path.join(root, "sub", "b.txt"), "b");
  writeFileSync(path.join(outside, "secret.txt"), "secret");
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "no error";
  } catch (err) {
    return err instanceof ConnectorError ? err.code : "other";
  }
};

describe("scoped reader", () => {
  it("reads text, strips a BOM, lists a directory and checks existence", async () => {
    const fs = files.scoped([root]);
    expect(await fs.readText(fs.join(root, "a.txt"))).toBe("hello");
    expect(await fs.readText(fs.join(root, "bom.txt"))).toBe("bom");
    const entries = await fs.readDir(root);
    expect(entries).toContainEqual({ name: "sub", isDirectory: true });
    expect(entries).toContainEqual({ name: "a.txt", isDirectory: false });
    expect(await fs.exists(fs.join(root, "a.txt"))).toBe(true);
    expect(await fs.exists(fs.join(root, "nope.txt"))).toBe(false);
  });

  it("rejects '..' traversal as internal", async () => {
    const fs = files.scoped([root]);
    expect(await code(fs.readText(path.join(root, "..", "Games2", "secret.txt")))).toBe("internal");
    expect(await code(fs.exists(path.join(root, "sub", "..", "..", "Games2")))).toBe("internal");
    expect(await code(fs.readDir(base))).toBe("internal");
  });

  it("a lexically outside path is a plain internal error, not the link subtype", async () => {
    const fs = files.scoped([root]);
    const thrown = await fs.readText(path.join(outside, "secret.txt")).then(() => null, (e: unknown) => e);
    expect(thrown).toBeInstanceOf(ConnectorError);
    expect(thrown).not.toBeInstanceOf(PathEscapesRootsError);
  });

  it("rejects relative paths as internal", async () => {
    expect(await code(files.scoped([root]).readText("a.txt"))).toBe("internal");
  });

  it("does not treat a sibling with the same prefix as inside the root", async () => {
    const fs = files.scoped([root]);
    expect(await code(fs.readText(path.join(outside, "secret.txt")))).toBe("internal");
    expect(await files.isInside(outside, root)).toBe(false);
    expect(await files.isInside(path.join(root, "sub"), root)).toBe(true);
    expect(await files.isInside(root, root)).toBe(true);
  });

  it("a junction or symlink that leaves the root is rejected", async () => {
    const link = path.join(root, "escape");
    try {
      symlinkSync(outside, link, "junction"); // junctions need no privilege on Windows
    } catch {
      return; // cannot create links here: covered by the manual list
    }
    const fs = files.scoped([root]);
    expect(await code(fs.readText(path.join(link, "secret.txt")))).toBe("internal");
    expect(await code(fs.readDir(link))).toBe("internal");
    // exists() through the link too, and the error is the distinguishable subtype (ADR 72).
    const thrown = await fs.exists(path.join(link, "secret.txt")).then(() => null, (e: unknown) => e);
    expect(thrown).toBeInstanceOf(PathEscapesRootsError);
    expect((thrown as ConnectorError).code).toBe("internal");
    expect((thrown as Error).message).not.toContain(base);
    expect(await files.isInside(path.join(link, "secret.txt"), root)).toBe(false);
    const entry = (await fs.readDir(root)).find((e) => e.name === "escape");
    expect(entry?.isDirectory).toBe(false);
  });

  it("a link that stays inside the root is followed", async () => {
    const link = path.join(root, "inner");
    try {
      symlinkSync(path.join(root, "sub"), link, "junction");
    } catch {
      return;
    }
    const fs = files.scoped([root]);
    expect(await fs.readText(path.join(link, "b.txt"))).toBe("b");
  });

  it("enforces the 1 MiB limit", async () => {
    const fs = files.scoped([root]);
    writeFileSync(path.join(root, "exact.txt"), "x".repeat(MAX_TEXT_BYTES));
    writeFileSync(path.join(root, "big.txt"), "x".repeat(MAX_TEXT_BYTES + 1));
    expect((await fs.readText(path.join(root, "exact.txt"))).length).toBe(MAX_TEXT_BYTES);
    expect(await code(fs.readText(path.join(root, "big.txt")))).toBe("scan.root-unreadable");
  });

  it("enforces the 10 000 entries limit", async () => {
    const fs = files.scoped([root]);
    const full = path.join(root, "full");
    const over = path.join(root, "over");
    mkdirSync(full);
    mkdirSync(over);
    for (let i = 0; i <= MAX_DIR_ENTRIES; i++) {
      if (i < MAX_DIR_ENTRIES) writeFileSync(path.join(full, `f${i}`), "");
      writeFileSync(path.join(over, `f${i}`), "");
    }
    expect((await fs.readDir(full)).length).toBe(MAX_DIR_ENTRIES);
    expect(await code(fs.readDir(over))).toBe("scan.root-unreadable");
  }, 60_000);

  it("a missing or non-file target is scan.root-unreadable, without paths in the message", async () => {
    const fs = files.scoped([root]);
    expect(await code(fs.readText(path.join(root, "missing.txt")))).toBe("scan.root-unreadable");
    expect(await code(fs.readText(path.join(root, "sub")))).toBe("scan.root-unreadable");
    try {
      await fs.readText(path.join(root, "missing.txt"));
    } catch (err) {
      expect((err as Error).message).not.toContain(base);
    }
  });

  it.runIf(win)("rejects alternate data streams", async () => {
    expect(await code(files.scoped([root]).readText(path.join(root, "a.txt") + ":stream"))).toBe("internal");
  });
});

describe("path semantics (Windows rules, any host)", () => {
  const w = createNodeLocalFiles({ platform: "win32" });
  it("normalizes separators, trailing separator and extended prefix, keeping case", () => {
    expect(w.normalize("C:/Program Files (x86)/Steam/")).toBe("C:\\Program Files (x86)\\Steam");
    expect(w.normalize("D:\\")).toBe("D:\\");
    expect(w.normalize("\\\\?\\D:\\Games\\")).toBe("D:\\Games");
  });
  it("compareKey ignores case and separator style", () => {
    expect(w.compareKey("c:/program files (x86)/steam")).toBe(w.compareKey("C:\\Program Files (x86)\\Steam\\"));
    expect(w.compareKey("D:\\Games")).not.toBe(w.compareKey("D:\\Games2"));
  });
  it("isAbsolute requires a drive or UNC root", () => {
    expect(w.isAbsolute("C:\\x")).toBe(true);
    expect(w.isAbsolute("c:/x")).toBe(true);
    expect(w.isAbsolute("\\\\srv\\share")).toBe(true);
    expect(w.isAbsolute("\\x")).toBe(false);
    expect(w.isAbsolute("C:x")).toBe(false);
    expect(w.isAbsolute("x\\y")).toBe(false);
  });
  it("isLocalPath accepts drive paths only, never UNC or device paths", () => {
    expect(w.isLocalPath("C:\\Games")).toBe(true);
    expect(w.isLocalPath("d:/Games")).toBe(true);
    for (const bad of ["\\\\srv\\share", "//srv/share", "\\\\?\\C:\\Games", "\\\\?\\UNC\\srv\\share", "\\\\.\\PhysicalDrive0", "C:Games", "\\Games", "rel\\x", "C:\\a\0b"]) {
      expect(w.isLocalPath(bad), bad).toBe(false);
    }
  });
  it("isInside on non-existent paths uses the prefix boundary and ignores case", async () => {
    expect(await w.isInside("D:\\games\\x", "D:\\Games")).toBe(process.platform === "win32");
    expect(await w.isInside("D:\\Games2", "D:\\Games")).toBe(false);
  });
});

it("systemClock", () => {
  expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1000);
  expect(systemClock.timeout(50)).toBeInstanceOf(AbortSignal);
});

describe("isDirectoryStrict (ADR 79)", () => {
  it("is false for absent paths and files (ENOENT, ENOTDIR) and true for folders", async () => {
    expect(await files.isDirectoryStrict!(root)).toBe(true);
    expect(await files.isDirectoryStrict!(path.join(root, "nope"))).toBe(false);
    expect(await files.isDirectoryStrict!(path.join(root, "a.txt"))).toBe(false);
    expect(await files.isDirectoryStrict!(path.join(root, "a.txt", "inside"))).toBe(false);
  });
});
