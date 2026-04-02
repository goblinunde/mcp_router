import type { MakerOptions } from "@electron-forge/maker-base";
import type { ForgeConfig } from "@electron-forge/shared-types";
import * as fs from "node:fs";
import * as os from "node:os";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerRpm, rpmArch } from "@electron-forge/maker-rpm";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";

import { mainConfig } from "./webpack.main.config";
import { rendererConfig } from "./webpack.renderer.config";
import { MakerDMG } from "@electron-forge/maker-dmg";
import * as path from "path";

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const electronVersion = require("electron/package.json").version;
const targetArch = (process.env.npm_config_target_arch as any) || process.arch;
const targetPlatform = process.env.npm_config_target_platform || process.platform;
const isMac = process.platform === "darwin";
const hasSignIdentity = !!process.env.PUBLIC_IDENTIFIER;
const hasNotarizeCreds = !!(
  process.env.APPLE_API_KEY &&
  process.env.APPLE_API_KEY_ID &&
  process.env.APPLE_API_ISSUER
);
const appDescription =
  "Effortlessly manage your MCP servers with MCP Router. MCP Router provides a user-friendly interface for organizing and operating MCP servers.";
const linuxDesktopFileName = "mcp-router.desktop";
const linuxIconPath = path.resolve(__dirname, "public/images/icon/icon.png");

function renameRpm(dest: string): string {
  return path.join(
    dest,
    '<%= name %>-<%= version %>-<%= revision %>.<%= arch === "aarch64" ? "arm64" : arch %>.rpm',
  );
}

function patchFedoraSpec(specPath: string): void {
  const installSectionNeedle = "cp -r usr/* %{buildroot}/usr/";
  const installSectionReplacement = [
    "cp -r ../usr/* %{buildroot}/usr/",
    "",
    "# Ensure the running Electron window matches the desktop file on Linux.",
    `if ! grep -q '^StartupWMClass=' %{buildroot}/usr/share/applications/${linuxDesktopFileName}; then`,
    `  sed -i '/^Icon=/a StartupWMClass=MCP Router' %{buildroot}/usr/share/applications/${linuxDesktopFileName}`,
    "fi",
  ].join("\n");

  const originalSpecContents = fs.readFileSync(specPath, "utf8");
  if (!originalSpecContents.includes(installSectionNeedle)) {
    throw new Error(`Unexpected RPM spec format: ${specPath}`);
  }

  const patchedSpecContents = originalSpecContents.replace(
    installSectionNeedle,
    installSectionReplacement,
  );

  fs.writeFileSync(specPath, patchedSpecContents);
}

const resolveElectronZipDir = () => {
  const zipName = `electron-v${electronVersion}-${targetPlatform}-${targetArch}.zip`;
  const cacheRoots = [
    process.env.XDG_CACHE_HOME
      ? path.resolve(process.env.XDG_CACHE_HOME, "electron")
      : undefined,
    path.resolve(os.homedir(), ".cache/electron"),
  ].filter((value): value is string => !!value);

  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;

      const candidate = path.join(root, entry.name, zipName);
      if (fs.existsSync(candidate)) {
        return path.dirname(candidate);
      }
    }
  }

  return undefined;
};

class FedoraMakerRpm extends MakerRpm {
  override async make({
    dir,
    makeDir,
    targetArch,
  }: MakerOptions): Promise<string[]> {
    // eslint-disable-next-line n/no-missing-require
    const { Installer } = require("electron-installer-redhat");
    const outDir = path.resolve(makeDir, "rpm", targetArch);

    await this.ensureDirectory(outDir);

    const installer = new Installer({
      ...this.config,
      arch: rpmArch(targetArch),
      src: dir,
      dest: outDir,
      logger: () => undefined,
      rename: renameRpm,
    });

    await installer.generateDefaults();
    await installer.generateOptions();
    await installer.generateScripts();
    await installer.createStagingDir();
    await installer.createContents();

    // Fedora 43's rpmbuild recreates BUILD/<name>-<version>-build before %install.
    // Point the spec at the sibling BUILD/usr tree that electron-installer-redhat stages,
    // then add the desktop integration tweaks Fedora expects.
    patchFedoraSpec(installer.specPath);

    await installer.createPackage();
    await installer.movePackage();

    return installer.options.packagePaths;
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    icon: "./public/images/icon/icon",
    electronZipDir: resolveElectronZipDir(),
    // Support both Intel and Apple Silicon architectures - use target arch from env
    arch: targetArch,
    // Only sign/notarize on macOS when credentials are available (CI-safe)
    osxSign: isMac && hasSignIdentity
      ? {
          identity: process.env.PUBLIC_IDENTIFIER,
        }
      : undefined,
    osxNotarize: isMac && hasNotarizeCreds
      ? {
          appleApiKey: process.env.APPLE_API_KEY || "",
          appleApiKeyId: process.env.APPLE_API_KEY_ID || "",
          appleApiIssuer: process.env.APPLE_API_ISSUER || "",
        }
      : undefined,
  },
  rebuildConfig: {
    // Force rebuild native modules for the target architecture
    arch: targetArch,
  },
  makers: [
    new MakerSquirrel({
      name: "MCP-Router",
      authors: "fjm2u",
      description: appDescription,
      setupIcon: "./public/images/icon/icon.ico",
    }),
    new MakerDMG(
      {
        name: "MCP-Router",
        format: "ULFO",
        icon: "./public/images/icon/icon.icns",
      },
      ["darwin"],
    ),
    new FedoraMakerRpm(
      {
        options: {
          name: "mcp-router",
          bin: "MCP Router",
          productName: "MCP Router",
          genericName: "MCP Server Management App",
          icon: {
            "512x512": linuxIconPath,
          },
          description: appDescription,
          productDescription: appDescription,
          homepage: "https://github.com/mcp-router/mcp-router",
          categories: ["Development", "Utility"],
          license: "SEE LICENSE IN LICENSE",
          scripts: {
            post: path.resolve(__dirname, "scripts/rpm-postinstall.sh"),
          },
        },
      },
      ["linux"],
    ),
    new MakerZIP(),
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new WebpackPlugin({
      mainConfig,
      renderer: {
        config: rendererConfig,
        entryPoints: [
          {
            html: "./src/index.html",
            js: "./src/renderer.tsx",
            name: "main_window",
            preload: {
              js: "./src/preload.ts",
            },
          },
        ],
      },
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        authToken: process.env.GITHUB_TOKEN,
        repository: {
          owner: "mcp-router",
          name: "mcp-router",
        },
        prerelease: true,
        draft: true,
      },
    },
  ],
};

export default config;
