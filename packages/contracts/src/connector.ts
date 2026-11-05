// Store connector contract, version 1 (ADR 40, extended by ADR 71, 72, 73 and 74).
// Types only, plus ConnectorError and the pure function checkConnectorManifest. No I/O.

export type StoreId = "steam" | "gog" | "epic" | "ubisoft" | "ea";
/** i18n key. Connector keys live under `connectors.<storeId>.*`, shared ones under `connectors.common.*`. */
export type I18nKey = string & { readonly __brand: "I18nKey" };
export type I18nParams = Readonly<Record<string, string | number>>;
export type GameAction = "play" | "open-store-page" | "install";
export type ExternalToolId = "legendary" | "gogdl";

/** ADR 76 point 12. */
export type LaunchModeId = "client" | "direct";
/** ADR 76 point 12: bare file name of a store client, `LocationDeclaration.executable`. */
export const LAUNCHER_EXECUTABLE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}\.exe$/i;

export interface StoreConnector {
  readonly contractVersion: 1;
  /** ADR 76 point 12. Ways to play, first = default. Absent = no setting. 'client' needs launchKinds 'exec' and a 'launcher' location with `executable`. */
  readonly launchModes?: readonly { readonly id: LaunchModeId; readonly labelKey: I18nKey; readonly hintKey?: I18nKey }[];
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
  /** ADR 73. Bare lower-case hosts this connector's HttpClient may call (HTTPS, default port). [] if none. */
  readonly apiHosts: readonly string[];
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
   * ADR 73. Optional. Current artwork of stored properties, at most 50 ids per call.
   * Ids missing from the result: nothing known. Media follow rule 4 (https, host in mediaHosts).
   */
  resolveMedia?(storeGameIds: readonly string[], ctx: MediaContext): Promise<ReadonlyMap<string, EntryMedia>>;
  /**
   * ADR 84. Optional. Titles of stored DLC properties, at most 50 ids per call. Ids missing from the result:
   * nothing known. Requires apiHosts and capabilities.dlc other than 'none'.
   */
  resolveTitles?(storeGameIds: readonly string[], ctx: MediaContext): Promise<ReadonlyMap<string, string>>;
  /**
   * ADR 87. Optional, on demand only (never in a sync). Reads the user's collections from the store's local
   * files under ctx.fs (confined to importCollectionsRoot inside each 'scan' location). Requires
   * capabilities.scan, a 'scan' location and importCollectionsRoot. Parse errors: fixed message, no cause (ADR 87 point 13).
   */
  importCollections?(ctx: CollectionImportContext): Promise<CollectionImportSnapshot>;
  /**
   * ADR 91 (points 3 and 13, M3). Optional, on demand only (never in a sync); present together with `describeWishlistItems`
   * or not at all. The user's wishlist in the store, read with the stored connection: ids only, in store order, at most
   * 5000, no title or media requests. Requires `connection` and `apiHosts`. Untrusted output: the core validates and caps.
   * Errors: fixed English message, no response text, no `cause` (ADR 91 point 13, e). Never changes the connection state itself.
   */
  readWishlist?(ctx: SyncContext): Promise<WishlistSnapshot>;
  /**
   * ADR 91 (point 13, M3). Titles and media of at most 500 wishlist ids the core chose. Ids missing from the result:
   * the core shows `<Store> <id>` and no image. Media follow rule 4 (https, host in mediaHosts).
   */
  describeWishlistItems?(storeGameIds: readonly string[], ctx: SyncContext): Promise<ReadonlyMap<string, WishlistItemInfo>>;
  /** ADR 87. Relative sub-folder of each resolved 'scan' location the import reader is confined to. No '..', not absolute. */
  readonly importCollectionsRoot?: string;
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

/** ADR 74: built by the core per store and run; `secrets` is the vault of scope `store:<id>`. */
export interface SyncContext extends BaseContext {
  readonly http: HttpClient;
  readonly secrets: SecretVault;
  readonly tools: ExternalToolRunner;
  readonly progress: ProgressReporter;
  /** Current time in ms; connectors never read the clock themselves (ADR 38; in every context since ADR 82). */
  now(): number;
  /** ADR 80. listLibrary only, with auto-detection only: read-only, confined to the resolved 'library' locations. */
  readonly fs?: ScopedFileReader;
  /** ADR 80. Same condition as `fs`: the resolved locations with purpose 'library' (empty when none exists on this PC). */
  readonly libraryLocations?: readonly ResolvedLocation[];
}

export interface WizardContext extends SyncContext {
  /** Core-owned return URL for OpenID/OAuth flows (uses the current port, ADR 28). */
  readonly callbackUrl: string;
  /** In-memory only (never on disk), short-lived state of this wizard session; wiped on done, cancel or expiry (ADR 74). */
  readonly wizardState: SecretVault;
}

export interface ScanContext extends BaseContext {
  /** User folders plus resolved locations declared by this connector. */
  readonly roots: readonly ScanRoot[];
  /** Read-only, confined to roots. Path semantics come from the platform. */
  readonly fs: ScopedFileReader;
  readonly progress: ProgressReporter;
}

/** ADR 73. The client only reaches this connector's apiHosts. */
export interface MediaContext extends BaseContext {
  readonly http: HttpClient;
}

export interface DiscoveryContext extends BaseContext {
  /** Resolved locations of this connector with purpose 'scan'. */
  readonly locations: readonly ResolvedLocation[];
  /** Read-only, confined to those locations. */
  readonly fs: ScopedFileReader;
}

/** ADR 87 (point 13). `secrets` is a read-only view built by the core: no set, no delete. */
export interface CollectionImportContext extends DiscoveryContext {
  readonly secrets: Pick<SecretVault, "get">;
}

/** ADR 87. Untrusted input: the core validates and caps everything. */
export interface CollectionImportSnapshot {
  /**
   * Plain collections in store order. Names are raw store data; the core normalizes them.
   * ADR 88: sourceId = the store's own collection id (1-64 printable ASCII), stable across renames.
   */
  readonly collections: readonly { readonly sourceId: string; readonly name: string; readonly storeGameIds: readonly string[] }[];
  /** Store "favourites" (Steam: collection id 'favorite'). */
  readonly favorites: readonly string[];
  /** 'connected': the folder came from the connected account; 'single-folder': the only folder found, not verified. */
  readonly accountSource: "connected" | "single-folder";
  /** Counters only (no names, no ids): dynamic, deleted, hidden, invalid... Unknown keys are ignored by the core. */
  readonly skipped: Readonly<Record<string, number>>;
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
  /** ADR 76 point 12. The user's choice, already validated; undefined when the connector declares no launchModes. */
  readonly launchMode?: LaunchModeId;
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

/** ADR 74. Pure. Wraps a value so it cannot be logged or serialized by accident. */
export function makeSecret(value: string): Secret {
  return { reveal: () => value, toString: () => "[redacted]", toJSON: () => "[redacted]" };
}

/** Scoped to (user, store). The core encrypts and decrypts; the connector never sees the key or the ciphertext. */
export interface SecretVault {
  get(name: string): Promise<Secret | null>;
  set(name: string, value: string | Secret): Promise<void>;
  delete(name: string): Promise<void>;
}

/**
 * Only network access a connector has. A GET with a body is 'internal'. Headers: names `^[a-z0-9-]{1,64}$`, no host/cookie/
 * content-length/connection/transfer-encoding, values without CR or LF (ADR 74). The response size cap (`maxBytes`:
 * 16 MiB for listLibrary, 2 MiB otherwise) is a factory option of the core, not a per-request field.
 * Secrets in headers/query are revealed at send time and redacted in logs. */
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
 * Read-only and confined to the roots it was created with (ADR 72): UTF-8 (a leading BOM is removed) or UTF-16 LE/BE with BOM (ADR 81); readText at most
 * 1 MiB; readDir at most 10 000 entries. Every path is resolved with realpath and rejected if it ends
 * outside the roots. Read failures are ConnectorError 'scan.root-unreadable'; a file over 1 MiB or not a regular file is 'store.unexpected-response' (ADR 81); a path outside the roots
 * is 'internal' (a connector bug). `join` follows the OS path semantics.
 */
export interface ScopedFileReader {
  readText(path: string): Promise<string>;
  /** ADR 80. Raw bytes; 'scan.root-unreadable' if the file is larger than maxBytes (at most 64 MiB). */
  readBytes(path: string, maxBytes: number): Promise<Uint8Array>;
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
  /** 'library' (ADR 80): resolved for listLibrary under the auto-detection rule; requires capabilities.library. */
  readonly purpose: "scan" | "launcher" | "library";
  readonly os: readonly ("windows" | "linux" | "macos")[];
  readonly sources: readonly LocationSource[];
  /** ADR 76 point 12. Only for purpose 'launcher': bare file name of the store client. The only file outside installPath an exec may target. */
  readonly executable?: string;
}

export interface ResolvedLocation {
  readonly declarationId: string;
  readonly path: string;
  /** Opaque to the core, ^[a-z0-9-]{1,32}$, stored with the root and handed back in ScanRoot. A connector may encode an id in it (ADR 79). */
  readonly tag?: string;
  /** ADR 79. Only from a 'registry-subkeys' source: name of the subkey the path was read from. Untrusted text; the core does not store it. */
  readonly subkey?: string;
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

// ---------- Connection wizard (rendered by the web, driven by the core). ----------

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
      /** ADR 74. Only with awaits 'input': the link and the fields share one screen. */
      fields?: readonly WizardField[];
    }
  | { kind: "input"; id: string; titleKey: I18nKey; bodyKey: I18nKey; fields: readonly WizardField[] }
  | {
      kind: "embedded-login";
      id: string;
      titleKey: I18nKey;
      bodyKey: I18nKey;
      /** Title of the login window; translated by the core (ADR 80). */
      windowTitleKey: I18nKey;
      /** https, host in authHosts. */
      url: string;
      /** https, host in authHosts, no query or fragment; matched on origin and path. */
      doneUrl: string;
      /** https, host in authHosts, no fragment; a query only with source 'document-json' (ADR 82). */
      captureUrl: string;
      /** 1 to 4. The core checks each captured value with its anchored pattern and maxLength. */
      capture: readonly { name: string; source?: "local-storage" | "document-json"; storageKeys: readonly string[]; jsonField: string; pattern: string; maxLength: number }[];
    };

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
  | { kind: "callback"; query: Readonly<Record<string, string>> }
  /** ADR 80. Built by the core only, never accepted from the API. */
  | { kind: "embedded"; values: Readonly<Record<string, Secret>> };

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

/** ADR 91. */
export interface WishlistSnapshot {
  /** false: the store answered with an empty or unreadable list that may be hidden (Steam `{}`), or the list is partial. */
  readonly complete: boolean;
  /** Store order (Steam priority, GOG as received). At most 5000; storeGameId in the store's own format. */
  readonly entries: readonly { readonly storeGameId: string; /** ISO 8601. */ readonly addedAt?: string }[];
}

/** ADR 91. Title (300 characters at most, no control characters) and optional media of one wishlist item. */
export interface WishlistItemInfo {
  readonly title: string;
  readonly media?: EntryMedia;
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
  /** ADR 83 M2. `dlcInferred`: the DLC link was deduced from the title, not given by the store. */
  readonly storeMetadata?: { readonly dlcInferred?: true };
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
  | "scan.discovery-unavailable"
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
export const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
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
  for (const h of c.apiHosts) if (!HOST_RE.test(h)) problems.push(`apiHosts: '${h}' is not a bare lower-case host name`);
  if (c.resolveMedia && c.apiHosts.length === 0) problems.push("resolveMedia requires apiHosts");
  if (c.resolveTitles && c.apiHosts.length === 0) problems.push("resolveTitles requires apiHosts");
  if (c.resolveTitles && cap.dlc === "none") problems.push("resolveTitles requires capabilities.dlc other than 'none'");
  for (const h of c.authHosts) if (!HOST_RE.test(h)) problems.push(`authHosts: '${h}' is not a bare lower-case host name`);
  for (const s of cap.uriSchemes) if (!SCHEME_RE.test(s)) problems.push(`uriSchemes: '${s}' is not a lower-case scheme`);

