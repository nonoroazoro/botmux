export const WORKFLOW_CREATOR_SKILL = `---
name: botmux-workflow-creator
description: Create or update portable Dynamic Workflow artifacts as parameterized repeatable processes. Use when the user asks to retain a successful process, procedure, playbook, or workflow for future execution.
---

# Workflow Creator

Create and validate a portable Dynamic Workflow using your semantic judgment. Write it in English unless the user explicitly asks for the artifact itself in another language. Input language alone is not such a request. The current LLM executes the Workflow with its normal tools.

Follow the Artifact Manager GUI interaction contract. Work silently until the next code-owned card. Never call \`botmux send\` for intent, planning, progress, or intermediate results.

## Draft

Treat every draft as a potential future team contribution. Personal scope controls visibility, not content portability.

Use a Dynamic Workflow when the user wants a stable, parameterized process to run again. Use Knowledge for durable facts. Use a Skill when the method is reusable but the agent must choose most of the process dynamically from heuristics.

Prefer a process that already succeeded. Make speculative assumptions explicit. Use these sections, adding \`## Failure handling\` when needed:

\`\`\`markdown
## Inputs
- \`input-name\` (required, string): Purpose and validation.

## Steps
1. Perform an executable action.
2. Follow explicit branches and bounded retries.

## Success criteria
- Define observable completion.

## Failure handling
- Define retries, stopping conditions, and partial results.
\`\`\`

Make input types, defaults, validation, dependencies, branches, bounds, side effects, and approval boundaries explicit when relevant. Avoid hidden inputs and unnecessary runtime details.

Remove secrets and source-specific personal or conversation identity. Express actors as roles and parameterize caller, team, project, recipient, and environment values. Do not copy one-off run data into fixed steps or defaults.

Only retain a person's identity when the user explicitly requests an identity-specific private Workflow and the identity is indispensable to its behavior. Before saving, explain that the Workflow is not portable and must not be proposed to a team.

Write logical orchestration, not bindings to a model, subagent API, CLI-native syntax, or specialized engine.

## Update

Use personal scope by default. Use bot scope only when the bot owner explicitly requests it. Read the existing Workflow in the same scope and preserve valid behavior.

\`\`\`bash
botmux artifact show --scope personal --name <name>
\`\`\`

## Validate

Submit the complete draft to the code-controlled Workflow trial card:

\`\`\`bash
botmux artifact trial \\
  --type workflow \\
  --name <lowercase-hyphenated-name> \\
  --description "<what it automates and when to use it>" <<'EOF'
## Inputs
...

## Steps
...

## Success criteria
...

## Failure handling
...
EOF
\`\`\`

The command returns immediately after scheduling the card. End that turn with \`BOTMUX_NOTHING_TO_SEND\`; never poll or wait for the click. The decision starts a new agent turn automatically. On Run, read the exact approved draft with the injected \`trial-read\` command, execute it once with the current agent and its normal tools, and use the smallest safe inputs. Do not send progress. Judge the observed result as \`passed\` or \`passed_with_limitations\`, then write a concise trial summary covering tested inputs, observations, and limitations. This summary is user-facing communication: use the language the user is currently using and keep technical terms in English. On success, show only the artifact save card. A failed, inconclusive, or changed draft requires another trial card because the token is bound to the exact content. Do not delegate execution to another model or engine.

## Save

\`\`\`bash
botmux artifact save \\
  --scope personal \\
  --type workflow \\
  --trial-token <trialToken> \\
  --trial-outcome <passed|passed_with_limitations> \\
  --trial-summary "<tested inputs, observations, and limitations>"
\`\`\`

Use \`--scope bot\` only when explicitly authorized. Saving the same name creates an immutable revision. Never claim it is saved until the user confirms the card.
`;
