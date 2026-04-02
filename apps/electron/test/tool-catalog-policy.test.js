const test = require("node:test");
const assert = require("node:assert/strict");
const { bootstrapWorkspaces, resetTestState } = require("./helpers/test-env");

class EchoSearchProvider {
  async search(request) {
    return request.tools.map((tool, index) => ({
      toolKey: tool.toolKey,
      toolName: tool.toolName,
      serverId: tool.serverId,
      serverName: tool.serverName,
      description: tool.description,
      relevance: 1 - index * 0.1,
      explanation: "matched",
    }));
  }
}

test.beforeEach(() => {
  resetTestState();
  bootstrapWorkspaces(["proj-space"]);
});

test("Tool catalog returns only tools allowed by server scope and RBAC policy", async () => {
  const {
    ToolCatalogService,
  } = require("@/main/modules/tool-catalog/tool-catalog.service");

  const servers = new Map([
    [
      "server-1",
      {
        id: "server-1",
        name: "alpha",
        projectId: "project-1",
        toolPermissions: { disabled_tool: false },
      },
    ],
    [
      "server-2",
      {
        id: "server-2",
        name: "beta",
        projectId: "project-1",
        toolPermissions: {},
      },
    ],
  ]);

  const clients = new Map([
    [
      "server-1",
      {
        listTools: async () => ({
          tools: [
            { name: "allowed_tool", description: "allowed" },
            { name: "disabled_tool", description: "disabled" },
          ],
        }),
      },
    ],
    [
      "server-2",
      {
        listTools: async () => ({
          tools: [{ name: "other_tool", description: "other" }],
        }),
      },
    ],
  ]);

  const serverStatusMap = new Map([
    ["alpha", true],
    ["beta", true],
  ]);

  const service = new ToolCatalogService(
    {
      getMaps: () => ({
        servers,
        clients,
        serverStatusMap,
      }),
    },
    new EchoSearchProvider(),
  );

  const result = await service.searchTools(
    { query: ["tool"], context: "run code" },
    {
      projectId: "project-1",
      allowedServerIds: new Set(["server-1"]),
      toolCatalogEnabled: true,
      toolAccessChecker: (serverId, toolName) =>
        serverId === "server-1" && toolName === "allowed_tool",
    },
  );

  assert.deepEqual(
    result.results.map((entry) => entry.toolName),
    ["allowed_tool"],
  );
});
