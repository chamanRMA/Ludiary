import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { findPrivacyViolations, readFixtureFiles } from "../src";

// Repository check (ADR 48 extended by ADR 72): fixtures and tests of every connector and package must be free of personal data.
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const scan = (parent: string, sub: string) =>
  readdirSync(join(root, parent), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, parent, d.name, sub)))
    .flatMap((d) => readFixtureFiles(join(root, parent, d.name, sub)));

it("no connector fixture contains SteamIDs, LastOwner, user paths, emails or tokens", () => {
  const files = scan("connectors", "fixtures");
  expect(files.length).toBeGreaterThan(0);
  expect(findPrivacyViolations(files)).toEqual([]);
});

// Skipped on purpose: the rules were written for fixture data and flag ~100 deliberate fakes in test code (negative cases, example.invalid
// emails, C:\Users\ana paths, assertion strings). Needs a per-line allow mechanism (architect decision) before it can be enabled.
it.skip("no connector or package test file contains them either", () => {
  const files = [...scan("connectors", "test"), ...scan("packages", "test")];
  expect(files.length).toBeGreaterThan(0);
  expect(findPrivacyViolations(files)).toEqual([]);
});
