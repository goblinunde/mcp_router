import type {
  GatewayDiscoverySyncResult,
  GatewayRegistrySource,
} from "@mcp_router/shared";
import { GatewayPluginRegistry } from "./gateway-plugin-registry";

export class GatewayDiscoveryService {
  private registry = new GatewayPluginRegistry();

  public sync(
    source: GatewayRegistrySource,
    installedVersions: Map<string, string> = new Map(),
  ): GatewayDiscoverySyncResult {
    const discoveredAt = Date.now();
    let updatedCount = 0;

    const packages = this.registry.loadRegistry(source).map((manifest) => {
      const installedVersion = installedVersions.get(manifest.id);
      const updateAvailable =
        installedVersion !== undefined && installedVersion !== manifest.version;

      if (updateAvailable) {
        updatedCount += 1;
      }

      return {
        manifest,
        discoveredAt,
        installedVersion,
        updateAvailable,
      };
    });

    return {
      source,
      packages,
      discoveredCount: packages.length,
      updatedCount,
      skippedCount: 0,
    };
  }
}
