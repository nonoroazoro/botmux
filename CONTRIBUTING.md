# Contributing to botmux

Read [AGENTS.md](AGENTS.md) before changing code. It defines code style, impact assessment, verification, PR, and release rules.

## Setup

```bash
git clone https://github.com/deepcoldy/botmux.git
cd botmux
pnpm install
pnpm build
```

Run without PM2:

```bash
pnpm daemon
```

Run with PM2:

```bash
pnpm daemon:start
pnpm daemon:logs
```

## Architecture

- `src/index-daemon.ts`, `src/daemon.ts`: daemon entry and assembly.
- `src/worker.ts`: per-session CLI execution and streaming.
- `src/adapters/cli/`: CLI and API-agent adapters.
- `src/adapters/backend/`: PTY, tmux, Zellij, Zmx, and Herdr backends.
- `src/core/`, `src/services/`: shared runtime logic and persistent services.
- `src/im/lark/`: Lark events, messages, cards, grants, and API access.
- `src/dashboard.ts`, `src/dashboard/`: dashboard server and UI support.
- `src/vc-agent/`, `src/platform/`: extended runtime surfaces.

See [AGENTS.md](AGENTS.md) for the current impact checklist. Do not duplicate implementation inventories here; use the source registries as the source of truth.

## Adding a CLI Adapter

1. Add the adapter under `src/adapters/cli/`.
2. Add its ID to `CliId` in `src/adapters/cli/types.ts`.
3. Register it in `src/adapters/cli/registry.ts`.
4. Add type-correct tests and validate one unrelated adapter if shared code changed.
5. Update user documentation when setup or configuration changes.

Use the full checklist in [`src/adapters/cli/CLAUDE.md`](src/adapters/cli/CLAUDE.md).

## Verification

```bash
pnpm build
pnpm test
pnpm test:e2e
```

- `pnpm test` runs the unit project.
- `pnpm test:e2e` runs real CLI or browser-backed tests sequentially.
- Run only the relevant E2E subset when a full E2E environment is unavailable.
- For live Lark verification, follow the local instructions in [AGENTS.md](AGENTS.md)
  and the runbook for your deployment environment.

## Pull Requests

Use `type(scope): <Chinese summary>` for the title and commit messages. Write the PR body in Chinese, include actual verification results, describe the regression surface, and attach screenshots for UI changes.
