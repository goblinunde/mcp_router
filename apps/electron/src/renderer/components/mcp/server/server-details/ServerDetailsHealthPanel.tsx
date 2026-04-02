import React from "react";
import type {
  MCPServer,
  MCPServerHealthCheckConfig,
  MCPServerHealthEvent,
} from "@mcp_router/shared";
import { useTranslation } from "react-i18next";
import {
  Activity,
  AlertTriangle,
  Clock3,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Input,
  Label,
  ScrollArea,
  Switch,
} from "@mcp_router/ui";

interface ServerDetailsHealthPanelProps {
  server: MCPServer;
  healthCheckConfig: Required<MCPServerHealthCheckConfig>;
  updateHealthCheckConfig: (
    updates: Partial<Required<MCPServerHealthCheckConfig>>,
  ) => void;
  onReconnect: () => Promise<void>;
  reconnecting: boolean;
}

const formatTimestamp = (value?: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const getEventAccentClass = (event: MCPServerHealthEvent): string => {
  switch (event.level) {
    case "success":
      return "border-emerald-500/40 bg-emerald-500/5";
    case "warning":
      return "border-amber-500/40 bg-amber-500/5";
    case "error":
      return "border-red-500/40 bg-red-500/5";
    default:
      return "border-border bg-muted/30";
  }
};

const ServerDetailsHealthPanel: React.FC<ServerDetailsHealthPanelProps> = ({
  server,
  healthCheckConfig,
  updateHealthCheckConfig,
  onReconnect,
  reconnecting,
}) => {
  const { t } = useTranslation();
  const healthStatus =
    server.healthStatus ||
    (server.status === "running" ? "healthy" : "unknown");
  const healthEvents = server.healthEvents || [];
  const numericFields: Array<{
    key:
      | "intervalMs"
      | "timeoutMs"
      | "failureThreshold"
      | "recoveryBackoffMs"
      | "maxRecoveryAttempts"
      | "recoveryWindowMs";
    label: string;
    min: number;
    step?: number;
  }> = [
    {
      key: "intervalMs",
      label: t("serverDetails.healthCheckInterval"),
      min: 5000,
      step: 1000,
    },
    {
      key: "timeoutMs",
      label: t("serverDetails.healthCheckTimeout"),
      min: 1000,
      step: 1000,
    },
    {
      key: "failureThreshold",
      label: t("serverDetails.failureThreshold"),
      min: 1,
    },
    {
      key: "recoveryBackoffMs",
      label: t("serverDetails.recoveryBackoff"),
      min: 0,
      step: 1000,
    },
    {
      key: "maxRecoveryAttempts",
      label: t("serverDetails.maxRecoveryAttempts"),
      min: 1,
    },
    {
      key: "recoveryWindowMs",
      label: t("serverDetails.recoveryWindow"),
      min: 60000,
      step: 1000,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base font-medium">
                {t("serverDetails.healthCheckEnabled")}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t("serverDetails.healthCheckEnabledHint")}
              </p>
            </div>
            <Switch
              checked={healthCheckConfig.enabled}
              onCheckedChange={(checked) =>
                updateHealthCheckConfig({ enabled: checked })
              }
            />
          </div>
        </div>

        <div className="rounded-md border p-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-base font-medium">
                {t("serverDetails.autoRecoveryEnabled")}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t("serverDetails.autoRecoveryEnabledHint")}
              </p>
            </div>
            <Switch
              checked={healthCheckConfig.autoRecoveryEnabled}
              onCheckedChange={(checked) =>
                updateHealthCheckConfig({ autoRecoveryEnabled: checked })
              }
              disabled={!healthCheckConfig.enabled}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {numericFields.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`health-config-${field.key}`}>{field.label}</Label>
            <Input
              id={`health-config-${field.key}`}
              type="number"
              min={field.min}
              step={field.step ?? 1}
              value={healthCheckConfig[field.key]}
              disabled={
                !healthCheckConfig.enabled ||
                (field.key !== "failureThreshold" &&
                  field.key !== "timeoutMs" &&
                  field.key !== "intervalMs" &&
                  !healthCheckConfig.autoRecoveryEnabled)
              }
              onChange={(event) =>
                updateHealthCheckConfig({
                  [field.key]: Number(event.target.value),
                } as Partial<Required<MCPServerHealthCheckConfig>>)
              }
            />
          </div>
        ))}
      </div>

      {!healthCheckConfig.enabled && (
        <Alert>
          <Activity className="h-4 w-4" />
          <AlertDescription>
            {t("serverDetails.healthCheckDisabledHint")}
          </AlertDescription>
        </Alert>
      )}

      {server.healthCheckError && (
        <Alert
          variant={healthStatus === "unhealthy" ? "destructive" : "default"}
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{server.healthCheckError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground mb-1">
            {t("serverDetails.healthStatusSummary")}
          </div>
          <Badge variant="outline">
            {t(`serverList.health.${healthStatus}`)}
          </Badge>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground mb-1">
            {t("serverDetails.consecutiveFailures")}
          </div>
          <div className="text-sm font-medium">
            {server.healthCheckFailures || 0}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground mb-1">
            {t("serverDetails.lastHealthCheck")}
          </div>
          <div className="text-sm font-medium break-words">
            {server.lastHealthCheckAt
              ? formatTimestamp(server.lastHealthCheckAt)
              : t("serverDetails.none")}
          </div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground mb-1">
            {t("serverDetails.lastHealthy")}
          </div>
          <div className="text-sm font-medium break-words">
            {server.lastHealthyAt
              ? formatTimestamp(server.lastHealthyAt)
              : t("serverDetails.none")}
          </div>
        </div>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-base font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              {t("serverDetails.healthActions")}
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t("serverDetails.healthActionsHint")}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => void onReconnect()}
            disabled={
              reconnecting ||
              server.status === "starting" ||
              server.status === "stopping"
            }
            className="gap-2"
          >
            {reconnecting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t("serverDetails.reconnecting")}
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                {t("serverDetails.reconnectNow")}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-medium">
            {t("serverDetails.healthEvents")}
          </Label>
        </div>

        {healthEvents.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
            {t("serverDetails.healthEventsEmpty")}
          </div>
        ) : (
          <ScrollArea className="max-h-[320px] rounded-md border p-3">
            <div className="space-y-3">
              {healthEvents.map((event) => (
                <div
                  key={event.id}
                  className={`rounded-md border p-3 ${getEventAccentClass(
                    event,
                  )}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium">{event.message}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimestamp(event.timestamp)}
                    </div>
                  </div>
                  {event.detail && (
                    <p className="mt-2 text-xs text-muted-foreground break-words">
                      {event.detail}
                    </p>
                  )}
                  {(event.attempt !== undefined ||
                    event.failureCount !== undefined) && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {event.attempt !== undefined && (
                        <Badge variant="secondary">
                          {t("serverDetails.healthEventAttempt", {
                            count: event.attempt,
                          })}
                        </Badge>
                      )}
                      {event.failureCount !== undefined && (
                        <Badge variant="secondary">
                          {t("serverDetails.healthEventFailureCount", {
                            count: event.failureCount,
                          })}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};

export default ServerDetailsHealthPanel;
