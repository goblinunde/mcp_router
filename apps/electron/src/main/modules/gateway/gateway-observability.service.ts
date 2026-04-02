import crypto from "node:crypto";
import type { GatewayStructuredEvent } from "@mcp_router/shared";
import { getLogService } from "@/main/modules/mcp-logger/mcp-logger.service";
import { GatewayAuditRepository } from "./gateway-audit.repository";

export class GatewayObservabilityService {
  private static instance: GatewayObservabilityService | null = null;
  private auditRepository = GatewayAuditRepository.getInstance();

  public static getInstance(): GatewayObservabilityService {
    if (!GatewayObservabilityService.instance) {
      GatewayObservabilityService.instance = new GatewayObservabilityService();
    }

    return GatewayObservabilityService.instance;
  }

  public static resetInstance(): void {
    GatewayObservabilityService.instance = null;
  }

  public emit(
    event: Omit<GatewayStructuredEvent, "id" | "timestamp"> &
      Partial<Pick<GatewayStructuredEvent, "id" | "timestamp">>,
  ): GatewayStructuredEvent {
    const normalized: GatewayStructuredEvent = {
      id: event.id || crypto.randomUUID(),
      timestamp: event.timestamp || Date.now(),
      ...event,
    };

    console.info("[gateway-event]", JSON.stringify(normalized));
    this.recordAuditEvent(normalized);
    this.recordRequestLog(normalized);

    return normalized;
  }

  private recordAuditEvent(event: GatewayStructuredEvent): void {
    this.auditRepository.add({
      workspaceId: event.workspaceId ?? null,
      actorType: event.tokenId ? "token" : event.userId ? "user" : "system",
      actorId: event.tokenId || event.userId || "gateway",
      action: `${event.category}.${event.action}`,
      targetType: event.serverId ? "server" : event.category,
      targetId: event.serverId || event.action,
      status: event.status,
      metadata: event.metadata,
      createdAt: event.timestamp,
    });
  }

  private recordRequestLog(event: GatewayStructuredEvent): void {
    getLogService().recordMcpRequestLog(
      {
        timestamp: new Date(event.timestamp).toISOString(),
        requestType: `gateway.${event.category}.${event.action}`,
        params: event.metadata || {},
        result: event.status,
        response: event.metadata,
        duration: 0,
        clientId: event.tokenId || event.userId || "gateway",
      },
      event.serverId,
    );
  }
}

export function getGatewayObservabilityService(): GatewayObservabilityService {
  return GatewayObservabilityService.getInstance();
}
