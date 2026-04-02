import type { GatewayTokenStatus } from "./token-types";

export type GatewayPermission =
  | "tool.list"
  | "tool.invoke"
  | "server.list"
  | "server.start"
  | "server.stop"
  | "server.configure"
  | "admin.manageTokens"
  | "admin.manageUsers"
  | "admin.manageWorkspaces";

export type GatewayRoleName =
  | "admin"
  | "operator"
  | "developer"
  | "viewer"
  | "legacy-app";

export interface GatewayUser {
  id: string;
  name: string;
  status: "active" | "disabled";
  createdAt: number;
  updatedAt: number;
}

export interface GatewayRole {
  id: string;
  workspaceId: string | null;
  name: GatewayRoleName | string;
  permissions: GatewayPermission[];
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface GatewayMembership {
  id: string;
  userId: string;
  workspaceId: string;
  roleId: string;
  createdAt: number;
  updatedAt: number;
}

export interface GatewayTokenScope {
  workspaces: string[];
  servers: string[];
  tools: string[];
}

export interface GatewayPrincipal {
  userId: string;
  workspaceId: string | null;
  roleIds: string[];
  roleNames: string[];
  permissions: GatewayPermission[];
  scope: GatewayTokenScope;
  legacyCompat: boolean;
}

export interface GatewayAuthContext {
  tokenId: string;
  clientId: string;
  authType: "gateway-token" | "legacy-token";
  status: GatewayTokenStatus;
  principal: GatewayPrincipal;
}

export interface GatewayAuditEvent {
  id: string;
  workspaceId: string | null;
  actorType: "system" | "user" | "token";
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  status: "success" | "error";
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface GatewayTokenRecord {
  id: string;
  clientId: string;
  userId: string | null;
  type: "gateway_access";
  status: GatewayTokenStatus;
  tokenHash: string;
  secretRef: string;
  workspaceScope: string[];
  serverScope: string[];
  toolScope: string[];
  roleNames: string[];
  legacyCompat: boolean;
  issuedAt: number;
  expiresAt?: number;
  lastUsedAt?: number;
  revokedAt?: number;
  metadata?: Record<string, unknown>;
}
