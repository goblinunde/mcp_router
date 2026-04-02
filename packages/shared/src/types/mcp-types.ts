// Input parameter definition for MCP servers
export interface MCPInputParam {
  type?: "string" | "number" | "boolean" | "directory" | "file";
  title?: string;
  description?: string;
  sensitive?: boolean;
  required?: boolean;
  default?: string | number | boolean;
  min?: number;
  max?: number;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  env: Record<string, string>;
  autoStart?: boolean;
  disabled?: boolean;
  description?: string;
  serverType: "local" | "remote" | "remote-streamable";
  command?: string;
  args?: string[];
  remoteUrl?: string;
  bearerToken?: string;
  // Project grouping
  projectId?: string | null;

  setupInstructions?: string;
  inputParams?: Record<string, MCPInputParam>;
  verificationStatus?: "verified" | "unverified";
  required?: string[];

  latestVersion?: string;
  version?: string;

  toolPermissions?: MCPServerToolPermissions;
  healthCheckConfig?: MCPServerHealthCheckConfig;
}

export interface MCPTool {
  name: string;
  description?: string;
  enabled?: boolean;
  inputSchema?: any;
}

export interface MCPServerToolPermissions {
  [toolName: string]: boolean;
}

export interface MCPServerHealthCheckConfig {
  enabled?: boolean;
  intervalMs?: number;
  timeoutMs?: number;
  failureThreshold?: number;
  autoRecoveryEnabled?: boolean;
  recoveryBackoffMs?: number;
  maxRecoveryAttempts?: number;
  recoveryWindowMs?: number;
}

export type MCPServerHealthStatus =
  | "unknown"
  | "healthy"
  | "degraded"
  | "unhealthy"
  | "recovering";

export type MCPServerHealthEventLevel =
  | "info"
  | "success"
  | "warning"
  | "error";

export type MCPServerHealthEventType =
  | "health-check-failed"
  | "health-check-recovered"
  | "auto-recovery-scheduled"
  | "auto-recovery-succeeded"
  | "auto-recovery-failed"
  | "auto-recovery-paused"
  | "manual-reconnect-requested"
  | "manual-reconnect-succeeded"
  | "manual-reconnect-failed";

export interface MCPServerHealthEvent {
  id: string;
  timestamp: string;
  type: MCPServerHealthEventType;
  level: MCPServerHealthEventLevel;
  message: string;
  detail?: string;
  attempt?: number;
  failureCount?: number;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPServer extends MCPServerConfig {
  id: string;
  status: "running" | "starting" | "stopping" | "stopped" | "error";
  errorMessage?: string; // Error message when status is "error"
  logs?: string[];
  healthStatus?: MCPServerHealthStatus;
  healthCheckFailures?: number;
  healthCheckError?: string;
  lastHealthCheckAt?: string;
  lastHealthyAt?: string;
  recoveryAttempts?: number;
  autoRecoveryCount?: number;
  lastRecoveryAt?: string;
  healthEvents?: MCPServerHealthEvent[];
  // Properties for the MCP Test Page
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
}

export interface APIMCPServer {
  id: string;
  tags: string[];
  displayId: string;
  description: string;
  userId: string;
  iconUrl: string;
  createdAt: number;
  githubUrl: string;
  name: string;
  latestVersion: string;
  updatedAt: number;
  version: string;
}

export interface LocalMCPServer {
  id: string;
  displayId?: string;
  githubUrl: string | null;
  name: string;
  description: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  command?: string;
  args?: string[];
  envs?: Record<string, string>;
  iconUrl?: string;
  tags?: string[];
  verificationStatus?: "verified" | "unverified";
  inputParams?: Record<string, MCPInputParam>;
  latestVersion?: string;
  version?: string;
  required?: string[];
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: Pagination;
}
