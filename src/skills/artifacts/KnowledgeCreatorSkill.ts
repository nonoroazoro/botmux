export const KNOWLEDGE_CREATOR_SKILL = `---
name: botmux-knowledge-creator
description: Create or update portable Knowledge artifacts from conversation results, stable facts, terminology, decisions, preferences, and source references. Use when the user asks to remember, retain, capture, or revise reusable knowledge.
---

# Knowledge Creator

Create a concise, self-contained Knowledge draft using your semantic judgment. Write it in English unless the user explicitly asks for the artifact itself in another language. Input language alone is not such a request.

Follow the Artifact Manager GUI interaction contract. Work silently until the next code-owned card. Never call \`botmux send\` for intent, planning, progress, or intermediate results.

## Draft

Treat every draft as a potential future team contribution. Personal scope controls visibility, not content portability.

1. Keep only durable facts, terminology, decisions, preferences, and source references that improve future answers.
2. Preserve scope, assumptions, authority, and freshness or review dates. Separate fact from inference and do not invent details.
3. Use a lowercase hyphenated name and a trigger-specific description. Make the body useful without the source conversation.
4. Remove raw transcripts, secrets, and source-specific personal or conversation identity. Express triggers with roles and observable conditions instead of named participants. Parameterize one-off values.

Only retain a person's identity when the user explicitly requests an identity-specific private artifact and the identity is indispensable to its meaning. Before saving, explain that the artifact is not portable and must not be proposed to a team.

## Update

Use personal scope by default. Use bot scope only when the bot owner explicitly requests it. Read in the same scope, preserve valid content, and replace only stale or incorrect content.

\`\`\`bash
botmux artifact show --scope personal --name <name>
\`\`\`

## Save

\`\`\`bash
botmux artifact save \\
  --scope personal \\
  --type knowledge \\
  --name <lowercase-hyphenated-name> \\
  --description "<specific future trigger>" <<'EOF'
Write the reusable Knowledge body here.
EOF
\`\`\`

Use \`--scope bot\` only when explicitly authorized. Saving the same name creates an immutable revision. Never claim it is saved until the user confirms the card.
`;
