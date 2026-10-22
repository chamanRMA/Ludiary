// Wizard engine (ADR 74 point 5): sessions, validation, one-shot steps, expiry and return_to.
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectionWizard, I18nKey, StoreId, WizardContext, WizardInput, WizardStep } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { addUserRoot, harness, makeConnector, offlineHttp, owned, type Harness } from "./helpers";

const k = (s: string) => s as I18nKey;
const BASE = "http://ludiary.localhost:48123";
const KEY = "0123456789abcdef0123456789abcdef";

const loginStep = (ctx: WizardContext): WizardStep => ({
  kind: "open-external",
  id: "login",
  titleKey: k("connectors.steam.login.title"),
  bodyKey: k("connectors.steam.login.body"),
  url: `https://login.example.com/openid?return_to=${encodeURIComponent(ctx.callbackUrl)}`,
  awaits: "callback",
});
const keyStep: WizardStep = {
  kind: "open-external",
  id: "apikey",
  titleKey: k("connectors.steam.apikey.title"),
  bodyKey: k("connectors.steam.apikey.body"),
  url: "https://login.example.com/dev/apikey",
  awaits: "input",
  fields: [{ name: "apiKey", labelKey: k("connectors.steam.apikey.label"), secret: true, paste: true, pattern: "^[0-9A-Fa-f]{32}$", maxLength: 64 }],
};

interface Spy {
  contexts: WizardContext[];
  submits: { stepId: string; input: WizardInput }[];
  override?: (stepId: string, input: WizardInput) => Promise<WizardStep | { kind: "done"; accountLabel?: string }>;
}

function wizard(spy: Spy): ConnectionWizard {
  return {
    start: async (ctx) => (spy.contexts.push(ctx), loginStep(ctx)),
    submit: async (ctx, stepId, input) => {
      spy.contexts.push(ctx);
      spy.submits.push({ stepId, input });
      if (spy.override) return spy.override(stepId, input);
      if (stepId === "login") {
        if (input.kind !== "callback") throw new Error("expected a callback");
        if (input.query["openid.mode"] === "cancel") throw new ConnectorError("auth.required", "cancelled", { messageKey: k("connectors.steam.login.cancelled") });
        await ctx.wizardState.set("steamId", "76561190000000000");
        return keyStep;
      }
      if (input.kind !== "fields") throw new Error("expected fields");
      await ctx.secrets.set("apiKey", input.values.apiKey ?? "");
      await ctx.secrets.set("steamId", (await ctx.wizardState.get("steamId"))?.reveal() ?? "");
      return { kind: "done", accountLabel: "Ana" };
    },
    status: async () => ({ state: "connected" }),
    disconnect: async () => undefined,
  };
}

async function setup(over: { spy?: Partial<Spy>; connector?: Parameters<typeof makeConnector>[0] } = {}) {
  const spy: Spy = { contexts: [], submits: [], ...over.spy };
  const h = await harness({
    connectors: [makeConnector({ connection: wizard(spy), caps: { library: true }, library: async () => ({ complete: true, entries: [owned("10", "Portal")] }), ...over.connector })],
    http: () => offlineHttp,
  });
  return { h, spy };
}

const callback = (h: Harness, id: string, query: Record<string, string> = { "openid.mode": "id_res" }) => h.core.wizardCallback(id, query);
const fields = (apiKey: string): WizardInput => ({ kind: "fields", values: { apiKey } });

