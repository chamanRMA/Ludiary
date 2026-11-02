import { request } from "node:http";
import type { LudiaryCoreFacade } from "../src/core";

export interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: () => Record<string, unknown>;
}

// node:http instead of fetch: fetch does not let us forge the Host header.
export function send(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: unknown; rawBody?: string; via?: "127.0.0.1" | "::1" } = {},
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const payload = opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body));
    const headers: Record<string, string> = { host: `127.0.0.1:${port}`, ...opts.headers };
    if (payload !== undefined) headers["content-type"] = "application/json";
    const req = request({ host: opts.via ?? "127.0.0.1", port, path, method: opts.method ?? "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c: string) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

export const WIZARD_ROUTES: [string, string][] = [
  ["POST", "/api/stores/steam/wizard"], ["POST", "/api/wizards/w-1/submit"], ["POST", "/api/wizards/w-1/callback"],
  ["DELETE", "/api/wizards/w-1"], ["DELETE", "/api/stores/steam/connection"],
];

/** Records every call; each method can be overridden. */
export function fakeCore(overrides: Partial<LudiaryCoreFacade> = {}): LudiaryCoreFacade & { calls: [string, ...unknown[]][] } {
  const calls: [string, ...unknown[]][] = [];
  const settings = {
    locale: "system" as const,
    detection: "manual-only" as const,
    scanRoots: [{ id: "r1", origin: "user" as const, path: "D:\\Games", enabled: true }],
    storeCollections: { steam: { enabled: true, unverifiedFavorites: false } },
  };
  const store = {
    store: "steam" as const,
    access: "official-api" as const,
    connection: "disconnected" as const,
    mode: "installed-only" as const,
    collections: { status: "idle" as const, lastSuccessAt: 1000, accountVerified: true, favoritesPending: 0 },
    sync: [{ operation: "scan" as const, state: "idle" as const }],
  };
  const game = {
    id: "g1",
    title: "Game One",
    stores: ["steam" as const],
    installed: true,
    favorite: false,
    playtimeMinutes: 0,
    tags: [],
  };
  const rec = <T>(name: string, value: T) => async (...args: unknown[]): Promise<T> => {
    calls.push([name, ...args]);
    return value;
  };
  return {
    calls,
    listLibrary: rec("listLibrary", [game]),
    getGame: async (id) => {
      calls.push(["getGame", id]);
      return id === "g1" ? { ...game, properties: [{ id: "p1", store: "steam", installed: true, actions: ["play"] }], dlc: [], collections: [{ id: "col1", name: "Pending", source: null }, { id: "col2", name: "Co-op", source: "steam" as const }] } : null;
    },
    updateGame: rec("updateGame", { ...game, properties: [], dlc: [], collections: [] }),
    listCollections: rec("listCollections", [{ id: "col1", name: "Pending", source: null, gameIds: ["g1"] }, { id: "col2", name: "Co-op", source: "steam" as const, gameIds: ["g1"] }]),
    createCollection: rec("createCollection", { id: "col1", name: "Pending", source: null, gameIds: [] }),
    renameCollection: rec("renameCollection", { id: "col1", name: "Renamed", source: null, gameIds: [] }),
    deleteCollection: rec("deleteCollection", undefined),
    launch: rec("launch", { status: "started" as const }),
    requestSync: rec("requestSync", undefined),
    storeStatus: rec("storeStatus", [store]),
    getSettings: rec("getSettings", settings),
    updateSettings: rec("updateSettings", settings),
    getOnboarding: rec("getOnboarding", { completedAt: null, detection: null }),
    completeOnboarding: rec("completeOnboarding", undefined),
    resetOnboarding: rec("resetOnboarding", undefined),
    setScanRootEnabled: rec("setScanRootEnabled", undefined),
    pickScanRoot: rec("pickScanRoot", null),
    removeScanRoot: rec("removeScanRoot", undefined),
    startWizard: rec("startWizard", { wizardId: "w-1", response: { kind: "info" as const, id: "choose", titleKey: "t", bodyKey: "b" } }),
    submitWizard: rec("submitWizard", { kind: "done" as const }),
    wizardCallback: rec("wizardCallback", { store: "steam" as const, response: { kind: "done" as const } }),
    cancelWizard: rec("cancelWizard", undefined),
    disconnect: rec("disconnect", undefined),
    ...overrides,
  } as LudiaryCoreFacade & { calls: [string, ...unknown[]][] };
}

export class FakeCoreError extends Error {
  constructor(
    readonly code: string,
    readonly key: string,
    readonly params?: Record<string, string | number>,
  ) {
    super(code);
  }
}
