import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { KeyStore } from "@ludiary/contracts";
import { createLocalServer, SessionStore } from "@ludiary/api";
import { describe, expect, it } from "vitest";
import { callServer } from "../src/launcher";
import { loadInstallToken, loadMasterKey } from "../src/server-role";

function memoryStore(initial: Record<string, Uint8Array> = {}): KeyStore & { data: Map<string, Uint8Array> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    get: async (n) => data.get(n) ?? null,
    set: async (n, v) => void data.set(n, v),
    delete: async (n) => void data.delete(n),
  };
}
const log = () => {};

describe("master key compartments (ADR 64)", () => {
  it("creates master-key/1 on first start and loads it afterwards", async () => {
    const store = memoryStore();
    const first = await loadMasterKey(store, log);
    expect(first).toMatchObject({ id: 1, origin: "created" });
    const again = await loadMasterKey(store, log);
    expect(again).toMatchObject({ id: 1, origin: "loaded" });
    expect(again.value.equals(first.value)).toBe(true);
  });

  it("never overwrites an entry it does not recognize: it is kept and a new key goes to the next slot", async () => {
    const future = Buffer.concat([Buffer.from("LDK"), Buffer.from([2]), Buffer.alloc(60, 7)]);
    const store = memoryStore({ "master-key/1": future });
    const key = await loadMasterKey(store, log);
    expect(key).toMatchObject({ id: 2, origin: "created" });
    expect(Buffer.from(store.data.get("master-key/1")!).equals(future)).toBe(true);
  });

  it("keeps using a valid key in a later slot when an earlier slot is free (after a rotation)", async () => {
    const valid = Buffer.alloc(32, 9);
    const store = memoryStore({ "master-key/2": valid });
    const key = await loadMasterKey(store, log);
    expect(key).toMatchObject({ id: 2, origin: "loaded" });
    expect(store.data.has("master-key/1")).toBe(false);
  });

  it("regenerates an invalid installation token (losing it costs nothing)", async () => {
    const store = memoryStore({ "install-token": new Uint8Array(5) });
    expect((await loadInstallToken(store, log)).length).toBe(32);
    expect(store.data.get("install-token")!.length).toBe(32);
  });
});

describe("launcher talking to whoever holds the port (ADR 63)", () => {
  const key = Buffer.alloc(32, 1);

  it("gets a link from our real server", async () => {
    const server = createLocalServer({
      appId: "Ludiary",
      version: "test",
      launcherKey: key,
      sessions: new SessionStore(),
      t: (k) => k,
      getStatus: () => ({}),
      onShutdownRequested: () => {},
    });
    const port = await server.listen(0);
    try {
      expect(await callServer(port, key, "open-link")).toMatch(new RegExp(`^http://ludiary\\.localhost:${port}/open\\?t=`));
      expect(await callServer(port, Buffer.alloc(32, 2), "open-link")).toBeNull();
    } finally {
      await server.close();
    }
  });

  it("refuses an impostor that answers like Ludiary but cannot prove it", async () => {
    const impostor = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/api/launcher/challenge") res.end(JSON.stringify({ nonce: "A".repeat(43) }));
      else res.end(JSON.stringify({ result: "https://evil.example/", proof: "B".repeat(43) }));
    });
    await new Promise<void>((r) => impostor.listen(0, "127.0.0.1", r));
    const { port } = impostor.address() as AddressInfo;
    try {
      expect(await callServer(port, key, "open-link")).toBeNull();
    } finally {
      impostor.close();
    }
  });
});
