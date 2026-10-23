import type { I18nKey, LocationDeclaration } from "@ludiary/contracts";

export const UBISOFT_NAME_KEY = "connectors.ubisoft.name" as I18nKey;

const INSTALLS = "SOFTWARE\\Ubisoft\\Launcher\\Installs";

// ADR 79, point 3. The subkey name is the game id; InstallDir is its folder (assumptions U1, U3).
export const UBISOFT_LOCATIONS: readonly LocationDeclaration[] = [
  {
    id: "ubisoft-installs",
    purpose: "scan",
    os: ["windows"],
    sources: [
      { kind: "registry-subkeys", hive: "HKLM", key: INSTALLS, value: "InstallDir", view: "32" },
      { kind: "registry-subkeys", hive: "HKLM", key: INSTALLS, value: "InstallDir", view: "64" },
    ],
  },
  {
    id: "ubisoft-launcher",
    purpose: "launcher",
    os: ["windows"],
    sources: [
      { kind: "registry-value", hive: "HKLM", key: "SOFTWARE\\Ubisoft\\Launcher", value: "InstallDir", view: "32" },
      { kind: "known-folder", folder: "ProgramFilesX86", relative: "Ubisoft\\Ubisoft Game Launcher" },
    ],
  },
];

// ADR 80, point 12: the launcher's configuration cache, read by listLibrary. LocalAppData was checked in point 3; the
// second source is Galaxy's. ctx.fs is confined to these folders.
export const UBISOFT_CACHE: LocationDeclaration = {
  id: "ubisoft-cache",
  purpose: "library",
  os: ["windows"],
  sources: [
    { kind: "known-folder", folder: "LocalAppData", relative: "Ubisoft Game Launcher\\cache\\configuration" },
    { kind: "known-folder", folder: "ProgramFilesX86", relative: "Ubisoft\\Ubisoft Game Launcher\\cache\\configuration" },
  ],
};
