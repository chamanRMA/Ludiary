import type { I18nKey, LocationDeclaration } from "@ludiary/contracts";

export const EPIC_NAME_KEY = "connectors.epic.name" as I18nKey;
export const EPIC_DATA_ID = "epic-launcher-data";
export const EPIC_LAUNCHER_ID = "epic-launcher";
export const EPIC_LAUNCHER_EXE = "EpicGamesLauncher.exe";

export const EPIC_LOCATIONS: readonly LocationDeclaration[] = [
  {
    // Data folder of the launcher; holds Manifests\*.item (ADR 78, point 3; E1). The registry value is the folder the
    // launcher really uses (checked 22-10-2026, native 64-bit view); the default folder is the fallback.
    id: EPIC_DATA_ID,
    purpose: "scan",
    os: ["windows"],
    sources: [
      { kind: "registry-value", hive: "HKLM", key: "SOFTWARE\\Epic Games\\EpicGamesLauncher", value: "AppDataPath", view: "64" },
      { kind: "known-folder", folder: "ProgramData", relative: "Epic\\EpicGamesLauncher\\Data" },
    ],
  },
  {
    // Path of the launcher executable, to prove it is installed before Install (ADR 78, point 4; E5 confirmed 22-10-2026:
    // the registry value uses '/' and points to a launcher on E:, the known folder is only the default).
    id: EPIC_LAUNCHER_ID,
    purpose: "launcher",
    os: ["windows"],
    sources: [
      { kind: "registry-value", hive: "HKCU", key: "Software\\Epic Games\\EOS", value: "ModSdkCommand" },
      { kind: "known-folder", folder: "ProgramFilesX86", relative: `Epic Games\\Launcher\\Portal\\Binaries\\Win64\\${EPIC_LAUNCHER_EXE}` },
    ],
  },
];
