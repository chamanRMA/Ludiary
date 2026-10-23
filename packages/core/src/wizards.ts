// Connection wizard engine (ADR 40 rule 4, ADR 74 point 5). Sessions live in memory only: never persisted, gone when
// the server stops, finished, cancelled or idle for 15 minutes. The connector decides the steps; the core validates
// everything it returns and everything the web sends, and accepts each step once.
import { ConnectorError } from "@ludiary/contracts";
import type { ConnectionWizard, StoreConnector, StoreId, WizardContext, WizardDone, WizardField, WizardInput, WizardStep } from "@ludiary/contracts";
import { memoryVault, syncContext } from "./contexts";
import { MAX_WIZARDS, WIZARD_CALL_MS, WIZARD_TTL_MS, type Env, type WizardResponse } from "./env";
import { CoreError, defaultKey, toErrorInfo } from "./errors";
import type { CoreErrorInfo } from "./model";
import { withTimeout } from "./timeout";
import { storeScope } from "./vault";

const STEP_ID = /^[a-z][a-z0-9-]{0,31}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9]{0,31}$/;
const EXTRACT = /^(?:json-field|url-query):[A-Za-z0-9_.-]{1,64}$/;
const PARAM_NAME = /^[A-Za-z0-9._-]{1,64}$/;
const CONTROL = /\p{Cc}/u;
const MAX_FIELDS = 4;
const MAX_QUERY_PARAMS = 32;
const MAX_QUERY_VALUE = 2048;
const MAX_LABEL = 100;

interface Session {
  id: string;
  store: StoreId;
  connector: StoreConnector;
  connection: ConnectionWizard;
  callbackUrl: string;
  step: WizardStep | null;
  /** Wizard state of the connector (ADR 40): memory only. */
  state: Map<string, string>;
  touchedAt: number;
  busy: boolean;
}

export interface WizardEngine {
  start(store: StoreId, returnBase: string): Promise<{ wizardId: string; response: WizardResponse }>;
  submit(wizardId: string, stepId: string, input: WizardInput): Promise<WizardResponse>;
  callback(wizardId: string, query: Readonly<Record<string, string>>): Promise<{ store: StoreId; response: WizardResponse }>;
  cancel(wizardId: string): void;
  /** Drops the open wizard of a store, if any (disconnect). */
  cancelStore(store: StoreId): void;
}

const rejected = (stepId: string, error: CoreErrorInfo): WizardResponse => ({ kind: "rejected", stepId, error });
const rejectedCode = (stepId: string, code: "invalid-input" | "busy" | "internal", params?: CoreErrorInfo["params"]): WizardResponse =>
  rejected(stepId, { code, key: defaultKey(code), ...(params ? { params } : {}) });

/** Rule 4 of ADR 40 on a step returned by the connector. Throws if it does not comply. */
function checkStep(step: unknown, c: StoreConnector): asserts step is WizardStep {
  const bad = (why: string): never => {
    throw new Error(`Invalid wizard step: ${why}`);
  };
  if (!step || typeof step !== "object") return bad("not an object");
  const s = step as Record<string, unknown>;
  if (typeof s.id !== "string" || !STEP_ID.test(s.id)) bad("id");
  const prefixes = [`connectors.${c.id}.`, "connectors.common."];
  const key = (v: unknown, what: string) => {
    if (typeof v !== "string" || !prefixes.some((p) => v.startsWith(p)) || v.length > 200 || CONTROL.test(v)) bad(what);
  };
  key(s.titleKey, "titleKey");
  key(s.bodyKey, "bodyKey");
  const checkFields = (fields: unknown) => {
    if (!Array.isArray(fields) || fields.length < 1 || fields.length > MAX_FIELDS) return bad("fields");
    const names = new Set<string>();
    for (const f of fields as WizardField[]) {
      if (!f || typeof f !== "object" || typeof f.name !== "string" || !FIELD_NAME.test(f.name) || names.has(f.name)) return bad("field name");
      names.add(f.name);
      key(f.labelKey, "field labelKey");
      if (typeof f.secret !== "boolean") bad("field secret");
      if (!Number.isInteger(f.maxLength) || f.maxLength < 1 || f.maxLength > 4096) bad("field maxLength");
      if (f.pattern !== undefined) {
        try {
          new RegExp(f.pattern);
        } catch {
          bad("field pattern");
        }
      }
      if (f.extract !== undefined && (typeof f.extract !== "string" || !EXTRACT.test(f.extract))) bad("field extract");
    }
  };
  if (s.kind === "info") return;
  if (s.kind === "input") return checkFields(s.fields);
  if (s.kind !== "open-external") return bad("kind");
  if (s.awaits !== "callback" && s.awaits !== "input") bad("awaits");
  if (s.fields !== undefined) {
    if (s.awaits !== "input") bad("fields need awaits 'input'");
    checkFields(s.fields);
  }
  let url: URL | null = null;
  try {
    url = new URL(String(s.url));
  } catch {
    bad("url");
  }
  if (!url || url.protocol !== "https:" || url.username !== "" || url.password !== "" || !c.authHosts.includes(url.hostname.toLowerCase())) bad("url host");
}

