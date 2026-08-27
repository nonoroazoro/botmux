# Bot Personality

Botmux gives every bot a stable personality and restrained message reactions.
The system separates long-term temperament from the responsibility of a bot in
the current group.

## Soul and Role

- **Soul** defines how the bot forms judgments and communicates. Every bot uses
  the built-in Soul by default. The bot owner can replace it with custom
  Markdown or reset it from **Dashboard > Bot Config**.
- **Role** defines what the bot is responsible for in the current context. The
  existing resolution order remains: group Role, then default Role, then none.

Soul answers "what kind of collaborator am I?" Role answers "what am I
responsible for here?" Both become one versioned Agent Context.

Botmux delivers the full Agent Context when a conversation starts, when its
effective content changes, or after the native CLI context resets. It is not
repeated on every ordinary turn. When reactions are enabled, ordinary turns
receive only a short reminder to apply the active reaction policy.

## Personality Reactions

The active model may add one semantic reaction to the user message that started
the current turn:

| Reaction | Meaning |
|------|------|
| `yes` | Explicit confirmation or clearly correct understanding |
| `no` | A materially incorrect premise that the reply will correct |
| `heart` | Genuine warmth, appreciation, support, or a meaningful moment |
| `like` | A useful contribution, good decision, or notable progress |
| `done` | A clearly completed outcome when a completion marker is useful |

Most messages should receive no reaction. Reactions do not replace the textual
reply and are not progress indicators. Botmux enforces one reaction per turn
and a maximum of four reactions per session in ten minutes.

The model decides whether a reaction is semantically appropriate. The daemon
owns authorization and always binds the reaction to the exact message that
initiated the current managed turn. A caller cannot choose another message by
submitting a message or turn ID.

## Configuration

Open **Dashboard > Bot Config** for the target bot:

1. Edit **Soul** to replace the built-in Markdown, or reset it to the default.
2. Toggle **Personality reactions**. It is enabled by default for bots with
   Feishu or Lark message transport.

Reaction writes require the `im:message.reactions:write_only` app scope. The
current `botmux setup` flow requests it automatically. Include it when creating
or configuring an app manually.

The equivalent `bots.json` setting is:

```json
{
  "personalityReactions": false
}
```

Only `false` is meaningful and disables the capability. Omitting the field
keeps it enabled. Soul content is owner-managed host data and is not stored in
`bots.json`.

## Boundaries

- A normal bot session has no supported interface for modifying its active
  Soul. File sandboxing blocks direct writes to the Soul store. Without a file
  sandbox, processes running as the same OS user do not have a strong filesystem
  boundary.
- The bot does not autonomously evolve its personality.
- The retired GoGoGo and DONE progress reaction system is not supported.
- `apiOnly` bots cannot add message reactions because they have no Lark message
  transport.

See [Roles and Teams](/en/roles) for group Role configuration.
