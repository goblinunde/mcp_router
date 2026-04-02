const fs = require("node:fs");
const path = require("node:path");

const TEST_USER_DATA_DIR = globalThis.__MCPR_TEST_USER_DATA_DIR;

function resetTestState() {
  try {
    const {
      resetSqliteManagerForTests,
      setWorkspaceDatabase,
    } = require("@/main/infrastructure/database/sqlite-manager");
    setWorkspaceDatabase(null);
    resetSqliteManagerForTests();
  } catch {
    // Ignore singleton reset failures during test teardown.
  }

  try {
    require("@/main/infrastructure/shared-config-manager").SharedConfigManager.resetInstance();
  } catch {
    // Ignore singleton reset failures during test teardown.
  }

  [
    "@/main/infrastructure/vault/vault.service",
    "@/main/infrastructure/vault/vault-secret.repository",
    "@/main/modules/gateway/gateway-security.service",
    "@/main/modules/gateway/gateway-user.repository",
    "@/main/modules/gateway/gateway-role.repository",
    "@/main/modules/gateway/gateway-membership.repository",
    "@/main/modules/gateway/gateway-token.repository",
    "@/main/modules/gateway/gateway-audit.repository",
    "@/main/modules/mcp-apps-manager/mcp-apps-manager.repository",
    "@/main/modules/workspace/workspace.service",
    "@/main/modules/workspace/platform-api-manager",
  ].forEach((modulePath) => {
    try {
      const mod = require(modulePath);
      Object.values(mod).forEach((value) => {
        if (value && typeof value.resetInstance === "function") {
          value.resetInstance();
        }
      });
    } catch {
      // Ignore optional singleton reset failures during test teardown.
    }
  });

  fs.rmSync(TEST_USER_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_USER_DATA_DIR, { recursive: true });
}

function bootstrapWorkspaces(workspaceIds = ["local-default"]) {
  const {
    getSqliteManager,
  } = require("@/main/infrastructure/database/sqlite-manager");
  const db = getSqliteManager("mcprouter", true);
  db.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      lastUsedAt TEXT NOT NULL,
      localConfig TEXT,
      remoteConfig TEXT,
      displayInfo TEXT
    )
  `);
  db.execute("DELETE FROM workspaces");

  const now = new Date().toISOString();
  workspaceIds.forEach((workspaceId, index) => {
    db.execute(
      `
        INSERT INTO workspaces (
          id, name, type, isActive, createdAt, lastUsedAt, localConfig, remoteConfig, displayInfo
        ) VALUES (
          :id, :name, :type, :isActive, :createdAt, :lastUsedAt, :localConfig, :remoteConfig, :displayInfo
        )
      `,
      {
        id: workspaceId,
        name: workspaceId,
        type: "local",
        isActive: index === 0 ? 1 : 0,
        createdAt: now,
        lastUsedAt: now,
        localConfig: JSON.stringify({
          databasePath: path.join("workspaces", workspaceId, "database.db"),
        }),
        remoteConfig: null,
        displayInfo: null,
      },
    );
  });
}

function writeLegacySharedConfig(tokens = []) {
  const configPath = path.join(TEST_USER_DATA_DIR, "shared-config.json");
  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        settings: {},
        mcpApps: { tokens },
        _meta: {
          version: "1.0.0",
          lastModified: new Date().toISOString(),
        },
      },
      null,
      2,
    ),
    "utf-8",
  );
  require("@/main/infrastructure/shared-config-manager").SharedConfigManager.resetInstance();
}

module.exports = {
  TEST_USER_DATA_DIR,
  bootstrapWorkspaces,
  resetTestState,
  writeLegacySharedConfig,
};
