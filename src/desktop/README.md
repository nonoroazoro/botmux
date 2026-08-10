# Botmux Desktop

Botmux Desktop is a macOS app that bundles a matching Node.js runtime, botmux build, and PM2. It supports Intel and Apple Silicon.

## Release Builds

The `Release` workflow publishes npm and creates the GitHub Release first. The protected macOS job then builds, signs, notarizes, staples, and attaches Universal DMG and ZIP assets asynchronously.

The signing job requires the authorized release actor and approval for the protected `macos-signing` environment. Store these values as environment secrets, not repository secrets:

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_API_KEY_P8`
- `APPLE_API_KEY_ID`
- `APPLE_API_ISSUER`

Prerelease tags still publish their npm dist-tag and GitHub prerelease, but unauthorized runs skip signed desktop assets. If signing is delayed or fails, the npm package and GitHub Release remain available without desktop assets.

To rebuild assets for an existing release, manually run the `Release` workflow with `release_tag`. This refreshes macOS assets without republishing npm, moving the tag, or rewriting the release body.

## Local Installation

Requirements:

- macOS
- Node.js 22 or newer
- pnpm
- A source checkout

Enable pnpm when needed:

```bash
corepack enable
```

Build and install:

```bash
bash src/desktop/install-local.sh
```

The script installs `/Applications/Botmux.app`, applies an ad hoc signature, removes quarantine, and opens the app. It does not install, upgrade, link, or modify the global `botmux` CLI.

The app shares bot configuration, sessions, and logs under `~/.botmux`, but uses its bundled runtime. It gracefully replaces an existing botmux PM2 fleet without touching user configuration or unrelated applications under the default `~/.pm2`.

Options:

```bash
bash src/desktop/install-local.sh --no-open
bash src/desktop/install-local.sh --skip-build
bash src/desktop/install-local.sh --skip-deps
bash src/desktop/install-local.sh --app-path /Applications/Botmux.app
```

For a source tree without Git version metadata:

```bash
BOTMUX_DESKTOP_VERSION=2.103.0 bash src/desktop/install-local.sh
```

## Update and Verify

Pull the desired source and run the installer again. Verify the installed app with:

```bash
pnpm desktop:smoke --skip-dashboard
```

Use `pnpm desktop:smoke` when the current source runtime is already running and dashboard checks should be included.

Local ad hoc builds are for development only. Distribute the signed and notarized release assets instead.
