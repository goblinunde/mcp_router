import { BaseRepository } from "@/main/infrastructure/database/base-repository";
import {
  getSqliteManager,
  SqliteManager,
} from "@/main/infrastructure/database/sqlite-manager";
import type { GatewayAuditEvent } from "@mcp_router/shared";

export class GatewayAuditRepository extends BaseRepository<GatewayAuditEvent> {
  private static instance: GatewayAuditRepository | null = null;

  private constructor(db: SqliteManager) {
    super(db, "gateway_audit_events");
  }

  public static getInstance(): GatewayAuditRepository {
    const db = getSqliteManager("mcprouter", true);
    if (
      !GatewayAuditRepository.instance ||
      GatewayAuditRepository.instance.database !== db
    ) {
      GatewayAuditRepository.instance = new GatewayAuditRepository(db);
    }
    return GatewayAuditRepository.instance;
  }

  public static resetInstance(): void {
    GatewayAuditRepository.instance = null;
  }

  protected initializeTable(): void {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS gateway_audit_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        status TEXT NOT NULL,
        metadata_json TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_gateway_audit_created_at ON gateway_audit_events(created_at)",
    );
  }

  protected mapRowToEntity(row: any): GatewayAuditEvent {
    return {
      id: row.id,
      workspaceId: row.workspace_id ?? null,
      actorType: row.actor_type,
      actorId: row.actor_id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      status: row.status,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
      createdAt: row.created_at,
    };
  }

  protected mapEntityToRow(entity: GatewayAuditEvent): Record<string, any> {
    return {
      id: entity.id,
      workspace_id: entity.workspaceId ?? null,
      actor_type: entity.actorType,
      actor_id: entity.actorId,
      action: entity.action,
      target_type: entity.targetType,
      target_id: entity.targetId,
      status: entity.status,
      metadata_json: entity.metadata ? JSON.stringify(entity.metadata) : null,
      created_at: entity.createdAt,
    };
  }
}
