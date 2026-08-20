import { getBotClient } from '../../../bot-registry.js';
import { larkGet } from '../client.js';
import type {
  MessageHistoryPageInput,
  MessageHistoryPageResult,
} from './index.js';

const MAX_PAGE_SIZE = 50;

/**
 * Read one newest-to-oldest page of Lark conversation history.
 *
 * @param input The identity-bound conversation and pagination parameters.
 * @returns One chronological page plus the opaque Lark cursor for older data.
 */
export async function listMessageHistoryPage(
  input: MessageHistoryPageInput,
): Promise<MessageHistoryPageResult> {
  const client = getBotClient(input.larkAppId);
  const pageSize = Math.min(Math.max(Math.floor(input.pageSize ?? 20), 1), MAX_PAGE_SIZE);
  let containerType: 'chat' | 'thread' = 'chat';
  let containerId = input.chatId;
  let filterThreadRoot: string | undefined;

  if (input.scope === 'thread') {
    if (!input.rootMessageId) throw new Error('Thread history requires a root message');
    const detail = await larkGet(
      client,
      `/open-apis/im/v1/messages/${encodeURIComponent(input.rootMessageId)}`,
    );
    if (detail.code !== 0) {
      throw new Error(`Failed to resolve thread: ${detail.msg} (code: ${detail.code})`);
    }
    const threadId = detail.data?.items?.[0]?.thread_id;
    if (threadId) {
      containerType = 'thread';
      containerId = threadId;
    } else {
      filterThreadRoot = input.rootMessageId;
    }
  }

  const collected: any[] = [];
  let pageToken = input.cursor;
  let hasMore = true;
  do {
    const response = await larkGet(client, '/open-apis/im/v1/messages', {
      container_id_type: containerType,
      container_id: containerId,
      page_size: pageSize - collected.length,
      sort_type: 'ByCreateTimeDesc',
      with_sender_name: 'true',
      ...(pageToken ? { page_token: pageToken } : {}),
    });
    if (response.code !== 0) {
      throw new Error(`Failed to list messages: ${response.msg} (code: ${response.code})`);
    }

    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    for (const message of items) {
      if (filterThreadRoot
        && message.message_id !== filterThreadRoot
        && message.root_id !== filterThreadRoot) {
        continue;
      }
      if (input.scope === 'ambient') {
        if (input.rootMessageId
          && (message.message_id === input.rootMessageId || message.root_id === input.rootMessageId)) {
          continue;
        }
        const boundary = input.beforeCreateTime ? Number(input.beforeCreateTime) : undefined;
        const created = Number(message.create_time);
        if (Number.isFinite(boundary) && Number.isFinite(created) && created >= (boundary as number)) {
          continue;
        }
      }
      collected.push(message);
      if (collected.length >= pageSize) break;
    }

    pageToken = typeof response.data?.page_token === 'string' && response.data.page_token
      ? response.data.page_token
      : undefined;
    hasMore = response.data?.has_more === true && !!pageToken;
  } while ((input.scope === 'ambient' || !!filterThreadRoot)
    && collected.length < pageSize
    && hasMore);

  return {
    messages: collected.slice(0, pageSize).reverse(),
    hasMore,
    ...(hasMore && pageToken ? { nextCursor: pageToken } : {}),
  };
}
