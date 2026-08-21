# CLI Adapters

Each supported CLI has an adapter file implementing `CliAdapter` from
`types.ts`. `registry.ts` is the adapter source of truth.

## Adding an Adapter

1. Add the adapter file and implement `CliAdapter`.
2. Add its ID to `CliId` in `types.ts`.
3. Register its executable, factory, export, and switch case in `registry.ts`.
4. Append its stable setup number and display label in
   `src/setup/bot-config-editor.ts`. Never reuse or reorder existing numbers.
5. Add the same display name to `CLI_DISPLAY_NAMES` in `src/worker.ts` and
   `cliDisplayNames` in `src/im/lark/card-builder.ts`.
6. Add adapter, setup, and sandbox tests as applicable.

Do not maintain a separate CLI list in the README. The registry and setup
options are authoritative.

## Isolation and Sandbox

The Linux file sandbox starts from a fresh tmpfs root and binds only paths
allowed by `fs-policy.ts`.

- Put persistent login and CLI state in directory-level `authPaths`. A missing
  single-file path cannot be bound, and tmpfs-only state disappears when the
  sandbox exits.
- Include any transcript or event directory that the daemon must read. Otherwise
  resume and output bridging cannot observe the CLI state.
- Keep `authPaths` narrow. They are writable and must not expose unrelated
  settings, hooks, plugins, Skills, or history.
- For adapters using `supportsReadIsolation`, CLI data is redirected into the
  isolated bot home. `authPaths` inside the original data root are intentionally
  removed by `authPathsSurvivingCliDataRedirect`; provision required state into
  the isolated home instead.
- Use `multiUserBaseline` only for host-installed tools that are safe to share.
  Never inherit credentials, settings, caches, or locks.

Run the relevant project tests, including `test/cli-adapters.test.ts`,
`test/bot-config-editor.test.ts`, and `test/sandbox.test.ts`. When changing auth
or persistent state, also launch the real CLI through `prepareDirectSandbox` and
confirm that login, state, transcript bridging, and resume survive a restart.
