import type {
  GatewayAuthContext,
  GatewayPermission,
  GatewayRoleName,
  GatewayTokenScope,
} from "@mcp_router/shared";

export const SYSTEM_ROLE_PERMISSIONS: Record<
  GatewayRoleName,
  GatewayPermission[]
> = {
  admin: [
    "tool.list",
    "tool.invoke",
    "server.list",
    "server.start",
    "server.stop",
    "server.configure",
    "admin.manageTokens",
    "admin.manageUsers",
    "admin.manageWorkspaces",
  ],
  operator: [
    "tool.list",
    "tool.invoke",
    "server.list",
    "server.start",
    "server.stop",
  ],
  developer: ["tool.list", "tool.invoke", "server.list"],
  viewer: ["tool.list", "server.list"],
  "legacy-app": ["tool.list", "tool.invoke", "server.list"],
};

export function hasPermission(
  context: GatewayAuthContext,
  permission: GatewayPermission,
): boolean {
  return context.principal.permissions.includes(permission);
}

export function matchesScope(scope: string[], candidate: string): boolean {
  if (scope.length === 0) {
    return false;
  }
  return scope.includes("*") || scope.includes(candidate);
}

export function matchesToolScope(
  scope: GatewayTokenScope,
  serverId: string,
  toolName: string,
): boolean {
  if (scope.tools.length === 0) {
    return false;
  }

  return scope.tools.some((pattern) => {
    if (pattern === "*") {
      return true;
    }
    if (pattern === toolName) {
      return true;
    }
    if (pattern === `${serverId}:*`) {
      return true;
    }
    return pattern === `${serverId}:${toolName}`;
  });
}

export function canAccessWorkspace(
  context: GatewayAuthContext,
  workspaceId: string | null,
): boolean {
  if (!workspaceId) {
    return true;
  }
  return matchesScope(context.principal.scope.workspaces, workspaceId);
}

export function canAccessServer(
  context: GatewayAuthContext,
  serverId: string,
): boolean {
  return matchesScope(context.principal.scope.servers, serverId);
}

export function canListTool(
  context: GatewayAuthContext,
  serverId: string,
  toolName: string,
): boolean {
  return (
    hasPermission(context, "tool.list") &&
    canAccessServer(context, serverId) &&
    matchesToolScope(context.principal.scope, serverId, toolName)
  );
}

export function canInvokeTool(
  context: GatewayAuthContext,
  serverId: string,
  toolName: string,
): boolean {
  return (
    hasPermission(context, "tool.invoke") &&
    canAccessServer(context, serverId) &&
    matchesToolScope(context.principal.scope, serverId, toolName)
  );
}
