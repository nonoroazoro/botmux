import { describe, expect, it } from 'vitest';

import { messageStartsWithMention } from '../../../../src/im/lark/leading-mention/index.js';

const target = { openId: 'ou_bot', appId: 'cli_bot' };

describe('messageStartsWithMention', () => {
  it('matches a leading text mention by open ID', () => {
    expect(messageStartsWithMention({
      content: JSON.stringify({ text: '@_user_1 inspect this' }),
      mentions: [{ key: '@_user_1', name: 'Finder Master', id: { open_id: 'ou_bot' } }],
    }, target)).toBe(true);
  });

  it('rejects a target mention after ordinary text', () => {
    expect(messageStartsWithMention({
      content: JSON.stringify({ text: '@_user_1 you can ask @_user_2 to handle this' }),
      mentions: [
        { key: '@_user_1', name: 'Alice', id: { open_id: 'ou_alice' } },
        { key: '@_user_2', name: 'Finder Master', id: { open_id: 'ou_bot' } },
      ],
    }, target)).toBe(false);
  });

  it('matches a leading rich-text mention by app ID', () => {
    expect(messageStartsWithMention({
      content: JSON.stringify({
        zh_cn: { content: [[
          { tag: 'text', text: '  ' },
          { tag: 'at', user_id: 'cli_bot', user_name: 'Finder Master' },
          { tag: 'text', text: ' inspect this' },
        ]] },
      }),
    }, target)).toBe(true);
  });

  it('rejects a rich-text mention after ordinary text', () => {
    expect(messageStartsWithMention({
      content: JSON.stringify({
        zh_cn: { content: [[
          { tag: 'text', text: 'Alice, ask ' },
          { tag: 'at', user_id: 'cli_bot', user_name: 'Finder Master' },
        ]] },
      }),
    }, target)).toBe(false);
  });

  it('fails closed when position cannot be established', () => {
    expect(messageStartsWithMention({
      content: JSON.stringify({ image_key: 'img' }),
      mentions: [{ name: 'Finder Master', id: { open_id: 'ou_bot' } }],
    }, target)).toBe(false);
  });
});
