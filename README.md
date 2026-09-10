<div align="center">
  <img src="src/dashboard/web/favicon.png" alt="botmux logo" width="120" />
  <h1>botmux</h1>
  <p><strong>Feishu and Lark gateway for isolated AI coding CLI sessions</strong></p>
  <p>Talk to Codex, Claude Code, Gemini, OpenCode, and other coding CLIs from a real conversation.</p>
  <p>
    <a href="README.zh.md">中文</a> ·
    <a href="docs-site/docs/en/quickstart.md">Quick Start</a> ·
    <a href="docs-site/docs/en/architecture.md">Architecture</a> ·
    <a href="docs-site/docs/en/personality.md">Bot Personality</a>
  </p>
</div>

> **Independent fork:** This repository is an independent fork of
> [deepcoldy/botmux](https://github.com/deepcoldy/botmux), not an official
> upstream distribution. It has fully diverged and does not preserve
> compatibility with upstream releases, configuration, or documentation.

## Overview

Botmux connects Feishu or Lark to real AI coding CLI processes. A conversation
can own a persistent CLI session, stream terminal output back to chat, and open
the same process from the Web Terminal or a local terminal.

It bridges the complete CLI instead of rebuilding a smaller agent on an Agent
SDK. Native memory, context management, tools, hooks, Skills, MCP servers, plan
mode, and slash commands remain available.

## Main changes in this fork

This fork keeps the original gateway model, but substantially rebuilds the
surrounding architecture and product experience for long-running bots, shared
servers, and real Feishu collaboration. The capabilities below are implemented
by this repository and are not upstream feature documentation.

| New capability | Description |
|------|------|
| Multi-user isolation | Shared provider accounts and capabilities with separate user runtime state, workspace, Git and SSH identity, history, and session identity |
| Feishu conversation model | Mention routing anywhere in a lobby message, natural follow-ups inside topics, paginated history, group context, topic branches, session forks, and interactive polls |
| Bot personality | Stable Soul, context-specific Role, lifecycle-aware Agent Context, and restrained semantic reactions |
| Assistant capability library | Personal and team Knowledge, Skills, and Workflows with isolated ownership, revisions, review, and controlled publication |
| Authorization | Separate talk and operate permissions, `/grant` request cards, expiry, message quotas, revocation, command restrictions, owner approval, and user-level OAuth |
| Local code workflow | Local repository checkouts are the source of truth instead of remote snippets or stale search results |
| Runtime and recovery | Persistent Ask cards and state, guarded retries, native context preservation, tmux, ZMX, and file sandbox support |
| Bot management and integrations | Centralized Dashboard configuration, automated Feishu app setup, multi-bot and cross-deployment collaboration, API-only mode, Issue Board, schedules, and On-Call |

## Multi-user isolation

Multiple users can use the same deployment-owned AI provider account and global
CLI capabilities while keeping CLI history, repositories, mutable state, and
personal assistant data separate. Each user has an independent home, workspace,
CLI runtime data, Git and SSH identity, and session identity. Global AGENTS.md,
Skills, plugins, and system tools remain available without sharing user-produced
state. See [Global Provider and User Runtime Isolation](docs/design/2026-09-08-global-provider-user-runtime-isolation.md).

Multi-user mode also isolates Feishu history reads, attachment paths, and
session data, preventing one user from reaching another user's session or local
files.

## Feishu conversation model

The conversation model follows normal Feishu usage. Mention the bot anywhere in
a lobby message to start a task, then continue inside the topic without
repeating the mention. When earlier discussion matters, the agent can read
paginated group or direct-message history and receive relevant group context
when members or topics join. Mentions such as `@Alice` remain part of the
original request so the model can decide whether Alice's messages are relevant.

The same task can be branched into a child topic or a parallel session with
`/fork`. `/adopt` attaches a locally running CLI, and `/relay` moves a session
to another topic while preserving its context and permission boundary.

Interactive polls support both people and bots. A bot can create a poll and
vote in it, and the result returns to the session as a normal Feishu
interaction event.

## Bot personality

Every bot has a built-in **Soul** that defines its stable judgment and
communication style. The owner can replace it with custom Markdown in the
Dashboard. The existing **Role** system remains separate and defines what the
bot is responsible for in the current group.

```text
Agent Context = Soul + effective Role + enabled capability policy
```

The full Agent Context is delivered when a conversation starts, when its
revision changes, or after the native CLI context resets. It is not repeated on
every ordinary turn.

The active model may add one restrained reaction to the exact user message that
started the current turn:

- `yes` for a clearly correct understanding
- `no` before correcting a materially incorrect premise
- `heart` for genuine warmth, appreciation, or support
- `like` for a useful contribution or good decision
- `done` for a clearly completed outcome

Most messages receive no reaction. The model makes the semantic decision; the
daemon owns target binding, authorization, idempotency, and rate limits. The
bot has no supported interface for rewriting its active Soul. File sandboxing
also blocks direct writes. Without sandboxing, processes running as the same OS
user do not have a strong filesystem boundary. See [Bot Personality](docs-site/docs/en/personality.md).

## Knowledge, Skills, and Workflows

Users can preserve useful results from a conversation as reusable assistant
capabilities instead of explaining the same context and process again:

- **Knowledge** gives the bot durable facts, terminology, decisions, and
  conventions to remember.
- **Skills** teach the bot reusable methods, judgment guidelines, and task
  instructions for a category of work.
- **Workflows** define repeatable processes with inputs, steps, branches,
  success criteria, and failure handling. The current bot runs them with its
  existing tools.

Users manage all three through natural conversation. Each capability belongs
either to a personal library or to the bot's team library. Personal capabilities
are available only to their owner in private conversations and are never loaded
into shared group conversations. Team capabilities are shared across that bot's
conversations.

Personal content is managed by its owner. A user can propose a portable personal
capability to the team; publishing or deleting team content requires bot owner
approval. Every saved change creates an immutable revision. Before a Workflow is
saved, the current bot runs the exact draft as a confirmed trial and reports the
observed result and limitations. See [Knowledge, Skills, and Workflows](docs-site/docs/en/workflow.md).

## Authorization

Permissions are divided into two layers:

- **Talk (`canTalk`)**: who can ask questions, view logs, and read code. Access
  can be opened for a group or granted to selected users through `globalGrants`
  or `/grant`. By default, only the owner can talk to the bot.
- **Operate (`canOperate`)**: who can change directories, restart or close a
  session, or click cards that change session state. This is controlled by
  `allowedUsers` and normally belongs only to the owner.

The authorization flow is also explicit and recoverable:

- An unauthorized group member who mentions the bot can trigger a request card
  sent to the owner, who can approve or reject it.
- `/grant` supports a user, an entire group, an expiry, and a message quota;
  `/revoke` removes the corresponding access.
- Exhausted quotas and expired grants automatically remove talk access without
  affecting the owner's operate access.
- `restrictGrantCommands` can limit per-user grantees to plain conversation,
  without slash commands.
- `p2pOpen` can open direct-message conversation while sensitive operations still
  require `allowedUsers`.
- User calls to services such as cloud documents and calendars use independent
  `/login` OAuth authorization rather than the bot owner's identity.
- Cross-deployment bots enter a dedicated team-trust gate and do not bypass the
  normal permission system to gain operate access.

Changes to shared assistant capabilities require bot-owner approval. Approval
cards, grant cards, and important state are persisted so a daemon restart does
not lose the result.

## Local code workflow

Code tasks use local repository checkouts as their source of truth. Before
reading or modifying code, the agent works from the user's local workspace
instead of remote snippets or stale search results. Attachment paths are
physically resolved so links or symlinks cannot cross the current workspace
boundary.

## Runtime and recovery

Botmux manages the real CLI process and supports tmux, ZMX, and other persistent
session backends. After a daemon restart, machine restart, or worker reconnect,
managed sessions, AskUserQuestion cards, and required recovery state can still
be processed.

Startup, submit confirmation, type-ahead, idle detection, and turn boundaries
are handled consistently across CLI adapters. Codex safe recovery preserves
native context. Login, permission, and policy-gated recovery blockers return
control to the initiator instead of silently widening access.

File sandboxing provides cross-platform default-deny rules, path allowlists, and
boundary validation. For lighter deployments, core-only and API-only bots can
be driven through an HTTP control API without Feishu message transport.

## Bot management and integrations

The Dashboard provides Bot, Session, Group, Team, Schedule, Issue
Board, monitoring, and insight panels. Each bot can configure its CLI, defaults,
Role, Soul, reactions, cards, multi-user isolation, and runtime backend.

`botmux setup` initializes the Feishu app, requests permissions, and configures
events. Cards, messages, Ask prompts, and approval notices use the configured
bot identity rather than presenting the botmux gateway as the assistant. Bots
can collaborate in one group or create cross-deployment collaboration groups
through team relationships.

Issue Board covers claiming, group creation, repository binding, execution,
completion, and release, with a local outbox and crash recovery. Schedules,
Webhooks, On-Call, plugins, and Workflows extend one-off conversations into
ongoing automation.

## Quick start

Node.js 22 or newer is required.

```bash
npm install -g botmux
botmux setup
botmux start
botmux dashboard
```

See the [5-minute setup guide](docs-site/docs/en/quickstart.md) for Feishu app
permissions, event subscriptions, CLI installation, and bot configuration.

## Development

Node.js 22 or newer and pnpm are required.

```bash
pnpm install
pnpm build
pnpm use:here
botmux setup
pnpm daemon:start
```

Run the complete verification set before handing off changes:

```bash
pnpm build
pnpm test
```

The CLI adapter registry is
[`src/adapters/cli/registry.ts`](src/adapters/cli/registry.ts).
