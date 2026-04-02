/**
 * トークン関連の型定義
 */

export type GatewayTokenStatus = "active" | "revoked";

/**
 * サーバーアクセス権限のマップ
 */
export type TokenServerAccess = Record<string, boolean>;

/**
 * トークンのインターフェース
 */
export interface Token {
  id: string; // トークンの一意のID
  clientId: string; // 関連付けられたクライアントID
  issuedAt: number; // トークン発行時のUNIXタイムスタンプ
  serverAccess: TokenServerAccess; // サーバーごとのアクセス権（true=許可、false=拒否）
  userId?: string;
  workspaceScope?: string[];
  toolScope?: string[];
  roleNames?: string[];
  status?: GatewayTokenStatus;
  expiresAt?: number;
  lastUsedAt?: number;
  revokedAt?: number;
  legacyCompat?: boolean;
}

/**
 * トークン生成時のオプション
 */
export interface TokenGenerateOptions {
  clientId: string; // クライアントID
  serverAccess: TokenServerAccess; // アクセスを許可するサーバIDマップ
  expiresIn?: number; // トークンの有効期間（秒）、デフォルトは24時間
  userId?: string;
  workspaceScope?: string[];
  toolScope?: string[];
  roleNames?: string[];
  legacyCompat?: boolean;
}

/**
 * トークン検証の結果
 */
export interface TokenValidationResult {
  isValid: boolean; // トークンが存在するかどうか
  clientId?: string; // 有効な場合のクライアントID
  userId?: string;
  workspaceScope?: string[];
  toolScope?: string[];
  roleNames?: string[];
  status?: GatewayTokenStatus;
  expiresAt?: number;
  lastUsedAt?: number;
  legacyCompat?: boolean;
  error?: string; // エラーメッセージ（存在しない場合）
  statusCode?: number;
}
