// Real SQLite files for the backup tests (ADR 89): migrated databases with a little data, in temporary folders.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MIGRATIONS, migrate, openDatabase } from "../src";

export const tempDir = (): string => mkdtempSync(join(tmpdir(), "ludiary-bk-"));

export interface FixtureOptions {
  /** How many embedded migrations to apply (default all). */
  levels?: number;
  installId?: string;
  periodic?: boolean;
  folder?: string;
  /** Free text kept in `settings` so a test can tell which database it is looking at. */
  marker?: string;
  restoredAt?: number;
  nextAllowedAt?: [store: string, operation: "library" | "scan", at: number][];
  roots?: { origin: "user" | "discovered"; path: string; enabled: boolean }[];
  withInstallation?: boolean;
}

export async function makeLudiaryDb(file: string, o: FixtureOptions = {}): Promise<void> {
  const db = openDatabase(file, undefined);
  try {
    await migrate(db, { backupDir: join(file, "..", "fixture-backups"), migrations: MIGRATIONS.slice(0, o.levels ?? MIGRATIONS.length) });
    if ((o.levels ?? MIGRATIONS.length) < 1) return;
    db.prepare("INSERT INTO users (id, created_at) VALUES ('u1', 1)").run();
    db.prepare("INSERT INTO devices (id, user_id, name, kind) VALUES ('d1', 'u1', 'pc', 'local')").run();
    const setting = db.prepare("INSERT INTO settings (user_id, key, value) VALUES ('u1', ?, ?)");
    if (o.installId !== undefined) setting.run("backups.installId", JSON.stringify(o.installId));
    if (o.periodic !== undefined) setting.run("backups.periodic", JSON.stringify(o.periodic));
    if (o.folder !== undefined) setting.run("backups.folder", JSON.stringify(o.folder));
    if (o.marker !== undefined) setting.run("test.marker", JSON.stringify(o.marker));
    if (o.restoredAt !== undefined) setting.run("backups.restoredAt", JSON.stringify(o.restoredAt));
    for (const [store, operation, at] of o.nextAllowedAt ?? []) {
      db.prepare("INSERT INTO sync_state (user_id, store, operation, status, next_allowed_at) VALUES ('u1', ?, ?, 'idle', ?)").run(store, operation, at);
    }
    (o.roots ?? []).forEach((r, i) => {
      db.prepare("INSERT INTO scan_roots (id, user_id, device_id, origin, path, path_key, enabled) VALUES (?, 'u1', 'd1', ?, ?, ?, ?)").run(`r${i}`, r.origin, r.path, r.path.toLowerCase(), r.enabled ? 1 : 0);
    });
    if (o.withInstallation && (o.levels ?? MIGRATIONS.length) >= 1) {
      db.prepare("INSERT INTO canonical_games (id, user_id, title, normalized_title, created_at, updated_at) VALUES ('g1', 'u1', 'Game', 'game', 1, 1)").run();
      db.prepare("INSERT INTO game_properties (id, user_id, canonical_game_id, store, store_game_id, kind, title, normalized_title, owned) VALUES ('p1', 'u1', 'g1', 'gog', '1', 'game', 'Game', 'game', 1)").run();
      db.prepare("INSERT INTO installations (id, user_id, property_id, device_id, install_path, launch_data, last_seen_at) VALUES ('i1', 'u1', 'p1', 'd1', 'X:\\\\Evil', '{\"exe\":\"X:\\\\\\\\Evil\\\\\\\\x.exe\"}', 1)").run();
    }
  } finally {
    db.close();
  }
}
