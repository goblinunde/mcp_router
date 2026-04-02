import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { TokenManager } from "@/main/modules/mcp-apps-manager/token-manager";
import type {
  GatewayAuthContext,
  TokenServerAccess,
  TokenValidationResult,
} from "@mcp_router/shared";
import { getGatewaySecurityService } from "../gateway/gateway-security.service";

export class TokenValidator {
  private tokenManager: TokenManager;
  private gatewaySecurity = getGatewaySecurityService();
  private serverNameToIdMap: Map<string, string>;

  constructor(serverNameToIdMap: Map<string, string>) {
    this.serverNameToIdMap = serverNameToIdMap;
    this.tokenManager = new TokenManager();
  }

  /**
   * Get server ID by name
   */
  private getServerIdByName(name: string): string | undefined {
    return this.serverNameToIdMap.get(name);
  }

  /**
   * Validate token and check server access in one step
   * @param token The token to validate
   * @param serverName The server name to check access for
   * @returns The client ID if token is valid and has access, throws error otherwise
   */
  public validateTokenAndAccess(
    token: string | undefined,
    serverName: string,
    options?: { workspaceId?: string | null },
  ): string {
    if (!token || typeof token !== "string") {
      throw new McpError(ErrorCode.InvalidRequest, "Token is required");
    }

    const validation = this.tokenManager.validateToken(
      token,
      options?.workspaceId,
    );
    if (!validation.isValid) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        validation.error || "Invalid token",
      );
    }

    // Get server ID from name
    const serverId = this.getServerIdByName(serverName);
    if (!serverId) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Unknown server: ${serverName}`,
      );
    }

    // Check server access
    if (!this.tokenManager.hasServerAccess(token, serverId)) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        "Token does not have access to this server",
      );
    }

    return validation.clientId!;
  }

  /**
   * Check if a token has access to a server
   */
  public hasServerAccess(token: string, serverId: string): boolean {
    return this.tokenManager.hasServerAccess(token, serverId);
  }

  public hasServerAccessContext(
    authContext: GatewayAuthContext,
    serverId: string,
  ): boolean {
    return this.gatewaySecurity.canAccessServer(authContext, serverId);
  }

  /**
   * Validate a token
   */
  public validateToken(
    token: string,
    workspaceId?: string | null,
  ): TokenValidationResult {
    return this.tokenManager.validateToken(token, workspaceId);
  }

  public resolveAuthContext(
    token: string,
    workspaceId?: string | null,
  ): GatewayAuthContext | null {
    return this.gatewaySecurity.resolveAuthContext(token, workspaceId);
  }

  public canListTool(
    authContext: GatewayAuthContext,
    serverId: string,
    toolName: string,
  ): boolean {
    return this.gatewaySecurity.canListTool(authContext, serverId, toolName);
  }

  public canInvokeTool(
    authContext: GatewayAuthContext,
    serverId: string,
    toolName: string,
  ): boolean {
    return this.gatewaySecurity.canInvokeTool(authContext, serverId, toolName);
  }

  /**
   * Update token server access
   */
  public updateTokenServerAccess(
    tokenId: string,
    serverAccess: TokenServerAccess,
  ): void {
    this.tokenManager.updateTokenServerAccess(tokenId, serverAccess);
  }

  /**
   * List all tokens
   */
  public listTokens(): any[] {
    return this.tokenManager.listTokens();
  }
}
