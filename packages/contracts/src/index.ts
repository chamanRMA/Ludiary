// Operating-system ports (ADR 38). Types only, no I/O: implementations live in platform-* packages.

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
