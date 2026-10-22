import type { I18nKey, LocationDeclaration } from "@ludiary/contracts";

export const GOG_NAME_KEY = "connectors.gog.name" as I18nKey;

// The registry only finds game folders; the data comes from goggame-<id>.info (ADR 76, point 3).
export const GOG_LOCATIONS: readonly LocationDeclaration[] = [
  {
    id: "gog-games",
    purpose: "scan",
    os: ["windows"],
    sources: [{ kind: "registry-subkeys", hive: "HKLM", key: "SOFTWARE\\GOG.com\\Games", value: "path", view: "32" }],
  },
  {
    id: "gog-library",
    purpose: "scan",
    os: ["windows"],
    sources: [{ kind: "known-folder", folder: "ProgramFilesX86", relative: "GOG Galaxy\\Games" }],
  },
];
