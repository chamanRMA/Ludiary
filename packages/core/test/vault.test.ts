// SecretVault (ADR 46, 74 point 6): scope, AAD, lost key and compartment.
import { describe, expect, it } from "vitest";
import type { Env } from "../src";
import { createVaultFactory } from "../src/vault";
import { fakeCipher, harness, type Harness } from "./helpers";

async function setup(cipher = fakeCipher(1, "k1")) {
  const h = await harness({ cipher, connected: ["steam"] });
  const env: Env = { deps: h.deps, connectors: new Map(), services: new Map(), serviceVaultFor: () => { throw new Error("unused"); }, userId: "the-user", deviceId: "dev", vaultFor: () => { throw new Error("unused"); } };
  return { h, vault: createVaultFactory(env)("steam") };
}
const withKey = (h: Harness, cipher: ReturnType<typeof fakeCipher>) => {
  const env: Env = { deps: { ...h.deps, cipher }, connectors: new Map(), services: new Map(), serviceVaultFor: () => { throw new Error("unused"); }, userId: "the-user", deviceId: "dev", vaultFor: () => { throw new Error("unused"); } };
  return createVaultFactory(env)("steam");
};

describe("store vault", () => {
  it("encrypts under scope store:<id> with the AAD user|scope|name, and reads back a Secret that does not print", async () => {
    const { h, vault } = await setup();
    await vault.set("apiKey", "0123456789abcdef0123456789abcdef");
    const row = h.store.secretRows.get("store:steam|apiKey")!;
    expect(row).toMatchObject({ scope: "store:steam", name: "apiKey", keyId: 1, updatedAt: h.clock.time });
    expect(row.ciphertext).not.toContain("0123456789abcdef");
    const aad = Buffer.from(row.ciphertext.split(".")[3]!, "base64url").toString();
    expect(aad).toBe("the-user|store:steam|apiKey");
    const got = await vault.get("apiKey");
    expect(got?.reveal()).toBe("0123456789abcdef0123456789abcdef");
    expect(JSON.stringify(got)).toBe('"[redacted]"');
    expect(`${got}`).toBe("[redacted]");
    expect(await vault.get("steamId")).toBeNull();
  });

  it("set overwrites, accepts a Secret and delete removes", async () => {
    const { h, vault } = await setup();
    await vault.set("a", "one");
    await vault.set("a", { reveal: () => "two", toString: () => "[redacted]", toJSON: () => "[redacted]" });
    expect((await vault.get("a"))?.reveal()).toBe("two");
    expect(h.store.secretRows.size).toBe(1);
    await vault.delete("a");
    expect(await vault.get("a")).toBeNull();
  });

  it("the AAD carries the user: a row moved to another user does not decrypt", async () => {
    const { h, vault } = await setup();
    await vault.set("apiKey", "v");
    const other = createVaultFactory({ deps: h.deps, connectors: new Map(), services: new Map(), serviceVaultFor: () => { throw new Error("unused"); }, userId: "someone-else", deviceId: "dev", vaultFor: () => { throw new Error("unused"); } })("steam");
    expect(await other.get("apiKey")).toBeNull();
  });

  it("lost key (same slot, other key): the row is deleted, the store expires and nothing is logged about the value", async () => {
    const { h, vault } = await setup();
    await vault.set("apiKey", "super-secret-value");
    const recreated = withKey(h, fakeCipher(1, "k2"));
    expect(await recreated.get("apiKey")).toBeNull();
    expect(h.store.secretRows.size).toBe(0);
    expect(h.store.connectionRows.get("steam")?.status).toBe("expired");
    const logs = h.logs.join("\n");
    expect(logs).toContain("warn:");
    expect(logs).not.toMatch(/super-secret-value|apiKey/);
  });

  it("compartment (another slot): the row is kept, the store expires", async () => {
    const { h, vault } = await setup();
    await vault.set("apiKey", "v");
    const second = withKey(h, fakeCipher(2, "k1"));
    expect(await second.get("apiKey")).toBeNull();
    expect(h.store.secretRows.size).toBe(1);
    expect(h.store.connectionRows.get("steam")?.status).toBe("expired");
    expect(h.logs.join("\n")).not.toContain("apiKey");
    // The original key still reads it once it is back.
    expect((await vault.get("apiKey"))?.reveal()).toBe("v");
  });

  it("a row whose keyId column says another slot is also a compartment, even if the blob looks like ours", async () => {
    const { h, vault } = await setup();
    await vault.set("apiKey", "v");
    const row = h.store.secretRows.get("store:steam|apiKey")!;
    h.store.secretRows.set("store:steam|apiKey", { ...row, keyId: 3 });
    expect(await vault.get("apiKey")).toBeNull();
    expect(h.store.secretRows.size).toBe(1);
  });
});
