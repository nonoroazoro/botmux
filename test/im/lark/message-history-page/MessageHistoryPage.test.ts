import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.fn();

vi.mock('../../../../src/bot-registry.js', () => ({
  getBotClient: () => ({ request }),
}));

import { listMessageHistoryPage } from '../../../../src/im/lark/message-history-page/index.js';

function message(id: string, createTime: string, rootId?: string): Record<string, string> {
  return {
    message_id: id,
    create_time: createTime,
    ...(rootId ? { root_id: rootId } : {}),
  };
}

beforeEach(() => request.mockReset());

describe('listMessageHistoryPage', () => {
  it('returns one chat page and forwards the cursor', async () => {
    request.mockResolvedValue({
      code: 0,
      data: {
        items: [message('m3', '3000'), message('m2', '2000')],
        has_more: true,
        page_token: 'next-page',
      },
    });

    const page = await listMessageHistoryPage({
      larkAppId: 'app', chatId: 'chat', scope: 'chat', cursor: 'current-page', pageSize: 2,
    });

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        page_size: 2,
        page_token: 'current-page',
        sort_type: 'ByCreateTimeDesc',
      }),
    }));
    expect(page.messages.map(item => item.message_id)).toEqual(['m2', 'm3']);
    expect(page).toMatchObject({ hasMore: true, nextCursor: 'next-page' });
  });

  it('reads consecutive pages without repeating messages', async () => {
    request
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [message('m4', '4000'), message('m3', '3000')],
          has_more: true,
          page_token: 'page-two',
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [message('m2', '2000'), message('m1', '1000')],
          has_more: false,
        },
      });

    const first = await listMessageHistoryPage({
      larkAppId: 'app', chatId: 'chat', scope: 'chat', pageSize: 2,
    });
    const second = await listMessageHistoryPage({
      larkAppId: 'app', chatId: 'chat', scope: 'chat', pageSize: 2, cursor: first.nextCursor,
    });

    expect(first.messages.map(item => item.message_id)).toEqual(['m3', 'm4']);
    expect(second.messages.map(item => item.message_id)).toEqual(['m1', 'm2']);
    expect(second.hasMore).toBe(false);
  });

  it('resolves a thread and paginates it newest first', async () => {
    request
      .mockResolvedValueOnce({ code: 0, data: { items: [{ thread_id: 'omt_thread' }] } })
      .mockResolvedValueOnce({
        code: 0,
        data: { items: [message('reply', '2000')], has_more: false },
      });

    const page = await listMessageHistoryPage({
      larkAppId: 'app', chatId: 'chat', scope: 'thread', rootMessageId: 'om_root',
    });

    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      params: expect.objectContaining({
        container_id_type: 'thread',
        container_id: 'omt_thread',
        sort_type: 'ByCreateTimeDesc',
      }),
    }));
    expect(page).toMatchObject({ hasMore: false });
  });

  it('continues upstream pages until an ambient page is filled', async () => {
    request
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [message('later', '4000'), message('root', '3000')],
          has_more: true,
          page_token: 'older',
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          items: [message('m2', '2000'), message('m1', '1000')],
          has_more: true,
          page_token: 'oldest',
        },
      });

    const page = await listMessageHistoryPage({
      larkAppId: 'app',
      chatId: 'chat',
      scope: 'ambient',
      rootMessageId: 'root',
      beforeCreateTime: '3000',
      pageSize: 2,
    });

    expect(request).toHaveBeenCalledTimes(2);
    expect(page.messages.map(item => item.message_id)).toEqual(['m1', 'm2']);
    expect(page.nextCursor).toBe('oldest');
  });
});
