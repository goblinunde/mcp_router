import { SingletonService } from "@/main/modules/singleton-service";
import type {
  StoreSecretInput,
  VaultAccessContext,
  VaultCrypto,
  VaultSecretRecord,
} from "@mcp_router/shared";
import {
  createVaultReference,
  isVaultReference,
  parseVaultReference,
} from "./vault-ref";
import { ElectronSafeStorageVaultCrypto } from "./vault-crypto";
import { VaultSecretRepository } from "./vault-secret.repository";

export class VaultService extends SingletonService<
  VaultSecretRecord,
  string,
  VaultService
> {
  private crypto: VaultCrypto;
  private repository: VaultSecretRepository;

  protected constructor(
    crypto: VaultCrypto = new ElectronSafeStorageVaultCrypto(),
    repository: VaultSecretRepository = VaultSecretRepository.getInstance(),
  ) {
    super();
    this.crypto = crypto;
    this.repository = repository;
  }

  protected getEntityName(): string {
    return "VaultSecret";
  }

  public static getInstance(): VaultService {
    return (this as any).getInstanceBase();
  }

  public static createForTests(crypto: VaultCrypto): VaultService {
    return new VaultService(crypto, VaultSecretRepository.getInstance());
  }

  public static resetInstance(): void {
    this.resetInstanceBase(VaultService);
  }

  public storeSecret(plaintext: string, input: StoreSecretInput): string {
    const existing = this.repository.findActiveByOwner(
      input.ownerType,
      input.ownerId,
    );
    const ciphertext = this.crypto.encrypt(plaintext);

    if (existing) {
      this.repository.update(existing.id, {
        ciphertext,
        workspaceId: input.workspaceId ?? null,
        secretType: input.secretType,
        revokedAt: undefined,
        metadata: input.metadata,
      });
      return createVaultReference(existing.id);
    }

    const created = this.repository.add({
      workspaceId: input.workspaceId ?? null,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      secretType: input.secretType,
      ciphertext,
      metadata: input.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return createVaultReference(created.id);
  }

  public resolveSecret(
    reference: string,
    access?: VaultAccessContext,
  ): string | null {
    const secretId = parseVaultReference(reference);
    if (!secretId) {
      return null;
    }

    const secret = this.repository.getById(secretId);
    if (!secret || secret.revokedAt) {
      return null;
    }

    this.assertAccess(secret, access);
    return this.crypto.decrypt(secret.ciphertext);
  }

  public migratePlaintextSecret(
    value: string | null | undefined,
    input: StoreSecretInput,
  ): string | null | undefined {
    if (!value) {
      return value;
    }

    if (isVaultReference(value)) {
      return value;
    }

    return this.storeSecret(value, input);
  }

  private assertAccess(
    secret: VaultSecretRecord,
    access?: VaultAccessContext,
  ): void {
    if (!access) {
      return;
    }

    if (
      access.workspaceId !== undefined &&
      secret.workspaceId !== null &&
      access.workspaceId !== secret.workspaceId
    ) {
      throw new Error("Vault secret does not belong to this workspace");
    }

    if (
      access.ownerType !== undefined &&
      access.ownerType !== secret.ownerType
    ) {
      throw new Error("Vault secret owner type mismatch");
    }

    if (access.ownerId !== undefined && access.ownerId !== secret.ownerId) {
      throw new Error("Vault secret owner id mismatch");
    }
  }
}

export function getVaultService(): VaultService {
  return VaultService.getInstance();
}
