import { BaseRepository } from "@/main/infrastructure/database/base-repository";
import {
  getSqliteManager,
  SqliteManager,
} from "@/main/infrastructure/database/sqlite-manager";
import type { GatewayMembership } from "@mcp_router/shared";

export class GatewayMembershipRepository extends BaseRepository<GatewayMembership> {
  private static instance: GatewayMembershipRepository | null = null;

  private constructor(db: SqliteManager) {
    super(db, "gateway_memberships");
  }

  public static getInstance(): GatewayMembershipRepository {
    const db = getSqliteManager("mcprouter", true);
    if (
      !GatewayMembershipRepository.instance ||
      GatewayMembershipRepository.instance.database !== db
    ) {
      GatewayMembershipRepository.instance = new GatewayMembershipRepository(
        db,
      );
    }
    return GatewayMembershipRepository.instance;
  }

  public static resetInstance(): void {
    GatewayMembershipRepository.instance = null;
  }

  protected initializeTable(): void {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS gateway_memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        role_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.db.execute(
      "CREATE INDEX IF NOT EXISTS idx_gateway_memberships_user_workspace ON gateway_memberships(user_id, workspace_id)",
    );
  }

  protected mapRowToEntity(row: any): GatewayMembership {
    return {
      id: row.id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
      roleId: row.role_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapEntityToRow(entity: GatewayMembership): Record<string, any> {
    const now = Date.now();
    return {
      id: entity.id,
      user_id: entity.userId,
      workspace_id: entity.workspaceId,
      role_id: entity.roleId,
      created_at: entity.createdAt ?? now,
      updated_at: now,
    };
  }

  public findByUserAndWorkspace(
    userId: string,
    workspaceId: string,
  ): GatewayMembership[] {
    const rows = this.db.all<any>(
      `
        SELECT *
        FROM gateway_memberships
        WHERE user_id = :userId
          AND workspace_id = :workspaceId
      `,
      { userId, workspaceId },
    );

    return rows.map((row) => this.mapRowToEntity(row));
  }
}
