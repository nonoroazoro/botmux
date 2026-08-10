# Legacy `readIsolation` Migration

`readIsolation` predates the unified file sandbox. New deployments should use `sandbox: true` and `sandboxPaths` instead.

At daemon startup, botmux migrates legacy fields while retaining them on disk for downgrade compatibility:

| Legacy field | Current field |
| --- | --- |
| `readIsolation: true` | `sandbox: true` |
| `readDenyExtraPaths` | `sandboxPaths.deny` |
| `sandboxHidePaths` | `sandboxPaths.deny` |
| `sandboxReadonlyPaths` | `sandboxPaths.readOnly` |

## Current Configuration

```jsonc
{
  "larkAppId": "cli_team",
  "cliId": "codex",
  "sandbox": true,
  "sandboxPaths": {
    "readWrite": ["/srv/team-workspace"],
    "readOnly": ["/srv/shared-source"],
    "deny": ["/srv/team-workspace/private"]
  },
  "sandboxNetwork": true
}
```

The unified policy is deny-by-default on both macOS and Linux. It compiles to Seatbelt on macOS and bubblewrap on Linux. The deepest matching path rule wins, while mandatory host-security rules cannot be overridden.

The sandbox applies to locally owned PTY and tmux launches. Unsupported local backends fail closed. Riff executes remotely and uses its own sandbox, so local confinement is bypassed there.

## Upgrade Procedure

1. Update `bots.json` or use the Dashboard sandbox controls.
2. Restart the daemon.
3. Cold-start affected sessions when a policy change must replace an already running process.
4. Verify the effective policy and confirm denied paths cannot be read.

```bash
pnpm build
pnpm daemon:restart
pnpm daemon:status
```

Do not run the same Lark app from two daemons at once. They will compete for the same event stream.

For current behavior and configuration, use the [File Sandbox guide](../docs-site/docs/en/sandbox.md) and [bots.json reference](../docs-site/docs/en/bots-json.md).
