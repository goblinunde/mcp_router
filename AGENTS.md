# Repository Guidelines

## Project Structure & Module Organization
This repository is a `pnpm` + `turbo` monorepo. Put product code in the package that owns it:

- `apps/electron`: main Electron desktop app. Renderer UI lives under `src/renderer`, backend and IPC code under `src/main`, and Playwright E2E tests under `e2e/`.
- `apps/cli`: `@mcp_router/cli` command-line client, with source in `src/` and build output in `dist/`.
- `packages/shared`: shared TypeScript types and cross-app logic.
- `packages/remote-api-types`: remote API schemas and generated types.
- `packages/ui` and `packages/tailwind-config`: reusable UI primitives and shared styling config.
- `docs/` and `public/`: design notes, ADRs, and static assets.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies. Use `pnpm`, not `npm` or `yarn`.
- `pnpm dev`: start the Electron development pipeline via Turbo.
- `pnpm build`: build all workspaces.
- `pnpm typecheck`: run TypeScript checks across the monorepo.
- `pnpm lint:fix`: run ESLint and apply safe fixes.
- `pnpm test:e2e`: package the Electron app and run Playwright E2E tests.
- `pnpm --filter @mcp_router/cli build`: build only the CLI package.

## Coding Style & Naming Conventions
TypeScript is the default for new code. Prettier enforces 2-space indentation, semicolons, double quotes, trailing commas, and `80` column width. ESLint includes custom rules that centralize shared types in `packages/shared/src/types` or `packages/remote-api-types/src`; avoid ad hoc type definitions outside allowed locations. Follow existing naming patterns: React components in `PascalCase.tsx`, helpers in `*-utils.ts`, Zustand stores in `*-store.ts`, and tests in `*.spec.ts`.

## Testing Guidelines
Current automated coverage is Playwright E2E in `apps/electron/e2e/specs`, using page objects from `e2e/fixtures/page-objects`. Add or update E2E coverage when behavior changes in the Electron app, especially around auth, workspace/project flows, or MCP server management. Keep test names descriptive, for example `app-launch.spec.ts`.

## Commit & Pull Request Guidelines
This snapshot does not include `.git` history, so follow the repo’s documented workflow in `CONTRIBUTING.md`: keep commits focused and written in the imperative mood, ideally scoped to one area such as `electron`, `cli`, or `shared`. Before opening a PR, run `pnpm build`, `pnpm typecheck`, `pnpm lint:fix`, and `pnpm test:e2e` when relevant. PRs should stay single-purpose, link related issues, describe testing performed, and update `README*` or `docs/` when behavior or architecture changes.
