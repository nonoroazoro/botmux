# Skill Management

botmux manages CLI-independent Skill packages and exposes selected Skills to each session. A Skill describes when it applies and where its resources live; delivery is adapted to the target CLI.

Without a bot `skills` policy, botmux does not create a session manifest, inject a catalog, create a runtime plugin, or change CLI arguments. The CLI keeps its native Skill behavior.

With a policy, selected Skills become a priority catalog. Native CLI discovery remains available unless the CLI itself behaves differently.

## Package Format

A Skill is a directory containing `SKILL.md`:

```text
deploy-runbook/
  SKILL.md
  references/
  scripts/
  assets/
```

Recommended frontmatter:

```markdown
---
name: deploy-runbook
description: Use for production deploys and rollbacks.
version: 1.2.0
tags: [deploy, sre]
---
```

Session agents read selected resources with:

```bash
botmux skill show deploy-runbook
botmux skill read deploy-runbook references/release.md
botmux skill resources deploy-runbook
```

These commands require the current session manifest.

## Install and Manage

Local sources:

```bash
botmux skills install ./skills/deploy-runbook
botmux skills install ./skills --skill deploy-runbook
botmux skills install ./skills/deploy-runbook --link
```

`--link` keeps the development source in place. A normal install vendors a copy under `~/.botmux/skills/store`.

Git and GitHub sources:

```bash
botmux skills discover github:acme/agent-skills
botmux skills install github:acme/agent-skills --skill deploy-runbook
botmux skills install github:acme/agent-skills --all
botmux skills install github:acme/agent-skills --path skills/deploy-runbook --ref main
botmux skills install git@github.com:acme/agent-skills.git --path skills/deploy-runbook --ref v1.2.0
```

Git paths must stay inside the checkout. Absolute paths, `..`, and escaping symlinks are rejected. Private GitHub sources reuse configured tokens, `gh auth`, Git credential helpers, or SSH. Credentials are not stored in source URLs or the Skill registry.

Artifact sources use the host's authenticated `agentbuddy` CLI:

```bash
botmux skills install "agentbuddy skill collection add <uid>"
botmux skills install "agentbuddy plugin collection add <uid>"
botmux skills install "agentbuddy skill add <group> --skill <name>"
```

Only install commands are accepted. Plugin packages contribute their contained `SKILL.md` files. Embedded telemetry is removed and checked fail-closed unless `BOTMUX_AGENTBUDDY_KEEP_TELEMETRY=1` is set.

Related environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `BOTMUX_SKILL_GIT_TIMEOUT_MS` | `60000` | Git command timeout |
| `BOTMUX_AGENTBUDDY_CMD` | `agentbuddy` | Artifact CLI command |
| `BOTMUX_AGENTBUDDY_TIMEOUT_MS` | `180000` | Artifact command timeout |
| `BOTMUX_AGENTBUDDY_KEEP_TELEMETRY` | unset | Preserve embedded telemetry |

Management commands:

```bash
botmux skills list
botmux skills inspect deploy-runbook
botmux skills update deploy-runbook
botmux skills remove deploy-runbook
botmux skills doctor
```

Removal rejects referenced Skills unless `--force` is used. It removes registry data and managed copies, not external source directories.

## Bot Policy

Configure direct priority Skills in `bots.json`:

```json
{
  "skills": {
    "include": ["skill:deploy-runbook"]
  }
}
```

Only `skill:<name>` entries are supported. Global settings control workspace Skill discovery (`off | all`) and delivery (`auto | prompt | native`). Legacy `trusted` workspace discovery is read as `all` with a deprecation warning.

Manage the current bot from chat:

```text
/skills
/skills attach deploy-runbook
/skills detach deploy-runbook
```

The Dashboard Skills page provides the same registry, policy, discovery, and delivery controls. Install and update operations run as background jobs.

## Delivery

- `prompt`: appends the priority catalog and serves resources through `botmux skill` commands.
- `native`: requires target CLI support and blocks session startup when unavailable.
- `auto`: prefers native delivery and otherwise uses prompt delivery.

Claude Code can receive a session-scoped runtime plugin through `--plugin-dir`. Other CLIs use the prompt catalog unless they implement native delivery.

Inspect resolution and delivery:

```bash
botmux skills resolve --bot <appId|name|index> --cwd <repo>
botmux skills delivery --bot <appId|name|index> --cwd <repo>
botmux skills delivery --cli codex --mode auto
botmux skills delivery --cli claude-code --mode auto
```

Sandboxed sessions read only manifest-selected resources. Claude native delivery mounts its session plugin read-only. No selected Skill is copied into a CLI's global Skill directory.

If a bot has no custom policy, `resolve` reports `skills: default`, meaning native CLI behavior remains unchanged.
