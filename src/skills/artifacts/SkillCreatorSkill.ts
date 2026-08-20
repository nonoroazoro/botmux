export const SKILL_CREATOR_SKILL = `---
name: botmux-skill-creator
description: Create or update portable Skill artifacts containing reusable methods, constraints, checklists, and operating guidance. Use when the user asks the assistant to learn, retain, or revise a repeatable way of handling a class of tasks, including a successful pattern from the current conversation.
---

# Skill Creator

Create a portable single-file Skill using your semantic judgment. Write it in English unless the user explicitly asks for the artifact itself in another language. Input language alone is not such a request.

Follow the Artifact Manager GUI interaction contract. Work silently until the next code-owned card. Never call \`botmux send\` for intent, planning, progress, or intermediate results.

## Draft

Treat every draft as a potential future team contribution. Personal scope controls visibility, not content portability.

1. Extract the goal, tools, successful pattern from the current conversation, corrections, expected output, and edge cases. Ask only for missing details that change the Skill materially.
2. Write a specific description covering what the Skill does, when it triggers, and adjacent near-misses that should not trigger it.
3. Match the degree of freedom to the task: guidance for judgment, steps for preferred procedures, and strict checks only for fragile or safety-critical work.
4. Use concise imperative instructions. Include decision points, failure handling, expected outputs, and observable success checks when useful.
5. Keep the body self-contained. Do not include YAML frontmatter or unbundled files. If bundled resources are required, explain that the portable format does not support them yet.
6. Remove raw transcripts, secrets, and source-specific personal or conversation identity. Use roles and observable conditions instead of named participants. Parameterize one-off values.

Only retain a person's identity when the user explicitly requests an identity-specific private Skill and the identity is indispensable to its behavior. Before saving, explain that the Skill is not portable and must not be proposed to a team.

## Update

Use personal scope by default. Use bot scope only when the bot owner explicitly requests it. Read in the same scope, preserve the original intent and valid behavior, and change only what new evidence justifies.

\`\`\`bash
botmux artifact show --scope personal --name <name>
\`\`\`

## Validate

Check 2 to 3 realistic prompts: a common case, an edge case, and when useful a near-miss. Safely dry-run objectively verifiable behavior with the current agent and normal tools. Do not mutate external state solely for evaluation. Remove hidden assumptions and revise general guidance instead of overfitting tests.

## Save

\`\`\`bash
botmux artifact save \\
  --scope personal \\
  --type skill \\
  --name <lowercase-hyphenated-name> \\
  --description "<what it does and when to use it>" <<'EOF'
Write the portable Skill instructions here.
EOF
\`\`\`

Use \`--scope bot\` only when explicitly authorized. Saving the same name creates an immutable revision. Never claim it is saved until the user confirms the card.
`;
