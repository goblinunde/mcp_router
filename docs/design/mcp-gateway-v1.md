# MCP Gateway V1 Design

## Status

- Proposed
- Owner: Codex implementation plan for `goblinunde/mcp_router`
- Scope: Incremental upgrade of the existing local MCP Router into a production-grade MCP Gateway without rewriting the current transport/runtime stack

## Goals

- Reuse the existing `/mcp` and `/mcp/sse` HTTP gateway, `AggregatorServer`, `RequestHandlers`, `TokenManager`/`TokenValidator`, and workspace/project model.
- Introduce production-grade authentication, scoped authorization, multi-user workspace membership, and a secure vault for external credentials.
- Keep the app runnable after each milestone and preserve existing client behavior where possible.
- Build the core seams needed for routing policies, dynamic tool exposure, plugins/marketplace, workflow orchestration, observability, SaaS sync, config-as-code, and model-aware routing.

## Non-negotiable Constraints

- No rewrite-from-scratch of the MCP runtime.
- No plaintext storage of gateway secrets or external API credentials in JSON config files.
- Existing tokens should keep working after migration unless the user explicitly rotates or revokes them.
- Every storage change requires migration notes, tests, and operational documentation.

## Current State

### Startup and gateway entry points

- `apps/electron/src/main.ts`
  - `initMCPServices()` initializes `PlatformAPIManager`, `MCPServerManager`, `ToolCatalogService`, `AggregatorServer`, and finally `MCPHttpServer` on port `3282`.
- `apps/electron/src/main/modules/mcp-server-runtime/http/mcp-http-server.ts`
  - Uses Express.
  - Protects `/mcp` and `/mcp/sse` with a token middleware.
  - Strips `Bearer ` manually, validates the token via `TokenValidator.validateToken`, and forwards the request to the aggregator transport.
  - Appends `_meta.token` and `_meta.projectId` into the JSON-RPC payload.
- `apps/electron/src/main/modules/mcp-server-runtime/aggregator-server.ts`
  - Owns the MCP `Server` and `StreamableHTTPServerTransport`.
  - For `listTools`, `callTool`, `listResources`, `readResource`, `listPrompts`, and `getPrompt`, it forwards into `RequestHandlers`.
- `apps/electron/src/main/modules/mcp-server-runtime/request-handlers.ts`
  - Handles the aggregator behavior across all connected MCP servers.
  - Enforces server access by calling `TokenValidator.validateTokenAndAccess` per downstream server.
  - Uses the existing project boundary when listing tools/resources/prompts.

### Existing auth and token model

- `apps/electron/src/main/modules/mcp-apps-manager/token-manager.ts`
  - Generates a random `mcpr_*` token.
  - Persists the token as a full plaintext identifier.
  - Tracks `clientId`, `issuedAt`, and `serverAccess`.
  - Does not model expiry, revocation, workspace scope, tool scope, or user ownership.
- `apps/electron/src/main/modules/mcp-server-runtime/token-validator.ts`
  - Validates token existence.
  - Maps server name to server id and checks `serverAccess`.
- `apps/electron/src/main/infrastructure/shared-config-manager.ts`
  - Stores `settings` and `mcpApps.tokens` in `shared-config.json`.
  - Tokens are currently stored in plaintext in a shared JSON file.
  - Includes `syncTokensWithWorkspaceServers`, which auto-grants new servers to every token.

### Existing dynamic tool behavior

- `RequestHandlers.handleListTools()`
  - When project optimization is enabled, returns only two meta-tools: `tool_discovery` and `tool_execute`.
  - Otherwise returns a legacy aggregated flat tool list.
- `apps/electron/src/main/modules/tool-catalog/tool-catalog-handler.ts`
  - `tool_discovery` requires a valid token and computes allowed servers by checking `tokenValidator.hasServerAccess`.
  - `tool_execute` resolves a `toolKey`, validates server access, then executes the downstream tool call.
