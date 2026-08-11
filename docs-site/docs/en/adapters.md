# Multi-CLI Adapters

botmux bridges different CLIs and agents through adapters selected via `cliId` in `bots.json`. **Local adapters each run as their own process**. Under the default tmux backend you can `tmux attach` into the real process; explicit pty, zellij, and herdr backends differ.

**Applies to**: when you want to switch the underlying CLI, or wire up a new tool, and need its `cliId` and whether it takes a `model` param.
**Doesn't apply**: strict Codex-compatible distributions and generic wrappers / gateways do not need new adapters. See [Codex-compatible distributions](#codex-compatible-distributions) and [Wrapper / gateway integration](#wrapper--gateway-integration) below.

## Supported CLIs / Agents

The table lists the current built-in adapters (the **authoritative source** for `cliId`s is [`src/adapters/cli/registry.ts`](https://github.com/deepcoldy/botmux/blob/master/src/adapters/cli/registry.ts), which changes across versions):

| `cliId` | CLI / Agent | Integration | `model` |
|---------|-----|-----|:--:|
| `claude-code` | Claude Code (default) | local process | ✅ |
| `codex` | Codex CLI | local process | ✅ |
| `codex-app` | Codex App | local process (app-server protocol) | |
| `gemini` | Gemini | local process | ✅ |
| `cursor` | Cursor (cursor-agent) | local process | ✅ |
| `opencode` | OpenCode | local process | ✅ |
| `antigravity` | Antigravity (agy) | local process | |
| `copilot` | GitHub Copilot | local process | ✅ |
| `grok` | Grok (grok-cli) | local process | ✅ |
| `kimi` | Kimi Code | local process | ✅ |
| `kiro-cli` | Kiro | local process | |
| `pi` | Pi | local process | |
| `oh-my-pi` | Oh-My-Pi (Pi fork) | local process | ✅ |
| `coco` | CoCo / Trae (requires ≥ 0.120.32) | local process | ✅ |
| `traex` | TRAE CLI (traex) | local process | ✅ |
| `mtr` | MTR | local process | |
| `hermes` | Hermes | local process | |
| `genius` | Genius | local process | ✅ |

> The `model` field only takes effect for adapters that support a model parameter; others ignore it.

## Codex-compatible distributions

BotMux separates protocol capability from distribution identity: `cliId: "codex"` selects the Codex protocol adapter, while `cliRuntime` selects the independently released executable that actually runs. A compatible fork can therefore reuse model arguments, resume, idle detection, and gated RPC without being checked against the official Codex version stream.

Use `cliRuntime` only for a **strictly compatible fork**: it must accept the arguments BotMux sends to Codex, preserve the same interaction state and rollout / resume semantics, and use a compatible authentication / home layout. If it changes arguments, the TUI state machine, session storage, or protocol, it needs a real adapter instead of a compatibility declaration.

See the [`bots.json` Codex-compatible distributions section](/en/bots-json#codex-compatible-distributions) for the complete config and update-provider behavior. The Dashboard Bot Defaults page can also configure and preflight a runtime. Existing `cliPathOverride` configs remain supported, but do not automatically enable Codex RPC features that require an explicit compatibility declaration.

## Wrapper / gateway integration

In many cases you don't run the native CLI directly but wrap it with a gateway or router, such as `ccr` or another custom launcher. In this case you **don't need a new adapter**: `cliId` still holds the real underlying CLI (`claude-code` / `codex` …), and you only swap the launch entry point for a **wrapper script**, pointing to it with `cliPathOverride` (the "CLI executable path override" when editing a bot in `botmux setup` is exactly this).

**Four general steps:**

1. **Log in to the gateway first** (one-time): complete the SSO login as the **same system user** that runs the daemon; the token is cached in that user's home directory. An expired token will pop an interactive login that blocks the PTY, so keep the login state alive.
2. **Write the wrapper script** in `~/.botmux/bin/`, passing the arguments botmux injects through to the real CLI (note: some gateways reject the `--settings` botmux injects, so strip it in the script).
3. **`chmod +x` to add the executable bit (the easiest one to miss!)** — botmux uses node-pty to exec the script directly; without the executable bit you get `EACCES`, the CLI exits immediately on launch, and the bot crashes and restarts.
4. **Verify by executing the script directly** (use `~/.botmux/bin/xxx --version`, don't test with `bash xxx` — running via bash doesn't need the executable bit and will mask the problem in step 3). Then configure `cliPathOverride` in `bots.json` (use an **absolute path**, not `~`), and run `botmux restart` to take effect.

For the **specific wrapper scripts** of each gateway, use the docs published by the corresponding CLI / gateway team. This public repository intentionally does not include internal document links or copied internal content.

- **MTR** — community-contributed, `npm i -g @metamove-code/mtr-cli@latest`
>
> A general technique for troubleshooting wrapper issues: run `botmux logs`, find the `Spawning fresh CLI:` line, copy the full command, and run it manually locally to pinpoint the problem (permissions / argument blacklist / login state).

## Adding a new adapter (contributors)

1. Create a new file under `src/adapters/cli/` implementing the `CliAdapter` interface
2. Add the new ID to the `CliId` union type in `src/adapters/cli/types.ts`
3. Add the import / switch case / export in `src/adapters/cli/registry.ts`
4. Add the display name to `CLI_DISPLAY_NAMES` in `src/worker.ts` and `cliDisplayNames` in `card-builder.ts`
5. Add an option to the setup interactive menu in `src/cli.ts`
6. Update the README

See [CONTRIBUTING.md](https://github.com/deepcoldy/botmux/blob/master/CONTRIBUTING.md) for details.