describe("start", () => {
  it("builds the callback URL from the validated origin and the wizard id, with a UUID-like id from newId", async () => {
    const { h, spy } = await setup();
    const { wizardId, response } = await h.core.startWizard("steam", BASE);
    expect(spy.contexts[0]!.callbackUrl).toBe(`${BASE}/connect/return?w=${wizardId}`);
    expect(response).toMatchObject({ kind: "open-external", id: "login", awaits: "callback" });
    expect((response as { url: string }).url).toContain(encodeURIComponent(`${BASE}/connect/return?w=${wizardId}`));
    expect(h.store.connectionRows.size).toBe(0); // nothing is connected until done
  });

  it("a return base with a path, https, credentials or garbage is invalid input; a store without wizard is not-found", async () => {
    const { h } = await setup();
    for (const base of [`${BASE}/x`, `${BASE}/`, "https://ludiary.localhost:1", "http://u:p@ludiary.localhost:1", "ludiary.localhost", ""]) {
      await expect(h.core.startWizard("steam", base), base).rejects.toMatchObject({ code: "invalid-input" });
    }
    await expect(h.core.startWizard("gog", BASE)).rejects.toMatchObject({ code: "not-found" });
  });

  it("opening another wizard for the same store cancels the previous one", async () => {
    const { h } = await setup();
    const a = await h.core.startWizard("steam", BASE);
    const b = await h.core.startWizard("steam", BASE);
    expect(b.wizardId).not.toBe(a.wizardId);
    await expect(callback(h, a.wizardId)).rejects.toMatchObject({ code: "not-found" });
    expect((await callback(h, b.wizardId)).response).toMatchObject({ kind: "open-external", id: "apikey" });
  });

  it("at most 4 at a time", async () => {
    const info: ConnectionWizard = { ...wizard({ contexts: [], submits: [] }), start: async () => ({ kind: "info", id: "choose", titleKey: k("connectors.common.t"), bodyKey: k("connectors.common.b") }) };
    const ids: StoreId[] = ["steam", "gog", "epic", "ubisoft", "ea"];
    const h = await harness({ connectors: ids.map((id) => makeConnector({ id, connection: info })) });
    for (const id of ids.slice(0, 4)) await h.core.startWizard(id, BASE);
    await expect(h.core.startWizard("ea", BASE)).rejects.toMatchObject({ code: "busy" });
    h.clock.time += 15 * 60_000; // the idle ones expire and free their place
    await expect(h.core.startWizard("ea", BASE)).resolves.toBeDefined();
  });

  it("a connector error while starting is thrown with its key and leaves no session", async () => {
    const { h } = await setup({ spy: { override: async () => ({ kind: "done" }) } });
    const bad = await harness({
      connectors: [
        makeConnector({
          connection: {
            start: async () => {
              throw new ConnectorError("network.unavailable", "down");
            },
            submit: async () => ({ kind: "done" }),
            status: async () => ({ state: "disconnected" }),
            disconnect: async () => undefined,
          },
        }),
      ],
    });
    await expect(bad.core.startWizard("steam", BASE)).rejects.toMatchObject({ code: "network.unavailable" });
    void h;
  });
});

describe("steps are accepted once and in turn", () => {
  it("a step out of turn is rejected and the connector is not called", async () => {
    const { h, spy } = await setup();
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const r = await h.core.submitWizard(wizardId, "apikey", fields(KEY));
    expect(r).toMatchObject({ kind: "rejected", stepId: "login", error: { code: "invalid-input" } });
    expect(spy.submits).toEqual([]);
  });

  it("the callback step cannot be answered through submit, and a callback does not answer a field step", async () => {
    const { h, spy } = await setup();
    const { wizardId } = await h.core.startWizard("steam", BASE);
    await expect(h.core.submitWizard(wizardId, "login", { kind: "callback", query: {} })).rejects.toMatchObject({ code: "invalid-input" });
    expect(await h.core.submitWizard(wizardId, "login", { kind: "continue" })).toMatchObject({ kind: "rejected", error: { code: "invalid-input" } });
    expect(spy.submits).toEqual([]);
    await callback(h, wizardId);
    expect((await callback(h, wizardId)).response).toMatchObject({ kind: "rejected", stepId: "apikey" });
    expect(spy.submits).toHaveLength(1);
  });

  it("a repeated return is rejected: the callback is accepted once", async () => {
    const { h, spy } = await setup();
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const first = await callback(h, wizardId);
    expect(first).toMatchObject({ store: "steam", response: { kind: "open-external", id: "apikey" } });
    const second = await callback(h, wizardId);
    expect(second).toMatchObject({ store: "steam", response: { kind: "rejected", error: { code: "invalid-input" } } });
    expect(spy.submits.map((s) => s.stepId)).toEqual(["login"]);
  });

  it("the connector's refusal keeps the same step, with its code and key", async () => {
    const { h } = await setup();
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const cancelled = await callback(h, wizardId, { "openid.mode": "cancel" });
    expect(cancelled.response).toEqual({
      kind: "rejected",
      stepId: "login",
      error: { code: "auth.required", key: "connectors.steam.login.cancelled" },
    });
    expect((await callback(h, wizardId)).response).toMatchObject({ kind: "open-external", id: "apikey" }); // still usable
  });

  it("a second call while one is running is rejected as busy", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const { h } = await setup({ spy: { override: async () => (await gate, keyStep) } });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const first = callback(h, wizardId);
    await Promise.resolve();
    expect((await callback(h, wizardId)).response).toMatchObject({ kind: "rejected", error: { code: "busy" } });
    release();
    expect((await first).response).toMatchObject({ kind: "open-external", id: "apikey" });
  });
});

