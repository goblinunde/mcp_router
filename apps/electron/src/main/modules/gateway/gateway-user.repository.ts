import { BaseRepository } from "@/main/infrastructure/database/base-repository";
import {
  getSqliteManager,
  SqliteManager,
} from "@/main/infrastructure/database/sqlite-manager";
import type { GatewayUser } from "@mcp_router/shared";

export class GatewayUserRepository extends BaseRepository<GatewayUser> {
  private static instance: GatewayUserRepository | null = null;

  private constructor(db: SqliteManager) {
    super(db, "gateway_users");
  }

  public static getInstance(): GatewayUserRepository {
    const db = getSqliteManager("mcprouter", true);
    if (
      !GatewayUserRepository.instance ||
      GatewayUserRepository.instance.database !== db
    ) {
      GatewayUserRepository.instance = new GatewayUserRepository(db);
    }
    return GatewayUserRepository.instance;
  }

  public static resetInstance(): void {
    GatewayUserRepository.instance = null;
  }

  protected initializeTable(): void {
    this.db.execute(`
      CREATE TABLE IF NOT EXISTS gateway_users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  protected mapRowToEntity(row: any): GatewayUser {
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected mapEntityToRow(entity: GatewayUser): Record<string, any> {
    const now = Date.now();
    return {
      id: entity.id,
      name: entity.name,
      status: entity.status,
      created_at: entity.createdAt ?? now,
      updated_at: now,
    };
  }
}
