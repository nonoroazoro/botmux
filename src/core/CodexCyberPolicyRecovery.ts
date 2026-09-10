import type { CodexBridgeEvent } from '../services/codex-transcript.js';
import { escapeXmlText } from '../utils/xml.js';

const MAX_RECOVERY_EVENTS = 200;
const MAX_RECOVERY_CHARS = 120_000;

export class CodexCyberPolicyRecovery {
  /**
   * Extract the visible conversation through an exact cyber-policy stop.
   * The Codex transcript reader has already removed reasoning, tool calls,
   * tool output, progress events, and non-terminal assistant messages. This
   * boundary additionally removes the policy terminal and all failed or
   * aborted assistant terminals.
   *
   * @param events Parsed events from the original Codex rollout.
   * @param options Exact boundary and earlier omission metadata.
   */
  extractConversation(
    events: readonly CodexBridgeEvent[],
    options: {
      boundaryEventUuid?: string;
      omittedMessageCount?: number;
      earlierMessagesOmitted?: boolean;
      messagePrefixOmitted?: boolean;
    } = {},
  ): string | undefined {
    let boundaryIndex = -1;
    for (let index = events.length - 1; index >= 0; index -= 1) {
      if (events[index].terminalErrorCode === 'codex_task_error:cyber_policy'
        && (!options.boundaryEventUuid || events[index].uuid === options.boundaryEventUuid)) {
        boundaryIndex = index;
        break;
      }
    }
    if (boundaryIndex < 0) return undefined;

    const visible = events.slice(0, boundaryIndex).filter(event =>
      event.text.trim().length > 0
      && (event.kind === 'user'
        || (event.kind === 'assistant_final'
          && event.terminalErrorCode !== 'codex_task_error:cyber_policy'
          && (event.terminalStatus === undefined || event.terminalStatus === 'completed'))),
    );
    if (visible.length === 0) return undefined;

    let selected = visible.slice(-MAX_RECOVERY_EVENTS);
    let totalChars = selected.reduce((sum, event) => sum + event.text.length, 0);
    while (selected.length > 1 && totalChars > MAX_RECOVERY_CHARS) {
      const removed = selected.shift();
      totalChars -= removed?.text.length ?? 0;
    }
    let messagePrefixOmitted = options.messagePrefixOmitted === true;
    if (selected.length === 1 && selected[0].text.length > MAX_RECOVERY_CHARS) {
      selected = [{
        ...selected[0],
        text: selected[0].text.slice(-MAX_RECOVERY_CHARS),
      }];
      messagePrefixOmitted = true;
    }

    const omittedCount = (options.omittedMessageCount ?? 0) + visible.length - selected.length;
    const messages = selected.map(event => [
      `<message role="${event.kind === 'user' ? 'user' : 'assistant'}">`,
      escapeXmlText(event.text),
      '</message>',
    ].join('\n'));
    return [
      '<botmux_recovered_codex_conversation>',
      ...(omittedCount > 0 ? [`<omitted message_count="${omittedCount}" />`] : []),
      ...(omittedCount === 0 && options.earlierMessagesOmitted
        ? ['<omitted earlier_messages="true" />']
        : []),
      ...(messagePrefixOmitted ? ['<omitted message_prefix="true" />'] : []),
      ...messages,
      '</botmux_recovered_codex_conversation>',
    ].join('\n');
  }

  /**
   * Build the first prompt for a fresh Codex conversation after a
   * cybersecurity policy stop. The policy response, failed assistant output,
   * reasoning, and tool records are omitted from the recovery context.
   *
   * @param openingContext The original Botmux opening context.
   * @param recoveryContext The filtered conversation or fallback user turn.
   */
  buildPrompt(openingContext: string, recoveryContext: string): string {
    const escapedOpeningMessage = [
      '<message role="user">',
      escapeXmlText(openingContext),
      '</message>',
    ].join('\n');
    const recoveryIncludesOpening = recoveryContext.includes(escapedOpeningMessage);
    const contexts = openingContext === recoveryContext || recoveryIncludesOpening
      ? recoveryContext
      : `${openingContext}\n\n${recoveryContext}`;
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
      '- Use the recovered Codex conversation below as the sole source for the previous conversation. Do not reconstruct it from Lark topic history.',
      '- Use exact quoted-message or attachment reads only when the recovered task already identifies that message or attachment.',
      '- If static evidence is insufficient, state what remains unverified instead of performing a risky test.',
      '- Keep the existing reply route and send the result to the same Lark topic.',
      '</botmux_cybersecurity_recovery>',
      '',
      contexts,
    ].join('\n');
  }
}
