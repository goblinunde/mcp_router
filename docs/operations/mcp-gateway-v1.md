# MCP Gateway V1 Operations

## Scope

This document covers the operational behavior introduced by the M1 gateway hardening slice:

- gateway token migration
- vault-backed secret storage
- workspace-scoped token validation
- tool-level RBAC enforcement

Detailed architecture and later milestones live in [docs/design/mcp-gateway-v1.md](/home/yyt/Downloads/mcp-router/docs/design/mcp-gateway-v1.md).

## Startup and Migration

On application startup, `getGatewaySecurityService().initialize()` now runs during main database initialization.

Migration behavior:

1. Legacy plaintext gateway tokens from `shared-config.json` are read once.
2. Each legacy token is re-materialized as a gateway token record with:
   - hashed token lookup value
   - vault-backed raw secret
   - explicit status/scope metadata
3. Legacy token entries are removed from shared config after migration.
4. Existing token strings continue to work unless revoked or rotated.

Remote workspace auth tokens and MCP server bearer tokens are also migrated on read/write boundaries into vault references.

## Manual Validation

1. Start the Electron app and confirm `/mcp` still starts on the configured local port.
2. Create or migrate a token and verify the raw secret no longer appears in `shared-config.json`.
3. Verify `servers.bearer_token` and workspace `remoteConfig.authToken` are stored as `vault://...` references rather than plaintext.
4. Call `/mcp` without a bearer token and confirm the server responds with `401`.
5. Call `/mcp` with a token scoped away from the active workspace or target server and confirm access is denied.
6. Call `tools/list` and `tools/call` with a restricted role and confirm list filtering plus invoke denial both happen.

## Rotation and Revocation

- Rotation is implemented by storing a new secret for the same token owner and updating the token record metadata.
- Revocation is implemented by setting token status to `revoked` and keeping an audit trail in `gateway_audit_events`.
- Vault secret access is isolated by workspace id plus owner metadata.

## Safe Defaults

- New servers are no longer auto-granted to every token.
- Gateway auth context is propagated via `_meta.gateway`, not raw `_meta.token`.
- The embedded HTTP server binds to `127.0.0.1`.

## Known Gaps

- Structured routing/retry events exist as scaffolding but are not yet fully wired into every request path.
- YAML config import is intentionally left as a documented scaffold; JSON import/export is the automation-safe path for now.
- Plugin discovery, workflow orchestration, and SaaS sync are foundation modules only in this slice.
