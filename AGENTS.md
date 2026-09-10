# botmux

Feishu and Lark gateway for isolated AI coding CLI sessions. Node.js 22 or newer
and pnpm are required. CLI adapters are registered in
`src/adapters/cli/registry.ts`.

## Engineering Rules

- Write source, tests, comments, prompts, Skills, and internal docs in concise
  English. Only localized user-facing UI and terminal text may use other
  languages.
- Preserve user identity, workspace isolation, and exact-initiator authorization.
  Never widen a personal action to another user or group member.
- Use deterministic code for schemas, validation, permissions, CRUD, cards,
  i18n, persistence, state transitions, and recovery.
- Use the active LLM for semantic work, including intent classification,
  Knowledge/Skill/Workflow authoring, context extraction, review, and Workflow
  execution. Code validates and commits confirmed results.
- Do not replace semantic work with hardcoded rules or a secondary model. Do not
  claim code has verified an outcome it cannot determine.

## Verification

Run `pnpm build` and relevant tests after implementation changes. Before a full
handoff, run:

```bash
pnpm build
pnpm test
```

## Local Checkout

`~/.botmux/bin/botmux` points to the checkout that most recently claimed it.

```bash
pnpm use:here       # claim an existing build
pnpm switch:here    # build and claim
pnpm daemon:restart
```

`pnpm build` does not claim the wrapper. Use `pnpm daemon:restart`, not a bare
`botmux restart`, for local verification. Switch back to the canonical checkout
before deleting a temporary worktree.