- `apps/electron/src/main/modules/tool-catalog/tool-catalog.service.ts`
  - Lists tools from running servers on demand.
  - Applies filtering for project id, server access, running state, and `server.toolPermissions`.

### Existing workspace and persistence model

- `apps/electron/src/main/modules/workspace/workspace.service.ts`
  - Maintains a metadata database at `mcprouter.db`.
  - Creates/switches local and remote workspaces.
  - Opens a dedicated SQLite database per workspace.
- `apps/electron/src/main/modules/workspace/platform-api-manager.ts`
  - Switches the active workspace database.
  - Runs `MainDatabaseMigration` for each workspace database.
  - Resets repositories/services on workspace change.
- `apps/electron/src/main/infrastructure/database/sqlite-manager.ts`
  - Wraps `better-sqlite3`.
  - Supports a main singleton DB and a current workspace DB.
- `apps/electron/src/main/modules/projects/projects.repository.ts`
  - Stores `projects` inside the active workspace database.
- `apps/electron/src/main/modules/mcp-server-manager/mcp-server-manager.repository.ts`
  - Stores `servers` inside the active workspace database.
  - Stores `bearer_token` in plaintext.
- `apps/electron/src/main/modules/workspace/workspace.repository.ts`
  - Stores remote workspace credentials inside `remoteConfig.authToken`.
  - The current implementation uses base64, not cryptographic protection.

### Existing logging and observability

- `apps/electron/src/main/modules/mcp-logger/mcp-logger.service.ts`
  - Persists request logs into `requestLogs`.
  - Removes token fields from logged params when present.
- `apps/electron/src/main/modules/mcp-server-runtime/request-handler-base.ts`
  - Wraps MCP requests with request logging and workflow hooks.
- `apps/electron/src/main/modules/mcp-server-manager/mcp-server-manager.ts`
  - Emits logs for server lifecycle and health monitoring.
- Gaps:
  - No structured routing trace.
  - No retry/fallback event model.
  - No token audit trail.
  - No vault access audit trail.

## Main Current-State Gaps

- Gateway auth is token-existence based, not principal-aware.
- Tokens are plaintext at rest and lack expiry, revocation, workspace scope, and tool scope.
- New servers are auto-granted to every token, which breaks least privilege.
- Tool authorization is split between server access and per-server disabled tools, but there is no RBAC model.
- Secrets for remote MCP servers and remote workspaces are stored outside a secure vault.
- Dynamic tool exposure exists, but it is not the default gateway mode and is not tied to a policy engine.
- Request logging exists, but gateway-level tracing, audit logging, and retry observability do not.

## Target State

### 1. Gateway Core

- Keep the existing HTTP server, aggregator server, and request handlers.
- Add a `GatewayRequestContext` built at the HTTP layer and propagated through `_meta.gateway`.
- Replace raw-token propagation with principal metadata:
  - `tokenId`
  - `clientId`
  - `userId`
  - `workspaceId` or wildcard scope
  - resolved role ids
  - allowed server ids
  - allowed tool patterns
  - auth type (`legacy-token`, `gateway-token`, later `user-session`)

### 2. AuthN/AuthZ and RBAC

- Add a local-first identity model:
  - `User`
  - `Workspace`
  - `Membership`
  - `Role`
  - `Policy`
- System roles for V1:
  - `admin`
  - `operator`
  - `developer`
  - `viewer`
- Enforcement points:
  - HTTP layer: authenticate bearer token and resolve principal.
  - Aggregated listing: filter tools/resources/prompts by effective permissions.
  - Tool execution: deny if the principal lacks invoke permission or scope.
  - Server management IPC and workflow execution will use the same evaluator in later milestones.

### 3. Vault

- Add a real vault for sensitive material:
  - gateway access token secrets
  - external MCP server API keys / bearer tokens
  - remote workspace auth tokens
- Vault storage model:
  - ciphertext stored in SQLite
  - encryption performed through an abstract `VaultCrypto` implementation
  - production desktop implementation uses Electron `safeStorage`
  - tests use an in-memory crypto implementation
  - if secure encryption is unavailable in production, secret persistence fails closed rather than silently downgrading to plaintext
