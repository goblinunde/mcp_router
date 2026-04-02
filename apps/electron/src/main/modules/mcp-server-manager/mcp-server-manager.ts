import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { app } from "electron";
import { EventEmitter } from "events";
import {
  MCPServer,
  MCPServerConfig,
  MCPServerHealthCheckConfig,
  MCPServerHealthEvent,
  MCPServerHealthEventLevel,
  MCPServerHealthEventType,
  MCPTool,
} from "@mcp_router/shared";
import {
  getServerService,
  ServerService,
} from "@/main/modules/mcp-server-manager/server-service";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  connectToMCPServer,
  substituteArgsParameters,
} from "../mcp-apps-manager/mcp-apps-manager.service";
import { getLogService } from "@/main/modules/mcp-logger/mcp-logger.service";

/**
 * Core server lifecycle management
 */
export class MCPServerManager {
  private static readonly HEALTH_MONITOR_TICK_MS = 5_000;
  private static readonly MAX_HEALTH_EVENTS = 25;
  private static readonly DEFAULT_HEALTH_CHECK_CONFIG: Required<MCPServerHealthCheckConfig> =
    {
      enabled: true,
      intervalMs: 30_000,
      timeoutMs: 10_000,
      failureThreshold: 2,
      autoRecoveryEnabled: true,
      recoveryBackoffMs: 5_000,
      maxRecoveryAttempts: 3,
      recoveryWindowMs: 5 * 60_000,
    };

  private servers: Map<string, MCPServer> = new Map();
  private clients: Map<string, Client> = new Map();
  private serverNameToIdMap: Map<string, string> = new Map();
  private serverStatusMap: Map<string, boolean> = new Map();
  private serversDir: string;
  private serverService!: ServerService;
  private eventEmitter = new EventEmitter();
  private healthMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private activeHealthChecks: Set<string> = new Set();
  private recoveryTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();
  private recoveryAttemptHistory: Map<string, number[]> = new Map();

  constructor() {
    this.serversDir = path.join(app.getPath("userData"), "mcp-servers");
    if (!fs.existsSync(this.serversDir)) {
      fs.mkdirSync(this.serversDir, { recursive: true });
    }
    // Set server name to ID map for log service
    getLogService().setServerNameToIdMap(this.serverNameToIdMap);
  }

  /**
   * Initialize async operations
   */
  public async initializeAsync(): Promise<void> {
    try {
      console.log("[MCPServerManager] Initializing...");

      // Initialize server service
      this.serverService = getServerService();

      // Load servers from database
      await this.loadServersFromDatabase();
      this.startHealthMonitor();

      console.log("[MCPServerManager] Initialization complete");
    } catch (error) {
      console.error("Failed to initialize Server Manager:", error);
    }
  }

  /**
   * Load servers from database
   */
  private async loadServersFromDatabase(): Promise<void> {
    try {
      console.log("[MCPServerManager] Loading servers from database...");
      const servers = this.serverService.getAllServers();
      console.log(
        `[MCPServerManager] Found ${servers.length} servers in database`,
      );

      const autoStartServerIds: string[] = [];

      for (const server of servers) {
        this.initializeRuntimeState(server);
        this.servers.set(server.id, server);

        // Update server name to ID mapping
        this.updateServerNameMapping(server);

        // Auto start servers if configured
        if (server.autoStart && !server.disabled) {
          autoStartServerIds.push(server.id);
        }
      }

      if (autoStartServerIds.length > 0) {
        await Promise.all(
          autoStartServerIds.map(async (id) => {
            try {
              await this.startServer(id, undefined, false, "auto-start");
            } catch (error) {
              const server = this.servers.get(id);
              const identifier = server?.name || id;
              console.error(
                `[MCPServerManager] Failed to auto-start server ${identifier}:`,
                error,
              );
            }
          }),
        );
      }

      console.log(`[MCPServerManager] ${servers.length} servers loaded`);
    } catch (error) {
      console.error("Error loading servers:", error);
    }
  }

