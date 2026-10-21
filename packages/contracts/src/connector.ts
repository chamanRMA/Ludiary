// Store connector contract, version 1 (ADR 40, extended by ADR 71 and 72).
// Types only, plus ConnectorError and the pure function checkConnectorManifest. No I/O.

export type StoreId = "steam" | "gog" | "epic" | "ubisoft" | "ea";
/** i18n key. Connector keys live under `connectors.<storeId>.*`, shared ones under `connectors.common.*`. */
export type I18nKey = string & { readonly __brand: "I18nKey" };
export type I18nParams = Readonly<Record<string, string | number>>;
export type GameAction = "play" | "open-store-page" | "install";
export type ExternalToolId = "legendary" | "gogdl";

export interface StoreConnector {
  readonly contractVersion: 1;
  readonly id: StoreId;
  readonly nameKey: I18nKey;
  /** 'unofficial-api' is shown to the user as fragile. */
  readonly access: "official-api" | "unofficial-api" | "local-only";
  readonly capabilities: ConnectorCapabilities;
  /** Floor between two library syncs, in ms. The core applies max(floor, configured value). */
  readonly minSyncIntervalMs: number;
  /** Hosts the wizard may send the user to. HTTPS only. */
  readonly authHosts: readonly string[];
  /** ADR 71. HTTPS hosts of every media URL this connector returns (bare host names, lower case). */
  readonly mediaHosts: readonly string[];
  /** Launcher/manifest locations the platform resolves for this connector (see LocationDeclaration). */
  readonly locations: readonly LocationDeclaration[];
  /** Bundled external tools this connector may run. */
  readonly externalTools: readonly ExternalToolId[];

  /** Present only if the store needs an account (not Ubisoft or EA). */
  readonly connection?: ConnectionWizard;
  /** Required when capabilities.library is true. Owned properties, games and DLC. */
  listLibrary?(ctx: SyncContext): Promise<LibrarySnapshot>;
  /** Required when capabilities.scan is true. Installed properties found under ctx.roots. */
  scanInstalled?(ctx: ScanContext): Promise<ScanResult>;
  /**
   * Optional (ADR 72). Reads files under resolved 'scan' locations and returns more scan roots,
   * e.g. the Steam library folders listed in libraryfolders.vdf. The core validates them
   * (absolute, existing directory, at most 64), stores them as 'discovered' scan_roots and
   * shows them in Settings with their own switch (ADR 42).
   */
  discoverRoots?(ctx: DiscoveryContext): Promise<readonly ResolvedLocation[]>;
  /**
   * Describes how to perform an action on a property already stored in the database.
   * Returns null if the action is not available for it. The core validates and executes
   * the result; a LaunchSpec is never returned by the API as a command.
   */
  resolveAction(property: StoredProperty, action: GameAction, ctx: LaunchContext): Promise<LaunchSpec | null>;
  /** Reserved for phase 3 (direct store prices where IsThereAnyDeal does not cover). Absent in the MVP. */
  readonly prices?: PriceProvider;
}

export interface ConnectorCapabilities {
  readonly library: boolean;
  readonly scan: boolean;
  readonly dlc: "none" | "library" | "scan" | "library-and-scan";
  readonly actions: readonly GameAction[];
  readonly launchKinds: readonly LaunchSpec["kind"][];
  /** Allow-list of URI schemes this connector may return, e.g. ['steam']. */
  readonly uriSchemes: readonly string[];
  /** The store reports its own playtime (how it combines with ours is pending). */
  readonly storePlaytime: boolean;
  /** Direct store prices. false until phase 3. */
  readonly price: boolean;
}

// ---------- Contexts (built by the core, one per store and run) ----------

export interface BaseContext {
  /** Cancellation and core-enforced timeout. */
  readonly signal: AbortSignal;
  /** Redacting logger. Messages in English, no secrets, no personal data. */
  readonly log: ConnectorLogger;
  readonly locale: string;
}

/** Types only until the account cut (ADR 72). */
export interface SyncContext extends BaseContext {
  readonly http: HttpClient;
  readonly secrets: SecretVault;
  readonly tools: ExternalToolRunner;
  readonly progress: ProgressReporter;
}

export interface WizardContext extends SyncContext {
  /** Core-owned return URL for OpenID/OAuth flows (uses the current port, ADR 28). */
  readonly callbackUrl: string;
  /** Encrypted, short-lived state for this wizard session; wiped on done or cancel. */
  readonly wizardState: SecretVault;
}

