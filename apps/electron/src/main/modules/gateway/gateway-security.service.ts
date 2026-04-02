import crypto from "crypto";
import { SingletonService } from "@/main/modules/singleton-service";
import { getSharedConfigManager } from "@/main/infrastructure/shared-config-manager";
import { getVaultService } from "@/main/infrastructure/vault/vault.service";
import type {
  GatewayAuthContext,
  GatewayPermission,
  GatewayRole,
  GatewayRoleName,
  GatewayTokenRecord,
  GatewayUser,
  Token,
  TokenGenerateOptions,
  TokenValidationResult,
} from "@mcp_router/shared";
import { GatewayUserRepository } from "./gateway-user.repository";
import { GatewayRoleRepository } from "./gateway-role.repository";
import { GatewayMembershipRepository } from "./gateway-membership.repository";
import { GatewayTokenRepository } from "./gateway-token.repository";
import { GatewayAuditRepository } from "./gateway-audit.repository";
import {
  SYSTEM_ROLE_PERMISSIONS,
  canAccessServer,
  canAccessWorkspace,
  canInvokeTool,
  canListTool,
} from "./rbac";

const DEFAULT_USER_ID = "local-system";

function now(): number {
  return Date.now();
}

export class GatewaySecurityService extends SingletonService<
  GatewayTokenRecord,
  string,
  GatewaySecurityService
