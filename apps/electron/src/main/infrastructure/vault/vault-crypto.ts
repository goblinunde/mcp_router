import { safeStorage } from "electron";
import type { VaultCrypto } from "@mcp_router/shared";

export class ElectronSafeStorageVaultCrypto implements VaultCrypto {
  public isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  public encrypt(plaintext: string): string {
    if (!this.isAvailable()) {
      throw new Error("Secure secret storage is unavailable on this machine");
    }

    return safeStorage.encryptString(plaintext).toString("base64");
  }

  public decrypt(ciphertext: string): string {
    if (!this.isAvailable()) {
      throw new Error("Secure secret storage is unavailable on this machine");
    }

    return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
  }
}

export class InMemoryVaultCrypto implements VaultCrypto {
  public isAvailable(): boolean {
    return true;
  }

  public encrypt(plaintext: string): string {
    return Buffer.from(plaintext, "utf-8").toString("base64");
  }

  public decrypt(ciphertext: string): string {
    return Buffer.from(ciphertext, "base64").toString("utf-8");
  }
}