function stepFields(step: WizardStep): readonly WizardField[] | null {
  if (step.kind === "input") return step.fields;
  if (step.kind === "open-external" && step.fields && step.fields.length > 0) return step.fields;
  return null;
}

/** Same rule as the web's `extractValue` (ADR 78 point 7). null: it was JSON but the field is missing or not text. */
function pickJsonField(text: string, name: string): string | null {
  const field = (o: unknown): string | null => {
    const v = o !== null && typeof o === "object" ? (o as Record<string, unknown>)[name] : undefined;
    return typeof v === "string" ? v : null;
  };
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string") return parsed; // a quoted value is a bare value
    if (parsed !== null && typeof parsed === "object") return field(parsed); // any other JSON (a number) falls through
  } catch {
    /* not JSON: try the braces, then the bare value */
  }
  const open = text.indexOf("{");
  if (open === -1) return text.replace(/^["']|["']$/g, "");
  try {
    return field(JSON.parse(text.slice(open, text.lastIndexOf("}") + 1)));
  } catch {
    return null;
  }
}

/** Applies `extract`, trims and checks maxLength and the anchored pattern. null means the value is not acceptable. */
function cleanField(f: WizardField, raw: string, hosts: readonly string[]): string | null {
  let value = raw;
  if (f.extract) {
    const [kind, name] = [f.extract.slice(0, f.extract.indexOf(":")), f.extract.slice(f.extract.indexOf(":") + 1)];
    try {
      if (kind === "json-field") {
        // ADR 78 point 7: JSON, else the part between the first "{" and the last "}", else the bare value.
        const v = pickJsonField(value, name);
        if (v === null) return null;
        value = v;
      } else {
        const url = new URL(value);
        // ADR 77 audit M1: only a page of the store's own hosts can hand a code over.
        if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || !hosts.includes(url.hostname)) return null;
        const v = url.searchParams.get(name);
        if (v === null) return null;
        value = v;
      }
    } catch {
      return null;
    }
  }
  value = value.trim();
  if (value.length > f.maxLength || value === "" || CONTROL.test(value)) return null;
  if (f.pattern !== undefined && !new RegExp(`^(?:${f.pattern})$`).test(value)) return null;
  return value;
}

