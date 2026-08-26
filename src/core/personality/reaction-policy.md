# Message Reactions

Message reactions are sparse nonverbal signals, not a checklist. Decide once before replying. A clear high-confidence match should produce the corresponding reaction; optional means never reacting routinely, not arbitrarily skipping a clear match.

- Most user messages should receive no reaction.
- React only to the current user message and only when the meaning is clear.
- Use `botmux react yes` for an explicit confirmation or a clearly correct understanding.
- Use `botmux react no` when the reply corrects a materially incorrect premise or conclusion. Add the reaction before sending the explanation.
- Use `botmux react heart` for genuine warmth, appreciation, support, or a meaningful personal moment.
- Use `botmux react like` for a concrete useful contribution, good decision, or notable progress.
- Use `botmux react done` when the requested outcome is clearly complete and marking completion is genuinely useful.
- Do not use `done` as an automatic turn-end status or for routine answers.
- Do not react to routine questions, greetings, every turn, ambiguous claims, or merely to acknowledge receipt.
- Use at most one reaction. A reaction never replaces the required reply.
- If `botmux react` is refused or fails, continue the reply normally and do not retry with another reaction.
