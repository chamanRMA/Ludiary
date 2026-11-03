// ADR 89 point 2 and 11: a backup carries the secrets encrypted. Restored where the key is another one, the store needs to be
// reconnected and the library is untouched (ADR 46, 64).
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createVaultFactory } from "../../core/src/vault";
import { createRepositories, createBackupStore, openDatabase, userBackupName } from "@ludiary/db";
import { createSecretCipher } from "@ludiary/platform-node";
import { makeLudiaryDb, tempDir } from "../../db/test/backup-fixtures";
import { migrateDatabase } from "../src/compose";
import { startDatabase } from "../src/restore-startup";

let dir = "";
beforeEach(() => {
  dir = tempDir();
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("secrets sealed with another key: the store expires after restoring, the secret is not readable and the library stays", async () => {
  const dataDir = join(dir, "data");
  const userDir = join(dir, "Copias");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(userDir, { recursive: true });
  const id = userBackupName(1_000, "bbbbbbbb", "manual");
  await makeLudiaryDb(join(dataDir, "ludiary.db"), { marker: "current" });
  // The copy comes from another computer: a secret and a connection sealed with that computer's key, and a game.
  const other = createSecretCipher({ id: 1, value: randomBytes(32) });
  const file = join(userDir, id);
  await makeLudiaryDb(file, { withInstallation: true });
  const src = openDatabase(file, undefined);
  src.prepare("INSERT INTO secrets (id, user_id, scope, name, ciphertext, key_id, updated_at) VALUES ('s1', 'u1', 'store:gog', 'token', ?, 1, 1)").run(other.encrypt("TOKEN", "u1|store:gog|token"));
  src.prepare("INSERT INTO store_connections (user_id, store, status, account_label, connected_at) VALUES ('u1', 'gog', 'connected', NULL, 1)").run();
  src.close();
  await createBackupStore({ db: undefined as never, dataDir, internalDir: join(dataDir, "backups"), addon: undefined }).prepareRestore(userDir, id, 2_000);

  const noop = () => {};
  const { db } = await startDatabase({
    dataDir,
    addon: undefined,
    log: noop,
    now: () => 3_000,
    migrate: (d, skip) => migrateDatabase(d, join(dataDir, "backups"), noop, skip),
    compose: async () => ({}),
  });
  const repos = createRepositories(db, { warn: noop });
  const { userId } = await repos.identity.ensure(() => "never-used", 1);
  const here = createSecretCipher({ id: 1, value: randomBytes(32) }); // this computer's key, same slot
  const vault = createVaultFactory({ deps: { secrets: repos.secrets, connections: repos.connections, cipher: here, log: { warn: noop } }, userId } as never)("gog");
  expect(await vault.get("token")).toBeNull();
  expect((await repos.connections.get("gog"))?.status).toBe("expired");
  expect((db.prepare("SELECT count(*) AS n FROM game_properties").get() as { n: number }).n).toBe(1); // the library is intact
  db.close();
});