  if (cap.library && !c.listLibrary) problems.push("capabilities.library is true but listLibrary is missing");
  if (!cap.library && c.listLibrary) problems.push("listLibrary is present but capabilities.library is false");
  if (cap.scan && !c.scanInstalled) problems.push("capabilities.scan is true but scanInstalled is missing");
  if (!cap.scan && c.scanInstalled) problems.push("scanInstalled is present but capabilities.scan is false");
  if (c.discoverRoots && !cap.scan) problems.push("discoverRoots requires capabilities.scan");
  if (c.importCollections) {
    if (!cap.scan) problems.push("importCollections requires capabilities.scan");
    if (!c.locations.some((l) => l.purpose === "scan")) problems.push("importCollections requires a 'scan' location");
    if (!c.importCollectionsRoot) problems.push("importCollections requires importCollectionsRoot");
  }
  if (c.importCollectionsRoot !== undefined) {
    const r = c.importCollectionsRoot;
    if (!c.importCollections) problems.push("importCollectionsRoot requires importCollections");
    if (r === "" || /^([a-zA-Z]:|[\\/])/.test(r) || r.split(/[\\/]/).some((x) => x === ".." || x === "")) {
      problems.push("importCollectionsRoot must be a relative path without '..' or empty parts");
    }
  }
  if (!c.readWishlist !== !c.describeWishlistItems) problems.push("readWishlist and describeWishlistItems go together");
  if (c.readWishlist) {
    if (!c.connection) problems.push("readWishlist requires a connection wizard");
    if (c.apiHosts.length === 0) problems.push("readWishlist requires apiHosts");
  }
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