export interface ScanContext extends BaseContext {
  /** User folders plus resolved locations declared by this connector. */
  readonly roots: readonly ScanRoot[];
  /** Read-only, confined to roots. Path semantics come from the platform. */
  readonly fs: ScopedFileReader;
  readonly progress: ProgressReporter;
}

export interface DiscoveryContext extends BaseContext {
  /** Resolved locations of this connector with purpose 'scan'. */
  readonly locations: readonly ResolvedLocation[];
  /** Read-only, confined to those locations. */
  readonly fs: ScopedFileReader;
}

export interface LaunchContext extends BaseContext {
  /** Resolved locations with purpose 'launcher' (e.g. GOG Galaxy client). */
  readonly launchers: readonly ResolvedLocation[];
  /**
   * false when the user did not allow auto-detection (ADR 42): launcher locations were not
   * looked up, so an empty `launchers` proves nothing and the connector must not report
   * 'launch.launcher-missing' because of it.
   */
  readonly launchersResolved: boolean;
  /** Confined to the launcher locations and the installPath of the property. */
  readonly fs: ScopedFileReader;
}

// ---------- Secrets, network, tools, files ----------

/** Never printable: toString() and toJSON() return '[redacted]'. */
export interface Secret {
  reveal(): string;
  toString(): string;
  toJSON(): string;
}

/** Scoped to (user, store). The core encrypts and decrypts; the connector never sees the key or the ciphertext. */
export interface SecretVault {
  get(name: string): Promise<Secret | null>;
  set(name: string, value: string | Secret): Promise<void>;
  delete(name: string): Promise<void>;
}

/** Only network access a connector has. Secrets in headers/query are revealed at send time and redacted in logs. */
export interface HttpClient {
  request(req: {
    method: "GET" | "POST";
    url: string;
    headers?: Readonly<Record<string, string | Secret>>;
    query?: Readonly<Record<string, string | number | Secret>>;
    body?: { json: unknown } | { form: Readonly<Record<string, string | Secret>> };
  }): Promise<{
    status: number;
    headers: Readonly<Record<string, string>>;
    json(): Promise<unknown>;
    text(): Promise<string>;
  }>;
}

/**
 * Runs a bundled tool without a shell. The core picks the binary (never the connector), points the
 * tool's config/session directory to a private temporary folder rehydrated from the vault, and
 * re-encrypts and wipes it afterwards. stdout/stderr are never logged raw.
 */
