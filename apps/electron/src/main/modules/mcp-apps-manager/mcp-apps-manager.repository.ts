import { Token, TokenServerAccess } from "@mcp_router/shared";
import { getGatewaySecurityService } from "../gateway/gateway-security.service";

/**
 * トークン用リポジトリクラス
 * SharedConfigManagerを使用して共通設定ファイルで管理
 */
export class McpAppsManagerRepository {
  private static instance: McpAppsManagerRepository | null = null;

  /**
   * コンストラクタ
   */
  private constructor() {
    console.log(
      "[McpAppsManagerRepository] Using SharedConfigManager for token storage",
    );
  }

  /**
   * シングルトンインスタンスを取得
   */
  public static getInstance(): McpAppsManagerRepository {
    if (!McpAppsManagerRepository.instance) {
      McpAppsManagerRepository.instance = new McpAppsManagerRepository();
    }
    return McpAppsManagerRepository.instance;
  }

  /**
   * インスタンスをリセット
   */
  public static resetInstance(): void {
    McpAppsManagerRepository.instance = null;
  }

  /**
   * トークンを取得
   */
  public getToken(id: string): Token | null {
    return getGatewaySecurityService().getToken(id);
  }

  /**
   * トークンを保存
   */
  public saveToken(token: Token): void {
    getGatewaySecurityService().createToken({
      clientId: token.clientId,
      serverAccess: token.serverAccess || {},
      userId: token.userId,
      workspaceScope: token.workspaceScope,
      toolScope: token.toolScope,
      roleNames: token.roleNames,
      legacyCompat: token.legacyCompat,
    });
  }

  /**
   * トークンをリスト表示
   */
  public listTokens(): Token[] {
    return getGatewaySecurityService().listTokens();
  }

  /**
   * トークンを削除
   */
  public deleteToken(id: string): boolean {
    try {
      return getGatewaySecurityService().deleteToken(id);
    } catch (error) {
      console.error(`トークン${id}の削除中にエラーが発生しました:`, error);
      return false;
    }
  }

  /**
   * クライアントIDに関連付けられた全てのトークンを削除
   */
  public deleteClientTokens(clientId: string): number {
    try {
      return getGatewaySecurityService().deleteClientTokens(clientId);
    } catch (error) {
      console.error(
        `クライアント${clientId}のトークン削除中にエラーが発生しました:`,
        error,
      );
      throw error;
    }
  }

  /**
   * トークンのサーバアクセスを更新
   */
  public updateTokenServerAccess(
    id: string,
    serverAccess: TokenServerAccess,
  ): boolean {
    try {
      return getGatewaySecurityService().updateTokenServerAccess(
        id,
        serverAccess,
      );
    } catch (error) {
      console.error(`トークン${id}の更新中にエラーが発生しました:`, error);
      return false;
    }
  }

  /**
   * クライアントIDに関連付けられたトークンを取得
   */
  public getTokensByClientId(clientId: string): Token[] {
    try {
      return getGatewaySecurityService()
        .listTokens()
        .filter((token) => token.clientId === clientId);
    } catch (error) {
      console.error(
        `クライアントID ${clientId} のトークン取得中にエラーが発生しました:`,
        error,
      );
      throw error;
    }
  }

  // BaseRepositoryとの互換性のためのメソッド
  public getById(id: string): Token | undefined {
    return getGatewaySecurityService().getToken(id) || undefined;
  }

  public getAll(): Token[] {
    return this.listTokens();
  }

  public add(token: Token): Token {
    this.saveToken(token);
    return token;
  }

  public update(id: string, token: Token): Token | undefined {
    const existing = this.getById(id);
    if (existing) {
      this.saveToken(token);
      return token;
    }
    return undefined;
  }

  public delete(id: string): boolean {
    return this.deleteToken(id);
  }
}
