import { describe, expect, it } from "vitest";
import { ApiError, createAuthIssueStore, createHttp, ORIGIN_KEY_HEADER, ORIGIN_KEY_STORAGE, type KeyStorage } from "./http";

interface Call {
  url: string;
  init: RequestInit;
}

type Reply = { status: number; body?: unknown; text?: string };

function setup(reply: Reply | (() => never), key: string | null = "test-key-not-real") {
  const calls: Call[] = [];
  const data = new Map<string, string>(key ? [[ORIGIN_KEY_STORAGE, key]] : []);
  const storage: KeyStorage = { getItem: (k) => data.get(k) ?? null, removeItem: (k) => void data.delete(k) };
  const issues = createAuthIssueStore();
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (typeof reply === "function") reply();
    const r = reply as Reply;
    return new Response(r.status === 204 ? null : (r.text ?? JSON.stringify(r.body ?? {})), { status: r.status });
  }) as typeof fetch;
  return { http: createHttp({ fetch: fetchFn, storage, issues }), calls, data, issues };
}

const headers = (c: Call | undefined): Record<string, string> => (c?.init.headers ?? {}) as Record<string, string>;

describe("http wrapper", () => {
  it("sends the origin key header, same-origin credentials and JSON", async () => {
    const { http, calls } = setup({ status: 200, body: [] });
    await http.get("/api/library");
    await http.post("/api/sync", { trigger: "open" });
    expect(calls[0]?.init.credentials).toBe("same-origin");
    expect(headers(calls[0])[ORIGIN_KEY_HEADER]).toBe("test-key-not-real");
    expect(headers(calls[0])["Content-Type"]).toBeUndefined();
    expect(headers(calls[1])["Content-Type"]).toBe("application/json");
    expect(calls[1]?.init.body).toBe('{"trigger":"open"}');
    expect(calls[0]?.url).not.toContain("?");
  });

  it("sends no body and no Content-Type when the POST has no body (onboarding reset)", async () => {
    const { http, calls } = setup({ status: 204 });
    await expect(http.post("/api/onboarding/reset")).resolves.toBeUndefined();
    expect(calls[0]?.init.body).toBeUndefined();
    expect(headers(calls[0])["Content-Type"]).toBeUndefined();
  });

  it("sends no key header when none is stored", async () => {
    const { http, calls } = setup({ status: 200, body: {} }, null);
    await http.get("/api/stores");
    expect(headers(calls[0])[ORIGIN_KEY_HEADER]).toBeUndefined();
  });

  it("401 origin_key_required drops the stored key and raises the notice", async () => {
    const { http, data, issues } = setup({ status: 401, body: { error: "origin_key_required" } });
    await expect(http.get("/api/library")).rejects.toMatchObject({ status: 401, key: "auth.originKeyRequired" });
    expect(data.has(ORIGIN_KEY_STORAGE)).toBe(false);
    expect(issues.get()).toBe("origin-key-required");
  });

  it("401 session_required keeps the key and raises the other notice; a later success clears it", async () => {
    const { http, data, issues } = setup({ status: 401, body: { error: "session_required" } });
    await expect(http.get("/api/library")).rejects.toMatchObject({ key: "auth.sessionRequired" });
    expect(data.has(ORIGIN_KEY_STORAGE)).toBe(true);
    expect(issues.get()).toBe("session-required");
    const ok = setup({ status: 200, body: [] });
    ok.issues.set("session-required");
    await ok.http.get("/api/library");
    expect(ok.issues.get()).toBeNull();
  });

  it("turns an error with detail into an ApiError with a translatable key and params", async () => {
    const detail = { code: "launch.launcher-missing", key: "connectors.steam.errors.launcherMissing", params: { n: 1 } };
    const { http } = setup({ status: 422, body: { error: "launch.launcher-missing", detail } });
    const err = await http.post("/api/games/x/launch", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: "launch.launcher-missing", key: detail.key, params: { n: 1 } });
  });

  it("maps errors without detail to generic keys and survives non-JSON bodies", async () => {
    await expect(setup({ status: 404, body: { error: "not-found" } }).http.get("/api/games/x")).rejects.toMatchObject({ key: "core.errors.not-found" });
    await expect(setup({ status: 409, body: { error: "busy" } }).http.post("/api/x", {})).rejects.toMatchObject({ status: 409, code: "busy", key: "errors.generic" });
    await expect(setup({ status: 502, text: "<html>" }).http.get("/api/x")).rejects.toMatchObject({ status: 502, key: "errors.generic" });
  });

  it("reports an unreachable server with a translatable key", async () => {
    const { http } = setup(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(http.get("/api/x")).rejects.toMatchObject({ status: 0, key: "errors.unreachable" });
  });
});