- Secret references use stable `vault://<secret-id>` handles.
- Access isolation is enforced by metadata:
  - workspace id
  - owner type (`gateway-token`, `server`, `workspace-auth`, later `plugin`)
  - owner id

### 4. Routing Policy Engine

- Add a pluggable `RoutingPolicyEngine` above the current handler dispatch path.
- V1 uses deterministic heuristics:
  - prompt intent tags
  - tool capability categories
  - workspace context
  - permissions
  - configured model preferences
- Expose a classifier interface so an LLM classifier can be added later without changing call sites.

### 5. Dynamic Tool Exposure

- Keep the existing `tool_discovery` / `tool_execute` meta-tools.
- Make `gateway mode` the default behavior for new workspaces/config.
- Legacy flat `listTools` stays behind a compatibility flag.
- Discovery results are filtered by:
  - user role permissions
  - token server scope
  - token tool scope
  - server project binding
  - routing policy

### 6. Plugins and Marketplace Foundation

- Add manifest-driven server packages:
  - metadata
  - install source
  - requested permissions
  - entrypoint definition
- Support a local registry file or directory first.
- Keep install/uninstall local-only in V1.

### 7. Workflow Orchestration

- Keep the current workflow module, but add a gateway-facing workflow executor abstraction.
- V1 workflow engine supports sequential steps only.
- Each workflow step reuses the same RBAC and routing path as direct tool calls.

### 8. Observability

- Keep `requestLogs`, but emit structured gateway events:
  - auth result
  - routing decision
  - retry attempt
  - final target server
  - latency
  - token usage
  - vault access
- Separate audit events from user-facing request logs.

### 9. SaaS-Readiness

- Keep local-first behavior.
- Add interfaces only for:
  - remote workspace sync provider
  - auth provider abstraction
  - multi-device sync hooks

### 10. Config-as-Code and Model-Aware Routing

- Add import/export of stable YAML/JSON config for:
  - workspace config
  - server config
  - roles/policies
  - routing rules
- Add model-aware routing preferences as config overlays on the routing engine.

## Threat Model

### Assets

- Gateway bearer tokens used by MCP clients.
- External MCP server credentials and bearer tokens.
- Remote workspace auth tokens.
- RBAC policies and membership mappings.
- Routing and audit logs that may reveal behavior or scope.

### Threats in the current implementation

- Plaintext token theft from `shared-config.json`.
- Plaintext or base64-only secret recovery from SQLite or config files.
- Privilege expansion due to automatic server grants.
- Token replay with no expiry or revocation.
- Cross-workspace misuse of shared tokens.
- Tool execution beyond intended scope because there is no tool-level RBAC evaluator.
- Secret leakage through logs, workflow context, or UI bridge APIs.

### V1 mitigations

- Gateway tokens are migrated to secure storage:
  - raw secret stored encrypted in the vault
  - token validation uses a token hash index
- External server credentials and workspace auth tokens move behind vault references.
- Token scope includes workspace and server boundaries, with optional tool patterns.
- Role evaluation and scope evaluation are both required before list/invoke succeeds.
- New servers are not auto-granted to all tokens.
- Audit events are emitted for token create/use/revoke and vault reads.
- Raw tokens are no longer propagated through request metadata or logs.

### Residual risk in V1

- Renderer/UI still has legacy surfaces that can reveal secrets if not refactored yet.
- Workflow hooks currently accept rich context and remain a separate hardening track.
- Local machine compromise is out of scope.

## Data Model Changes

### Main database additions (`mcprouter.db`)

- `gateway_users`
  - `id`
  - `name`
  - `status`
  - `created_at`
  - `updated_at`
- `gateway_roles`
  - `id`
  - `workspace_id` nullable for system roles
  - `name`
  - `permissions_json`
  - `is_system`
  - `created_at`
  - `updated_at`
