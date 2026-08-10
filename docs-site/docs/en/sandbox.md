# File Sandbox

The file sandbox runs a local Agent CLI under a deny-by-default filesystem policy. It uses Seatbelt on macOS and bubblewrap on Linux with the same three access levels:

- `readWrite`: the CLI can read and modify the path.
- `readOnly`: the CLI can read but not modify the path.
- `deny`: the path is inaccessible.

The deepest matching path rule wins. Mandatory host-security rules always remain enforced.

## Enable It

Use the Dashboard Bot Config page or set `sandbox: true` in `bots.json`:

```jsonc
{
  "name": "oncall-bot",
  "cliId": "claude-code",
  "sandbox": true,
  "sandboxPaths": {
    "readWrite": ["/srv/workspaces/team-a"],
    "readOnly": ["/srv/shared-source"],
    "deny": ["/srv/workspaces/team-a/private"]
  },
  "sandboxNetwork": true
}
```

The baseline policy exposes the session working directory and the bot's own runtime data as writable, exposes required system and toolchain paths as read-only, and denies unmatched paths. `sandboxPaths` adds per-bot rules on top of that baseline.

Rules are resolved to canonical absolute paths. Missing or invalid entries are dropped and logged. Use an existing parent directory when a new file must be writable at session start.

## Behavior

- Writes to `readWrite` paths modify the host directly. The old overlay and `/land` workflow no longer exists.
- Reads outside the policy are denied instead of falling back to host-wide visibility.
- CLI credentials redirected into the bot's private runtime directory remain usable without exposing sibling bot data.
- Existing CLI processes keep the policy they started with. Cold-start a session to apply a changed policy.
- `botmux send` continues through the daemon-mediated relay without exposing Lark credentials to the CLI.

## Network

Network access remains enabled by default. On Linux, set `sandboxNetwork: false` to use a separate network namespace. This may break model APIs, package managers, Git remotes, and proxies. Seatbelt currently does not apply this network switch on macOS.

## Backend Compatibility

- PTY and tmux support the local sandbox.
- Zellij, Zmx, Herdr, and other backends that own the child process fail closed when local sandboxing is requested.
- Riff runs remotely and uses its own sandbox, so botmux skips local confinement.

## Legacy Configuration

The daemon migrates these legacy fields automatically:

| Legacy | Current |
| --- | --- |
| `readIsolation: true` | `sandbox: true` |
| `readDenyExtraPaths` | `sandboxPaths.deny` |
| `sandboxHidePaths` | `sandboxPaths.deny` |
| `sandboxReadonlyPaths` | `sandboxPaths.readOnly` |

Prefer the current fields for new configuration. See the [bots.json reference](/en/bots-json) for the complete schema.

## Safety Notes

1. Review `readWrite` paths carefully because writes are direct.
2. Keep sensitive credentials outside allowed paths or add explicit `deny` rules.
3. Treat network access as a separate policy decision.
4. Use version control or worktrees when changes need review before landing.
