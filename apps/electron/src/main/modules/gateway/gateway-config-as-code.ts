import type { GatewayConfigBundle } from "@mcp_router/shared";

export class GatewayConfigCodec {
  public exportJson(bundle: GatewayConfigBundle): string {
    this.assertBundle(bundle);
    return JSON.stringify(bundle, null, 2);
  }

  public exportYaml(bundle: GatewayConfigBundle): string {
    this.assertBundle(bundle);
    return `${this.renderYamlValue(bundle, 0)}\n`;
  }

  public importBundle(
    content: string,
    format: "json" | "yaml" = this.detectFormat(content),
  ): GatewayConfigBundle {
    if (format === "json") {
      return this.assertBundle(JSON.parse(content) as GatewayConfigBundle);
    }

    throw new Error(
      "YAML import is scaffolded but not enabled in this milestone. Use JSON import for automation and YAML export/examples for authoring.",
    );
  }

  private detectFormat(content: string): "json" | "yaml" {
    const trimmed = content.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return "json";
    }
    return "yaml";
  }

  private assertBundle(bundle: GatewayConfigBundle): GatewayConfigBundle {
    if (!bundle.version) {
      throw new Error("Gateway config bundle must include a version");
    }

    return bundle;
  }

  private renderYamlValue(value: unknown, indentLevel: number): string {
    const indent = "  ".repeat(indentLevel);

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return "[]";
      }

      return value
        .map((item) => {
          if (this.isScalar(item)) {
            return `${indent}- ${this.renderScalar(item)}`;
          }

          const rendered = this.renderYamlValue(item, indentLevel + 1);
          return `${indent}- ${rendered.trimStart()}`;
        })
        .join("\n");
    }

    if (value && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>)
        .map(([key, child]) => {
          if (this.isScalar(child)) {
            return `${indent}${key}: ${this.renderScalar(child)}`;
          }

          return `${indent}${key}:\n${this.renderYamlValue(
            child,
            indentLevel + 1,
          )}`;
        })
        .join("\n");
    }

    return `${indent}${this.renderScalar(value)}`;
  }

  private isScalar(value: unknown): boolean {
    return (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    );
  }

  private renderScalar(value: unknown): string {
    if (value === null) {
      return "null";
    }

    if (typeof value === "string") {
      return JSON.stringify(value);
    }

    return String(value);
  }
}
