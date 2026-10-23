import { createGogConnector } from "@ludiary/connector-gog";
import { createSteamConnector } from "@ludiary/connector-steam";
import { createUbisoftConnector } from "@ludiary/connector-ubisoft";
import type { StoreConnector } from "@ludiary/contracts";

/** The static list of connectors (ADR 38): adding a store is one package in connectors/ and one line here. */
export function createConnectors(): readonly StoreConnector[] {
  return [createSteamConnector(), createGogConnector(), createUbisoftConnector()];
}

/** Union of the `mediaHosts` of the connectors, sorted: it becomes `img-src` (ADR 71). */
export function unionMediaHosts(connectors: readonly StoreConnector[]): string[] {
  return [...new Set(connectors.flatMap((c) => c.mediaHosts))].sort();
}

/** Union of the URI schemes the connectors may launch (ADR 40 rule 5), lower-case. */
export function unionUriSchemes(connectors: readonly StoreConnector[]): string[] {
  return [...new Set(connectors.flatMap((c) => c.capabilities.uriSchemes).map((s) => s.toLowerCase()))].sort();
}