  for (const l of c.locations) {
    if (l.executable === undefined) continue;
    if (l.purpose !== "launcher") problems.push(`location '${l.id}': executable only for purpose 'launcher'`);
    else if (typeof l.executable !== "string" || !LAUNCHER_EXECUTABLE.test(l.executable) || l.executable.includes("..")) problems.push(`location '${l.id}': invalid executable`);
  }
  if (c.launchModes !== undefined) {
    const ids = c.launchModes.map((m) => m.id).sort().join(",");
    if (ids !== "client,direct") problems.push("launchModes must have exactly 'client' and 'direct'");
    if (c.launchModes.some((m) => !m.labelKey)) problems.push("a launch mode has no labelKey");
    if (c.launchModes.some((m) => m.id === "client") && !(cap.launchKinds.includes("exec") && c.locations.some((l) => l.purpose === "launcher" && l.executable !== undefined))) {
      problems.push("launch mode 'client' needs launchKind 'exec' and a 'launcher' location with executable");
    }
  }

  if (c.connection && c.authHosts.length === 0) problems.push("a connector with a connection wizard needs authHosts");
  if (!cap.library && c.locations.some((l) => l.purpose === "library")) {
    problems.push("a 'library' location requires capabilities.library");
  }
  if (cap.library && c.apiHosts.length === 0 && c.externalTools.length === 0) {
    problems.push("capabilities.library requires apiHosts or externalTools");
  }
  if (c.access === "local-only" && c.connection) problems.push("a local-only connector must not declare a connection wizard");
  return problems;
}
