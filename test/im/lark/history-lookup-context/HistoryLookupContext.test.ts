import { describe, expect, it } from 'vitest';

import { buildHistoryLookupContext } from '../../../../src/im/lark/history-lookup-context/index.js';

describe('buildHistoryLookupContext', () => {
  it('uses ambient history for a group thread', () => {
    const context = buildHistoryLookupContext('group', 'thread', 'en');

    expect(context).toContain('botmux history --scope ambient');
    expect(context).toContain('look into this bug');
  });

  it('uses chat history for a direct message', () => {
    const context = buildHistoryLookupContext('p2p', 'thread', 'en');

    expect(context).toContain('botmux history --scope chat');
    expect(context).toContain('direct-message history');
  });

  it('uses the current scope for a chat-scoped group session', () => {
    const context = buildHistoryLookupContext('group', 'chat', 'en');

    expect(context).toContain('run `botmux history`');
    expect(context).not.toContain('--scope ambient');
  });
});
