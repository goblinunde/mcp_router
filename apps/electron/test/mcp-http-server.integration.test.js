const test = require("node:test");
const assert = require("node:assert/strict");
const { bootstrapWorkspaces, resetTestState } = require("./helpers/test-env");

test.beforeEach(() => {
  resetTestState();
  bootstrapWorkspaces(["local-default"]);
});

test("MCPHttpServer authenticates requests and blocks forbidden tool access", async (t) => {
  const {
    getGatewaySecurityService,
  } = require("@/main/modules/gateway/gateway-security.service");
  const {
    TokenValidator,
  } = require("@/main/modules/mcp-server-runtime/token-validator");
  const {
    MCPHttpServer,
  } = require("@/main/modules/mcp-server-runtime/http/mcp-http-server");
  const {
    getPlatformAPIManager,
  } = require("@/main/modules/workspace/platform-api-manager");

  const gatewaySecurity = getGatewaySecurityService();
  gatewaySecurity.initialize();

  const validator = new TokenValidator(new Map([["alpha", "server-1"]]));
  const platformManager = getPlatformAPIManager();
  platformManager.getCurrentWorkspace = () => ({
    id: "local-default",
    name: "Local",
    type: "local",
    isActive: true,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    localConfig: { databasePath: "workspaces/local-default/database.db" },
  });
  platformManager.isRemoteWorkspace = () => false;

  const allowedToken = gatewaySecurity.createToken({
    clientId: "allowed-client",
    userId: "local-system",
    serverAccess: { "server-1": true },
    workspaceScope: ["local-default"],
    toolScope: ["server-1:allowed_tool"],
    roleNames: ["developer"],
  });

  const forbiddenToken = gatewaySecurity.createToken({
    clientId: "forbidden-client",
    userId: "local-system",
    serverAccess: { "server-1": true },
    workspaceScope: ["local-default"],
    toolScope: ["server-1:visible_tool"],
    roleNames: ["developer"],
  });

  const fakeAggregator = {
    getTransport() {
      return {
        handleRequest: async (_req, res, body) => {
          const toolName = body.params?.name;
          const authContext = body.params?._meta?.gateway;

          if (!validator.canInvokeTool(authContext, "server-1", toolName)) {
            res.status(403).json({
              jsonrpc: "2.0",
              error: {
                code: -32001,
                message: `Forbidden tool: ${toolName}`,
              },
              id: body.id || null,
            });
            return;
          }

          res.status(200).json({
            jsonrpc: "2.0",
            result: {
              ok: true,
              toolName,
            },
            id: body.id || null,
          });
        },
      };
    },
    getAggregatorServer() {
      return {
        connect: async () => undefined,
      };
    },
  };

  const httpServer = new MCPHttpServer({}, 0, fakeAggregator);
  await httpServer.start();
  t.after(async () => {
    await httpServer.stop();
  });

  const port = httpServer.server.address().port;
  const url = `http://127.0.0.1:${port}/mcp`;
  const requestBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "allowed_tool",
      arguments: {},
    },
  };

  const missingTokenResponse = await globalThis.fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  assert.equal(missingTokenResponse.status, 401);

  const forbiddenResponse = await globalThis.fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${forbiddenToken.id}`,
    },
    body: JSON.stringify({
      ...requestBody,
      params: {
        ...requestBody.params,
        name: "forbidden_tool",
      },
    }),
  });
  assert.equal(forbiddenResponse.status, 403);

  const allowedResponse = await globalThis.fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${allowedToken.id}`,
    },
    body: JSON.stringify(requestBody),
  });
  assert.equal(allowedResponse.status, 200);
  const allowedPayload = await allowedResponse.json();
  assert.equal(allowedPayload.result.ok, true);
  assert.equal(allowedPayload.result.toolName, "allowed_tool");
});
