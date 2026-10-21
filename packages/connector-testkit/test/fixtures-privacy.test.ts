import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { findPrivacyViolations, readFixtureFiles } from "../src";

// Repository check (ADR 48 extended by ADR 72): every connector's fixtures must be free of personal data.
const connectorsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "connectors");

it("no connector fixture contains SteamIDs, LastOwner, user paths, emails or tokens", () => {
  const files = readdirSync(connectorsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(connectorsDir, d.name, "fixtures")))
    .flatMap((d) => readFixtureFiles(join(connectorsDir, d.name, "fixtures")));
  expect(files.length).toBeGreaterThan(0);
  expect(findPrivacyViolations(files)).toEqual([]);
});
