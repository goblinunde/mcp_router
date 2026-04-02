const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

const repoRoot = path.resolve(__dirname, "../../..");
const testUserDataDir = path.join(os.tmpdir(), "mcp-router-node-tests");
fs.mkdirSync(testUserDataDir, { recursive: true });
globalThis.__MCPR_TEST_USER_DATA_DIR = testUserDataDir;

process.env.TS_NODE_PROJECT = path.join(
  repoRoot,
  "apps/electron/tsconfig.json",
);
require("ts-node/register/transpile-only");
require.extensions[".svg"] = (module, filename) => {
  module.exports = filename;
};
require.extensions[".png"] = (module, filename) => {
  module.exports = filename;
};

const electronMock = {
  app: {
    getPath(name) {
      if (name === "userData") {
        return testUserDataDir;
      }
      return testUserDataDir;
    },
    whenReady: async () => undefined,
    isReady: () => true,
    on: () => undefined,
    once: () => undefined,
    removeListener: () => undefined,
    commandLine: {
      appendSwitch: () => undefined,
    },
    setName: () => undefined,
    setAsDefaultProtocolClient: () => true,
    requestSingleInstanceLock: () => true,
    getLoginItemSettings: () => ({}),
    quit: () => undefined,
    exit: () => undefined,
    dock: {
      show: () => undefined,
      hide: () => undefined,
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`enc:${value}`, "utf-8"),
    decryptString: (buffer) =>
      Buffer.from(buffer).toString("utf-8").replace(/^enc:/, ""),
  },
  session: {
    defaultSession: {
      webRequest: {
        onHeadersReceived: () => undefined,
      },
    },
    fromPartition: () => ({}),
  },
  ipcMain: {
    handle: () => undefined,
    removeHandler: () => undefined,
    on: () => undefined,
  },
  BrowserWindow: class BrowserWindow {},
  shell: {
    openExternal: () => undefined,
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    shouldUseHighContrastColors: false,
    on: () => undefined,
    removeListener: () => undefined,
  },
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAlias(
  request,
  parent,
  isMain,
  options,
) {
  if (request === "@mcp_router/shared") {
    request = path.join(repoRoot, "packages/shared/src/index.ts");
  } else if (request.startsWith("@mcp_router/shared/")) {
    request = path.join(
      repoRoot,
      "packages/shared/src",
      request.slice("@mcp_router/shared/".length),
    );
  } else if (request.startsWith("@/")) {
    request = path.join(repoRoot, "apps/electron/src", request.slice(2));
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const originalLoad = Module._load;
Module._load = function loadPatched(request, parent, isMain) {
  if (request === "electron") {
    return electronMock;
  }
  if (
    request === "../aggregator-server" ||
    request.endsWith("/aggregator-server")
  ) {
    return {
      AggregatorServer: class AggregatorServer {
        getTransport() {
          return {
            handleRequest: async () => undefined,
          };
        }

        getAggregatorServer() {
          return {
            connect: async () => undefined,
          };
        }
      },
    };
  }
  if (request === "@modelcontextprotocol/sdk/server/sse") {
    return {
      SSEServerTransport: class SSEServerTransport {
        constructor() {
          this.sessionId = "test-session";
        }

        async handlePostMessage() {
          return undefined;
        }

        close() {}
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
