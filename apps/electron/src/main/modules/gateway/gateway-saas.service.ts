import type {
  GatewaySyncHooks,
  GatewayWorkspaceSyncProvider,
} from "@mcp_router/shared";

export class GatewaySyncCoordinator {
  private provider: GatewayWorkspaceSyncProvider | null = null;
  private hooks: GatewaySyncHooks[] = [];

  public registerProvider(provider: GatewayWorkspaceSyncProvider): void {
    this.provider = provider;
  }

  public registerHooks(hooks: GatewaySyncHooks): void {
    this.hooks.push(hooks);
  }

  public async pushWorkspace(workspaceId: string): Promise<boolean> {
    if (!this.provider) {
      return false;
    }

    for (const hook of this.hooks) {
      await hook.beforePush?.(workspaceId);
    }

    await this.provider.pushWorkspace(workspaceId);

    for (const hook of this.hooks) {
      await hook.afterPush?.(workspaceId);
    }

    return true;
  }

  public async pullWorkspace(workspaceId: string): Promise<boolean> {
    if (!this.provider) {
      return false;
    }

    for (const hook of this.hooks) {
      await hook.beforePull?.(workspaceId);
    }

    await this.provider.pullWorkspace(workspaceId);

    for (const hook of this.hooks) {
      await hook.afterPull?.(workspaceId);
    }

    return true;
  }
}
