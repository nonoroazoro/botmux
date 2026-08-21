export function newBotConversationDefaults() {
  return {
    p2pMode: 'chat',
    regularGroupReplyMode: 'new-topic',
    regularGroupMentionMode: 'topic',
    docSubscribeDefaultMode: 'mention-only',
  } as const;
}
