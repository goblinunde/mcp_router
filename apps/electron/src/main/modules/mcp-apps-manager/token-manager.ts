import {
  Token,
  TokenGenerateOptions,
  TokenValidationResult,
  TokenServerAccess,
} from "@mcp_router/shared";
import { getGatewaySecurityService } from "../gateway/gateway-security.service";

/**
 * トークン管理機能を提供するクラス
 */
export class TokenManager {
  private gatewaySecurity = getGatewaySecurityService();

  public constructor() {
    this.gatewaySecurity.initialize();
  }

  /**
   * 新しいトークンを生成
   */
  public generateToken(options: TokenGenerateOptions): Token {
    return this.gatewaySecurity.createToken(options);
  }

  /**
   * トークンを検証
   */
  public validateToken(
    tokenId: string,
    workspaceId?: string | null,
  ): TokenValidationResult {
    return this.gatewaySecurity.validateToken(tokenId, workspaceId);
  }

  /**
   * トークンからクライアントIDを取得
   */
  public getClientIdFromToken(tokenId: string): string | null {
    const validation = this.validateToken(tokenId);
    return validation.isValid ? validation.clientId! : null;
  }

  /**
   * トークンを削除
   */
  public deleteToken(tokenId: string): boolean {
    return this.gatewaySecurity.deleteToken(tokenId);
  }

  /**
   * クライアントIDに関連付けられた全てのトークンを削除
   */
  public deleteClientTokens(clientId: string): number {
    return this.gatewaySecurity.deleteClientTokens(clientId);
  }

  /**
   * 全てのトークンをリスト表示
   */
  public listTokens(): Token[] {
    return this.gatewaySecurity.listTokens();
  }

  /**
   * トークンのサーバアクセス権限を確認
   */
  public hasServerAccess(tokenId: string, serverId: string): boolean {
    const context = this.gatewaySecurity.resolveAuthContext(tokenId, null);
    if (!context) {
      return false;
    }
    return this.gatewaySecurity.canAccessServer(context, serverId);
  }

  /**
   * トークンのサーバアクセス権限を更新
   */
  public updateTokenServerAccess(
    tokenId: string,
    serverAccess: TokenServerAccess,
  ): boolean {
    return this.gatewaySecurity.updateTokenServerAccess(
      tokenId,
      serverAccess || {},
    );
  }
}