export function createWizardEngine(env: Env, onConnected: (store: StoreId) => Promise<void>): WizardEngine {
  const { deps } = env;
  const sessions = new Map<string, Session>();

  function purge(): void {
    const now = deps.clock.now();
    for (const [id, s] of sessions) if (!s.busy && now - s.touchedAt >= WIZARD_TTL_MS) sessions.delete(id);
  }

  function live(wizardId: unknown): Session {
    purge();
    const s = typeof wizardId === "string" ? sessions.get(wizardId) : undefined;
    if (!s) throw new CoreError("not-found", "Unknown or expired wizard");
    s.touchedAt = deps.clock.now();
    return s;
  }

  async function context(s: Session, signal: AbortSignal): Promise<WizardContext> {
    return { ...(await syncContext(env, s.connector, signal, { epoch: "bump" })), callbackUrl: s.callbackUrl, wizardState: memoryVault(s.state), now: () => deps.clock.now() };
  }

  async function finish(s: Session, done: WizardDone): Promise<WizardResponse> {
    const label = typeof done.accountLabel === "string" ? done.accountLabel.trim() : "";
    const accountLabel = label !== "" && label.length <= MAX_LABEL && !CONTROL.test(label) ? label : null;
    await deps.connections.put({ store: s.store, status: "connected", accountLabel, connectedAt: deps.clock.now() });
    sessions.delete(s.id);
    deps.log.info("Store connected", { connector: s.store });
    // The first library sync is forced (no floor); a failure here must not undo the connection.
    await onConnected(s.store).catch(() => deps.log.warn("Could not schedule the first library sync", { connector: s.store }));
    return { kind: "done", ...(accountLabel ? { accountLabel } : {}) };
  }

  /** Runs one connector call. A ConnectorError is a rejection of the same step; anything else is 'internal' and closes the session. */
  async function call(s: Session, stepId: string, work: (ctx: WizardContext) => Promise<WizardStep | WizardDone>): Promise<WizardResponse> {
    s.busy = true;
    try {
      const signal = deps.clock.timeout(WIZARD_CALL_MS);
      const out = await withTimeout(signal, async () => work(await context(s, signal)));
      if (out && typeof out === "object" && (out as WizardDone).kind === "done") {
        // Cancelled or disconnected while the connector was working: do not mark it connected, drop what it stored.
        if (sessions.get(s.id) !== s) {
          await deps.secrets.deleteScope(storeScope(s.store));
          return rejectedCode(stepId, "invalid-input");
        }
        return await finish(s, out as WizardDone);
      }
      checkStep(out, s.connector);
      s.step = out;
      return out;
    } catch (e) {
      if (e instanceof ConnectorError) {
        deps.log.warn("Wizard step rejected by the connector", { connector: s.store, code: e.code });
        return rejected(stepId, toErrorInfo(e));
      }
      deps.log.error("Wizard failed", { connector: s.store, error: e instanceof Error ? e.name : "unknown" });
      sessions.delete(s.id);
      // A timeout can land after the connector stored secrets: without a connection row they would be orphaned.
      if (!(await deps.connections.get(s.store))) await deps.secrets.deleteScope(storeScope(s.store));
      return rejectedCode(stepId, "internal");
    } finally {
      s.busy = false;
      s.touchedAt = deps.clock.now();
    }
  }

  function checkQuery(query: unknown): asserts query is Readonly<Record<string, string>> {
    const bad = () => new CoreError("invalid-input", "Invalid callback parameters");
    if (!query || typeof query !== "object" || Array.isArray(query)) throw bad();
    const entries = Object.entries(query);
    if (entries.length > MAX_QUERY_PARAMS) throw bad();
    for (const [k, v] of entries) {
      if (!PARAM_NAME.test(k) || typeof v !== "string" || v.length > MAX_QUERY_VALUE || CONTROL.test(v)) throw bad();
    }
  }

  function cancelStore(store: StoreId): void {
    for (const [id, s] of sessions) if (s.store === store) sessions.delete(id);
  }

  return {
    async start(store, returnBase) {
      const connector = env.connectors.get(store);
      const connection = connector?.connection;
      if (!connector || !connection) throw new CoreError("not-found", "This store has no connection wizard");
      let origin: URL;
      try {
        origin = new URL(returnBase);
      } catch {
        throw new CoreError("invalid-input", "Invalid return base");
      }
      if (origin.protocol !== "http:" || origin.username !== "" || origin.password !== "" || origin.origin !== returnBase) {
        throw new CoreError("invalid-input", "Invalid return base");
      }
      purge();
      cancelStore(store);
      if (sessions.size >= MAX_WIZARDS) throw new CoreError("busy", "Too many open wizards");
      const id = deps.newId();
      const s: Session = {
        id,
        store,
        connector,
        connection,
        callbackUrl: `${returnBase}/connect/return?w=${id}`,
        step: null,
        state: new Map(),
        touchedAt: deps.clock.now(),
        busy: false,
      };
      sessions.set(id, s);
      const response = await call(s, "start", (ctx) => connection.start(ctx));
      if (response.kind === "rejected") {
        sessions.delete(id);
        throw new CoreError(response.error.code, "The wizard could not start", { key: response.error.key, ...(response.error.params ? { params: response.error.params } : {}) });
      }
      return { wizardId: id, response };
    },

    async submit(wizardId, stepId, input) {
      const s = live(wizardId);
      const step = s.step;
      if (!input || typeof input !== "object" || input.kind === "callback") throw new CoreError("invalid-input", "Invalid wizard input");
      if (s.busy || !step) return rejectedCode(step?.id ?? "start", "busy");
      if (stepId !== step.id) return rejectedCode(step.id, "invalid-input"); // out of turn, or a step already accepted
      const fields = stepFields(step);
      if (fields) {
        if (input.kind !== "fields" || !input.values || typeof input.values !== "object") return rejectedCode(step.id, "invalid-input");
        const names = Object.keys(input.values);
        if (names.length !== fields.length || fields.some((f) => !Object.hasOwn(input.values, f.name))) return rejectedCode(step.id, "invalid-input");
        const values: Record<string, string> = {};
        for (const f of fields) {
          const raw = input.values[f.name];
          const clean = typeof raw === "string" ? cleanField(f, raw, [...s.connector.authHosts, ...s.connector.apiHosts]) : null;
          if (clean === null) return rejectedCode(step.id, "invalid-input", { field: f.name });
          values[f.name] = clean;
        }
        return call(s, step.id, (ctx) => s.connection.submit(ctx, step.id, { kind: "fields", values }));
      }
      if (step.kind === "open-external" && step.awaits === "callback") return rejectedCode(step.id, "invalid-input"); // only by the return route
      if (input.kind !== "continue") return rejectedCode(step.id, "invalid-input");
      return call(s, step.id, (ctx) => s.connection.submit(ctx, step.id, { kind: "continue" }));
    },

    async callback(wizardId, query) {
      const s = live(wizardId);
      checkQuery(query);
      const step = s.step;
      if (s.busy || !step) return { store: s.store, response: rejectedCode(step?.id ?? "start", "busy") };
      // Accepted once: after a success the wizard is on the next step, so a repeated return finds no callback step.
      if (step.kind !== "open-external" || step.awaits !== "callback") return { store: s.store, response: rejectedCode(step.id, "invalid-input") };
      const response = await call(s, step.id, (ctx) => s.connection.submit(ctx, step.id, { kind: "callback", query: { ...query } }));
      return { store: s.store, response };
    },

    cancel(wizardId) {
      if (typeof wizardId === "string") sessions.delete(wizardId);
    },

    cancelStore,
  };
}
