import type { I18nKey, LocationDeclaration } from "@ludiary/contracts";

export const EA_NAME_KEY = "connectors.ea.name" as I18nKey;

// ADR 81, point 3. Default folders of the EA app and of Origin (assumption EAD5); the app itself (EAD7).
export const EA_LOCATIONS: readonly LocationDeclaration[] = [
  {
    id: "ea-libraries",
    purpose: "scan",
    os: ["windows"],
    sources: [
      { kind: "known-folder", folder: "ProgramFiles", relative: "EA Games" },
      { kind: "known-folder", folder: "ProgramFilesX86", relative: "Origin Games" },
    ],
  },
  {
    id: "ea-desktop",
    purpose: "launcher",
    os: ["windows"],
    sources: [{ kind: "known-folder", folder: "ProgramFiles", relative: "Electronic Arts\\EA Desktop\\EA Desktop" }],
  },
];
