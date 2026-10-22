// SecretVault per store (ADR 46, 74 point 6): scope `store:<id>`, AAD `user_id|scope|name`. The connector never sees
// the key or the ciphertext. A secret that cannot be read puts the store in 'expired' without touching the library.
import { makeSecret } from "@ludiary/contracts";
import type { Secret, SecretVault, StoreId } from "@ludiary/contracts";
import type { Env } from "./env";

export const storeScope = (store: StoreId): string => `store:${store}`;

export function createVaultFactory(env: Env): (store: StoreId) => SecretVault {
  const { deps, userId } = env;
  const aad = (scope: string, name: string) => `${userId}|${scope}|${name}`;

  return (store) => {
    const scope = storeScope(store);
    return {
      async get(name): Promise<Secret | null> {
        const row = await deps.secrets.get(scope, name);
        if (!row) return null;
        if (row.keyId !== deps.cipher.activeKeyId) {
          // A compartment (ADR 64): written under another credential slot. Kept as it is.
          deps.log.warn("A stored secret belongs to another key slot; the store needs to be reconnected", { connector: store });
          await deps.connections.setStatus(store, "expired");
          return null;
        }
        const res = deps.cipher.decrypt(row.ciphertext, aad(scope, name));
        if (res.ok) return makeSecret(res.value);
        if (res.reason === "other-key") {
          deps.log.warn("A stored secret belongs to another key slot; the store needs to be reconnected", { connector: store });
        } else {
          // Key lost and recreated in the same slot, or tampered data: useless forever (ADR 46).
          await deps.secrets.delete(scope, name);
          deps.log.warn("A stored secret cannot be read and was deleted; the store needs to be reconnected", { connector: store });
        }
        await deps.connections.setStatus(store, "expired");
        return null;
      },
      async set(name, value) {
        const plain = typeof value === "string" ? value : value.reveal();
        await deps.secrets.put({
          scope,
          name,
          ciphertext: deps.cipher.encrypt(plain, aad(scope, name)),
          keyId: deps.cipher.activeKeyId,
          updatedAt: deps.clock.now(),
        });
      },
      delete: (name) => deps.secrets.delete(scope, name),
    };
  };
}
