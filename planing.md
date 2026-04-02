# MCP Gateway Planning

This repository now has a detailed gateway design and milestone plan in [docs/design/mcp-gateway-v1.md](/home/yyt/Downloads/mcp-router/docs/design/mcp-gateway-v1.md).

Current implementation status:

- M1 complete: gateway token migration, vault skeleton, multi-user role/membership scaffolding, workspace/server/tool scoping, and auth enforcement on `/mcp` and `/mcp/sse`
- M2+ scaffolded: routing policy foundation, plugin registry/discovery, model-aware routing overlay, workflow orchestration adapter, observability service, SaaS sync coordinator, and config-as-code codec
- Operational notes: [docs/operations/mcp-gateway-v1.md](/home/yyt/Downloads/mcp-router/docs/operations/mcp-gateway-v1.md)
- Config examples: `docs/examples/`

Milestones:

1. M1: RBAC, vault-backed secrets, token scoping, gateway auth compatibility
2. M2: deterministic routing engine, retry/fallback wiring, dynamic tool exposure default
3. M3: marketplace manifest, local registry discovery, install/uninstall UX
4. M4: workflow orchestration with routing/RBAC reuse
5. M5: structured observability, dashboards, audit surfacing
6. M6: SaaS sync providers, model routing overlays, config-as-code import/export hardening
