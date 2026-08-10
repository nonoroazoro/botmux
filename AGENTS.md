# botmux

Feishu and Lark gateway for isolated AI coding CLI sessions. The adapter source of truth is `src/adapters/cli/registry.ts`. Node.js 22 or newer is required.

## Working Rules

- Think in English, communicate in Chinese, and keep technical terms in English.
- Be direct and concise. Identify problems and fix them.
- Write generated artifacts in English unless the user requests another language or the content is localized UI copy.
- Do not use Em Dash characters in generated artifacts.
- Treat concurrent user edits as authoritative. Re-read files after interruptions and never revert user changes without explicit approval.
- Before web search or scraping, check the site's `llms.txt`. Clone open source repositories and search them locally.

## Code and Tests

- Prefer clean, minimal, performance-first designs that match existing patterns.
- Keep one definition per file. Use PascalCase only for definition filenames; use lowercase for other filenames.
- Prefix private class members with `_`.
- Export through `index.ts` barrels with `export * from`. Do not use default exports or deep imports.
- Never use TypeScript non-null assertions.
- Write all new or modified code comments and JSDoc in English. Localized user-facing copy may use its target language.
- Use multi-line JSDoc, `{@link TypeName}` references, and `@param node The node.` formatting.
- Test paths mirror source paths. Mocks must satisfy the real types.
- Use project scripts instead of raw test runners.

## Build and Runtime

```bash
pnpm build
pnpm test
pnpm workflow-core:test
pnpm daemon:restart
pnpm daemon:logs
pnpm daemon:status
```

- Run `pnpm build` after implementation changes and tests proportional to the affected surface.
- CI runs `pnpm build`, `pnpm test`, and `pnpm workflow-core:test`.
- Restart the daemon when a change needs local or Feishu verification.

### Checkout Wrapper

`~/.botmux/bin/botmux` points to the checkout that most recently claimed it.

```bash
pnpm use:here
pnpm switch:here
BOTMUX_NO_CLAIM=1 pnpm use:here
```

`pnpm build` does not claim the wrapper. `pnpm switch:here` builds and claims it. See `scripts/claim-botmux-bin.mjs`.

For local live verification:

```bash
pnpm switch:here
pnpm daemon:restart
```

Use `pnpm daemon:restart`, not a bare `botmux restart`. Every configured bot will use the claimed checkout, so switch back to the canonical checkout before deleting a temporary worktree.

### devbox1 Deployment

`devbox1` is an interactive zsh alias for an SSH command, not an SSH hostname. devbox1 uses `/usr/lib/node_modules/botmux`, `/usr/bin/botmux`, and `~/.botmux`.

Build and transfer the current checkout, including uncommitted changes:

```bash
pnpm build
deploy_dir="$(mktemp -d /private/tmp/botmux-deploy.XXXXXX)"
pnpm pack --pack-destination "$deploy_dir"
devbox_target="$(zsh -ic 'alias devbox1' | sed -E "s/^devbox1='ssh ([^']+)'$/\1/")"
test -n "$devbox_target"
scp "$deploy_dir"/botmux-*.tgz "$devbox_target:/tmp/botmux-deploy.tgz"
zsh -ic devbox1
```

Then run on devbox1:

```bash
sudo -n npm i -g /tmp/botmux-deploy.tgz
/usr/bin/botmux restart
/usr/bin/botmux status
```

Confirm `botmux-0` and `botmux-dashboard` are `online`, and verify a change-specific marker under `/usr/lib/node_modules/botmux/dist/`. Do not modify `~/.botmux` configuration. Plain `npm i -g` fails because the global package is root-owned.

## Architecture and Impact

- `src/index-daemon.ts`, `src/daemon.ts`, `src/worker.ts`: daemon and worker lifecycle.
- `src/cli.ts`, `src/cli/`: CLI commands.
- `src/adapters/cli/`, `src/adapters/backend/`: CLI runtimes and PTY, tmux, Zellij, Zmx, Herdr, and Riff backends.
- `src/core/`, `src/services/`: shared runtime logic, policies, stores, sessions, scheduling, isolation, and IPC.
- `src/im/lark/`: Lark events, API clients, parsing, cards, and grants.
- `src/dashboard.ts`, `src/dashboard/`, `src/workflows/`, `src/vc-agent/`, `src/platform/`, `src/desktop/`: dashboard and extended runtime surfaces.

Before editing, assess impact across:

- macOS and Linux, especially paths, shells, processes, PTYs, permissions, and encoding.
- All affected CLIs and shared adapter utilities. Validate one unrelated CLI when shared code changes.
- PTY, tmux, Zellij, Zmx, Herdr, and Riff backends where relevant.
- Direct, group, topic, chat-scoped, thread-scoped, adopt, restore, scheduled, substitute, Workflow v3, and meeting sessions.
- Sandbox, multi-user isolation, read isolation, API-only mode, talk grants, owner-only actions, and daemon IPC authorization.

Shared changes in `src/core/`, `src/services/`, `src/config.ts`, `src/bot-registry.ts`, `src/im/lark/`, or `src/worker.ts` require the broadest regression review.

## Pull Requests and Releases

- Use `type(scope): <Chinese summary>` for PR titles and commit messages. Write PR descriptions in Chinese.
- Explain what changed, why, impact, and actual verification. Include screenshots for card, dashboard, desktop, or web-terminal UI changes.
- Do not include real Feishu member names or internal bot-review labels in public Git history. `Co-authored-by` trailers are allowed.
- Regular commits and pushes do not release. Create a `v*` annotated tag only when explicitly requested.
- Do not edit `package.json` versions manually. Use a Chinese tag message.
- Stable releases must contain the latest `origin/master` and pass the release authority gate.
- `-canary.N`, `-beta.N`, and `-rc.N` map to their npm dist-tags; other prereleases map to `next` without changing `latest`.
- The release workflow publishes npm and the GitHub Release first, then attaches signed macOS assets asynchronously.
