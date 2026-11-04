// SecretVault per store or service (ADR 46, 74 point 6, 86 point 15 A1): scope `store:<id>` or `service:<id>`, AAD
// `user_id|scope|name`. The connector never sees the key or the ciphertext. A secret that cannot be read puts the
// owner in 'expired' without touching the library.
import { makeSecret } from "@ludiary/contracts";
import type { PriceServiceId, Secret, SecretVault, StoreId } from "@ludiary/contracts";
import type { Env } from "./env";

export const storeScope = (store: StoreId): string => `store:${store}`;
export const serviceScope = (service: PriceServiceId): string => `service:${service}`;

/** `logFields` names the owner in the log lines; `onUnreadable` marks it 'expired' (a store row or a service setting). */
export function scopedVault(
  env: Env,
  scope: string,
  logFields: Readonly<Record<string, string>>,
  onUnreadable: () => Promise<void>,
): SecretVault {
  const { deps, userId } = env;
  const aad = (name: string) => `${userId}|${scope}|${name}`;
  return {
    async get(name): Promise<Secret | null> {
      const row = await deps.secrets.get(scope, name);
      if (!row) return null;
      if (row.keyId !== deps.cipher.activeKeyId) {
        // A compartment (ADR 64): written under another credential slot. Kept as it is.
        deps.log.warn("A stored secret belongs to another key slot; it needs to be reconnected", logFields);
        await onUnreadable();
        return null;
      }
      const res = deps.cipher.decrypt(row.ciphertext, aad(name));
      if (res.ok) return makeSecret(res.value);
      if (res.reason === "other-key") {
        deps.log.warn("A stored secret belongs to another key slot; it needs to be reconnected", logFields);
      } else {
        // Key lost and recreated in the same slot, or tampered data: useless forever (ADR 46).
        await deps.secrets.delete(scope, name);
        deps.log.warn("A stored secret cannot be read and was deleted; it needs to be reconnected", logFields);
      }
      await onUnreadable();
      return null;
    },
    async set(name, value) {
      const plain = typeof value === "string" ? value : value.reveal();
      await deps.secrets.put({
        scope,
        name,
        ciphertext: deps.cipher.encrypt(plain, aad(name)),
        keyId: deps.cipher.activeKeyId,
        updatedAt: deps.clock.now(),
      });
    },
    delete: (name) => deps.secrets.delete(scope, name),
  };
}

export const createVaultFactory = (env: Env) => (store: StoreId): SecretVault =>
  scopedVault(env, storeScope(store), { connector: store }, () => env.deps.connections.setStatus(store, "expired"));

/** Settings key of a service's state: 'invalid' (the service refused the key) or 'expired' (the key cannot be read). Absent = healthy. */
export const serviceStatusKey = (service: PriceServiceId): string => `services.${service}.status`;

export const createServiceVaultFactory = (env: Env) => (service: PriceServiceId): SecretVault =>
  scopedVault(env, serviceScope(service), { service }, () => env.deps.settings.set(serviceStatusKey(service), "expired"));
