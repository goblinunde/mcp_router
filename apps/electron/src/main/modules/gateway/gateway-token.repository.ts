import { BaseRepository } from "@/main/infrastructure/database/base-repository";
import {
  getSqliteManager,
  SqliteManager,
} from "@/main/infrastructure/database/sqlite-manager";
import type { GatewayTokenRecord } from "@mcp_router/shared";

export class GatewayTokenRepository extends BaseRepository<GatewayTokenRecord> {
  private static instance: GatewayTokenRepository | null = null;

  private constructor(db: SqliteManager) {
    super(db, "gateway_tokens");
  }

  public static getInstance(): GatewayTokenRepository {
    const db = getSqliteManager("mcprouter", true);
    if (
      !GatewayTokenRepository.instance ||
      GatewayTokenRepository.instance.database !== db
    ) {
      GatewayTokenRepository.instance = new GatewayTokenRepository(db);
    }
    return GatewayTokenRepository.instance;
  }

  public static resetInstance(): void {
    GatewayTokenRepository.instance = null;
  }

  protected initializeTable(): void {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS gateway_tokens (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        user_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        secret_ref TEXT NOT NULL,
        workspace_scope_json TEXT NOT NULL,
        server_scope_json TEXT NOT NULL,
        tool_scope_json TEXT NOT NULL,
        role_names_json TEXT NOT NULL,
        legacy_compat INTEGER NOT NULL DEFAULT 0,
        issued_at INTEGER NOT NULL,
        expires_at INTEGER,
        last_used_at INTEGER,
        revoked_at INTEGER,
        metadata_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_gateway_tokens_client ON gateway_tokens(client_id)",
    );
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_gateway_tokens_status ON gateway_tokens(status)",
    );
  }

  protected mapRowToEntity(row: any): GatewayTokenRecord {
    return {
      id: row.id,
      clientId: row.client_id,
      userId: row.user_id ?? null,
      type: row.type,
      status: row.status,
      tokenHash: row.token_hash,
      secretRef: row.secret_ref,
      workspaceScope: JSON.parse(row.workspace_scope_json),
      serverScope: JSON.parse(row.server_scope_json),
      toolScope: JSON.parse(row.tool_scope_json),
      roleNames: JSON.parse(row.role_names_json),
      legacyCompat: row.legacy_compat === 1,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at ?? undefined,
      lastUsedAt: row.last_used_at ?? undefined,
      revokedAt: row.revoked_at ?? undefined,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    };
  }

  protected mapEntityToRow(entity: GatewayTokenRecord): Record<string, any> {
    const now = Date.now();
    return {
      id: entity.id,
      client_id: entity.clientId,
      user_id: entity.userId,
      type: entity.type,
      status: entity.status,
      token_hash: entity.tokenHash,
      secret_ref: entity.secretRef,
      workspace_scope_json: JSON.stringify(entity.workspaceScope),
      server_scope_json: JSON.stringify(entity.serverScope),
      tool_scope_json: JSON.stringify(entity.toolScope),
      role_names_json: JSON.stringify(entity.roleNames),
      legacy_compat: entity.legacyCompat ? 1 : 0,
      issued_at: entity.issuedAt,
      expires_at: entity.expiresAt ?? null,
      last_used_at: entity.lastUsedAt ?? null,
      revoked_at: entity.revokedAt ?? null,
      metadata_json: entity.metadata ? JSON.stringify(entity.metadata) : null,
      created_at: entity.issuedAt ?? now,
      updated_at: now,
    };
  }

  public findByHash(tokenHash: string): GatewayTokenRecord | null {
    const row = this.db.get<any>(
      "SELECT * FROM gateway_tokens WHERE token_hash = :tokenHash LIMIT 1",
      { tokenHash },
    );
    return row ? this.mapRowToEntity(row) : null;
  }

  public listByClientId(clientId: string): GatewayTokenRecord[] {
    const rows = this.db.all<any>(
      "SELECT * FROM gateway_tokens WHERE client_id = :clientId",
      { clientId },
    );
    return rows.map((row) => this.mapRowToEntity(row));
  }
}
