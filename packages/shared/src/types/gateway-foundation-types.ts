import type { GatewayAuthContext, GatewayPermission } from "./gateway-types";

export interface GatewayServerPackagePermissionRequest {
  scope: GatewayPermission | string;
  description: string;
}

export interface GatewayServerPackageManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  entry: string;
  registrySource?: string;
  installSteps?: string[];
  requestedPermissions: GatewayServerPackagePermissionRequest[];
  capabilities?: string[];
  tags?: string[];
}

export interface GatewayRegistrySource {
  type: "file" | "directory";
  path: string;
  autoUpdate?: boolean;
}

export interface GatewayRegistryPackageRecord {
  manifest: GatewayServerPackageManifest;
  discoveredAt: number;
  installedVersion?: string;
  updateAvailable: boolean;
}

export interface GatewayDiscoverySyncResult {
  source: GatewayRegistrySource;
  packages: GatewayRegistryPackageRecord[];
  discoveredCount: number;
  updatedCount: number;
  skippedCount: number;
}

export interface GatewayWorkflowStep {
  id: string;
  kind: "discover-tools" | "call-tool" | "delay" | "custom";
  toolRef?: string;
  serverId?: string;
  arguments?: Record<string, unknown>;
  delayMs?: number;
  metadata?: Record<string, unknown>;
}

export interface GatewayWorkflowDefinition {
  id: string;
  name: string;
  workspaceId?: string | null;
  requiredPermissions?: GatewayPermission[];
  steps: GatewayWorkflowStep[];
}

export interface GatewayWorkflowStepResult {
  stepId: string;
  status: "completed" | "failed";
  serverId?: string;
  output?: unknown;
  error?: string;
}

export interface GatewayWorkflowExecutionResult {
  workflowId: string;
  status: "completed" | "failed";
  executedSteps: GatewayWorkflowStepResult[];
}

export interface GatewayStructuredEvent {
  id: string;
  category: "auth" | "routing" | "retry" | "vault" | "workflow" | "discovery";
  action: string;
  workspaceId?: string | null;
  tokenId?: string;
  userId?: string | null;
  serverId?: string;
  status: "success" | "error";
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface GatewayRoutingRule {
  id: string;
  match: {
    workspaceIds?: string[];
    intents?: string[];
    capabilities?: string[];
    modelPatterns?: string[];
  };
  preferServerIds?: string[];
  fallbackServerIds?: string[];
}

export interface GatewayModelRoutingPreference {
  provider?: string;
  modelPattern: string;
  preferredServerIds: string[];
  preferredCapabilities?: string[];
}

export interface GatewayConfigBundle {
  version: string;
  workspaces?: Array<{
    id: string;
    name: string;
    defaultRoutingMode?: "gateway" | "legacy";
  }>;
  roles?: Array<{
    name: string;
    workspaceId?: string | null;
    permissions: GatewayPermission[];
  }>;
  routingRules?: GatewayRoutingRule[];
  modelRouting?: GatewayModelRoutingPreference[];
  registrySources?: GatewayRegistrySource[];
  workflows?: GatewayWorkflowDefinition[];
}

export interface GatewayAuthProvider {
  kind: "local" | "remote";
  authenticateToken(rawToken: string): Promise<GatewayAuthContext | null>;
}

export interface GatewayWorkspaceSyncProvider {
  kind: "local" | "remote";
  pullWorkspace(workspaceId: string): Promise<void>;
  pushWorkspace(workspaceId: string): Promise<void>;
}

export interface GatewaySyncHooks {
  beforePush?(workspaceId: string): Promise<void> | void;
  afterPush?(workspaceId: string): Promise<void> | void;
  beforePull?(workspaceId: string): Promise<void> | void;
  afterPull?(workspaceId: string): Promise<void> | void;
}
