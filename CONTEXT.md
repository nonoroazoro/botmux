# botmux Domain Terms

Use these terms consistently in product copy, code comments, and documentation.

## Agent CLI

An AI coding command-line tool run by botmux, such as Claude Code, Codex, Gemini, Cursor, or OpenCode.

Avoid: agent cli, CLI bot.

## Bot

A chat-visible identity that routes messages to one configured Agent CLI.

Avoid: agent, app.

## Session

A continuing conversation between one chat anchor and one Agent CLI runtime.

Avoid: thread, task, unless referring to the actual Lark object.

## Token Usage

Native input and output token counts reported by the Agent CLI or its transcript. Input includes cache tokens when the CLI reports them. botmux does not estimate tokens from message text.

Avoid: token estimate, cost estimate.

## Context Usage

The latest valid context-window measurement reported by the Agent CLI or transcript. It may decrease after compaction and must not be derived from cumulative Token Usage. Omit it when native data is insufficient.

`showUsageInCardFooter: false` hides Context Usage and Token Usage from ordinary card footers without disabling accounting.

Avoid: cumulative context, estimated context window.

## Usage Ledger

Append-only daily JSONL under `~/.botmux/usage/` containing per-turn Token Usage deltas and session metadata. Baselines start at worker spawn, so earlier transcript history is excluded. botmux does not upload the ledger.

Zero-delta `ownership` records identify native sessions before positive deltas. They are markers, not accounting events.

Avoid: usage log, billing database.
