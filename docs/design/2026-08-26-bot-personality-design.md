# Bot Personality Design

Status: Implemented

## Goal

Give each bot a stable point of view and restrained social expression without
turning personality into scripted mannerisms or injecting a large prompt on
every turn.

## Model

Personality has four layers with separate responsibilities:

1. **Soul** defines the bot's stable temperament, judgment style, and social
   boundaries. Every bot uses the built-in Soul unless its owner saves a custom
   Soul in Dashboard.
2. **Role** defines the bot's current responsibility and domain behavior. The
   existing group Role overrides the bot's default Role.
3. **Agent Context delivery** combines the resolved Soul, Role, and optional
   reaction policy. The full context is delivered when a conversation starts
   and again only when its revision changes or the native CLI context resets.
4. **Reaction** is a sparse nonverbal expression of the active personality. The
   model decides whether the current user message has a clear semantic match;
   deterministic code validates and executes the decision.

Soul answers "what kind of collaborator am I?" Role answers "what am I
responsible for here?" Reaction answers "is one small social signal useful on
this message?"

## Context Lifecycle

Botmux resolves one versioned Agent Context from:

```text
Agent Context = Soul + effective Role + enabled capability policy
```

The context revision is content-addressed. Botmux injects the full block at
session start, after an effective configuration change, or after a native
context reset. Ordinary turns receive only a short reaction reminder when the
capability is enabled. The full Soul and Role are not repeated every turn.

## Reaction Policy

The supported semantic reactions are `yes`, `no`, `heart`, `like`, and `done`.
Most messages receive no reaction.

- `yes` confirms a clearly correct understanding.
- `no` marks a materially incorrect premise before the bot explains why.
- `heart` expresses genuine warmth, appreciation, or support.
- `like` recognizes a concrete useful contribution or good decision.
- `done` marks a clearly completed outcome when that signal is useful.

A reaction never replaces the textual reply. The model may use at most one
reaction per user turn and must not retry with a different reaction after a
failure.

## Enforcement Boundary

The model owns semantic judgment. Botmux owns deterministic enforcement:

- reactions must target the user message that initiated the current managed
  turn;
- the daemon is the only authority for the current turn identity;
- callers prove access with the rotating capability and cannot submit their own
  turn identity;
- each turn can receive at most one personality reaction;
- each session is limited to four reactions per ten minutes;
- provider calls have a bounded timeout and persisted idempotency ledger.

This keeps expression flexible while preserving authorization, isolation, and
abuse controls.

## Ownership and Configuration

The built-in Soul is the safe default for every bot. A bot owner may replace it
with custom Markdown or reset it to the built-in version from Dashboard.
Reaction support can be enabled or disabled per bot and is unavailable when the
bot has no Feishu transport.

Soul files are owner-managed host data. They are not writable by a normal bot
session, including sessions that run without sandbox isolation.

## Deliberate Non-Goals

- The bot does not autonomously rewrite or evolve its Soul.
- There is no compatibility path for the retired GoGoGo or DONE progress
  reaction system.
- Reactions are not automatic progress indicators, acknowledgements, or a
  per-turn checklist.
- Personality does not claim human emotions, history, or certainty the model
  does not have.

Future personality growth, if added, should use owner-reviewed proposals with
version history and rollback. It should not grant the runtime direct write
access to the active Soul.
