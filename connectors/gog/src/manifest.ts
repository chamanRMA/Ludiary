import type { I18nKey, LocationDeclaration } from "@ludiary/contracts";

export const GOG_NAME_KEY = "connectors.gog.name" as I18nKey;

/** Galaxy's folder, to prove it is installed before Install (ADR 77, point 7; GA9). */
export const GOG_GALAXY_CLIENT: LocationDeclaration = {
  id: "gog-galaxy-client",
  purpose: "launcher",
  executable: "GalaxyClient.exe",
  os: ["windows"],
  sources: [{ kind: "registry-value", hive: "HKLM", key: "SOFTWARE\\GOG.com\\GalaxyClient\\paths", value: "client", view: "32" }],
};

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