> {
  private initialized = false;
  private userRepository = GatewayUserRepository.getInstance();
  private roleRepository = GatewayRoleRepository.getInstance();
  private membershipRepository = GatewayMembershipRepository.getInstance();
  private tokenRepository = GatewayTokenRepository.getInstance();
  private auditRepository = GatewayAuditRepository.getInstance();

  protected constructor() {
    super();
  }

  protected getEntityName(): string {
    return "GatewaySecurity";
  }

  public static getInstance(): GatewaySecurityService {
    return (this as any).getInstanceBase();
  }

  public static resetInstance(): void {
    this.resetInstanceBase(GatewaySecurityService);
  }

  public initialize(): void {
    if (this.initialized) {
      return;
    }

    this.ensureDefaultIdentityState();
    this.migrateLegacyTokens();
    this.initialized = true;
  }

  public createToken(options: TokenGenerateOptions): Token {
    this.initialize();
    const issuedAt = Math.floor(Date.now() / 1000);
    const rawToken = this.generateTokenSecret();
    const userId = options.userId || DEFAULT_USER_ID;
    const serverScope = Object.entries(options.serverAccess || {})
      .filter(([, allowed]) => allowed)
      .map(([serverId]) => serverId);
    const workspaceScope =
      options.workspaceScope && options.workspaceScope.length > 0
        ? options.workspaceScope
        : ["*"];
    const toolScope =
      options.toolScope && options.toolScope.length > 0
        ? options.toolScope
        : ["*"];
    const roleNames =
      options.roleNames && options.roleNames.length > 0
        ? options.roleNames
        : ["developer"];
    const expiresAt = options.expiresIn
      ? issuedAt + options.expiresIn
      : undefined;

    const existing = this.tokenRepository.listByClientId(options.clientId);
    existing.forEach((token) => {
      this.deleteTokenByRecord(token);
    });

    const secretRef = getVaultService().storeSecret(rawToken, {
      ownerType: "gateway-token",
      ownerId: options.clientId,
      secretType: "gateway-access-token",
      metadata: { clientId: options.clientId },
    });

    this.tokenRepository.add({
      clientId: options.clientId,
      userId,
      type: "gateway_access",
      status: "active",
      tokenHash: this.hashToken(rawToken),
      secretRef,
      workspaceScope,
      serverScope,
      toolScope,
      roleNames,
      legacyCompat: !!options.legacyCompat,
      issuedAt,
      expiresAt,
      metadata: undefined,
      id: crypto.randomUUID(),
    } as GatewayTokenRecord);

    this.recordAudit({
      actorType: "user",
      actorId: userId,
      action: "token.create",
      targetType: "gateway-token",
      targetId: options.clientId,
      status: "success",
      metadata: {
        workspaceScope,
        serverScope,
        toolScope,
      },
      workspaceId: workspaceScope.includes("*") ? null : workspaceScope[0],
    });

    return {
      id: rawToken,
      clientId: options.clientId,
      issuedAt,
      serverAccess: this.serverScopeToAccessMap(serverScope),
      userId,
      workspaceScope,
      toolScope,
      roleNames,
      status: "active",
      expiresAt,
      legacyCompat: !!options.legacyCompat,
    };
  }

  public validateToken(
    rawToken: string,
    workspaceId?: string | null,
  ): TokenValidationResult {
    this.initialize();
    const record = this.getTokenRecordByRawToken(rawToken);
    if (!record) {
      return {
        isValid: false,
        error: "Token not found",
        statusCode: 401,
      };
    }

    if (record.status !== "active" || record.revokedAt) {
      return {
        isValid: false,
        error: "Token has been revoked",
        statusCode: 401,
      };
    }

    const issuedWorkspaceId = workspaceId ?? null;
    const context = this.buildAuthContext(record, issuedWorkspaceId);

    if (!canAccessWorkspace(context, issuedWorkspaceId)) {
      return {
        isValid: false,
        error: "Token is not scoped to this workspace",
        statusCode: 403,
      };
    }

    if (record.expiresAt && record.expiresAt < Math.floor(Date.now() / 1000)) {
      return {
        isValid: false,
        error: "Token has expired",
        statusCode: 401,
      };
    }

    this.tokenRepository.update(record.id, {
      lastUsedAt: Math.floor(Date.now() / 1000),
    });

    this.recordAudit({
      actorType: "token",
      actorId: record.clientId,
      action: "token.use",
      targetType: "workspace",
      targetId: issuedWorkspaceId || "*",
      status: "success",
      workspaceId: issuedWorkspaceId,
    });

    return {
      isValid: true,
      clientId: record.clientId,
      userId: record.userId || undefined,
      workspaceScope: record.workspaceScope,
      toolScope: record.toolScope,
      roleNames: context.principal.roleNames,
      status: record.status,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      legacyCompat: record.legacyCompat,
    };
  }

  public resolveAuthContext(
    rawToken: string,
    workspaceId?: string | null,
  ): GatewayAuthContext | null {
    const record = this.getTokenRecordByRawToken(rawToken);
    if (!record) {
      return null;
    }
    return this.buildAuthContext(record, workspaceId ?? null);
  }

  public listTokens(): Token[] {
    this.initialize();
    return this.tokenRepository.getAll().map((record) => this.toToken(record));
  }

  public getToken(rawToken: string): Token | null {
    const record = this.getTokenRecordByRawToken(rawToken);
    return record ? this.toToken(record) : null;
  }

  public deleteToken(rawToken: string): boolean {
    this.initialize();
    const record = this.getTokenRecordByRawToken(rawToken);
    if (!record) {
      return false;
    }

    this.deleteTokenByRecord(record);
    return true;
  }

  public deleteClientTokens(clientId: string): number {
    this.initialize();
    const records = this.tokenRepository.listByClientId(clientId);
    records.forEach((record) => this.deleteTokenByRecord(record));
    return records.length;
  }

  public updateTokenServerAccess(
    rawToken: string,
    serverAccess: Record<string, boolean>,
  ): boolean {
    this.initialize();
    const record = this.getTokenRecordByRawToken(rawToken);
    if (!record) {
      return false;
    }

    const serverScope = Object.entries(serverAccess || {})
      .filter(([, allowed]) => allowed)
      .map(([serverId]) => serverId);
    this.tokenRepository.update(record.id, { serverScope });
    return true;
  }

  public getClientId(rawToken: string): string | null {
    return this.getTokenRecordByRawToken(rawToken)?.clientId || null;
  }

  public canAccessServer(
    context: GatewayAuthContext,
    serverId: string,
  ): boolean {
    return canAccessServer(context, serverId);
  }

  public canListTool(
    context: GatewayAuthContext,
    serverId: string,
    toolName: string,
  ): boolean {
    return canListTool(context, serverId, toolName);
  }

  public canInvokeTool(
    context: GatewayAuthContext,
    serverId: string,
    toolName: string,
  ): boolean {
    return canInvokeTool(context, serverId, toolName);
  }

  private ensureDefaultIdentityState(): void {
    const existingUser = this.userRepository.getById(DEFAULT_USER_ID);
    if (!existingUser) {
      this.userRepository.add({
        id: DEFAULT_USER_ID,
        name: "Local System",
        status: "active",
        createdAt: now(),
        updatedAt: now(),
      } as GatewayUser);
    }

    (
      Object.entries(SYSTEM_ROLE_PERMISSIONS) as Array<
        [GatewayRoleName, GatewayPermission[]]
      >
    ).forEach(([name, permissions]) => {
      if (this.roleRepository.findByName(name)) {
        return;
      }
      this.roleRepository.add({
        id: crypto.randomUUID(),
        workspaceId: null,
        name,
        permissions,
        isSystem: true,
        createdAt: now(),
        updatedAt: now(),
      } as GatewayRole);
    });

    const adminRole = this.roleRepository.findByName("admin");
    if (!adminRole) {
      return;
    }

    let workspaceRows: Array<{ id: string }> = [{ id: "local-default" }];
    try {
      workspaceRows = this.userRepository.database.all<{ id: string }>(
        "SELECT id FROM workspaces",
      );
      if (workspaceRows.length === 0) {
        workspaceRows = [{ id: "local-default" }];
      }
    } catch {
      workspaceRows = [{ id: "local-default" }];
    }
    workspaceRows.forEach(({ id: workspaceId }) => {
      const membership = this.membershipRepository.findByUserAndWorkspace(
        DEFAULT_USER_ID,
        workspaceId,
      )[0];
      if (membership) {
        return;
      }

      this.membershipRepository.add({
        id: crypto.randomUUID(),
        userId: DEFAULT_USER_ID,
        workspaceId,
        roleId: adminRole.id,
        createdAt: now(),
        updatedAt: now(),
      } as any);
    });
  }

  private migrateLegacyTokens(): void {
    const manager = getSharedConfigManager();
    const legacyTokens = manager.getLegacyTokens();
    if (legacyTokens.length === 0) {
      return;
    }

    legacyTokens.forEach((legacyToken) => {
      if (this.getTokenRecordByRawToken(legacyToken.id)) {
        return;
      }

      const serverScope = Object.entries(legacyToken.serverAccess || {})
        .filter(([, allowed]) => allowed)
        .map(([serverId]) => serverId);

      const secretRef = getVaultService().storeSecret(legacyToken.id, {
        ownerType: "gateway-token",
        ownerId: legacyToken.clientId,
        secretType: "gateway-access-token",
        metadata: { migrated: true, clientId: legacyToken.clientId },
      });

      this.tokenRepository.add({
        id: crypto.randomUUID(),
        clientId: legacyToken.clientId,
        userId: legacyToken.userId || DEFAULT_USER_ID,
        type: "gateway_access",
        status: legacyToken.status || "active",
        tokenHash: this.hashToken(legacyToken.id),
        secretRef,
        workspaceScope: legacyToken.workspaceScope || ["*"],
        serverScope,
        toolScope: legacyToken.toolScope || ["*"],
        roleNames: legacyToken.roleNames || ["legacy-app"],
        legacyCompat: true,
        issuedAt: legacyToken.issuedAt,
        expiresAt: legacyToken.expiresAt,
        lastUsedAt: legacyToken.lastUsedAt,
        revokedAt: legacyToken.revokedAt,
        metadata: { migrated: true },
      } as GatewayTokenRecord);
    });

    manager.clearLegacyTokens();
  }

  private buildAuthContext(
    record: GatewayTokenRecord,
    workspaceId: string | null,
  ): GatewayAuthContext {
    const roleNames = this.resolveRoleNames(record, workspaceId);
    const permissions = this.resolvePermissions(roleNames, workspaceId);

    return {
      tokenId: record.id,
      clientId: record.clientId,
      authType: record.legacyCompat ? "legacy-token" : "gateway-token",
      status: record.status,
      principal: {
        userId: record.userId || DEFAULT_USER_ID,
        workspaceId,
        roleIds: this.resolveRoleIds(roleNames),
        roleNames,
        permissions,
        scope: {
          workspaces: record.workspaceScope,
          servers: record.serverScope,
          tools: record.toolScope,
        },
        legacyCompat: record.legacyCompat,
      },
    };
  }

  private resolveRoleNames(
    record: GatewayTokenRecord,
    workspaceId: string | null,
  ): string[] {
    const roleNames = new Set<string>(record.roleNames || []);

    if (roleNames.size === 0 && workspaceId && record.userId) {
      const memberships = this.membershipRepository.findByUserAndWorkspace(
        record.userId,
        workspaceId,
      );
      memberships.forEach((membership) => {
        const role = this.roleRepository.getById(membership.roleId);
        if (role) {
          roleNames.add(role.name);
        }
      });
    }

    if (roleNames.size === 0) {
      roleNames.add(record.legacyCompat ? "legacy-app" : "developer");
    }

    return Array.from(roleNames);
  }

  private resolveRoleIds(roleNames: string[]): string[] {
    return roleNames
      .map((name) => this.roleRepository.findByName(name)?.id)
      .filter((value): value is string => !!value);
  }

  private resolvePermissions(
    roleNames: string[],
    workspaceId: string | null,
  ): GatewayPermission[] {
    const permissions = new Set<GatewayPermission>();

    roleNames.forEach((name) => {
      const role = this.roleRepository.findByName(name);
      if (
        role &&
        (role.workspaceId === null || role.workspaceId === workspaceId)
      ) {
        role.permissions.forEach((permission) => permissions.add(permission));
        return;
      }

      const systemPermissions =
        SYSTEM_ROLE_PERMISSIONS[name as GatewayRoleName] || [];
      systemPermissions.forEach((permission) => permissions.add(permission));
    });

    return Array.from(permissions);
  }

  private toToken(record: GatewayTokenRecord): Token {
    const rawToken = getVaultService().resolveSecret(record.secretRef, {
      ownerType: "gateway-token",
      ownerId: record.clientId,
    });

    if (!rawToken) {
      throw new Error(
        `Failed to resolve gateway token secret for ${record.id}`,
      );
    }

    return {
      id: rawToken,
      clientId: record.clientId,
      issuedAt: record.issuedAt,
      serverAccess: this.serverScopeToAccessMap(record.serverScope),
      userId: record.userId || undefined,
      workspaceScope: record.workspaceScope,
      toolScope: record.toolScope,
      roleNames: record.roleNames,
      status: record.status,
      expiresAt: record.expiresAt,
      lastUsedAt: record.lastUsedAt,
      revokedAt: record.revokedAt,
      legacyCompat: record.legacyCompat,
    };
  }

  private getTokenRecordByRawToken(
    rawToken: string,
  ): GatewayTokenRecord | null {
    return this.tokenRepository.findByHash(this.hashToken(rawToken));
  }

  private serverScopeToAccessMap(
    serverScope: string[],
  ): Record<string, boolean> {
    return serverScope.reduce<Record<string, boolean>>((acc, serverId) => {
      acc[serverId] = true;
      return acc;
    }, {});
  }

  private generateTokenSecret(): string {
    return (
      "mcpr_" +
      crypto
        .randomBytes(24)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "")
    );
  }

  private hashToken(rawToken: string): string {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
  }

  private deleteTokenByRecord(record: GatewayTokenRecord): void {
    this.tokenRepository.delete(record.id);
    this.recordAudit({
      actorType: "token",
      actorId: record.clientId,
      action: "token.revoke",
      targetType: "gateway-token",
      targetId: record.clientId,
      status: "success",
      workspaceId: record.workspaceScope.includes("*")
        ? null
        : record.workspaceScope[0] || null,
    });
  }

  private recordAudit(input: {
    actorType: "system" | "user" | "token";
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    status: "success" | "error";
    metadata?: Record<string, unknown>;
    workspaceId?: string | null;
  }): void {
    this.auditRepository.add({
      id: crypto.randomUUID(),
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      status: input.status,
      metadata: input.metadata,
      workspaceId: input.workspaceId ?? null,
      createdAt: now(),
    } as any);
  }
}

export function getGatewaySecurityService(): GatewaySecurityService {
  return GatewaySecurityService.getInstance();
}
