// Operating-system ports (ADR 38). Types only, no I/O: implementations live in platform-* packages.
import type { LocationDeclaration, ResolvedLocation, ScopedFileReader } from "./connector";

/** Stores small secrets outside the database (ADR 14). Windows: Credential Manager. */
export interface KeyStore {
  /** Returns the stored bytes, or null when no entry exists. */
  get(name: string): Promise<Uint8Array | null>;
  set(name: string, value: Uint8Array): Promise<void>;
  /** Deleting a missing entry is not an error. */
  delete(name: string): Promise<void>;
}

export interface TrayMenuItem {
  /** Stable identifier sent back in the click event. */
  id: string;
  /** Already translated text (the tray never owns translations). */
  label: string;
  enabled?: boolean;
}

export interface TrayState {
  tooltip: string;
  items: readonly TrayMenuItem[];
}

/** System tray (ADR 13, 45). Texts arrive translated from the server. */
export interface TrayHost {
  start(state: TrayState): Promise<void>;
  update(state: TrayState): void;
  onClick(handler: (itemId: string) => void): void;
  /** Fired if the tray disappears unexpectedly (helper crashed). */
  onLost(handler: (reason: string) => void): void;
  stop(): Promise<void>;
}

/** Single-instance lock that the OS releases when its holder dies, even after a crash (ADR 62). */
export interface InstanceLock {
  /** Returns a release function, or null when another live process holds the lock. */
  acquire(): Promise<(() => void) | null>;
  /** True when some process holds the lock. Holds it only for an instant and never makes a concurrent acquire() fail. */
  isHeld(): Promise<boolean>;
}

/** Modal messages for errors the user must see, since Ludiary.exe has no console (ADR 64). Texts arrive translated. */
export interface UserDialogs {
  showError(title: string, body: string): Promise<void>;
}

export interface PlatformInfo {
  readonly os: "windows" | "linux" | "macos";
  readonly arch: string;
  /** Per-user directory for database, logs and runtime.json (ADR 45). */
  readonly dataDir: string;
  /** Directory that holds the installed program. */
  readonly installDir: string;
  /** BCP 47 locale of the user interface of the OS, e.g. "es-ES". */
  readonly systemLocale: string;
  /** Opens a URL in the default browser. */
  openUrl(url: string): Promise<void>;
}

// ---------- Ports added by ADR 72 ----------

/** Thrown by LocationResolver.resolve when a source could not be read. `partial`: the locations that did resolve (ADR 79). */
export class LocationsUnreadableError extends Error {
  constructor(message: string, readonly partial: readonly ResolvedLocation[] = []) {
    super(message);
    this.name = "LocationsUnreadableError";
  }
}

/** ADR 38, 40 rule 8. Read-only: implementations never write the registry or launcher files (ADR 42). */
export interface LocationResolver {
  /**
   * Every distinct existing path of the declaration on this OS, in source order (deduplicated with LocalFiles.compareKey).
   * A key or value that does not exist is not an error (it yields nothing). Throws if a registry source could not be read
   * (helper failed, access denied, any other error): absent and unreadable are not the same (ADR 79).
   */
  resolve(decl: LocationDeclaration): Promise<readonly ResolvedLocation[]>;
}

/** Path semantics and confined reading (ADR 38: the core treats paths as opaque strings). */
export interface LocalFiles {
  scoped(roots: readonly string[]): ScopedFileReader;
  /** Absolute, OS separators, no trailing separator; keeps the original case. */
  normalize(path: string): string;
  isAbsolute(path: string): boolean;
  /** True if `path` is `root` or below it, after realpath; case-insensitive on Windows; 'D:\Games2' is not inside 'D:\Games'. */
  isInside(path: string, root: string): Promise<boolean>;
  /** Equality key for uniqueness (lower-case on Windows). */
  compareKey(path: string): string;
  isDirectory(path: string): Promise<boolean>;
  /** ADR 79. Like isDirectory (false when absent or not a directory), but throws if it cannot tell (permissions, I/O). */
  isDirectoryStrict(path: string): Promise<boolean>;
  /** Canonical path (realpath of the deepest existing ancestor, missing tail unchanged). Throws if it cannot be resolved. */
  realPath(path: string): Promise<string>;
  /**
   * True only for a path on a local drive. On Windows it is false for UNC (\\server\share) and device
   * (\\?\, \\.\) paths, which a stat could turn into a network connection. Checked on paths that come from
   * files or the registry before touching them; a UNC folder is valid only when the user picks it (ADR 72).
   * Pure: no disk access.
   */
  isLocalPath(path: string): boolean;
}

/** ADR 40 rule 5: never through a shell; the core validates the spec before calling. */
export interface ProcessLauncher {
  /** Kinds this platform can run; runtime refuses a connector whose launchKinds are not all here. */
  readonly kinds: readonly ("uri" | "exec")[];
  /** Hands the URI to the OS handler of its scheme. */
  openUri(uri: string): Promise<void>;
  /**
   * Detached, args as a list, no shell (ADR 40 rule 5). Windows (ADR 76): only an existing local `.exe`,
   * no verbatim arguments, the child's main window is not hidden. Rejects with ExecError.
   */
  exec(spec: { executable: string; args: readonly string[]; cwd?: string }): Promise<void>;
}

/** ADR 76: why `ProcessLauncher.exec` failed. */
export class ExecError extends Error {
  /** 'rejected': the platform's own check refused the spec. 'denied': the OS refused (e.g. needs administrator). 'failed': anything else. */
  constructor(readonly reason: "rejected" | "denied" | "failed") {
    super(`exec ${reason}`);
    this.name = "ExecError";
  }
}

/** Native folder dialog on the user's desktop (localhost only). null if cancelled. Texts arrive translated. */
export interface FolderPicker {
  pick(opts: { title: string }): Promise<string | null>;
}

/** Time for the core, which must not use timers or Date directly (ADR 38). */
export interface Clock {
  now(): number;
  timeout(ms: number): AbortSignal;
}

// ---------- Ports added by ADR 74 ----------

/**
 * ADR 46, 74. AES-256-GCM; implemented in platform-node. aad = `${userId}|${scope}|${name}`.
 * The key never leaves the implementation.
 */
export interface SecretCipher {
  /** Slot n of the credential master-key/<n> (ADR 64). */
  readonly activeKeyId: number;
  /** `v1.<keyId>.<nonce base64url>.<ciphertext+tag base64url>`, fresh random 12-byte nonce per call, 16-byte tag. */
  encrypt(plaintext: string, aad: string): string;
  /** 'other-key': written under another slot (compartment, ADR 64). 'invalid': bad format, tag or AAD. */
  decrypt(blob: string, aad: string): { ok: true; value: string } | { ok: false; reason: "other-key" | "invalid" };
}