- `gateway_memberships`
  - `id`
  - `user_id`
  - `workspace_id`
  - `role_id`
  - `created_at`
  - `updated_at`
- `gateway_tokens`
  - `id`
  - `client_id`
  - `user_id` nullable
  - `type` (`gateway_access`, later `service`)
  - `status` (`active`, `revoked`)
  - `token_hash`
  - `secret_ref`
  - `workspace_scope_json`
  - `server_scope_json`
  - `tool_scope_json`
  - `role_bindings_json`
  - `legacy_compat`
  - `issued_at`
  - `expires_at` nullable
  - `last_used_at` nullable
  - `revoked_at` nullable
  - `metadata_json`
- `vault_secrets`
  - `id`
  - `workspace_id` nullable
  - `owner_type`
  - `owner_id`
  - `secret_type`
  - `ciphertext`
  - `created_at`
  - `updated_at`
  - `revoked_at` nullable
  - `metadata_json`
- `gateway_audit_events`
  - `id`
  - `workspace_id` nullable
  - `actor_type`
  - `actor_id`
  - `action`
  - `target_type`
  - `target_id`
  - `status`
  - `metadata_json`
  - `created_at`

### Workspace database changes

- Reuse the existing `servers` table.
- Migrate `servers.bearer_token` from plaintext values to `vault://...` references.
- Keep the field name for backward-compatible repository mapping.

### Workspace metadata changes

- Reuse the existing `workspaces` table in `mcprouter.db`.
- Migrate `remoteConfig.authToken` to a `vault://...` reference.
- Keep the current shape so the rest of the workspace model does not need a rewrite.

## Backward Compatibility Plan

- Existing `shared-config.json` tokens are migrated on startup into `gateway_tokens` plus `vault_secrets`.
- Migrated legacy tokens keep the same bearer secret so existing clients continue to work.
- Legacy tokens default to:
  - `workspace_scope = ["*"]`
  - server scope copied from legacy `serverAccess`
  - `tool_scope = ["*"]`
  - `legacy_compat = true`
- After successful migration:
  - tokens are removed from `shared-config.json`
  - settings remain in `shared-config.json`
- Existing server records keep using the same `bearer_token` column, but the value becomes a vault reference.
- Existing workspace auth records keep the same `remoteConfig` shape, but `authToken` becomes a vault reference.

## Rollout and Feature Flags

- `gateway.authV1`
  - Enables principal-aware auth context and token scope enforcement.
- `gateway.dynamicToolsDefault`
  - Makes `tool_discovery` / `tool_execute` the default listing mode.
- `gateway.routingV1`
  - Enables policy engine routing and retries.
- `gateway.pluginRegistryV1`
  - Enables local registry and package manifest support.
- `gateway.workflowV1`
  - Enables the new gateway workflow executor path.
- `gateway.configAsCodeV1`
  - Enables YAML/JSON import/export.
- `gateway.modelRoutingV1`
  - Enables model-aware routing overlays.

### Safe defaults

- Auth enforcement is on for `/mcp` and `/mcp/sse`.
- Legacy flat tool listing remains available during migration, but only under explicit compatibility settings.
- Secret writes fail closed if vault encryption is unavailable.
- New server creation does not auto-expand token scope.

## Milestones

### M1. Gateway Core

#### Deliverables

- Secure token store backed by SQLite and vault references.
- Vault service and encrypted secret repository.
- Principal resolution in `MCPHttpServer`.
- Scoped token validation by workspace and server.
- Minimal RBAC model with users, roles, memberships, and evaluator.
- Tool list filtering and tool call denial by RBAC + scope.
- Token create/use/revoke audit events.
- Migration from plaintext shared config tokens and plaintext server/workspace secrets.

#### Acceptance criteria

- `/mcp` and `/mcp/sse` require authentication.
- Token scope can limit workspace and server access.
- Unauthorized servers are blocked.
- `listTools` is filtered and `callTool` denies forbidden tools.
- Secrets are not stored in plaintext config files.
- Unit tests cover token validation, RBAC decisions, and discovery filtering.
- Integration test covers `401`, forbidden tool access, and allowed tool success.

