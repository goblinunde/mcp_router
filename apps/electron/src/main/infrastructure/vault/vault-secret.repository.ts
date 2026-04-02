import { BaseRepository } from "@/main/infrastructure/database/base-repository";
import {
  getSqliteManager,
  SqliteManager,
} from "@/main/infrastructure/database/sqlite-manager";
import type { VaultSecretRecord } from "@mcp_router/shared";

export class VaultSecretRepository extends BaseRepository<VaultSecretRecord> {
  private static instance: VaultSecretRepository | null = null;

  private constructor(db: SqliteManager) {
    super(db, "vault_secrets");
  }

  public static getInstance(): VaultSecretRepository {
    const db = getSqliteManager("mcprouter", true);
    if (
      !VaultSecretRepository.instance ||
      VaultSecretRepository.instance.database !== db
    ) {
      VaultSecretRepository.instance = new VaultSecretRepository(db);
    }
    return VaultSecretRepository.instance;
  }

  public static resetInstance(): void {
    VaultSecretRepository.instance = null;
  }

  protected initializeTable(): void {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS vault_secrets (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        secret_type TEXT NOT NULL,
        ciphertext TEXT NOT NULL,
        revoked_at INTEGER,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_vault_secrets_owner ON vault_secrets(owner_type, owner_id)",
    );
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_vault_secrets_workspace ON vault_secrets(workspace_id)",
    );
  }

  protected mapRowToEntity(row: any): VaultSecretRecord {
    return {
      id: row.id,
      workspaceId: row.workspace_id ?? null,
      ownerType: row.owner_type,
      ownerId: row.owner_id,
      secretType: row.secret_type,
      ciphertext: row.ciphertext,
      revokedAt: row.revoked_at ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapEntityToRow(entity: VaultSecretRecord): Record<string, any> {
    const now = Date.now();
    return {
      id: entity.id,
      workspace_id: entity.workspaceId ?? null,
      owner_type: entity.ownerType,
      owner_id: entity.ownerId,
      secret_type: entity.secretType,
      ciphertext: entity.ciphertext,
      revoked_at: entity.revokedAt ?? null,
      metadata_json: entity.metadata ? JSON.stringify(entity.metadata) : null,
      created_at: entity.createdAt ?? now,
      updated_at: now,
    };
  }

  public findActiveByOwner(
    ownerType: string,
    ownerId: string,
  ): VaultSecretRecord | null {
    const row = this.db.get<any>(
      `
        SELECT *
        FROM vault_secrets
        WHERE owner_type = :ownerType
          AND owner_id = :ownerId
          AND revoked_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      { ownerType, ownerId },
    );

    return row ? this.mapRowToEntity(row) : null;
  }
}
