import { describe, expect, it } from "vitest";
import { createHelperRunner } from "../src/helper-io";
import { HelperProcessWatcher, parseProcessList, PROCESS_LIST_MAX_BYTES, PROCESS_LIST_TIMEOUT_MS } from "../src/process-watcher";

describe("parseProcessList (ADR 92)", () => {
  it("keeps only local absolute paths of reasonable length", () => {
    const long = "C:\\" + "a".repeat(32_767);
    const text = JSON.stringify({ paths: ["C:\\Games\\a.exe", "d:/Games/b.exe", "\\\\server\\share\\c.exe", "relative\\d.exe", "C:\\x\0y.exe", 5, null, long, "C:\\" + "a".repeat(32_764)] });
    expect(parseProcessList(text)).toEqual(["C:\\Games\\a.exe", "d:/Games/b.exe", "C:\\" + "a".repeat(32_764)]);
  });
  it("anything else is an empty list", () => {
    for (const t of ["", "not json", "null", "[]", '{"paths":"C:\\\\a.exe"}', '{"error":"x"}']) expect(parseProcessList(t), t).toEqual([]);
  });
  it("caps the count", () => {
    expect(parseProcessList(JSON.stringify({ paths: Array.from({ length: 9000 }, (_, i) => `C:\\p${i}.exe`) }))).toHaveLength(8192);
  });
});

describe("HelperProcessWatcher", () => {
  it("runs --processes with 5 s and 4 MiB, passes the signal, and parses the answer", async () => {
    const seen: unknown[] = [];
    const ac = new AbortController();
    const w = new HelperProcessWatcher(async (args, input, opts) => {
      seen.push(args, input, opts);
      return '{"paths":["C:\\\\Games\\\\x.exe"]}\n';
    });
    expect(await w.listExecutables(ac.signal)).toEqual(["C:\\Games\\x.exe"]);
    expect(seen).toEqual([["--processes"], "", { timeoutMs: PROCESS_LIST_TIMEOUT_MS, maxBytes: PROCESS_LIST_MAX_BYTES, signal: ac.signal }]);
    expect([PROCESS_LIST_TIMEOUT_MS, PROCESS_LIST_MAX_BYTES]).toEqual([5000, 4 * 1024 * 1024]);
  });

  it("lets a failing helper fail (the core treats it as no game)", async () => {
    const w = new HelperProcessWatcher(async () => {
      throw new Error("helper timed out");
    });
    await expect(w.listExecutables(new AbortController().signal)).rejects.toThrow("timed out");
  });
});

describe("the runner honours maxBytes and the signal", () => {
  const node = createHelperRunner(process.execPath);
  it("rejects output over maxBytes but allows more than the default when asked", async () => {
    const big = ["-e", "process.stdout.write('x'.repeat(300000))"];
    await expect(node(big, "")).rejects.toThrow("too large");
    expect((await node(big, "", { maxBytes: 1024 * 1024 })).length).toBe(300_000);
  });
  it("kills the helper when the signal aborts", async () => {
    const ac = new AbortController();
    const p = node(["-e", "setTimeout(()=>{}, 60000)"], "", { signal: ac.signal });
    setTimeout(() => ac.abort(), 100);
    await expect(p).rejects.toThrow("aborted");
  });
});
