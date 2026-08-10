# botmux

Feishu and Lark gateway for isolated AI coding CLI sessions. The adapter source of truth is `src/adapters/cli/registry.ts`. Node.js 22 or newer is required.

After implementation changes, run `pnpm build` and relevant tests. CI runs `pnpm build`, `pnpm test`, and `pnpm workflow-core:test`.

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
