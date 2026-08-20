# botmux

Feishu and Lark gateway for isolated AI coding CLI sessions. The adapter source of truth is `src/adapters/cli/registry.ts`. Node.js 22 or newer is required.

After implementation changes, run `pnpm build` and relevant tests. CI runs `pnpm build`, `pnpm test`, and `pnpm workflow-core:test`.

## Deterministic Code and LLM Boundaries

Use deterministic code whenever the behavior can be specified and verified precisely. This includes schemas, validation, permissions, authorization, scope, CRUD, state transitions, cards, i18n, persistence, revisions, conflicts, and recovery.

Use the active LLM for semantic work. This includes intent and artifact type classification, Knowledge/Skill/Workflow creation and revision, context extraction, quality review, trial interpretation, and Dynamic Workflow execution with the tools available in the current session.

Keep the handoff explicit: the LLM proposes content and performs semantic work; code validates the structured boundary, presents confirmation, and commits approved mutations. Do not replace semantic authoring or execution with hardcoded rules, a specialized runner, or a secondary model merely to make the flow appear more engineered. Do not add a code gate that claims to verify a semantic outcome when code cannot actually verify it.

## Local Checkout

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
