
import {
  ARTIFACT_MANAGER_SKILL,
  KNOWLEDGE_CREATOR_SKILL,
  SKILL_CREATOR_SKILL,
  WORKFLOW_CREATOR_SKILL,
} from './artifacts/index.js';

export interface SkillDef {
  /**
   * Filesystem-safe directory name.
   */
  name: string;
  /**
   * Complete Markdown content with YAML frontmatter.
   */
  content: string;
}

const SCHEDULE_SKILL = `---
name: botmux-schedule
description: Create and manage reminders or recurring tasks in the current Lark conversation with botmux schedule. Use for explicit reminders, cron-like schedules, delayed execution, recurring monitoring, or direct botmux schedule requests.
---

# Schedule

Use this skill for conversation-bound scheduled tasks. Confirm the schedule and task content before creating one. In a Lark session, omit chat and topic identifiers unless the user explicitly chooses another delivery position.

## Commands

\`\`\`bash
botmux schedule add "<schedule>" "<prompt>" [--name <name>] [--top-level | --topic --root-msg-id <om_...> | --new-topic [--topic-title <title>]] [--silent]
botmux schedule list
botmux schedule pause <id>
botmux schedule resume <id>
botmux schedule remove <id>
botmux schedule run <id>
\`\`\`

Accepted schedules include five-field cron, one-time durations such as \`30m\`, recurring intervals such as \`every 2h\`, ISO timestamps, and supported natural-language times.

Use \`--silent\` for monitoring that should notify only when the prompt's alert condition is met. State that condition explicitly. A silent new-topic task creates a hidden session and publishes the topic only on its first \`botmux send\`.

After creation, report the task ID and next run time. The daemon evaluates due tasks every 30 seconds and reuses the task's stored working directory.

For a scheduled cross-chat broadcast, keep the schedule in the current conversation and make its prompt call:

\`\`\`bash
botmux send --top-level --chat-id <target-chat-id> "<content>"
\`\`\`
`;

const CHAT_RENAME_SKILL = `---
name: botmux-chat-rename
description: Rename the current Lark group when the user asks or when a major task phase change makes the existing name misleading.
---

# Rename the Current Chat

\`\`\`bash
botmux chat rename "New chat name"
botmux chat rename "Project | Verification" --proactive
\`\`\`

- Rename only the current group. The executing bot must be a member.
- Execute an explicit user request directly.
- Use \`--proactive\` only for a material goal or phase change. It has a ten-minute debounce.
- Prefer a stable topic with a short phase suffix. Avoid percentages, sensitive data, or evaluative language.
- On success, report the final name. On failure, report the error and an actionable remedy.
`;

const HISTORY_SKILL = `---
name: botmux-history
description: Read paginated Lark history when the current turn needs chat context outside the active session.
---

# Lark History

Read one page at a time. Start with the newest page. Messages within each page are chronological.

- Automatic lookup is allowed only when a first-turn prompt hint says earlier context may be needed and the current request depends on it.
- In an existing topic, use session context unless the user explicitly requests history outside the topic.
- Treat mentions as semantic context. If the user asks about a mentioned person's messages, use the open ID from prompt metadata to filter results. Do not fetch history when the mention only assigns work or references someone.
- When \`hasMore=true\` and relevant context may remain, repeat the same scope with \`--cursor <nextCursor>\`.

\`\`\`bash
botmux history
botmux history --scope ambient
botmux history --scope chat
botmux history --scope ambient --cursor <nextCursor>
botmux history --page-size 20
\`\`\`

Scopes:

- \`thread\`: current topic
- \`chat\`: complete group or direct-message chat
- \`ambient\`: group messages before and outside the current topic
- \`session\`: resolves to thread or chat from the session

The JSON response contains \`messages\`, \`hasMore\`, and \`nextCursor\`. Use \`botmux quoted <messageId>\` to download resources or inspect a full card. Add \`--with-card-json\` only when structured card data is required.
`;