export interface ExternalToolRunner {
  run(
    tool: ExternalToolId,
    args: readonly (string | Secret)[],
    opts?: { timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

/**
 * Read-only and confined to the roots it was created with (ADR 72): UTF-8 without BOM; readText at most
 * 1 MiB; readDir at most 10 000 entries. Every path is resolved with realpath and rejected if it ends
 * outside the roots. Read failures are ConnectorError 'scan.root-unreadable'; a path outside the roots
 * is 'internal' (a connector bug). `join` follows the OS path semantics.
 */
export interface ScopedFileReader {
  readText(path: string): Promise<string>;
  readDir(path: string): Promise<readonly { name: string; isDirectory: boolean }[]>;
  exists(path: string): Promise<boolean>;
  join(...parts: string[]): string;
}

export type LocationSource =
  | { kind: "registry-value"; hive: "HKLM" | "HKCU"; key: string; value: string; view?: "32" | "64" }
  | { kind: "registry-subkeys"; hive: "HKLM" | "HKCU"; key: string; value: string; view?: "32" | "64" }
  | {
      kind: "known-folder";
      folder: "ProgramData" | "ProgramFiles" | "ProgramFilesX86" | "LocalAppData" | "RoamingAppData";
      relative: string;
    };

export interface LocationDeclaration {
  readonly id: string;
  readonly purpose: "scan" | "launcher";
  readonly os: readonly ("windows" | "linux" | "macos")[];
  readonly sources: readonly LocationSource[];
}

export interface ResolvedLocation {
  readonly declarationId: string;
  readonly path: string;
  readonly tag?: string;
}
export type ScanRoot =
  | { readonly origin: "user"; readonly path: string }
  | ({ readonly origin: "discovered" } & ResolvedLocation);

export interface ProgressReporter {
  report(p: { done: number; total?: number; phaseKey?: I18nKey }): void;
}
export interface ConnectorLogger {
  debug(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  info(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
  warn(msg: string, fields?: Readonly<Record<string, string | number | boolean>>): void;
}

// ---------- Connection wizard (rendered by the web, driven by the core). Types only until the account cut. ----------

export interface ConnectionWizard {
  start(ctx: WizardContext): Promise<WizardStep>;
  submit(ctx: WizardContext, stepId: string, input: WizardInput): Promise<WizardStep | WizardDone>;
  /** Cheap check of the stored connection, without a full sync. */
  status(ctx: SyncContext): Promise<{ state: "connected" | "expired" | "disconnected"; accountLabel?: string }>;
  /** Removes this connector's secrets and tool sessions. */
  disconnect(ctx: SyncContext): Promise<void>;
}

export type WizardStep =
  | { kind: "info"; id: string; titleKey: I18nKey; bodyKey: I18nKey; params?: I18nParams }
  | {
      kind: "open-external";
      id: string;
      titleKey: I18nKey;
      bodyKey: I18nKey;
      url: string;
      awaits: "callback" | "input";
    }
  | { kind: "input"; id: string; titleKey: I18nKey; bodyKey: I18nKey; fields: readonly WizardField[] };

export interface WizardField {
  name: string;
  labelKey: I18nKey;
  secret: boolean;
  pattern?: string;
  maxLength: number;
  /** Shows a "Paste from clipboard" button (ADR 43). */
  paste?: boolean;
  /** Applied by the core before validating, e.g. 'json-field:authorizationCode' or 'url-query:code' (ADR 43). */
  extract?: `json-field:${string}` | `url-query:${string}`;
}

export type WizardInput =
  | { kind: "continue" }
  | { kind: "fields"; values: Readonly<Record<string, string>> }
  | { kind: "callback"; query: Readonly<Record<string, string>> };

/** accountLabel: non-secret display name shown in Settings; never logged. */
export interface WizardDone {
  kind: "done";
  accountLabel?: string;
}

// ---------- Library and scan results ----------

export interface LibrarySnapshot {
  /** false if the store returned a partial list: the core must not mark missing properties as no longer owned. */
  readonly complete: boolean;
  readonly entries: readonly StoreEntry[];
}

export type ExternalIds = Readonly<Partial<Record<"igdb" | "rawg" | "steamAppId", string>>>;
/** Same rules everywhere: https and host in the connector's mediaHosts (ADR 71). */
export interface EntryMedia {
  readonly coverUrl?: string;
  readonly heroUrl?: string;
  readonly iconUrl?: string;
}

export interface StoreEntry {
  readonly storeGameId: string;
  readonly kind: "game" | "dlc";
  /** For DLC, when the store says which game it belongs to. */
  readonly baseStoreGameId?: string;
  readonly title: string;
  readonly externalIds?: ExternalIds;
  readonly media?: EntryMedia;
  readonly storePlaytimeMinutes?: number;
  /** ISO 8601. */
  readonly storeLastPlayedAt?: string;
}

export interface ScanResult {
  readonly entries: readonly InstalledEntry[];
  readonly unreadableRoots: readonly { root: ScanRoot; code: ConnectorErrorCode }[];
}

export interface InstalledEntry {
  /** Absent when the store id cannot be read; the core then relies on title only. */
  readonly storeGameId?: string;
  readonly kind: "game" | "dlc";
  readonly baseStoreGameId?: string;
  readonly title: string;
  /** Absolute, inside one of ctx.roots. */
  readonly installPath: string;
  /** Relative to installPath. Hints for process detection (pending decision). */
  readonly executables?: readonly string[];
  /** Opaque to the core, persisted, and handed back only to this connector in StoredProperty. */
  readonly launchData?: Readonly<Record<string, string>>;
  readonly externalIds?: ExternalIds;
  readonly media?: EntryMedia;
}

// ---------- Actions ----------

/** Read from the database by the core. DLC never reach resolveAction. */
export interface StoredProperty {
  readonly storeGameId: string | null;
  readonly installed: boolean;
  readonly installPath: string | null;
  readonly launchData: Readonly<Record<string, string>> | null;
}

export type LaunchSpec =
  | { kind: "uri"; uri: string }
  | { kind: "exec"; executable: string; args: readonly string[]; cwd?: string };

// ---------- Errors ----------

export type ConnectorErrorCode =
  | "auth.required"
  | "auth.expired"
  | "auth.invalid"
  | "account.private-profile"
  | "network.unavailable"
  | "network.timeout"
  | "store.rate-limited"
  | "store.unexpected-response"
  | "tool.missing"
  | "tool.failed"
  | "scan.root-unreadable"
  | "launch.launcher-missing"
  | "launch.not-installed"
  | "action.unsupported"
  | "internal";

export interface ConnectorErrorDetails {
  messageKey?: I18nKey;
  params?: I18nParams;
  retryAfterMs?: number;
  cause?: unknown;
}

/** message: English, for developers, no secrets. The UI shows messageKey (or connectors.common.errors.<code>). */
export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly details: ConnectorErrorDetails;
  constructor(code: ConnectorErrorCode, message: string, details: ConnectorErrorDetails = {}) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.details = details;
  }
}

/**
 * A path whose realpath leaves the allowed roots (a junction or symlink that escapes). It is an 'internal' error
 * like any path outside the roots, but it comes from the user's disk, not from a connector bug, so a connector may
 * skip that one entry instead of failing the scan (ADR 72). The message never carries the path.
 */
export class PathEscapesRootsError extends ConnectorError {
  constructor() {
    super("internal", "path resolves outside the allowed roots through a link");
    this.name = "PathEscapesRootsError";
  }
}

// ---------- Prices (phase 3; shape to be confirmed then) ----------

export interface PriceProvider {
  getPrice(
    entry: { storeGameId: string },
    region: string,
    ctx: SyncContext,
  ): Promise<{ amountMinor: number; currency: string; regularAmountMinor?: number; url: string } | null>;
}

// ---------- Manifest check (pure) ----------

const STORE_IDS: readonly string[] = ["steam", "gog", "epic", "ubisoft", "ea"];
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*$/;

/**
 * Lists what is wrong in a manifest (runtime refuses the connector at startup if non-empty).
 * Messages are English, for developers; they are not user-facing text.
 */
export function checkConnectorManifest(c: StoreConnector): readonly string[] {
  const problems: string[] = [];
  const cap = c.capabilities;

  if ((c.contractVersion as number) !== 1) problems.push(`unsupported contractVersion ${String(c.contractVersion)}`);
  if (!STORE_IDS.includes(c.id)) problems.push(`unknown store id '${String(c.id)}'`);
  if (!c.nameKey) problems.push("nameKey is empty");
  if (!Number.isInteger(c.minSyncIntervalMs) || c.minSyncIntervalMs <= 0) {
    problems.push("minSyncIntervalMs must be a positive integer");
  }

  for (const h of c.mediaHosts) if (!HOST_RE.test(h)) problems.push(`mediaHosts: '${h}' is not a bare lower-case host name`);
  for (const h of c.authHosts) if (!HOST_RE.test(h)) problems.push(`authHosts: '${h}' is not a bare lower-case host name`);
  for (const s of cap.uriSchemes) if (!SCHEME_RE.test(s)) problems.push(`uriSchemes: '${s}' is not a lower-case scheme`);

  if (cap.library && !c.listLibrary) problems.push("capabilities.library is true but listLibrary is missing");
  if (!cap.library && c.listLibrary) problems.push("listLibrary is present but capabilities.library is false");
  if (cap.scan && !c.scanInstalled) problems.push("capabilities.scan is true but scanInstalled is missing");
  if (!cap.scan && c.scanInstalled) problems.push("scanInstalled is present but capabilities.scan is false");
  if (c.discoverRoots && !cap.scan) problems.push("discoverRoots requires capabilities.scan");
  if (cap.price !== (c.prices !== undefined)) problems.push("capabilities.price and prices disagree");
  if ((cap.dlc === "scan" || cap.dlc === "library-and-scan") && !cap.scan) problems.push("dlc 'scan' requires capabilities.scan");
  if ((cap.dlc === "library" || cap.dlc === "library-and-scan") && !cap.library) {
    problems.push("dlc 'library' requires capabilities.library");
  }

  if (cap.actions.includes("play") && cap.launchKinds.length === 0) problems.push("action 'play' needs at least one launchKind");
  if (cap.launchKinds.includes("uri") && cap.uriSchemes.length === 0) problems.push("launchKind 'uri' needs uriSchemes");
  if (!cap.launchKinds.includes("uri") && cap.uriSchemes.length > 0) problems.push("uriSchemes set without launchKind 'uri'");
  if (cap.uriSchemes.some((s) => ["http", "https", "file", "javascript", "data"].includes(s))) {
    problems.push("uriSchemes must not include http, https, file, javascript or data");
  }

  const seen = new Set<string>();
  for (const l of c.locations) {
    if (!l.id) problems.push("a location has an empty id");
    if (seen.has(l.id)) problems.push(`duplicate location id '${l.id}'`);
    seen.add(l.id);
    if (l.sources.length === 0) problems.push(`location '${l.id}' has no sources`);
    if (l.os.length === 0) problems.push(`location '${l.id}' has no os`);
  }

  if (c.access === "local-only" && c.connection) problems.push("a local-only connector must not declare a connection wizard");
  return problems;
}
