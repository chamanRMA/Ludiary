// Contexts handed to connectors for network work (ADR 74): library, status, disconnect and the wizard.
import { ConnectorError, makeSecret } from "@ludiary/contracts";
import type { ConnectorLogger, HttpClient, ResolvedLocation, ScopedFileReader, SecretVault, StoreConnector, StoreId, SyncContext } from "@ludiary/contracts";
import type { Env } from "./env";
import { effectiveLocale } from "./settings";

/** Response cap of the library call (ADR 74 point 8); 2 MiB, the client default, for everything else. */
export const LIBRARY_MAX_BYTES = 16 * 1024 * 1024;

export function connectorLogger(env: Env, id: StoreId): ConnectorLogger {
  const log = env.deps.log;
  return {
    debug: (m, f) => log.debug(m, { connector: id, ...f }),
    info: (m, f) => log.info(m, { connector: id, ...f }),
    warn: (m, f) => log.warn(m, { connector: id, ...f }),
  };
}

const offline: HttpClient = {
  async request() {
    throw new ConnectorError("network.unavailable", "This mode has no network access for connectors");
  },
};

/** In-memory vault (the state of a wizard session): never touches the disk. */
export function memoryVault(map: Map<string, string>): SecretVault {
  return {
    async get(name) {
      const v = map.get(name);
      return v === undefined ? null : makeSecret(v);
    },
    async set(name, value) {
      map.set(name, typeof value === "string" ? value : value.reveal());
    },
    async delete(name) {
      map.delete(name);
    },
  };
}

// Session epoch per store (ADR 77, audit A2). Disconnecting, or a wizard step that stores a secret, starts a new one;
// a library operation that began in an older epoch can no longer write secrets, so a late token rotation cannot
// resurrect a session the user just removed. Memory only.
const epochs = new WeakMap<Env, Map<StoreId, number>>();
export function epochOf(env: Env, store: StoreId): number {
  return epochs.get(env)?.get(store) ?? 0;
}
export function bumpEpoch(env: Env, store: StoreId): void {
  const m = epochs.get(env) ?? new Map<StoreId, number>();
  epochs.set(env, m);
  m.set(store, (m.get(store) ?? 0) + 1);
}

/** Wraps the store vault: `guard` refuses `set` once the epoch moved on; `bump` starts a new epoch on every `set`. */
function epochVault(env: Env, store: StoreId, mode: "guard" | "bump"): SecretVault {
  const vault = env.vaultFor(store);
  const started = epochOf(env, store);
  return {
    get: (name) => vault.get(name),
    delete: (name) => vault.delete(name),
    async set(name, value) {
      // shortcut: check-then-write is atomic only because cipher.encrypt and SecretRepository.put are synchronous;
      // if either becomes async, move the epoch check into the vault right before put.
      // shortcut: `bump` does not check that its wizard is still live; a cancelled wizard's late set could overwrite
      // a newer one's token (needs a full GOG login inside the race), add an isLive() check if that ever matters.
      if (mode === "bump") bumpEpoch(env, store);
      else if (epochOf(env, store) !== started) throw new ConnectorError("auth.required", "The session changed during the operation");
      await vault.set(name, value);
    },
  };
}

export async function syncContext(
  env: Env,
  c: StoreConnector,
  signal: AbortSignal,
  opts: { maxBytes?: number; epoch?: "guard" | "bump"; fs?: ScopedFileReader; libraryLocations?: readonly ResolvedLocation[] } = {},
): Promise<SyncContext> {
  const log = connectorLogger(env, c.id);
  return {
    signal,
    log,
    locale: await effectiveLocale(env),
    http: env.deps.http ? env.deps.http(c.apiHosts, signal, log, opts.maxBytes ? { maxBytes: opts.maxBytes } : undefined) : offline,
    secrets: opts.epoch ? epochVault(env, c.id, opts.epoch) : env.vaultFor(c.id),
    tools: {
      async run() {
        throw new ConnectorError("tool.missing", "No external tools in this cut (ADR 74)");
      },
    },
    progress: { report: () => undefined },
    now: () => env.deps.clock.now(),
    ...(opts.fs ? { fs: opts.fs } : {}),
    ...(opts.libraryLocations ? { libraryLocations: opts.libraryLocations } : {}),
  };
}