describe("callback parameters", () => {
  it("more than 32 parameters, bad names and long or control values are invalid input", async () => {
    const { h, spy } = await setup();
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const many = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`openid.p${i}`, "x"]));
    for (const q of [many, { "bad name": "x" }, { "openid.a": "x".repeat(2049) }, { "openid.a": "a\u0000b" }, { "": "x" }]) {
      await expect(callback(h, wizardId, q as Record<string, string>)).rejects.toMatchObject({ code: "invalid-input" });
    }
    expect(spy.submits).toEqual([]);
    const ok = Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`openid.p${i}`, "x"]));
    await expect(callback(h, wizardId, ok)).resolves.toBeDefined();
  });
});

describe("fields", () => {
  async function atKey() {
    const x = await setup();
    const { wizardId } = await x.h.core.startWizard("steam", BASE);
    await callback(x.h, wizardId);
    return { ...x, wizardId };
  }

  it("exactly the declared names: extra or missing fields are rejected", async () => {
    const { h, wizardId, spy } = await atKey();
    for (const input of [
      { kind: "fields", values: {} },
      { kind: "fields", values: { apiKey: KEY, other: "x" } },
      { kind: "fields", values: { other: KEY } },
      { kind: "continue" },
    ] as WizardInput[]) {
      expect(await h.core.submitWizard(wizardId, "apikey", input)).toMatchObject({ kind: "rejected", stepId: "apikey", error: { code: "invalid-input" } });
    }
    expect(spy.submits.map((s) => s.stepId)).toEqual(["login"]);
  });

  it("the pattern and the length are checked on the server, and the value is trimmed", async () => {
    const { h, wizardId, spy } = await atKey();
    for (const bad of ["", "   ", "xyz", KEY.slice(1), `${KEY}0`, "g".repeat(32), `${KEY}\n${KEY}`]) {
      expect(await h.core.submitWizard(wizardId, "apikey", fields(bad)), bad).toMatchObject({ kind: "rejected", error: { code: "invalid-input", params: { field: "apiKey" } } });
    }
    expect(spy.submits).toHaveLength(1); // only the login one
    await h.core.submitWizard(wizardId, "apikey", fields(`  ${KEY}\t`));
    expect(spy.submits[1]).toEqual({ stepId: "apikey", input: fields(KEY) });
  });

  it("never logs the value of a field", async () => {
    const { h, wizardId } = await atKey();
    await h.core.submitWizard(wizardId, "apikey", fields("not-the-key-but-secret"));
    await h.core.submitWizard(wizardId, "apikey", fields(KEY));
    expect(h.logs.join("\n")).not.toMatch(/not-the-key|0123456789abcdef/);
  });

  it("applies extract before validating", async () => {
    const step: WizardStep = { ...keyStep, id: "code", fields: [{ name: "apiKey", labelKey: k("connectors.steam.l"), secret: true, maxLength: 64, extract: "json-field:authorizationCode" }] };
    const { h } = await setup({ spy: { override: async (id, input) => (id === "login" ? step : input.kind === "fields" ? { kind: "done" } : step) } });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    await callback(h, wizardId);
    expect(await h.core.submitWizard(wizardId, "code", fields("not json"))).toMatchObject({ kind: "rejected" });
    expect(await h.core.submitWizard(wizardId, "code", fields('{"authorizationCode":"abc"}'))).toEqual({ kind: "done" });
  });
});

