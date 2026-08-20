export const ARTIFACT_MANAGER_SKILL = `---
name: botmux-artifacts
description: Manage reusable Knowledge, Skill, and Dynamic Workflow artifacts through code-owned cards and minimal natural-language input. Use for listing, reading, reviewing history, creating, updating, deleting, or contributing personal and bot-scoped artifacts.
---

# Artifact Manager

Translate the user's request into the internal artifact commands. Run commands yourself. Never ask the user to run them.

## GUI interaction

Artifact CRUD is a card-led flow, not a chat-led flow. For Create, Update, Delete, and Contribute, work silently until the next code-owned card or terminal status. Do not call \`botmux send\` or emit chat text to announce intent, restate the plan, narrate overlap review, validation, trial execution, or next steps. Ask in chat only when required open-ended information is missing and cannot be inferred safely. List, Show, and History remain normal read responses.

## Responsibility boundary

Use your semantic judgment to classify the artifact, load the matching creator, author or revise the content, evaluate its quality, and execute Dynamic Workflows. botmux code owns structured validation, authorization, scope, CRUD, revisions, confirmation cards, and persistence.

Do not replace creator reasoning or Workflow execution with hardcoded orchestration, a specialized runner, or a secondary model. The current agent performs those semantic steps with its normal tools.

## Route authoring

For Create or Update, load and follow the matching creator before saving:

- Knowledge: \`botmux skill show botmux-knowledge-creator\`
- Skill: \`botmux skill show botmux-skill-creator\`
- Dynamic Workflow: \`botmux skill show botmux-workflow-creator\`

Each artifact type uses the matching botmux creator above as its authoring path.

## Semantic overlap review

Before saving a new artifact name, review the existing artifacts with the same type and target scope:

1. Draft a provisional name, description, and body so the intended future behavior is clear.
2. Build a compact English retrieval query from the provisional name, description, trigger or goal, and a few likely aliases. Keep it plain text without shell syntax.
3. Run \`botmux artifact search --scope <scope> --type <type> --query "<query>" --limit 8\`. This deterministic metadata search only recalls candidates. Its ranking is not a semantic decision. Do not list the entire library for overlap review.
4. Semantically compare the returned names and descriptions. Read the full current content of at most three plausible candidates with \`botmux artifact show\`. Do not read every artifact body.
5. Judge overlap by future behavior, not keyword similarity:
   - Knowledge overlaps when it captures substantially the same facts, terminology, decision, preference, scope, and freshness expectations.
   - Skill overlaps when it has substantially the same trigger, goal, method, constraints, and output contract.
   - Dynamic Workflow overlaps when it has substantially the same inputs, ordered process, branches, side effects, and success criteria.
6. Treat shared products, repositories, tools, or vocabulary as insufficient by themselves. Complementary artifacts should remain separate.
7. A material overlap exists when the proposal would be better represented as a correction, extension, or new revision of an existing artifact rather than a separately triggered artifact.

When no material overlap exists, continue without interrupting the user.

When a material overlap exists, do not save. Submit the strongest match and a concise comparison to the code-controlled overlap card:

\`\`\`bash
botmux artifact overlap \\
  --type <knowledge|skill|workflow> \\
  --name <proposed-name> \\
  --existing <strongest-existing-name> <<'EOF'
Summarize the overlap, meaningful differences, recommendation, and up to two other relevant candidates.
EOF
\`\`\`

The command returns immediately after scheduling the card. End that turn with \`BOTMUX_NOTHING_TO_SEND\`; never poll or wait for the click. The decision starts a new agent turn automatically. On \`update\`, preserve the existing name and merge only justified content. On \`separate\`, distinguish the new trigger or scope and do not ask again. On \`revise\`, apply the supplied request and review overlap again. On \`cancel\`, no agent turn is started.

## Read

Read operations execute immediately:

\`\`\`bash
botmux artifact list --scope personal [--type knowledge|skill|workflow]
botmux artifact show --scope personal --name <name>
botmux artifact history --scope personal --name <name>
\`\`\`

Summarize command output for the user. Personal reads are available only in P2P sessions.

## Delete

Delete by exact name:

\`\`\`bash
botmux artifact delete --scope personal --name <name>
\`\`\`

Deletion permanently removes the artifact and all revision history. Never claim deletion completed until the authorized user confirms the destructive card.

## Scope and contribution

- Use \`--scope personal\` by default.
- Manage personal artifacts only in a P2P session with the bot. Never load or author personal artifacts in a shared group session.
- Use \`--scope bot\` only when the bot owner explicitly manages the shared library.
- Treat personal scope as a visibility boundary, not permission to create identity-bound content. Author every artifact so it can be reused by another user and later contributed to a team.
- Before a team contribution, review the name, description, and body for source-specific personal or conversation identity. If any remains, create a portable revision before proposing it.
- A team contribution normally starts as a personal save followed by \`Save and propose to team\` on the confirmation card.
- The bot owner must approve the separate bot-global artifact.

Create, Update, and Delete require card confirmation. List, Show, and History do not.

For Create, Update, Delete, and Contribute, the code-owned card or terminal status is the complete response. End the turn with exactly \`BOTMUX_NOTHING_TO_SEND\`.
`;
