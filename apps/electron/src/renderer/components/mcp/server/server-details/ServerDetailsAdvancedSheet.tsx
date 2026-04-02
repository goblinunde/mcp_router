import React, { useState, useEffect, useCallback } from "react";
import type {
  MCPInputParam,
  MCPServer,
  MCPServerHealthCheckConfig,
  MCPTool,
  Project,
} from "@mcp_router/shared";
import { useTranslation } from "react-i18next";
import { Settings2, Check, RefreshCw, Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@mcp_router/ui";
import { Button } from "@mcp_router/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@mcp_router/ui";
import { Switch } from "@mcp_router/ui";
import { toast } from "sonner";
import ServerDetailsInputParams from "./ServerDetailsInputParams";
import ServerDetailsGeneralSettings from "./ServerDetailsGeneralSettings";
import ServerDetailsHealthPanel from "./ServerDetailsHealthPanel";
import { useServerEditingStore } from "@/renderer/stores";
import { usePlatformAPI } from "@/renderer/platform-api";

const DEFAULT_HEALTH_CHECK_CONFIG: Required<MCPServerHealthCheckConfig> = {
  enabled: true,
  intervalMs: 30_000,
  timeoutMs: 10_000,
  failureThreshold: 2,
  autoRecoveryEnabled: true,
  recoveryBackoffMs: 5_000,
  maxRecoveryAttempts: 3,
  recoveryWindowMs: 5 * 60_000,
};

const createHealthCheckConfig = (
  config?: MCPServerHealthCheckConfig,
): Required<MCPServerHealthCheckConfig> => ({
  enabled: config?.enabled !== false,
  intervalMs: Number.isFinite(config?.intervalMs)
    ? Math.floor(config?.intervalMs as number)
    : DEFAULT_HEALTH_CHECK_CONFIG.intervalMs,
  timeoutMs: Number.isFinite(config?.timeoutMs)
    ? Math.floor(config?.timeoutMs as number)
    : DEFAULT_HEALTH_CHECK_CONFIG.timeoutMs,
  failureThreshold: Number.isFinite(config?.failureThreshold)
    ? Math.floor(config?.failureThreshold as number)
    : DEFAULT_HEALTH_CHECK_CONFIG.failureThreshold,
  autoRecoveryEnabled: config?.autoRecoveryEnabled !== false,
  recoveryBackoffMs: Number.isFinite(config?.recoveryBackoffMs)
    ? Math.floor(config?.recoveryBackoffMs as number)
    : DEFAULT_HEALTH_CHECK_CONFIG.recoveryBackoffMs,
  maxRecoveryAttempts: Number.isFinite(config?.maxRecoveryAttempts)
    ? Math.floor(config?.maxRecoveryAttempts as number)
    : DEFAULT_HEALTH_CHECK_CONFIG.maxRecoveryAttempts,
  recoveryWindowMs: Number.isFinite(config?.recoveryWindowMs)
    ? Math.floor(config?.recoveryWindowMs as number)
    : DEFAULT_HEALTH_CHECK_CONFIG.recoveryWindowMs,
});

interface ServerDetailsAdvancedSheetProps {
  server: MCPServer;
  handleSave: (
    updatedInputParams?: Record<string, MCPInputParam>,
    editedName?: string,
    updatedToolPermissions?: Record<string, boolean>,
    updatedHealthCheckConfig?: MCPServerHealthCheckConfig,
  ) => Promise<void>;
  projects?: Project[];
  onAssignProject?: (projectId: string | null) => Promise<void> | void;
  onOpenManageProjects?: () => void;
  onReconnect?: () => Promise<void>;
}

const ServerDetailsAdvancedSheet: React.FC<ServerDetailsAdvancedSheetProps> = ({
  server,
  handleSave,
  projects = [],
  onAssignProject,
  onOpenManageProjects,
  onReconnect,
}) => {
  const { t } = useTranslation();
  const platformAPI = usePlatformAPI();
  const {
    isAdvancedEditing: isOpen,
    isLoading,
    editedName,
    editedCommand,
    editedArgs,
    editedBearerToken,
    editedAutoStart,
    envPairs,
    editedToolPermissions,
    setIsAdvancedEditing: setIsOpen,
    setEditedName,
    setEditedCommand,
    setEditedBearerToken,
    setEditedAutoStart,
    setIsLoading,
    setEditedToolPermissions,
    updateArg,
    removeArg,
    addArg,
    updateEnvPair,
    removeEnvPair,
    addEnvPair,
  } = useServerEditingStore();

  const deriveInitialToolPermissions = useCallback(
    (toolList?: MCPTool[] | null): Record<string, boolean> => {
      const serverPermissions = server.toolPermissions || {};
      if (!toolList || toolList.length === 0) {
        return { ...serverPermissions };
      }

      const permissions: Record<string, boolean> = {};
      for (const tool of toolList) {
        if (serverPermissions[tool.name] !== undefined) {
          permissions[tool.name] = serverPermissions[tool.name] !== false;
        } else if (tool.enabled !== undefined) {
          permissions[tool.name] = !!tool.enabled;
        } else {
          permissions[tool.name] = true;
        }
      }

      return permissions;
    },
    [server.toolPermissions],
  );

  // State for project assignment
  const [assigning, setAssigning] = useState(false);
  const currentProjectId = server.projectId ?? null;

  const handleAssignProject = async (value: string) => {
    if (!onAssignProject) return;
    setAssigning(true);
    try {
      await onAssignProject(value === "__none__" ? null : value);
    } finally {
      setAssigning(false);
    }
  };

  // State for input parameters
  const [inputParamValues, setInputParamValues] = useState<
    Record<string, string>
  >({});
  const [initialInputParamValues, setInitialInputParamValues] = useState<
    Record<string, string>
  >({});
  const [isParamsDirty, setIsParamsDirty] = useState(false);
  const [tools, setTools] = useState<MCPTool[]>(server.tools ?? []);
  const [isToolsLoading, setIsToolsLoading] = useState(false);
  const [needsServerRunning, setNeedsServerRunning] = useState(false);
  const [initialToolPermissions, setInitialToolPermissions] = useState<
    Record<string, boolean>
  >(() => deriveInitialToolPermissions(server.tools));
  const [isToolPermissionsDirty, setIsToolPermissionsDirty] = useState(false);
  const [hasAttemptedToolFetch, setHasAttemptedToolFetch] = useState(false);
  const [healthCheckConfig, setHealthCheckConfig] = useState<
    Required<MCPServerHealthCheckConfig>
  >(() => createHealthCheckConfig(server.healthCheckConfig));
  const [initialHealthCheckConfig, setInitialHealthCheckConfig] = useState<
    Required<MCPServerHealthCheckConfig>
  >(() => createHealthCheckConfig(server.healthCheckConfig));
  const [isHealthConfigDirty, setIsHealthConfigDirty] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Initialize inputParamValues from server inputParams defaults
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const initialValues: Record<string, string> = {};
    Object.entries(server.inputParams || {}).forEach(([key, param]) => {
      initialValues[key] =
        param.default !== undefined ? String(param.default) : "";
    });
    setInputParamValues(initialValues);
    setInitialInputParamValues(initialValues);
    setIsParamsDirty(false);
  }, [isOpen, server.id]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextHealthCheckConfig = createHealthCheckConfig(
      server.healthCheckConfig,
    );
    setHealthCheckConfig(nextHealthCheckConfig);
    setInitialHealthCheckConfig(nextHealthCheckConfig);
    setIsHealthConfigDirty(false);
  }, [isOpen, server.id]);

  // Initialize tool permissions when sheet opens or server changes
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const basePermissions = deriveInitialToolPermissions(server.tools);
    setTools(server.tools ?? []);
    setInitialToolPermissions(basePermissions);
    setEditedToolPermissions(basePermissions);
    setIsToolPermissionsDirty(false);
    setNeedsServerRunning(false);
    setHasAttemptedToolFetch(false);
  }, [
    deriveInitialToolPermissions,
    isOpen,
    server.id,
    setEditedToolPermissions,
  ]);

  // Fetch tools from platform API
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const fetchTools = async () => {
      setIsToolsLoading(true);
      setNeedsServerRunning(false);

      try {
        const toolList = await platformAPI.servers.listTools(server.id);
        if (cancelled) {
          return;
        }
        setTools(toolList);
        const permissions = deriveInitialToolPermissions(toolList);
        setInitialToolPermissions(permissions);
        setEditedToolPermissions(permissions);
        setIsToolPermissionsDirty(false);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const rawMessage =
          error instanceof Error ? error.message : String(error);
        if (/must be running/i.test(rawMessage)) {
          setNeedsServerRunning(true);
        } else {
          console.error("Failed to load tools", error);
        }
      } finally {
        if (!cancelled) {
          setIsToolsLoading(false);
          setHasAttemptedToolFetch(true);
        }
      }
    };

    fetchTools();

    return () => {
      cancelled = true;
    };
  }, [
    deriveInitialToolPermissions,
    isOpen,
    platformAPI,
    server.id,
    setEditedToolPermissions,
  ]);

  const updateInputParam = (key: string, value: string) => {
    setInputParamValues((prev) => {
      const updated = { ...prev, [key]: value };
      const dirty = Object.keys(updated).some(
        (k) => updated[k] !== initialInputParamValues[k],
      );
      setIsParamsDirty(dirty);
      return updated;
    });
  };

  const updateHealthCheckConfig = useCallback(
    (updates: Partial<Required<MCPServerHealthCheckConfig>>) => {
      setHealthCheckConfig((previous) => {
        const updated = { ...previous, ...updates };
        setIsHealthConfigDirty(
          JSON.stringify(updated) !== JSON.stringify(initialHealthCheckConfig),
        );
        return updated;
      });
    },
    [initialHealthCheckConfig],
  );

  const handleReconnectClick = useCallback(async () => {
    if (!onReconnect) {
      return;
    }

    setIsReconnecting(true);
    try {
      await onReconnect();
      toast.success(t("serverDetails.reconnectSuccess"));
    } catch (error) {
      console.error("Failed to reconnect server", error);
      toast.error(
        error instanceof Error
          ? error.message
          : t("serverDetails.reconnectFailed"),
      );
    } finally {
      setIsReconnecting(false);
    }
  }, [onReconnect, t]);

  const handleToolToggle = (toolName: string, enabled: boolean) => {
    setEditedToolPermissions((prev) => {
      const updated = { ...prev, [toolName]: enabled };
      const initial = initialToolPermissions;
      const initialKeys = Object.keys(initial);
      const updatedKeys = Object.keys(updated);
      const keysMatch =
        initialKeys.length === updatedKeys.length &&
        updatedKeys.every((key) => initialKeys.includes(key));
      const dirty =
        !keysMatch || updatedKeys.some((key) => updated[key] !== initial[key]);
      setIsToolPermissionsDirty(dirty);
      return updated;
    });
  };

  // This function is now only used internally to update inputParams in handleSave
  const prepareInputParamsForSave = () => {
    const updatedInputParams = { ...(server.inputParams || {}) };

    if (server.inputParams) {
      Object.entries(inputParamValues).forEach(([key, value]) => {
        if (updatedInputParams[key]) {
          updatedInputParams[key] = {
            ...updatedInputParams[key],
            default: value,
          };
        }
      });
    }

    return updatedInputParams;
  };

  const renderToolsContent = () => {
    if (isToolsLoading) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {t("serverDetails.toolsLoading")}
        </div>
      );
    }

    if (needsServerRunning) {
      return (
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          <span>{t("serverDetails.toolsRequireRunning")}</span>
        </div>
      );
    }

    if (tools.length === 0) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4" />
          {t("serverDetails.toolsEmpty")}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {tools.map((tool) => {
            const isEnabled = editedToolPermissions[tool.name] ?? true;
            const toggleCard = () => handleToolToggle(tool.name, !isEnabled);
            return (
              <div
                key={tool.name}
                className="flex items-start justify-between gap-4 rounded-md border border-border p-3 cursor-pointer transition-colors hover:border-primary/50"
                role="switch"
                aria-checked={isEnabled}
                tabIndex={0}
                onClick={toggleCard}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleCard();
                  }
                }}
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">{tool.name}</p>
                  {tool.description && (
                    <p className="text-xs text-muted-foreground">
                      {tool.description}
                    </p>
                  )}
                </div>
                <Switch
                  onClick={(event) => event.stopPropagation()}
                  checked={isEnabled}
                  onCheckedChange={(checked) =>
                    handleToolToggle(tool.name, checked)
                  }
                  aria-label={
                    isEnabled
                      ? t("serverDetails.toolEnabled")
                      : t("serverDetails.toolDisabled")
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const hasInputParams =
    !!server.inputParams && Object.keys(server.inputParams).length > 0;
  const showToolsTab =
    isToolsLoading ||
    tools.length > 0 ||
    needsServerRunning ||
    Object.keys(initialToolPermissions).length > 0 ||
    hasAttemptedToolFetch;

  const getTabsListClass = () => {
    if (hasInputParams && showToolsTab) {
      return "grid-cols-4";
    }
    if (hasInputParams || showToolsTab) {
      return "grid-cols-3";
    }
    return "grid-cols-2";
  };

  const renderGeneralSettingsContent = () => (
    <ServerDetailsGeneralSettings
      server={server}
      editedName={editedName}
      setEditedName={setEditedName}
      editedCommand={editedCommand}
      setEditedCommand={setEditedCommand}
      editedArgs={editedArgs}
      updateArg={updateArg}
      removeArg={removeArg}
      addArg={addArg}
      editedBearerToken={editedBearerToken}
      setEditedBearerToken={setEditedBearerToken}
      editedAutoStart={editedAutoStart}
      setEditedAutoStart={setEditedAutoStart}
      envPairs={envPairs}
      updateEnvPair={updateEnvPair}
      removeEnvPair={removeEnvPair}
      addEnvPair={addEnvPair}
      inputParamValues={inputParamValues}
      projects={projects}
      currentProjectId={currentProjectId}
      assigning={assigning}
      onAssignProject={onAssignProject ? handleAssignProject : undefined}
      onOpenManageProjects={onOpenManageProjects}
    />
  );

  const renderHealthSettingsContent = () => (
    <ServerDetailsHealthPanel
      server={server}
      healthCheckConfig={healthCheckConfig}
      updateHealthCheckConfig={updateHealthCheckConfig}
      onReconnect={handleReconnectClick}
      reconnecting={isReconnecting}
    />
  );

  const renderTabsContent = () => {
    return (
      <Tabs defaultValue="general" className="mt-4">
        <TabsList className={`grid w-full ${getTabsListClass()}`}>
          {hasInputParams && (
            <TabsTrigger value="params">
              {t("serverDetails.inputParameters")}
            </TabsTrigger>
          )}
          <TabsTrigger value="general">
            {t("serverDetails.generalSettings")}
          </TabsTrigger>
          <TabsTrigger value="health">
            {t("serverDetails.healthMonitoring")}
          </TabsTrigger>
          {showToolsTab && (
            <TabsTrigger value="tools">{t("serverDetails.tools")}</TabsTrigger>
          )}
        </TabsList>

        {hasInputParams && (
          <TabsContent value="params" className="space-y-6 mt-4">
            <ServerDetailsInputParams
              server={server}
              inputParamValues={inputParamValues}
              updateInputParam={updateInputParam}
            />
          </TabsContent>
        )}

        <TabsContent value="general" className="space-y-6 mt-4">
          {renderGeneralSettingsContent()}
        </TabsContent>

        <TabsContent value="health" className="space-y-6 mt-4">
          {renderHealthSettingsContent()}
        </TabsContent>

        {showToolsTab && (
          <TabsContent value="tools" className="space-y-6 mt-4">
            {renderToolsContent()}
          </TabsContent>
        )}
      </Tabs>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            {t("serverDetails.advancedConfiguration")}
          </SheetTitle>
          <SheetDescription>
            {t("serverDetails.advancedConfigurationDescription")}
          </SheetDescription>
        </SheetHeader>

        {renderTabsContent()}

        <SheetFooter className="flex justify-between sm:justify-between border-t pt-4">
          <Button
            variant="ghost"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
            className="gap-2"
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={async () => {
              setIsLoading(true);
              try {
                // Prepare input params if they were modified
                const updatedInputParams = isParamsDirty
                  ? prepareInputParamsForSave()
                  : server.inputParams;
                const toolPermissionsToSave = isToolPermissionsDirty
                  ? { ...editedToolPermissions }
                  : undefined;
                const healthCheckConfigToSave = isHealthConfigDirty
                  ? { ...healthCheckConfig }
                  : server.healthCheckConfig;

                // Call the parent's handleSave with inputParams and editedName
                await handleSave(
                  updatedInputParams,
                  editedName,
                  toolPermissionsToSave,
                  healthCheckConfigToSave,
                );

                // Reset dirty state after successful save
                if (isParamsDirty) {
                  setInitialInputParamValues(inputParamValues);
                  setIsParamsDirty(false);
                }
                if (isToolPermissionsDirty) {
                  setInitialToolPermissions(editedToolPermissions);
                  setIsToolPermissionsDirty(false);
                }
                if (isHealthConfigDirty) {
                  setInitialHealthCheckConfig(healthCheckConfig);
                  setIsHealthConfigDirty(false);
                }
              } catch (error) {
                console.error("Failed to save:", error);
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {t("common.save")}
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default ServerDetailsAdvancedSheet;
