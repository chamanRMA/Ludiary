// Contexts handed to connectors for network work (ADR 74): library, status, disconnect and the wizard.
import { ConnectorError, makeSecret } from "@ludiary/contracts";
import type { ConnectorLogger, HttpClient, SecretVault, StoreConnector, StoreId, SyncContext } from "@ludiary/contracts";
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

export async function syncContext(env: Env, c: StoreConnector, signal: AbortSignal, opts: { maxBytes?: number } = {}): Promise<SyncContext> {
  const log = connectorLogger(env, c.id);
  return {
    signal,
    log,
    locale: await effectiveLocale(env),
    http: env.deps.http ? env.deps.http(c.apiHosts, signal, log, opts.maxBytes ? { maxBytes: opts.maxBytes } : undefined) : offline,
    secrets: env.vaultFor(c.id),
    tools: {
      async run() {
        throw new ConnectorError("tool.missing", "No external tools in this cut (ADR 74)");
      },
    },
    progress: { report: () => undefined },
  };
}
