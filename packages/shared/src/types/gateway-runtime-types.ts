export interface VaultCrypto {
  isAvailable(): boolean;
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface VaultSecretRecord {
  id: string;
  workspaceId: string | null;
  ownerType: string;
  ownerId: string;
  secretType: string;
  ciphertext: string;
  revokedAt?: number;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface StoreSecretInput {
  workspaceId?: string | null;
  ownerType: string;
  ownerId: string;
  secretType: string;
  metadata?: Record<string, unknown>;
}

export interface VaultAccessContext {
  workspaceId?: string | null;
  ownerType?: string;
  ownerId?: string;
}

export interface RoutingCandidate {
  serverId: string;
  serverName: string;
  capabilities: string[];
  workspaceId?: string | null;
  models?: string[];
  priority?: number;
}

export interface RoutingRequest {
  intent?: string;
  requiredCapability?: string;
  workspaceId?: string | null;
  modelName?: string;
  allowedServerIds?: Set<string>;
  fallbackServerIds?: string[];
}

export interface RoutingDecision {
  primaryServerId: string | null;
  orderedServerIds: string[];
  scores: Array<{
    serverId: string;
    score: number;
    reasons: string[];
  }>;
}

export interface RetryPlanOptions {
  sameServerRetries: number;
}