const QUOTED_SKILL = `---
name: botmux-quoted
description: Read a referenced Lark message and download its resources when a prompt quote hint or a message ID from history is relevant to the task.
---

# Read a Message by ID

When the prompt says \`[The user quoted a message ...]\`, decide whether the quoted content is needed. Run this command only when it is relevant:

\`\`\`bash
botmux quoted <message_id>
botmux quoted <message_id> --raw
\`\`\`

The command accepts any accessible message ID. It returns normalized message JSON and downloads visible images or files into the returned \`attachments\` paths. Use \`--raw\` when the original body or exact \`cardJson\` field is required. Image and file placeholders correspond by index to \`resources\` and \`attachments\`.
`;

const SEND_SKILL = `---
name: botmux-send
description: Deliver agent-authored text, cards, images, files, video previews, or mentions to Lark. Use --attention only when progress is blocked on human authorization, credentials, access, or an irreversible decision.
---

# Send to Lark

Users cannot see terminal output. Deliver every user-visible message with \`botmux send\`. A successful exit code means the message was delivered; do not resend because the CLI reports no visible output.

This skill defines transport only. It does not decide what the agent should say or when a reply is warranted.

## Content

Use a positional argument only for simple single-line text. Use a quoted heredoc, stdin, or a UTF-8 \`--content-file\` for Markdown, backticks, shell fragments, multiline text, non-ASCII PowerShell content, or emoji. Do not JSON-stringify normal content or encode newlines as literal \`\\n\`.

\`\`\`bash
botmux send --mention-back "Done"

botmux send --mention-back <<'EOF'
## Result

- Item A
- Item B
EOF

botmux send --content-file /tmp/message.md --mention-back
\`\`\`

Inside a single-quoted heredoc, write backticks directly. Do not escape them.

On Windows, write non-ASCII or multiline content to a UTF-8 file before sending it:

\`\`\`powershell
$messageFile = Join-Path $env:TEMP 'botmux-message.md'
Set-Content -LiteralPath $messageFile -Encoding utf8 -Value $content
botmux send --content-file $messageFile --mention-back
\`\`\`

Body precedence is \`--content-file\`, then the positional argument, then stdin. Only \`--card-json\` and \`--card-file\` are parsed as JSON. Do not pre-escape a shell command for an outer tool protocol, and do not expect literal \`\\n\` sequences to become newlines. Avoid command substitution for message bodies.

## Attachments and cards

\`\`\`bash
botmux send --images chart.png --images table.png --mention-back <<'EOF'
## Report
![Trend](img:0)
![Details](img:1)
EOF

botmux send --files /tmp/report.pdf --mention-back "Report attached"
botmux send --videos /tmp/demo.mp4 --video-covers /tmp/cover.png --no-mention "Preview"
botmux send --card-file /tmp/card.json --no-mention
\`\`\`

Card input accepts a direct interactive-card object or supported OpenAPI wrappers. Custom cards may contain display elements and \`open_url\` buttons only. Callback controls, forms, inputs, selectors, and other botmux-action surfaces are rejected.

## Mention decision

Every send must choose exactly one notification mode:

- \`--mention-back\`: notify the sender who triggered this turn
- one or more \`--mention <open_id[:name]>\`: notify explicit people or bots
- \`--no-mention\`: notify nobody

\`--mention-back\` and \`--no-mention\` are switches and take no value. Use \`--mention <open_id[:name]>\` for an explicit recipient.

\`--mention-back\` refers to the turn trigger, not necessarily the person who clicked an earlier card. Use an explicit open ID when the actual recipient differs.

## Routing

Messages reply in the current topic by default. In a regular group they quote the triggering message unless \`--no-quote\` is used.

\`\`\`bash
botmux send --quote <message_id> --no-mention "Follow-up"
botmux send --top-level --no-mention "Announcement"
botmux send --top-level --chat-id <chat_id> --no-mention "Cross-chat announcement"
\`\`\`

## Human attention

Use \`--attention[=authz|decision|blocked|help]\` only when the task cannot continue without human action. State the blocker and required action in one sentence, send it, then stop. Attention is non-blocking and clears automatically after the user responds. Do not use attention for progress or ordinary questions. Use \`botmux ask\` for a bounded choice.

\`\`\`bash
botmux send --attention=authz --mention-back "Production deployment permission is required. Grant it so I can continue."
\`\`\`

Attention applies only to current-session text or card replies and cannot be combined with \`--top-level\`, \`--chat-id\`, \`--into\`, or \`--voice\`.
`;