  /**
   * Update server name to ID mapping
   */
  private updateServerNameMapping(server: MCPServer): void {
    this.serverNameToIdMap.set(server.name, server.id);
  }

  private initializeRuntimeState(server: MCPServer): void {
    server.status = "stopped";
    server.logs = [];
    server.toolPermissions = server.toolPermissions || {};
    server.healthStatus = "unknown";
    server.healthCheckFailures = 0;
    server.healthCheckError = undefined;
    server.lastHealthCheckAt = undefined;
    server.lastHealthyAt = undefined;
    server.recoveryAttempts = 0;
    server.autoRecoveryCount = 0;
    server.lastRecoveryAt = undefined;
    server.healthEvents = [];
    this.applyHealthMonitoringConfig(server.id, server);
  }

  private createRuntimeSnapshot(
    server: MCPServer,
  ): Pick<
    MCPServer,
    | "status"
    | "errorMessage"
    | "logs"
    | "tools"
    | "resources"
    | "prompts"
    | "healthStatus"
    | "healthCheckFailures"
    | "healthCheckError"
    | "lastHealthCheckAt"
    | "lastHealthyAt"
    | "recoveryAttempts"
    | "autoRecoveryCount"
    | "lastRecoveryAt"
    | "healthEvents"
  > {
    return {
      status: server.status,
      errorMessage: server.errorMessage,
      logs: server.logs || [],
      tools: server.tools,
      resources: server.resources,
      prompts: server.prompts,
      healthStatus: server.healthStatus,
      healthCheckFailures: server.healthCheckFailures,
      healthCheckError: server.healthCheckError,
      lastHealthCheckAt: server.lastHealthCheckAt,
      lastHealthyAt: server.lastHealthyAt,
      recoveryAttempts: server.recoveryAttempts,
      autoRecoveryCount: server.autoRecoveryCount,
      lastRecoveryAt: server.lastRecoveryAt,
      healthEvents: server.healthEvents || [],
    };
  }

