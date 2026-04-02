import fs from "node:fs";
import path from "node:path";
import type {
  GatewayRegistrySource,
  GatewayServerPackageManifest,
} from "@mcp_router/shared";

export class GatewayPluginRegistry {
  public loadRegistry(
    source: GatewayRegistrySource,
  ): GatewayServerPackageManifest[] {
    if (source.type === "file") {
      return this.loadFromFile(source.path);
    }

    return this.loadFromDirectory(source.path);
  }

  public buildInstallPlan(manifest: GatewayServerPackageManifest): string[] {
    if (manifest.installSteps && manifest.installSteps.length > 0) {
      return [...manifest.installSteps];
    }

    return [`prepare ${manifest.entry}`];
  }

  public buildUninstallPlan(manifest: GatewayServerPackageManifest): string[] {
    return [`remove ${manifest.id}@${manifest.version}`];
  }

  private loadFromFile(filePath: string): GatewayServerPackageManifest[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as
      | GatewayServerPackageManifest[]
      | { packages?: GatewayServerPackageManifest[] };
    const manifests = Array.isArray(parsed) ? parsed : parsed.packages || [];

    return manifests.map((manifest) =>
      this.validateManifest({
        ...manifest,
        registrySource: manifest.registrySource ?? filePath,
      }),
    );
  }

  private loadFromDirectory(
    directoryPath: string,
  ): GatewayServerPackageManifest[] {
    if (!fs.existsSync(directoryPath)) {
      return [];
    }

    return fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .flatMap((entry) => {
        const manifestPath = entry.isDirectory()
          ? path.join(directoryPath, entry.name, "manifest.json")
          : entry.name.endsWith(".json")
            ? path.join(directoryPath, entry.name)
            : null;

        if (!manifestPath || !fs.existsSync(manifestPath)) {
          return [];
        }

        return [this.loadManifestFile(manifestPath)];
      });
  }

  private loadManifestFile(manifestPath: string): GatewayServerPackageManifest {
    const manifest = JSON.parse(
      fs.readFileSync(manifestPath, "utf-8"),
    ) as GatewayServerPackageManifest;

    return this.validateManifest({
      ...manifest,
      registrySource: manifest.registrySource ?? manifestPath,
    });
  }

  private validateManifest(
    manifest: GatewayServerPackageManifest,
  ): GatewayServerPackageManifest {
    if (
      !manifest.id ||
      !manifest.name ||
      !manifest.version ||
      !manifest.entry
    ) {
      throw new Error(
        `Invalid gateway package manifest at ${manifest.registrySource || "unknown source"}`,
      );
    }

    return {
      ...manifest,
      requestedPermissions: manifest.requestedPermissions || [],
      capabilities: manifest.capabilities || [],
      tags: manifest.tags || [],
    };
  }
}
