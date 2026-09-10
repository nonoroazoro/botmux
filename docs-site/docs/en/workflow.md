# Knowledge, Skills, and Workflows

Botmux stores reusable capabilities in personal and team libraries:

| Type | Purpose |
| --- | --- |
| Knowledge | Durable facts, terminology, and decisions |
| Skill | Reusable methods that guide the agent's judgment |
| Workflow | A repeatable process with inputs, steps, branches, and success criteria |

Ask the bot to create, update, find, or run a capability in natural language.
The current agent authors and executes Workflows with its normal tools.
Botmux handles scope, authorization, revisions, confirmation cards, and storage.

## Personal and team scope

Personal capabilities are available only to their owner in a private conversation
with the bot. A shared group cannot read another user's personal library.
Team capabilities belong to the bot's shared library.

Create, update, and delete operations require the appropriate confirmation card.
A user can save a personal capability and propose it to the team. The bot owner
approves the separate team contribution. Saved revisions are immutable.

## Workflow trial

A Workflow draft defines its inputs, steps, success criteria, and failure handling.
The bot presents a trial confirmation card before executing the draft. The trial
uses the current agent and its normal tools. A successful trial must include the
observed outcome and any limitations before the user confirms saving.

Changing the draft requires a new trial confirmation. A trial token is bound to
the exact draft and initiating session.

## Internal commands

The bot invokes these commands for the user:

```bash
botmux artifact list --scope personal --type workflow
botmux artifact show --scope personal --name release-check
botmux artifact history --scope personal --name release-check
```

The internal `bot` scope selects the team library. Authorization is derived from
the active session; passing a scope does not grant access.
