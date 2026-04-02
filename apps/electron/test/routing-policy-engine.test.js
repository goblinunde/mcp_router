const test = require("node:test");
const assert = require("node:assert/strict");

test("Routing policy engine selects the best candidate and builds a retry plan", () => {
  const {
    RoutingPolicyEngine,
  } = require("@/main/modules/gateway/routing-policy-engine");

  const engine = new RoutingPolicyEngine();
  const decision = engine.decide(
    {
      intent: "database query for analytics",
      requiredCapability: "db",
      workspaceId: "ws-alpha",
      modelName: "gpt-4.1",
      allowedServerIds: new Set(["server-1", "server-2"]),
      fallbackServerIds: ["server-3"],
    },
    [
      {
        serverId: "server-1",
        serverName: "db-primary",
        capabilities: ["db", "analytics"],
        workspaceId: "ws-alpha",
        models: ["gpt-4.1"],
        priority: 5,
      },
      {
        serverId: "server-2",
        serverName: "docs",
        capabilities: ["documents"],
        workspaceId: "ws-alpha",
        models: ["gpt-4.1"],
      },
      {
        serverId: "server-3",
        serverName: "db-fallback",
        capabilities: ["db"],
        workspaceId: "ws-beta",
      },
    ],
  );

  assert.equal(decision.primaryServerId, "server-1");
  assert.deepEqual(decision.orderedServerIds, [
    "server-1",
    "server-2",
    "server-3",
  ]);

  const retryPlan = engine.buildRetryPlan(decision, {
    sameServerRetries: 1,
  });
  assert.deepEqual(retryPlan, ["server-1", "server-1", "server-2", "server-3"]);
});
