import { expect, it } from "vitest";
import { backupDate } from "./backups";

it("reads the date of a copy from its name", () => {
  expect(backupDate("ludiary-20261103T123456789Z-0a1b2c3d-manual.sqlite")).toBe(Date.UTC(2026, 10, 3, 12, 34, 56, 789));
  expect(backupDate("pre-restore-001793795415123-origin.sqlite")).toBe(1793795415123);
  expect(backupDate("pre-migration-001793795415123-0006_x.sqlite")).toBe(1793795415123);
  expect(backupDate("whatever.sqlite")).toBeNull();
});
