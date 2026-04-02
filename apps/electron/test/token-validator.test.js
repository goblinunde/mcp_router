const test = require("node:test");
const assert = require("node:assert/strict");
const { bootstrapWorkspaces, resetTestState } = require("./helpers/test-env");

test.beforeEach(() => {
  resetTestState();
  bootstrapWorkspaces(["ws-alpha", "ws-beta"]);
});

test("TokenValidator enforces workspace, server, and tool scope", () => {
  const {
    getGatewaySecurityService,
  } = require("@/main/modules/gateway/gateway-security.service");
  const {
    TokenValidator,
  } = require("@/main/modules/mcp-server-runtime/token-validator");

  const gatewaySecurity = getGatewaySecurityService();
  gatewaySecurity.initialize();

  const developerToken = gatewaySecurity.createToken({
    clientId: "developer-client",
    userId: "local-system",
    serverAccess: { "server-1": true },
    workspaceScope: ["ws-alpha"],
    toolScope: ["server-1:allowed_tool"],
    roleNames: ["developer"],
  });

  const viewerToken = gatewaySecurity.createToken({
    clientId: "viewer-client",
    userId: "local-system",
    serverAccess: { "server-1": true },
    workspaceScope: ["ws-alpha"],
    toolScope: ["*"],
    roleNames: ["viewer"],
  });

  const validator = new TokenValidator(new Map([["alpha", "server-1"]]));

  assert.equal(
    validator.validateToken(developerToken.id, "ws-alpha").isValid,
    true,
  );
  assert.equal(
    validator.validateToken(developerToken.id, "ws-beta").isValid,
    false,
  );
  assert.equal(validator.hasServerAccess(developerToken.id, "server-1"), true);

  const developerContext = validator.resolveAuthContext(
    developerToken.id,
    "ws-alpha",
  );
  assert.ok(developerContext);
  assert.equal(
    validator.canListTool(developerContext, "server-1", "allowed_tool"),
    true,
  );
  assert.equal(
    validator.canInvokeTool(developerContext, "server-1", "allowed_tool"),
    true,
  );
  assert.equal(
    validator.canInvokeTool(developerContext, "server-1", "blocked_tool"),
    false,
  );

  const viewerContext = validator.resolveAuthContext(
    viewerToken.id,
    "ws-alpha",
  );
  assert.ok(viewerContext);
  assert.equal(
    validator.canListTool(viewerContext, "server-1", "any_tool"),
    true,
  );
  assert.equal(
    validator.canInvokeTool(viewerContext, "server-1", "any_tool"),
    false,
  );
});