  private clampInteger(
    value: number | undefined,
    fallback: number,
    min: number,
    max?: number,
  ): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    const normalized = Math.floor(value as number);
    if (normalized < min) {
      return min;
    }
    if (typeof max === "number" && normalized > max) {
      return max;
    }
    return normalized;
  }

  private getHealthCheckConfig(
    server: MCPServer,
  ): Required<MCPServerHealthCheckConfig> {
    const config = server.healthCheckConfig || {};
    const defaults = MCPServerManager.DEFAULT_HEALTH_CHECK_CONFIG;

    return {
      enabled: config.enabled !== false,
      intervalMs: this.clampInteger(
        config.intervalMs,
        defaults.intervalMs,
        5_000,
      ),
      timeoutMs: this.clampInteger(config.timeoutMs, defaults.timeoutMs, 1_000),
      failureThreshold: this.clampInteger(
        config.failureThreshold,
        defaults.failureThreshold,
        1,
        10,
      ),
      autoRecoveryEnabled: config.autoRecoveryEnabled !== false,
      recoveryBackoffMs: this.clampInteger(
        config.recoveryBackoffMs,
        defaults.recoveryBackoffMs,
        0,
      ),
      maxRecoveryAttempts: this.clampInteger(
        config.maxRecoveryAttempts,
        defaults.maxRecoveryAttempts,
        1,
        10,
      ),
      recoveryWindowMs: this.clampInteger(
        config.recoveryWindowMs,
        defaults.recoveryWindowMs,
        60_000,
      ),
    };
  }

  private applyHealthMonitoringConfig(id: string, server: MCPServer): void {
    const config = this.getHealthCheckConfig(server);

    if (!config.enabled) {
      this.clearRecoveryTimer(id);
      this.recoveryAttemptHistory.delete(id);
      server.healthStatus = "unknown";
      server.healthCheckFailures = 0;
      server.healthCheckError = undefined;
      server.lastHealthCheckAt = undefined;
      server.recoveryAttempts = 0;
    } else if (!server.healthEvents) {
      server.healthEvents = [];
    }

    if (!config.autoRecoveryEnabled) {
      this.clearRecoveryTimer(id);
      this.recoveryAttemptHistory.delete(id);
      server.recoveryAttempts = 0;
    }
  }

  private isHealthCheckDue(server: MCPServer, intervalMs: number): boolean {
    if (!server.lastHealthCheckAt) {
      return true;
    }

    const lastCheckAt = Date.parse(server.lastHealthCheckAt);
    return Number.isNaN(lastCheckAt) || Date.now() - lastCheckAt >= intervalMs;
  }

  private pushHealthEvent(
    server: MCPServer,
    event: Omit<MCPServerHealthEvent, "id" | "timestamp">,
  ): void {
    const events = server.healthEvents || [];
    const entry: MCPServerHealthEvent = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    server.healthEvents = [entry, ...events].slice(
      0,
      MCPServerManager.MAX_HEALTH_EVENTS,
    );
  }

  private addHealthEvent(
    server: MCPServer,
    type: MCPServerHealthEventType,
    level: MCPServerHealthEventLevel,
    message: string,
    detail?: string,
    metadata?: Partial<Pick<MCPServerHealthEvent, "attempt" | "failureCount">>,
  ): void {
    this.pushHealthEvent(server, {
      type,
      level,
      message,
      detail,
      attempt: metadata?.attempt,
      failureCount: metadata?.failureCount,
    });
  }

  private clearRecoveryTimer(id: string): void {
    const timer = this.recoveryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.recoveryTimers.delete(id);
    }
  }

  private resetRecoveryState(
    id: string,
    server?: MCPServer,
    options?: { preserveRecoveryStats?: boolean },
  ): void {
    this.clearRecoveryTimer(id);
    this.recoveryAttemptHistory.delete(id);
    if (server) {
      server.recoveryAttempts = 0;
      if (!options?.preserveRecoveryStats) {
        server.autoRecoveryCount = 0;
        server.lastRecoveryAt = undefined;
      }
    }
  }

  private startHealthMonitor(): void {
    if (this.healthMonitorTimer) {
      return;
    }

    this.healthMonitorTimer = setInterval(() => {
      void this.runHealthChecks();
    }, MCPServerManager.HEALTH_MONITOR_TICK_MS);
  }

  private stopHealthMonitor(): void {
    if (this.healthMonitorTimer) {
      clearInterval(this.healthMonitorTimer);
      this.healthMonitorTimer = null;
    }

    for (const timer of this.recoveryTimers.values()) {
      clearTimeout(timer);
    }

    this.recoveryTimers.clear();
    this.activeHealthChecks.clear();
    this.recoveryAttemptHistory.clear();
  }

  private async runHealthChecks(): Promise<void> {
    const runningServerIds = Array.from(this.clients.keys());
    if (runningServerIds.length === 0) {
      return;
    }

    await Promise.allSettled(
      runningServerIds.map(async (serverId) =>
        this.checkServerHealth(serverId),
      ),
    );
  }

  private async checkServerHealth(serverId: string): Promise<void> {
    if (
      this.activeHealthChecks.has(serverId) ||
      this.recoveryTimers.has(serverId)
    ) {
      return;
    }

    const server = this.servers.get(serverId);
    const client = this.clients.get(serverId);

    if (!server || !client || server.status !== "running") {
      return;
    }

    const healthCheckConfig = this.getHealthCheckConfig(server);
    if (
      !healthCheckConfig.enabled ||
      !this.isHealthCheckDue(server, healthCheckConfig.intervalMs)
    ) {
      return;
    }

    this.activeHealthChecks.add(serverId);

    try {
      const previousHealthStatus = server.healthStatus;
      const previousFailureCount = server.healthCheckFailures || 0;
      await this.withTimeout(
        client.ping(),
        healthCheckConfig.timeoutMs,
        `${server.name} health check timed out`,
      );

      const now = new Date().toISOString();
      server.healthStatus = "healthy";
      server.healthCheckFailures = 0;
      server.healthCheckError = undefined;
      server.lastHealthCheckAt = now;
      server.lastHealthyAt = now;

      if (
        previousFailureCount > 0 ||
        (previousHealthStatus !== "healthy" &&
          previousHealthStatus !== "unknown" &&
          previousHealthStatus !== undefined)
      ) {
        this.addHealthEvent(
          server,
          "health-check-recovered",
          "success",
          "Health checks recovered",
          previousFailureCount > 0
            ? `Recovered after ${previousFailureCount} consecutive failures.`
            : undefined,
          { failureCount: previousFailureCount },
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown health check error";
      const now = new Date().toISOString();
      const failureCount = (server.healthCheckFailures || 0) + 1;

      server.healthCheckFailures = failureCount;
      server.healthCheckError = message;
      server.lastHealthCheckAt = now;
      server.healthStatus =
        failureCount >= healthCheckConfig.failureThreshold
          ? "unhealthy"
          : "degraded";

      this.addHealthEvent(
        server,
        "health-check-failed",
        failureCount >= healthCheckConfig.failureThreshold
          ? "error"
          : "warning",
        "Health check failed",
        message,
        { failureCount },
      );

      this.recordServerLog(
        server,
        "HealthCheck",
        "error",
        "MCP Router Health Monitor",
        { failureCount },
        message,
      );

      if (failureCount >= healthCheckConfig.failureThreshold) {
        this.scheduleAutoRecovery(serverId, message);
      }
    } finally {
      this.activeHealthChecks.delete(serverId);
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  private registerRecoveryAttempt(
    serverId: string,
    healthCheckConfig: Required<MCPServerHealthCheckConfig>,
  ): number | null {
    const now = Date.now();
    const attempts = (this.recoveryAttemptHistory.get(serverId) || []).filter(
      (timestamp) => now - timestamp <= healthCheckConfig.recoveryWindowMs,
    );

    if (attempts.length >= healthCheckConfig.maxRecoveryAttempts) {
      this.recoveryAttemptHistory.set(serverId, attempts);
      return null;
    }

    attempts.push(now);
    this.recoveryAttemptHistory.set(serverId, attempts);
    return attempts.length;
  }

  private scheduleAutoRecovery(serverId: string, failureReason: string): void {
    const server = this.servers.get(serverId);
    if (!server || server.disabled || this.recoveryTimers.has(serverId)) {
      return;
    }

    const healthCheckConfig = this.getHealthCheckConfig(server);
    if (!healthCheckConfig.autoRecoveryEnabled) {
      this.addHealthEvent(
        server,
        "auto-recovery-paused",
        "warning",
        "Automatic recovery is disabled",
        "Reconnect manually to recover this server.",
      );
      return;
    }

    const attemptNumber = this.registerRecoveryAttempt(
      serverId,
      healthCheckConfig,
    );

    if (!attemptNumber) {
      server.status = "error";
      server.healthStatus = "unhealthy";
      server.errorMessage =
        "Automatic recovery paused after repeated health check failures.";
      this.disconnectClient(serverId);
      this.addHealthEvent(
        server,
        "auto-recovery-paused",
        "error",
        "Automatic recovery paused",
        server.errorMessage,
      );
      this.recordServerLog(
        server,
        "AutoRecovery",
        "error",
        "MCP Router Health Monitor",
        { failureReason, exhausted: true },
        server.errorMessage,
      );
      return;
    }

    server.healthStatus = "recovering";
    server.recoveryAttempts = attemptNumber;
    server.lastRecoveryAt = new Date().toISOString();

    this.addHealthEvent(
      server,
      "auto-recovery-scheduled",
      "warning",
      "Automatic recovery scheduled",
      `Retrying in ${healthCheckConfig.recoveryBackoffMs} ms.`,
      { attempt: attemptNumber },
    );

    const timer = setTimeout(() => {
      this.recoveryTimers.delete(serverId);
      void this.performAutoRecovery(serverId, failureReason);
    }, healthCheckConfig.recoveryBackoffMs);

    this.recoveryTimers.set(serverId, timer);
  }

  private async performAutoRecovery(
    serverId: string,
    failureReason: string,
  ): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server || server.disabled) {
      return;
    }

    server.healthStatus = "recovering";
    server.lastRecoveryAt = new Date().toISOString();

    this.disconnectClient(serverId);

    try {
      await this.startServer(
        serverId,
        "MCP Router Health Monitor",
        false,
        "auto-recovery",
      );

      const recoveredServer = this.servers.get(serverId);
      if (recoveredServer) {
        recoveredServer.autoRecoveryCount =
          (recoveredServer.autoRecoveryCount || 0) + 1;
        recoveredServer.lastRecoveryAt = new Date().toISOString();
      }

      this.addHealthEvent(
        server,
        "auto-recovery-succeeded",
        "success",
        "Automatic recovery succeeded",
        failureReason,
        { attempt: server.recoveryAttempts },
      );

      this.recordServerLog(
        server,
        "AutoRecovery",
        "success",
        "MCP Router Health Monitor",
        { failureReason, attempt: server.recoveryAttempts },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown recovery error";
      server.status = "error";
      server.healthStatus = "unhealthy";
      server.errorMessage = message;
      server.healthCheckError = message;

      this.addHealthEvent(
        server,
        "auto-recovery-failed",
        "error",
        "Automatic recovery failed",
        message,
        { attempt: server.recoveryAttempts },
      );

      this.recordServerLog(
        server,
        "AutoRecovery",
        "error",
        "MCP Router Health Monitor",
        { failureReason, attempt: server.recoveryAttempts },
        message,
      );

      this.scheduleAutoRecovery(serverId, message);
    }
  }

  private disconnectClient(serverId: string): void {
    const server = this.servers.get(serverId);
    const client = this.clients.get(serverId);

    if (server) {
      this.serverStatusMap.set(server.name, false);
    }

    if (!client) {
      return;
    }

    try {
      client.close();
    } catch (error) {
      console.error(`Failed to close client for server ${serverId}:`, error);
    } finally {
      this.clients.delete(serverId);
    }
  }

  private recordServerLog(
    server: MCPServer,
    requestType: string,
    result: "success" | "error",
    clientId: string,
    params?: Record<string, unknown>,
    errorMessage?: string,
  ): void {
    getLogService().recordMcpRequestLog(
      {
        timestamp: new Date().toISOString(),
        requestType,
        params: {
          serverName: server.name,
          ...params,
        },
        result,
        errorMessage,
        duration: 0,
        clientId,
      },
      server.name,
    );
  }

  /**
   * Get server ID by name
   */
  public getServerIdByName(name: string): string | undefined {
    return this.serverNameToIdMap.get(name);
  }

  public on(
    event:
      | "server-added"
      | "server-updated"
      | "server-removed"
      | "server-started"
      | "server-stopped",
    handler: (serverId: string) => void,
  ): void {
    this.eventEmitter.on(event, handler);
  }

  public off(
    event:
      | "server-added"
      | "server-updated"
      | "server-removed"
      | "server-started"
      | "server-stopped",
    handler: (serverId: string) => void,
  ): void {
    this.eventEmitter.off(event, handler);
  }

  /**
   * Clear all servers from memory (used when switching workspaces)
   */
  public clearAllServers(): void {
    this.stopHealthMonitor();

    // Stop all running servers
    for (const [id] of this.clients) {
      try {
        this.stopServer(id);
      } catch (error) {
        console.error(`Failed to stop server ${id}:`, error);
      }
    }

    // Clear all maps
    this.servers.clear();
    this.clients.clear();
    this.serverNameToIdMap.clear();
    this.serverStatusMap.clear();
  }

  /**
   * Get a list of all MCP servers
   */
  public getServers(): MCPServer[] {
    // Get latest server info from database
    const dbServers = this.serverService.getAllServers();

    // Add servers from database that aren't in memory
    dbServers.forEach((server) => {
      if (!this.servers.has(server.id)) {
        this.servers.set(server.id, {
          ...server,
          status: "stopped",
          logs: [],
        });
        this.initializeRuntimeState(this.servers.get(server.id)!);
        this.updateServerNameMapping(server);
      }
    });

    // Return servers with their current runtime status preserved
    return Array.from(this.servers.values()).map((server) => {
      const currentServer = this.servers.get(server.id);
      return currentServer || server;
    });
  }

  /**
   * Add a new MCP server
   */
  public addServer(config: MCPServerConfig): MCPServer {
    const newServer = this.serverService.addServer(config);
    this.initializeRuntimeState(newServer);
    this.servers.set(newServer.id, newServer);
    this.updateServerNameMapping(newServer);
    this.eventEmitter.emit("server-added", newServer.id);
    return newServer;
  }

  /**
   * Remove an MCP server
   */
  public removeServer(id: string): boolean {
    const server = this.servers.get(id);
    this.clearRecoveryTimer(id);
    this.recoveryAttemptHistory.delete(id);

    // Stop the server if it's running
    if (this.clients.has(id)) {
      this.stopServer(id);
    }

    // Remove server from all tokens
    this.removeServerFromTokens(id);

    // Remove from database
    const removed = this.serverService.deleteServer(id);

    // Remove from memory if successful
    if (removed && server) {
      this.serverNameToIdMap.delete(server.name);
      this.servers.delete(id);
      this.eventEmitter.emit("server-removed", id);
    }

    return removed;
  }

  /**
   * Remove server ID from all tokens
   */
  private removeServerFromTokens(serverId: string): void {
    try {
      const {
        TokenManager,
      } = require("@/main/modules/mcp-apps-manager/token-manager");
      const tokenManager = new TokenManager();
      const allTokens = tokenManager.listTokens();

      for (const token of allTokens) {
        if (serverId in (token.serverAccess || {})) {
          const updatedServerAccess = { ...(token.serverAccess || {}) };
          delete updatedServerAccess[serverId];
          tokenManager.updateTokenServerAccess(token.id, updatedServerAccess);
        }
      }
    } catch (error) {
      console.error(
        `Failed to update tokens for server removal ${serverId}:`,
        error,
      );
    }
  }

  /**
   * Start an MCP server
   */
  public async startServer(
    id: string,
    clientId?: string,
    persist: boolean = true,
    startReason:
      | "manual"
      | "auto-start"
      | "auto-recovery"
      | "manual-reconnect" = "manual",
  ): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server || server.disabled) {
      throw new Error(server ? "Server is disabled" : "Server not found");
    }

    const healthCheckConfig = this.getHealthCheckConfig(server);

    // If already running, do nothing
    if (this.clients.has(id)) {
      return true;
    }

    this.clearRecoveryTimer(id);

    if (startReason === "manual" || startReason === "auto-start") {
      this.resetRecoveryState(id, server);
    } else if (startReason === "manual-reconnect") {
      this.resetRecoveryState(id, server, { preserveRecoveryStats: true });
    }

    server.status = "starting";
    const result = await this.connectToServerWithResult(id);

    if (result.status === "error") {
      server.status = "error";
      server.errorMessage = result.error;
      if (
        startReason === "auto-recovery" ||
        startReason === "manual-reconnect"
      ) {
        server.healthStatus = "unhealthy";
        server.healthCheckError = result.error;
      }
      throw new Error(result.error);
    }

    this.clients.set(id, result.client);
    server.status = "running";
    server.errorMessage = undefined;
    server.healthCheckFailures = 0;
    server.healthCheckError = undefined;
    if (healthCheckConfig.enabled) {
      server.healthStatus = "healthy";
      server.lastHealthCheckAt = new Date().toISOString();
      server.lastHealthyAt = server.lastHealthCheckAt;
    } else {
      server.healthStatus = "unknown";
      server.lastHealthCheckAt = undefined;
    }
    if (startReason === "manual" || startReason === "auto-start") {
      server.autoRecoveryCount = 0;
      server.lastRecoveryAt = undefined;
    }

    // Register the client
    this.serverStatusMap.set(server.name, true);

    // Update autoStart if persist is true
    if (persist) {
      this.updateServer(id, { autoStart: true });
    }

    // Record log
    getLogService().recordMcpRequestLog({
      timestamp: new Date().toISOString(),
      requestType: "StartServer",
      params: { serverName: server.name },
      result: "success",
      duration: 0,
      clientId: clientId || "unknownClient",
    });

    this.eventEmitter.emit("server-started", id);

    return true;
  }

  /**
   * Stop an MCP server
   */
  public stopServer(
    id: string,
    clientId?: string,
    persist: boolean = true,
  ): boolean {
    const server = this.servers.get(id);
    if (!server) {
      return false;
    }

    this.clearRecoveryTimer(id);
    this.recoveryAttemptHistory.delete(id);

    const client = this.clients.get(id);
    if (!client) {
      server.status = "stopped";
      server.healthStatus = "unknown";
      server.healthCheckFailures = 0;
      server.healthCheckError = undefined;
      return true;
    }

    try {
      server.status = "stopping";

      // Unregister the client
      this.serverStatusMap.set(server.name, false);

      // Update autoStart if persist is true
      if (persist) {
        this.updateServer(id, { autoStart: false });
      }

      // Record log
      getLogService().recordMcpRequestLog({
        timestamp: new Date().toISOString(),
        requestType: "StopServer",
        params: { serverName: server.name },
        result: "success",
        duration: 0,
        clientId: clientId || "unknownClient",
      });

      // Disconnect the client
      this.disconnectClient(id);
      server.status = "stopped";
      server.healthStatus = "unknown";
      server.healthCheckFailures = 0;
      server.healthCheckError = undefined;
      this.eventEmitter.emit("server-stopped", id);
      return true;
    } catch {
      server.status = "error";
      return false;
    }
  }

  public async reconnectServer(
    id: string,
    clientId: string = "MCP Router UI",
  ): Promise<boolean> {
    const server = this.servers.get(id);
    if (!server || server.disabled) {
      throw new Error(server ? "Server is disabled" : "Server not found");
    }

    if (server.status === "starting" || server.status === "stopping") {
      throw new Error("Server is busy");
    }

    this.clearRecoveryTimer(id);
    this.recoveryAttemptHistory.delete(id);
    server.recoveryAttempts = 0;
    server.healthStatus = "recovering";
    server.lastRecoveryAt = new Date().toISOString();

    this.addHealthEvent(
      server,
      "manual-reconnect-requested",
      "info",
      "Manual reconnect requested",
      "Retrying server connection immediately.",
    );

    this.disconnectClient(id);

    try {
      await this.startServer(id, clientId, false, "manual-reconnect");

      server.lastRecoveryAt = new Date().toISOString();
      this.addHealthEvent(
        server,
        "manual-reconnect-succeeded",
        "success",
        "Manual reconnect succeeded",
      );

      this.recordServerLog(server, "ManualReconnect", "success", clientId);

      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown reconnect error";
      server.status = "error";
      server.healthStatus = "unhealthy";
      server.errorMessage = message;
      server.healthCheckError = message;

      this.addHealthEvent(
        server,
        "manual-reconnect-failed",
        "error",
        "Manual reconnect failed",
        message,
      );

      this.recordServerLog(
        server,
        "ManualReconnect",
        "error",
        clientId,
        undefined,
        message,
      );

      throw new Error(message);
    }
  }

  /**
   * Update an MCP server's configuration
   */
  public updateServer(
    id: string,
    config: Partial<MCPServerConfig>,
  ): MCPServer | undefined {
    const oldServer = this.servers.get(id);
    if (oldServer && config.name && oldServer.name !== config.name) {
      this.serverNameToIdMap.delete(oldServer.name);
    }

    const updatedServer = this.serverService.updateServer(id, config);
    if (!updatedServer) {
      return undefined;
    }

    const server = this.servers.get(id);
    if (server) {
      const runtimeState = this.createRuntimeSnapshot(server);
      Object.assign(server, updatedServer, runtimeState);
      server.toolPermissions = server.toolPermissions || {};
      this.applyHealthMonitoringConfig(id, server);
      this.updateServerNameMapping(server);
    }

    this.eventEmitter.emit("server-updated", id);

    return updatedServer;
  }

  /**
   * Update tool permissions for a server
   */
  public updateServerToolPermissions(
    id: string,
    toolPermissions: Record<string, boolean>,
  ): MCPServer {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error(`Server not found: ${id}`);
    }

    const updatedConfig: Partial<MCPServerConfig> = { toolPermissions };
    const updatedServer = this.serverService.updateServer(id, updatedConfig);

    if (!updatedServer) {
      throw new Error(
        `Failed to update tool permissions for server: ${server.name}`,
      );
    }

    server.toolPermissions = { ...toolPermissions };

    if (Array.isArray(server.tools)) {
      server.tools = server.tools.map((tool) => ({
        ...tool,
        enabled: toolPermissions[tool.name] !== false,
      }));
    }

    this.eventEmitter.emit("server-updated", id);

    return server;
  }

  /**
   * List tools for a specific server
   */
  public async listServerTools(id: string): Promise<MCPTool[]> {
    const server = this.servers.get(id);
    if (!server) {
      throw new Error("Server not found");
    }

    const client = this.clients.get(id);
    const isRunning =
      !!client &&
      (server.status === "running" || this.serverStatusMap.get(server.name));

    if (!isRunning || !client) {
      throw new Error("Server must be running to list tools");
    }

    const response = await client.listTools();
    const tools = response?.tools ?? [];
    const permissions = server.toolPermissions || {};
    const toolsWithStatus = tools.map((tool) => ({
      ...tool,
      enabled: permissions[tool.name] !== false,
    }));

    server.tools = toolsWithStatus;
    return toolsWithStatus;
  }

  /**
   * Get the status of a specific MCP server
   */
  public getServerStatus(
    id: string,
  ): "running" | "starting" | "stopping" | "stopped" | "error" {
    const server = this.servers.get(id);
    return server?.status || "error";
  }

  /**
   * Connect to an MCP server
   */
  private async connectToServerWithResult(
    id: string,
  ): Promise<
    { status: "success"; client: Client } | { status: "error"; error: string }
  > {
    const server = this.servers.get(id);
    if (!server) {
      return { status: "error", error: "Server not found" };
    }

    try {
      const result = await connectToMCPServer(
        {
          id: server.id,
          name: server.name,
          serverType: server.serverType,
          command: server.command,
          args: server.args
            ? substituteArgsParameters(
                server.args,
                server.env || {},
                server.inputParams || {},
              )
            : undefined,
          remoteUrl: server.remoteUrl,
          bearerToken: server.bearerToken,
          env: server.env,
          inputParams: server.inputParams,
        },
        "mcp-router",
      );

      return result;
    } catch (error) {
      return {
        status: "error",
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /**
   * Get all maps for sharing with other components
   */
  public getMaps() {
    return {
      servers: this.servers,
      clients: this.clients,
      serverNameToIdMap: this.serverNameToIdMap,
      serverStatusMap: this.serverStatusMap,
    };
  }

  /**
   * Shutdown all servers
   */
  public async shutdown(): Promise<void> {
    this.stopHealthMonitor();

    for (const [id] of this.clients) {
      // Don't persist state changes when shutting down - this is just cleanup
      this.stopServer(id, undefined, false);
    }
  }
}