const POLL_SKILL = `---
name: botmux-poll
description: Create or vote in a single-choice poll for humans and bots.
---

# Polls

When the target, title, and 2 to 8 options are known, run exactly one create command without announcing intent or progress:

\`\`\`bash
botmux poll create --title "Movie night" --option "Option A" --option "Option B" [--description "..."] [--chat-id <chat_id>]
\`\`\`

This is the only supported creation path. If an interrupted request is resumed, recover the same target, title, options, and description from conversation context and preserve them exactly. Do not inspect other skills, source code, processes, sessions, or history.

The command posts the poll and a private control card for its creator. That is the complete response. On success, send no text and end with exactly \`BOTMUX_NOTHING_TO_SEND\`. Do not retry or repair runtime files. On failure, report the exact error and stop.

Vote with:

\`\`\`bash
botmux poll vote <poll_id> <option-number|opt_N|exact-text>
\`\`\`

Each identity may vote once. Per-option counts and voters stay hidden until the creator ends the poll.
`;

const BOTS_SKILL = `---
name: botmux-bots
description: List collaborator bots in the current Lark chat before mentioning, delegating, or handing off work.
---

# Collaborator Bots

\`\`\`bash
botmux bots list
\`\`\`

Use \`capability\` and \`hasTeamRole\` to select a suitable bot. Mention only entries with \`mentionable=true\`. If false, ask that bot or a user to run \`/introduce\` first. Use \`larkAppId\` as a Workflow bot identifier and \`openId\` for Lark mentions.

For a formal handoff, read \`botmux-handoff\`.
`;

const HANDOFF_SKILL = `---
name: botmux-handoff
description: Hand the next stage of a task to another bot with enough structured context for reliable continuation.
---

# Bot Handoff

1. Run \`botmux bots list\` and choose a suitable \`mentionable=true\` bot.
2. Send one structured handoff with \`botmux send --mention\`.

Include:

- recipient
- current conclusion
- relevant context, including links, message IDs, files, or data
- requested next action
- completion criteria

\`\`\`bash
botmux send --mention "ou_xxx:Reviewer" <<'EOF'
Handoff:
- Current conclusion: The timeout begins after change PR-123.
- Context: service pay-gateway; logs at <link>.
- Next action: decide whether to revert and propose a fix.
- Done when: root cause and an executable decision are documented.
EOF
\`\`\`

After sending, briefly tell the user who owns the next step.
`;

export const ASK_SKILL = `---
name: botmux-ask
description: Ask a blocking multiple-choice question in the current Lark topic and return a machine-readable answer to the calling shell.
---

# Ask a Bounded Question

Use this only when execution must wait for one of 2 to 6 clear choices. Use \`botmux send\` for progress or open-ended questions. Do not wrap Workflow gates in another ask.

\`\`\`bash
choice=$(botmux ask buttons --options "deploy=Deploy,rollback=Roll back,abort=Stop" "What should I do next?")
case "$choice" in
  deploy) botmux send --mention-back "Deploying now." ;;
  rollback) botmux send --mention-back "Rolling back now." ;;
  abort) botmux send --mention-back "Stopped." ;;
esac
\`\`\`

The ask command posts a card, blocks, and writes the selected key to stdout. It does not send stdout back to Lark. When the user needs a visible result, capture the answer and call \`botmux send\`.

\`--mention-back\` notifies the turn trigger, which may differ from the card clicker. To notify the clicker, use JSON output and send to the returned \`by\` open ID:

\`\`\`bash
botmux ask buttons --json --options "yes=Continue,no=Stop" "Continue?"
botmux send --mention <open_id> "..."
\`\`\`

JSON output includes \`selected\`, \`by\`, \`timedOut\`, and \`comment\`. Exit codes: 0 success, 124 timeout, 2 invalid arguments or missing environment, 3 daemon unavailable or request invalidated. Human-readable diagnostics are on stderr.
`;

