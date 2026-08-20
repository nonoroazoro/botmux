import type { MessageHistoryScope } from './index.js';

export interface MessageHistoryPageInput {
  larkAppId: string;
  chatId: string;
  scope: MessageHistoryScope;
  rootMessageId?: string;
  beforeCreateTime?: string;
  cursor?: string;
  pageSize?: number;
}
