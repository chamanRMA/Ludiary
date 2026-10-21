import type { I18nKey, LocationDeclaration } from "@ludiary/contracts";

export const STEAM_NAME_KEY = "connectors.steam.name" as I18nKey;

export const STEAM_LOCATIONS: readonly LocationDeclaration[] = [
  {
    id: "steam-root",
    purpose: "scan",
    os: ["windows"],
    sources: [
      { kind: "registry-value", hive: "HKCU", key: "Software\\Valve\\Steam", value: "SteamPath" },
      { kind: "registry-value", hive: "HKLM", key: "SOFTWARE\\Valve\\Steam", value: "InstallPath", view: "32" },
      { kind: "known-folder", folder: "ProgramFilesX86", relative: "Steam" },
    ],
  },
  {
    id: "steam-client",
    purpose: "launcher",
    os: ["windows"],
    sources: [{ kind: "registry-value", hive: "HKCU", key: "Software\\Valve\\Steam", value: "SteamExe" }],
  },
];
