import { createEpicConnector } from "@ludiary/connector-epic";
import { createEaConnector } from "@ludiary/connector-ea";
import { createGogConnector } from "@ludiary/connector-gog";
import { createSteamConnector } from "@ludiary/connector-steam";
import { createUbisoftConnector } from "@ludiary/connector-ubisoft";
import { itadService } from "@ludiary/itad";
import type { PriceService, StoreConnector } from "@ludiary/contracts";

/** The static list of connectors (ADR 38): adding a store is one package in connectors/ and one line here. */
export function createConnectors(): readonly StoreConnector[] {
  return [createSteamConnector(), createGogConnector(), createEpicConnector(), createUbisoftConnector(), createEaConnector()];
}

/** ADR 86: the price services (IsThereAnyDeal). Not a store: it has no library. */
export function createPriceServices(): readonly PriceService[] {
  return [itadService];
}

/** Union of the `mediaHosts` of the connectors and the price services, sorted: it becomes `img-src` (ADR 71, ADR 86 point 17). */
export function unionMediaHosts(connectors: readonly StoreConnector[], services: readonly PriceService[] = []): string[] {
  return [...new Set([...connectors, ...services].flatMap((c) => c.mediaHosts))].sort();
}

/** Union of the URI schemes the connectors may launch (ADR 40 rule 5), lower-case. */
export function unionUriSchemes(connectors: readonly StoreConnector[]): string[] {
  return [...new Set(connectors.flatMap((c) => c.capabilities.uriSchemes).map((s) => s.toLowerCase()))].sort();
}
