// Embedded login step (ADR 80) and 'library' locations.
import { makeSecret } from "@ludiary/contracts";
import type { ConnectionWizard, EmbeddedLogin, I18nKey, LocationResolver, Secret, WizardInput, WizardStep } from "@ludiary/contracts";
import { describe, expect, it } from "vitest";
import { harness, makeConnector, offlineHttp, owned, resolver } from "./helpers";

const k = (s: string) => s as I18nKey;
const BASE = "http://ludiary.localhost:48123";
const TICKET = "ubisoft-test-remember-me-ticket-".padEnd(70, "x");

const step = (over: Record<string, unknown> = {}): WizardStep =>
  ({
    kind: "embedded-login",
    id: "login",
    titleKey: k("connectors.steam.login.title"),
    bodyKey: k("connectors.steam.login.body"),
    windowTitleKey: k("connectors.steam.login.window"),
    url: "https://login.example.com/login?x=1",
    doneUrl: "https://login.example.com/ready",
    captureUrl: "https://login.example.com/change/",
    capture: [{ name: "ticket", storageKeys: ["a", "b"], jsonField: "ticket", pattern: "[A-Za-z0-9-]{64,}", maxLength: 200 }],
    ...over,
  }) as WizardStep;

async function setup(port: EmbeddedLogin | null, over: Record<string, unknown> = {}) {
  const submits: WizardInput[] = [];
  const connection: ConnectionWizard = {
    start: async () => step(over),
    submit: async (_ctx, _id, input) => (submits.push(input), { kind: "done", accountLabel: "Ana" }),
    status: async () => ({ state: "connected" }),
    disconnect: async () => undefined,
  };
  const h = await harness({ connectors: [makeConnector({ connection, caps: { library: true }, library: async () => ({ complete: true, entries: [] }) })], http: () => offlineHttp });
  if (port) h.deps.embeddedLogin = port;
  return { h, spy: { submits } };
}

type Result = Awaited<ReturnType<EmbeddedLogin["run"]>>;
const captured = (value = TICKET): Result => ({ kind: "captured", values: { ticket: makeSecret(value) as Secret }, blockedHosts: ["ads.example.net"] });

