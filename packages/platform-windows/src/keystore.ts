import type { KeyStore } from "@ludiary/contracts";
import type { Entry } from "@napi-rs/keyring";

/** Shape of the raw native addon of @napi-rs/keyring (loaded by the caller with process.dlopen). */
export interface KeyringBinding {
  Entry: new (service: string, username: string) => Entry;
}

/**
 * KeyStore on top of the Windows Credential Manager (ADR 14, 45).
 * The native addon is injected: inside a single-file executable `require` cannot load .node files,
 * so the composition root loads it from the native/ folder next to the executable.
 */
export class CredentialManagerKeyStore implements KeyStore {
  constructor(
    private readonly binding: KeyringBinding,
    /** Technical identifier of the app (ADR 44), used as the credential "service". */
    private readonly service: string,
  ) {}

  private entry(name: string): Entry {
    return new this.binding.Entry(this.service, name);
  }

  async get(name: string): Promise<Uint8Array | null> {
    const secret = this.entry(name).getSecret();
    return secret === null ? null : Uint8Array.from(secret);
  }

  async set(name: string, value: Uint8Array): Promise<void> {
    this.entry(name).setSecret(value);
  }

  async delete(name: string): Promise<void> {
    this.entry(name).deletePassword();
  }
}
