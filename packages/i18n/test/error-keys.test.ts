import { expect, it } from "vitest";
import { translate, translateKey } from "../src";
import en from "../locales/en.json";
import es from "../locales/es.json";

// Mirrors ConnectorErrorCode (packages/contracts) and CoreErrorCode (packages/core): i18n imports nothing internal.
const CONNECTOR_CODES = [
  "auth.required",
  "auth.expired",
  "auth.invalid",
  "account.private-profile",
  "network.unavailable",
  "network.timeout",
  "store.rate-limited",
  "store.unexpected-response",
  "tool.missing",
  "tool.failed",
  "scan.root-unreadable",
  "scan.discovery-unavailable",
  "launch.launcher-missing",
  "launch.not-installed",
  "action.unsupported",
  "internal",
];
const CORE_CODES = ["not-found", "not-installed", "action-unavailable", "launch.rejected", "launch.denied", "busy", "invalid-input", "name-taken", "limit-reached", "limit-reached.tagsPerGame", "limit-reached.tags", "limit-reached.collections", "limit-reached.gamesPerCollection", "label-empty", "label-too-long", "picker-unavailable", "backup.busy", "backup.no-folder", "backup.folder-unavailable", "backup.write-failed", "backup.not-found", "backup.too-large", "backup.corrupt", "backup.not-ludiary", "backup.too-new", "timeout", "collectionManaged", "limit-reached.watch"];
const WEB_KEYS = ["web.open.title", "web.open.noscript", "web.open.invalid.title", "web.open.invalid.body", "web.missing.title", "web.missing.body"];

it("every connector and core error code, the folder dialog title and the pages of the API have a text in es and en (ADR 72)", () => {
  const keys = [
    ...CONNECTOR_CODES.map((c) => `connectors.common.errors.${c}`),
    ...CORE_CODES.map((c) => `core.errors.${c}`),
    "core.pickFolder.title",
    "prices.errors.notConnected",
    "prices.errors.countryMissing",
    "prices.errors.limited",
    ...WEB_KEYS,
  ];
  for (const key of keys) {
    expect((es as Record<string, string>)[key], `es ${key}`).toBeTruthy();
    expect((en as Record<string, string>)[key], `en ${key}`).toBeTruthy();
  }
});

it("translates connector keys through the merged server catalog and falls back to the key", () => {
  expect(translate("es", "connectors.steam.name")).toBe("Steam");
  expect(translateKey("en", "connectors.common.errors.scan.root-unreadable")).toMatch(/folder/i);
  expect(translateKey("en", "no.such.key")).toBe("no.such.key");
});
