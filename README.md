# botmux

[中文](README.zh.md)

botmux connects Feishu or Lark to AI coding CLIs such as Codex and Claude Code.
Each conversation runs in its own CLI session and can be followed from Feishu,
the dashboard, or a Web Terminal.

## This is an independent fork

This repository has fully diverged from the original
[deepcoldy/botmux](https://github.com/deepcoldy/botmux). It is not expected to
remain compatible with upstream releases, configuration, or documentation.
Upstream changes are adopted only when they fit this fork.

## What changed and why

### One assistant, many isolated users

Each user can have a separate home, workspace, CLI configuration, login, and
session identity. Shared tools remain available, but private state does not leak
between users.

For example, two people can use the same bot on a shared server without sharing
CLI history, credentials, repositories, or personal assistant data. A card can
only be confirmed by the user who requested it.

### Feishu conversations behave like conversations

In a group lobby, an explicit mention of the bot anywhere in the message starts
a session. Inside the resulting topic, users can continue without mentioning it
again. On the first turn, the agent can read paginated group or direct-message
history when earlier discussion is needed. Mentions such as `@Alice` remain part
of the request, so the agent can decide whether Alice's messages are relevant.

This keeps routing predictable while still allowing requests such as "check the
bug Alice described above" to work naturally.

### Knowledge, Skills, and Workflows

Users can build a personal assistant through conversation:

- **Knowledge** records facts and conventions.
- **Skills** record reusable task instructions.
- **Workflows** record parameterized processes that the agent can run again.

All three support create, view, search, update, revision history, and delete.
They can belong to one user or to the whole bot. Personal changes require that
user's confirmation. Team contributions require a bot owner's approval.

For example, a user can ask the bot to remember a release checklist, or turn a
successful release process into a reusable Workflow. The LLM writes and runs
the semantic content; code handles permissions, validation, cards, persistence,
and confirmed changes.

### Local code is the source of truth

Before reading or changing a repository, the agent clones it into the user's
workspace, returns an existing checkout to its default branch, and updates it.
Remote code search is not used unless the user explicitly asks for it.

This avoids answers based on stale branches or remote snippets that do not match
the code the agent will actually edit.

### Unattended execution with guarded recovery

Coding CLIs are prepared to run without routine workspace-trust or permission
prompts. Real blockers such as login can still require the user.

If a Codex-backed session explicitly hits a cybersecurity policy block, the
requesting user receives a dedicated confirmation card. Confirming starts a new
conversation with a conservative defensive-review strategy while keeping the
same workspace, Feishu topic, reply route, and Web Terminal link. Normal
conversations never enter this flow.

### The bot owns its identity

Feishu cards and messages use the configured bot name and description. Users see
the configured assistant identity rather than the botmux gateway brand. Empty
or invalid trusted metadata is not injected into the CLI. User messages are
forwarded unchanged.

## What remains from the original project

The fork retains the useful gateway foundation: live Feishu cards, Web Terminal,
multi-bot and multi-CLI routing, persistent sessions, dashboard management,
scheduled tasks, external triggers, and Feishu/Lark support.

The adapter source of truth is
[`src/adapters/cli/registry.ts`](src/adapters/cli/registry.ts).

## Development

Node.js 22 or newer and pnpm are required.

```bash
pnpm install
pnpm build
pnpm use:here
botmux setup
pnpm daemon:start
```

Run the main checks before submitting changes:

```bash
pnpm build
pnpm test
pnpm workflow-core:test
```