### M2. Routing Policy Engine and Fallback

#### Deliverables

- `RoutingPolicyEngine` with deterministic classifiers.
- Retry policy with configurable same-server retry and alternate-server fallback.
- Structured routing traces per request.

#### Acceptance criteria

- Routing chooses a server deterministically from prompt/context/capability.
- Retries and fallback paths are visible in structured logs.
- Unit tests cover selection and fallback ordering.

### M3. Dynamic Tool Gateway Mode

#### Deliverables

- Gateway mode is the default for new configs.
- Discovery results are scoped by permission and routing policy.
- Legacy mode remains available behind config.

#### Acceptance criteria

- `tool_discovery` returns only relevant, allowed tools.
- `tool_execute` accepts tool references and enforces scope.

### M4. Plugin Registry and Auto Discovery

#### Deliverables

- Server package manifest schema.
- Local registry support.
- Install/uninstall flows.
- Discovery pipeline and optional auto-update flag.

#### Acceptance criteria

- Registry scan can discover packages and sync metadata.
- Installed packages can be listed and removed safely.

### M5. Workflow and Observability

#### Deliverables

- Sequential gateway workflow executor.
- Unified event model for request, auth, routing, retry, and audit events.
- Docs for operations and event consumers.

#### Acceptance criteria

- Workflow steps reuse RBAC and routing.
- Observability emits structured events for each gateway request.

### M6. SaaS Scaffold, Config-as-Code, and Model Routing

#### Deliverables

- Auth provider abstraction and remote sync interfaces.
- YAML/JSON config import/export and validation.
- Model-aware routing overlay.

#### Acceptance criteria

- Example configs validate.
- Remote sync remains stubbed but callable through interfaces.
- Model preferences influence routing when enabled.

## Testing Strategy

### Unit tests

- `TokenValidator` / gateway token service
  - valid token
  - revoked token
  - expired token
  - wrong workspace
  - wrong server
- RBAC evaluator
  - admin/operator/developer/viewer allow and deny cases
  - token scope narrows role permissions
- Tool discovery policy
  - only allowed tools returned
  - forbidden tools filtered
- Routing policy and fallback
  - deterministic selection
  - retry ordering
  - alternate fallback path

### Integration tests

- Start `MCPHttpServer` with mocked downstream server manager/runtime.
- Verify:
  - missing token returns `401`
  - valid token with forbidden tool returns `403` or MCP authorization error
  - valid token with allowed tool returns a success response

## Operational Notes

- Token migration should be idempotent.
- Vault migration should only replace plaintext values after the encrypted secret is written successfully.
- Audit tables should never store raw secret material.
- The gateway should log token id / secret ref / server id, not raw tokens.

## Assumptions and Non-goals

- V1 remains local-first and single-active-workspace from the desktop app’s perspective.
- Multi-user in V1 means multiple users and memberships can be modeled locally; it does not imply a remote collaborative backend yet.
- Existing renderer/UI secret exposure is not fully redesigned in M1 unless required by the storage migration path.
- The routing engine in V1 is deterministic and heuristic; LLM classification is an extension seam, not a dependency.
- Marketplace ratings and recommendations are data-model placeholders only.
- Workflow orchestration in V1 is sequential only; no DAG scheduler or long-running distributed agents yet.

## Manual Validation

1. Start the Electron app and confirm `MCPHttpServer` still boots.
2. Use an existing migrated token against `/mcp` and confirm compatibility.
3. Create a scoped token, allow only one workspace/server/tool pattern, and confirm forbidden access is denied.
4. Inspect `shared-config.json` and confirm tokens are no longer stored there.
5. Inspect migrated `servers` rows and confirm bearer tokens are replaced by vault references.
6. Inspect audit logs and request logs to confirm raw secrets are not present.
