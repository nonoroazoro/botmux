export class CodexCyberPolicyRecovery {
  /**
   * Build the first prompt for a fresh Codex conversation after a
   * cybersecurity policy stop. Previous assistant and tool output is omitted.
   *
   * @param openingContext The original Botmux opening context.
   * @param currentTurnContext The user turn that was stopped.
   */
  buildPrompt(openingContext: string, currentTurnContext: string): string {
    const contexts = openingContext === currentTurnContext
      ? openingContext
      : `${openingContext}\n\n${currentTurnContext}`;
    return [
      '<botmux_cybersecurity_recovery>',
      'The previous Codex conversation stopped at a cybersecurity safety boundary.',
      'Continue in this fresh conversation as a conservative, read-only defensive analysis.',
      '',
      '- Focus first on whether the local source code contains the reported security weakness.',
      '- Establish the relevant code path, trust boundary, trigger conditions, and impact from static evidence.',
      '- Use read-only inspection of existing local code and already available context.',
      '- Do not modify code, configuration, repositories, dependencies, services, or external state.',
      '- Do not perform active validation or reproduce risky behavior. Examples include executing a PoC, replaying an exploit, probing a live system, or testing against third-party data or services.',
      '- Recover only the necessary Lark context with read-only history or quoted-message tools when the request depends on prior chat messages.',
      '- If static evidence is insufficient, state what remains unverified instead of performing a risky test.',
      '- Keep the existing Botmux reply route and send the result to the same Lark topic.',
      '</botmux_cybersecurity_recovery>',
      '',
      contexts,
    ].join('\n');
  }
}
