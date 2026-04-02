import { BaseRepository } from "@/main/infrastructure/database/base-repository";
import {
  getSqliteManager,
  SqliteManager,
} from "@/main/infrastructure/database/sqlite-manager";
import type { GatewayRole, GatewayPermission } from "@mcp_router/shared";

export class GatewayRoleRepository extends BaseRepository<GatewayRole> {
  private static instance: GatewayRoleRepository | null = null;

  private constructor(db: SqliteManager) {
    super(db, "gateway_roles");
  }

  public static getInstance(): GatewayRoleRepository {
    const db = getSqliteManager("mcprouter", true);
    if (
      !GatewayRoleRepository.instance ||
      GatewayRoleRepository.instance.database !== db
    ) {
      GatewayRoleRepository.instance = new GatewayRoleRepository(db);
    }
    return GatewayRoleRepository.instance;
  }

  public static resetInstance(): void {
    GatewayRoleRepository.instance = null;
  }

  protected initializeTable(): void {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS gateway_roles (
        id TEXT PRIMARY KEY,
        workspace_id TEXT,
        name TEXT NOT NULL,
        permissions_json TEXT NOT NULL,
        is_system INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_gateway_roles_name ON gateway_roles(name)",
    );
  }

  protected mapRowToEntity(row: any): GatewayRole {
    return {
      id: row.id,
      workspaceId: row.workspace_id ?? null,
      name: row.name,
      permissions: JSON.parse(row.permissions_json) as GatewayPermission[],
      isSystem: row.is_system === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapEntityToRow(entity: GatewayRole): Record<string, any> {
    const now = Date.now();
    return {
      id: entity.id,
      workspace_id: entity.workspaceId ?? null,
      name: entity.name,
      permissions_json: JSON.stringify(entity.permissions),
      is_system: entity.isSystem ? 1 : 0,
      created_at: entity.createdAt ?? now,
      updated_at: now,
    };
  }

  public findByName(name: string): GatewayRole | null {
    const row = this.db.get<any>(
      "SELECT * FROM gateway_roles WHERE name = :name LIMIT 1",
      { name },
    );
    return row ? this.mapRowToEntity(row) : null;
  }
}