describe("what the connector returns is validated (ADR 40 rule 4)", () => {
  const bad: [string, WizardStep][] = [
    ["a url outside authHosts", { ...keyStep, url: "https://evil.example/key" }],
    ["a http url", { ...keyStep, url: "http://login.example.com/key" }],
    ["a url with credentials", { ...keyStep, url: "https://u:p@login.example.com/key" }],
    ["a bad step id", { ...keyStep, id: "Bad Id" }],
    ["a key outside the connector namespace", { ...keyStep, titleKey: k("web.something") }],
    ["a key of another connector", { ...keyStep, bodyKey: k("connectors.gog.body") }],
    ["more than 4 fields", { ...keyStep, fields: Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, labelKey: k("connectors.steam.l"), secret: false, maxLength: 5 })) }],
    ["a field name with a dot", { ...keyStep, fields: [{ name: "a.b", labelKey: k("connectors.steam.l"), secret: false, maxLength: 5 }] }],
    ["maxLength 0", { ...keyStep, fields: [{ name: "a", labelKey: k("connectors.steam.l"), secret: false, maxLength: 0 }] }],
    ["maxLength 5000", { ...keyStep, fields: [{ name: "a", labelKey: k("connectors.steam.l"), secret: false, maxLength: 5000 }] }],
    ["a pattern that does not compile", { ...keyStep, fields: [{ name: "a", labelKey: k("connectors.steam.l"), secret: false, maxLength: 5, pattern: "(" }] }],
    ["fields on a callback step", { ...keyStep, awaits: "callback" }],
    ["an unknown kind", { kind: "weird", id: "x" } as never],
  ];
  it.each(bad)("%s: internal, and the session is closed", async (_name, step) => {
    const { h } = await setup({ spy: { override: async () => step } });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    expect((await callback(h, wizardId)).response).toMatchObject({ kind: "rejected", error: { code: "internal" } });
    await expect(callback(h, wizardId)).rejects.toMatchObject({ code: "not-found" });
  });

  it("an exception that is not a ConnectorError is internal and closes the session", async () => {
    const { h } = await setup({
      spy: {
        override: async () => {
          throw new TypeError("bug");
        },
      },
    });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    expect((await callback(h, wizardId)).response).toMatchObject({ kind: "rejected", error: { code: "internal" } });
    await expect(h.core.submitWizard(wizardId, "login", { kind: "continue" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("a connector that never answers is cut at the timeout and the step stays usable", async () => {
    const { h } = await setup({ spy: { override: () => new Promise(() => undefined) } });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const pending = callback(h, wizardId);
    await new Promise((r) => setTimeout(r, 0));
    h.clock.fire();
    expect((await pending).response).toMatchObject({ kind: "rejected", stepId: "login" });
  });
});

describe("expiry and cancel", () => {
  it("a wizard expires after 15 minutes without activity; activity renews it", async () => {
    const { h } = await setup();
    const a = await h.core.startWizard("steam", BASE);
    h.clock.time += 14 * 60_000;
    await expect(h.core.submitWizard(a.wizardId, "login", { kind: "continue" })).resolves.toBeDefined(); // renews
    h.clock.time += 14 * 60_000;
    await expect(callback(h, a.wizardId)).resolves.toBeDefined();
    h.clock.time += 15 * 60_000;
    await expect(callback(h, a.wizardId)).rejects.toMatchObject({ code: "not-found" });
    await expect(h.core.submitWizard(a.wizardId, "login", { kind: "continue" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("cancel is idempotent and also works for an unknown id", async () => {
    const { h } = await setup();
    const a = await h.core.startWizard("steam", BASE);
    await h.core.cancelWizard(a.wizardId);
    await h.core.cancelWizard(a.wizardId);
    await h.core.cancelWizard("nope");
    await expect(callback(h, a.wizardId)).rejects.toMatchObject({ code: "not-found" });
  });

  it("cancelling while the connector is storing secrets leaves no connection and no secrets (audit)", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const { h } = await setup({
      spy: {
        override: async (stepId) => {
          if (stepId === "login") return keyStep;
          await gate;
          return { kind: "done", accountLabel: "Ana" };
        },
      },
    });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    await callback(h, wizardId);
    // The connector stores its secrets, then the user cancels before it answers.
    const pending = h.core.submitWizard(wizardId, "apikey", fields(KEY));
    await Promise.resolve();
    h.store.secretRows.set("store:steam|apiKey", { scope: "store:steam", name: "apiKey", ciphertext: "x", keyId: 1, updatedAt: 0 });
    await h.core.cancelWizard(wizardId);
    release();
    expect(await pending).toMatchObject({ kind: "rejected" });
    expect(h.store.connectionRows.has("steam")).toBe(false);
    expect(h.store.secretRows.size).toBe(0);
  });

  it("disconnecting a store drops its open wizard", async () => {
    const { h } = await setup();
    const a = await h.core.startWizard("steam", BASE);
    await h.core.disconnect("steam");
    await expect(callback(h, a.wizardId)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("done", () => {
  async function finish(extra: Parameters<typeof setup>[0] = {}) {
    const x = await setup(extra);
    // A recent attempt that would block an unforced sync.
    x.h.store.sync.set("steam:library", { store: "steam", operation: "library", lastAttemptAt: x.h.clock.time, lastSuccessAt: x.h.clock.time, status: "idle", error: null, nextAllowedAt: null });
    const { wizardId } = await x.h.core.startWizard("steam", BASE);
    await callback(x.h, wizardId);
    const done = await x.h.core.submitWizard(wizardId, "apikey", fields(KEY));
    return { ...x, wizardId, done };
  }

  it("marks the store connected with the account label, ends the session and stores the secrets encrypted", async () => {
    const { h, done, wizardId } = await finish();
    expect(done).toEqual({ kind: "done", accountLabel: "Ana" });
    expect(h.store.connectionRows.get("steam")).toEqual({ store: "steam", status: "connected", accountLabel: "Ana", connectedAt: h.clock.time });
    expect([...h.store.secretRows.keys()].sort()).toEqual(["store:steam|apiKey", "store:steam|steamId"]);
    expect(JSON.stringify([...h.store.secretRows.values()])).not.toContain(KEY);
    await expect(h.core.submitWizard(wizardId, "apikey", fields(KEY))).rejects.toMatchObject({ code: "not-found" });
    expect(h.logs.join("\n")).not.toMatch(/Ana|76561190000000000|0123456789abcdef/);
  });

  it("the wizard state never reaches the database (memory only)", async () => {
    const { h } = await finish();
    // steamId is stored only because the connector wrote it to the vault on purpose; the in-memory state key is not a row.
    expect(JSON.stringify([...h.store.secretRows.values()])).not.toContain("76561190000000000");
    expect([...h.store.secretRows.values()].map((r) => r.name)).not.toContain("wizardState");
  });

  it("schedules the first library sync forced, without the floor", async () => {
    const { h } = await finish();
    await h.core.whenIdle();
    expect([...h.store.properties.values()].map((p) => p.storeGameId)).toEqual(["10"]);
    expect(h.store.sync.get("steam:library")).toMatchObject({ status: "idle", lastSuccessAt: h.clock.time });
  });

  it("drops an account label that is too long or has control characters", async () => {
    for (const label of ["x".repeat(101), "a\u0000b", "   "]) {
      const { h, done } = await finish({ spy: { override: async (id) => (id === "login" ? keyStep : { kind: "done", accountLabel: label }) } });
      expect(done).toEqual({ kind: "done" });
      expect(h.store.connectionRows.get("steam")).toMatchObject({ status: "connected", accountLabel: null });
    }
  });

  it("reconnecting replaces an expired connection", async () => {
    const x = await setup();
    x.h.store.connectionRows.set("steam", { store: "steam", status: "expired", accountLabel: "Old", connectedAt: 1 });
    const { wizardId } = await x.h.core.startWizard("steam", BASE);
    await callback(x.h, wizardId);
    await x.h.core.submitWizard(wizardId, "apikey", fields(KEY));
    expect(x.h.store.connectionRows.get("steam")).toMatchObject({ status: "connected", accountLabel: "Ana" });
  });

  it("while the first run is not finished the sync waits, and starts when onboarding completes", async () => {
    const spy: Spy = { contexts: [], submits: [] };
    const h = await harness({
      onboarded: false,
      dirs: ["D:\\Games"],
      connectors: [makeConnector({ connection: wizard(spy), caps: { library: true }, library: async () => ({ complete: true, entries: [owned("10", "Portal")] }) })],
      http: () => offlineHttp,
    });
    addUserRoot(h, "D:\\Games");
    const { wizardId } = await h.core.startWizard("steam", BASE);
    await callback(h, wizardId);
    await h.core.submitWizard(wizardId, "apikey", fields(KEY));
    await h.core.whenIdle();
    expect(h.store.properties.size).toBe(0);
    await h.core.completeOnboarding("manual-only");
    await h.core.whenIdle();
    expect(h.store.properties.size).toBe(1);
  });
});