describe("embedded-login step", () => {
  it("opens the window with the manifest's authHosts and the translated title, then submits 'embedded'", async () => {
    const calls: Parameters<EmbeddedLogin["run"]>[0][] = [];
    const { h, spy } = await setup({ run: async (req) => (calls.push(req), captured()) });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    const r = await h.core.submitWizard(wizardId, "login", { kind: "continue" });
    expect(r).toMatchObject({ kind: "done" });
    expect(calls[0]).toMatchObject({ title: "connectors.steam.login.window", allowedHosts: ["login.example.com"], startUrl: "https://login.example.com/login?x=1" });
    expect(spy.submits[0]).toMatchObject({ kind: "embedded" });
    expect(h.logs.join("\n")).not.toContain(TICKET);
    expect(h.logs.join("\n")).toContain("ads.example.net");
  });

  it("rejects without the port, and kind 'embedded' from the API", async () => {
    const { h, spy } = await setup(null);
    const { wizardId } = await h.core.startWizard("steam", BASE);
    expect(await h.core.submitWizard(wizardId, "login", { kind: "continue" })).toMatchObject({ kind: "rejected", error: { key: "wizard.embedded.unavailable" } });
    await expect(h.core.submitWizard(wizardId, "login", { kind: "embedded", values: { ticket: makeSecret(TICKET) } })).rejects.toMatchObject({ code: "invalid-input" });
    expect(spy.submits).toEqual([]);
  });

  const outcomes: [Result, string][] = [
    [{ kind: "cancelled", blockedHosts: [] }, "cancelled"],
    [{ kind: "unavailable", reason: "busy" }, "busy"],
    [{ kind: "unavailable", reason: "runtime-missing" }, "runtimeMissing"],
    [{ kind: "failed", reason: "failed" }, "failed"],
    [{ kind: "failed", reason: "capture-missing" }, "captureMissing"],
  ];
  it.each(outcomes)("%j -> wizard.embedded.%s, same step, connector not called", async (result, name) => {
    const { h, spy } = await setup({ run: async () => result });
    const { wizardId } = await h.core.startWizard("steam", BASE);
    expect(await h.core.submitWizard(wizardId, "login", { kind: "continue" })).toMatchObject({ kind: "rejected", stepId: "login", error: { key: `wizard.embedded.${name}` } });
    expect(spy.submits).toEqual([]);
    expect(await h.core.submitWizard(wizardId, "login", { kind: "continue" })).toMatchObject({ kind: "rejected" }); // still usable
  });

  it("checks names, pattern and length of what was captured", async () => {
    const wrongName: Result = { kind: "captured", values: { other: makeSecret(TICKET) }, blockedHosts: [] };
    for (const bad of [captured("short"), captured("é".repeat(70)), captured("a".repeat(201)), wrongName]) {
      const { h, spy } = await setup({ run: async () => bad });
      const { wizardId } = await h.core.startWizard("steam", BASE);
      expect(await h.core.submitWizard(wizardId, "login", { kind: "continue" })).toMatchObject({ kind: "rejected", error: { key: "wizard.embedded.failed" } });
      expect(spy.submits).toEqual([]);
    }
  });

  it("DELETE, another wizard of the store, shutdown and the 10 minutes abort the signal; the session does not expire meanwhile", async () => {
    for (const how of ["delete", "other", "shutdown", "timeout"] as const) {
      let signal!: AbortSignal;
      let release!: (r: Result) => void;
      const { h, spy } = await setup({ run: (_req, s) => ((signal = s), new Promise<Result>((res) => (release = res))) });
      const { wizardId } = await h.core.startWizard("steam", BASE);
      const pending = h.core.submitWizard(wizardId, "login", { kind: "continue" });
      await new Promise((r) => setTimeout(r, 0));
      expect(signal.aborted).toBe(false);
      h.clock.time += 3_600_000; // far beyond the 15 minutes of idle: a busy session is not purged
      expect(await h.core.submitWizard(wizardId, "login", { kind: "continue" })).toMatchObject({ kind: "rejected", error: { code: "busy" } });
      if (how === "delete") await h.core.cancelWizard(wizardId);
      else if (how === "other") await h.core.startWizard("steam", BASE);
      else if (how === "shutdown") h.core.shutdown();
      else h.clock.fire();
      expect(signal.aborted).toBe(true);
      release(captured()); // a capture that arrives late
      expect(await pending).toMatchObject({ kind: "rejected", error: { key: "wizard.embedded.cancelled" } });
      expect(spy.submits).toEqual([]); // the connector never saw it
    }
  });

  const bad: [string, Record<string, unknown>][] = [
    ["http url", { url: "http://login.example.com/x" }],
    ["host outside authHosts", { doneUrl: "https://evil.example.com/ready" }],
    ["doneUrl with query", { doneUrl: "https://login.example.com/ready?a=1" }],
    ["5 capture fields", { capture: Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, storageKeys: ["a"], jsonField: "a", pattern: ".", maxLength: 5 })) }],
    ["pattern that does not compile", { capture: [{ name: "t", storageKeys: ["a"], jsonField: "a", pattern: "(", maxLength: 5 }] }],
    ["unknown source", { capture: [{ name: "t", source: "cookies", storageKeys: [], jsonField: "a", pattern: ".", maxLength: 5 }] }],
    ["document-json with storageKeys", { capture: [{ name: "t", source: "document-json", storageKeys: ["a"], jsonField: "a", pattern: ".", maxLength: 5 }] }],
    ["query in captureUrl with local-storage", { captureUrl: "https://login.example.com/change/?a=1" }],
    ["mixed sources", { capture: [{ name: "t", source: "document-json", storageKeys: [], jsonField: "a", pattern: ".", maxLength: 5 }, { name: "u", storageKeys: ["a"], jsonField: "a", pattern: ".", maxLength: 5 }] }],
    ["fragment in captureUrl", { captureUrl: "https://login.example.com/change/#x", capture: [{ name: "t", source: "document-json", storageKeys: [], jsonField: "a", pattern: ".", maxLength: 5 }] }],
    ["url and doneUrl on the same origin and path", { doneUrl: "https://login.example.com/login" }],
    ["maxLength too big", { capture: [{ name: "t", storageKeys: ["a"], jsonField: "a", pattern: ".", maxLength: 9000 }] }],
  ];
  it("document-json: a query in captureUrl is accepted and source reaches the port", async () => {
    let req: Parameters<EmbeddedLogin["run"]>[0] | undefined;
    const over = { captureUrl: "https://login.example.com/auth?c=1", capture: [{ name: "ticket", source: "document-json", storageKeys: [], jsonField: "access_token", pattern: "[A-Za-z0-9-]{64,}", maxLength: 200 }] };
    const { h } = await setup({ run: async (r) => ((req = r), captured()) }, over);
    const { wizardId } = await h.core.startWizard("steam", BASE);
    await h.core.submitWizard(wizardId, "login", { kind: "continue" });
    expect(req?.captureUrl).toBe("https://login.example.com/auth?c=1");
    expect(req?.capture[0]).toMatchObject({ source: "document-json", storageKeys: [] });
  });

  it.each(bad)("a step with %s is internal", async (_n, over) => {
    const { h } = await setup({ run: async () => captured() }, over);
    await expect(h.core.startWizard("steam", BASE)).rejects.toMatchObject({ code: "internal" });
  });
});

describe("'library' locations (ADR 80)", () => {
  const LOC = [{ id: "cache", purpose: "library" as const, os: ["windows" as const], sources: [{ kind: "known-folder" as const, folder: "LocalAppData" as const, relative: "X" }] }];
  async function run(mode: "auto-and-manual" | "manual-only", locations: LocationResolver) {
    const seen: { fs: boolean; locs: number }[] = [];
    const h = await harness({
      connectors: [
        makeConnector({
          locations: LOC,
          caps: { library: true },
          library: async (ctx) => (seen.push({ fs: ctx.fs !== undefined, locs: ctx.libraryLocations?.length ?? -1 }), { complete: true, entries: [owned("1", "A")] }),
        }),
      ],
      http: () => offlineHttp,
      connected: ["steam"],
      mode,
      locations,
    });
    await h.core.requestSync({ trigger: "manual", operations: ["library"] });
    await h.core.whenIdle();
    return { h, seen };
  }

  it("gives fs and the resolved locations only with auto-detection", async () => {
    expect((await run("auto-and-manual", resolver({ cache: [{ declarationId: "cache", path: "C:\\L" }] }))).seen).toEqual([{ fs: true, locs: 1 }]);
    expect((await run("auto-and-manual", resolver({}))).seen).toEqual([{ fs: true, locs: 0 }]); // absent is not an error
    expect((await run("manual-only", resolver({ cache: [{ declarationId: "cache", path: "C:\\L" }] }))).seen).toEqual([{ fs: false, locs: -1 }]);
  });

  it("an unreadable declaration is scan.discovery-unavailable and the connector is not called", async () => {
    const { h, seen } = await run("auto-and-manual", {
      resolve: async () => {
        throw new Error("registry down");
      },
    });
    expect(seen).toEqual([]);
    expect((await h.core.storeStatus()).find((s) => s.store === "steam")?.sync.find((x) => x.operation === "library")?.error?.code).toBe("scan.discovery-unavailable");
  });
});