const ORCHESTRATE_SKILL = `---
name: botmux-orchestrate
description: Coordinate a long-running project only when multiple bots own independent workstreams, persistent multi-topic coordination and a shared task board are required, and a lead bot must integrate the results.
---

# Multi-bot Project Orchestration

Do not use this for a bounded single-agent task, a one-step handoff, or personal Knowledge, Skill, or Dynamic Workflow management.

## Protocol

1. Run \`botmux bots list\`. Select suitable, mentionable collaborators.
2. Propose workstreams with title, goal, acceptance criteria, working directory, dependencies, and assigned bots.
3. Obtain one explicit user approval before creating a board or dispatching work.
4. Use the Lark task capability to create a shared task list. Add the initiating user as a member, create one task per workstream, assign the responsible app, and retain each \`task_guid\`.
5. Dispatch one topic per workstream:

\`\`\`bash
botmux dispatch --title "<title>" --bot "<open_id>:<name>:<role>" --repo "<working-dir>" --brief-file /tmp/brief.md
\`\`\`

Each brief must include the task GUID, goal, acceptance criteria, dependencies, and completion protocol: update the Lark task, attach or link the result, then run \`botmux report "<summary and output location>"\`.

6. Read the task board when reports arrive. Dispatch dependent work only after prerequisites complete. For follow-up inside a child topic, use:

\`\`\`bash
botmux dispatch --into <topic-root> --bot <bot-open-id> --brief "<follow-up>"
\`\`\`

Do not mention an active child bot from the lead topic; that would create a separate context.

7. When all workstreams pass acceptance, deliver one integrated report with outputs and remaining risks.

Keep a small local mapping of workstream, \`task_guid\`, topic root, and assigned bots for recovery. Stop and notify the user after three failed attempts at the same operation.
`;

export const WHITEBOARD_SKILL = `---
name: botmux-whiteboard
description: Read or update the optional shared project whiteboard for durable project state, decisions, verified commands, blockers, and handoff context.
---

# Project Whiteboard

The whiteboard is disabled by default. Check before use:

\`\`\`bash
botmux whiteboard status
botmux whiteboard current
botmux whiteboard current --create
botmux whiteboard list
\`\`\`

Do not enable it implicitly. Create one only when the user requests it or durable project context is clearly required.

Read the current snapshot and version:

\`\`\`bash
botmux whiteboard read --id <whiteboardId> --json
\`\`\`

Store a concise current snapshot, not a transcript or append-only log. Include project goal, organization, accepted design and exclusions, verified progress, risks, blockers, and next steps. Never write secrets, tokens, personal data, unauthorized external information, or large raw logs. Use the user's language unless asked otherwise.

Before every update, read the latest content, merge new information into one complete snapshot, and use compare-and-set:

\`\`\`bash
botmux whiteboard update --id <whiteboardId> --expected-updated-at <updatedAt> <<'EOF'
# Current state
...
EOF
\`\`\`

On \`whiteboard_cas_mismatch\`, read again, merge against the new state, and retry. \`write --yes\` is a human force-overwrite compatibility command; agents should use \`update\`.

Send a brief \`botmux send\` notice when the board is first created or materially updated. Do not announce every small edit. User-visible conclusions and decisions still belong in Lark.
`;

export const ASK_SKILL_NAME = 'botmux-ask';

/**
 * Conditionally installed because some CLIs provide a native ask hook.
 */
export const WHITEBOARD_SKILL_NAME = 'botmux-whiteboard';

export const BUILTIN_SKILLS: SkillDef[] = [
  { name: 'botmux-artifacts', content: ARTIFACT_MANAGER_SKILL },
  { name: 'botmux-knowledge-creator', content: KNOWLEDGE_CREATOR_SKILL },
  { name: 'botmux-skill-creator', content: SKILL_CREATOR_SKILL },
  { name: 'botmux-workflow-creator', content: WORKFLOW_CREATOR_SKILL },
  { name: 'botmux-chat-rename', content: CHAT_RENAME_SKILL },
  { name: 'botmux-schedule', content: SCHEDULE_SKILL },
  { name: 'botmux-history', content: HISTORY_SKILL },
  { name: 'botmux-quoted', content: QUOTED_SKILL },
  { name: 'botmux-send', content: SEND_SKILL },
  { name: 'botmux-poll', content: POLL_SKILL },
  { name: 'botmux-bots', content: BOTS_SKILL },
  { name: 'botmux-handoff', content: HANDOFF_SKILL },
  { name: 'botmux-orchestrate', content: ORCHESTRATE_SKILL },
];

/**
 * Legacy Workflow instructions available only to explicit daemon routes.
 */
export const ON_DEMAND_BUILTIN_SKILLS: SkillDef[] = [
];
