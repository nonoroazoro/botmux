import { mentionAppId, mentionOpenId } from '../message-parser.js';

/**
 * Check whether the first semantic token in a Lark message mentions a target.
 *
 * @param message The structured Lark message.
 * @param target The target's app-scoped identities.
 * @returns Whether the message starts by addressing the target.
 */
export function messageStartsWithMention(
  message: {
    mentions?: any[];
    content?: string;
    body?: { content?: string };
  } | null | undefined,
  target: { openId?: string; appId?: string },
): boolean {
  const matchesTarget = (mention: any): boolean => Boolean(
    (target.openId && mentionOpenId(mention) === target.openId)
    || (target.appId && mentionAppId(mention) === target.appId),
  );
  const rawContent = message?.content ?? message?.body?.content;
  if (!rawContent) return false;

  try {
    const content = JSON.parse(rawContent);
    if (typeof content?.text === 'string') {
      const text = content.text.trimStart();
      const candidates = (message?.mentions ?? []).flatMap(mention => [
        typeof mention?.key === 'string' && mention.key ? mention.key : undefined,
        typeof mention?.name === 'string' && mention.name ? `@${mention.name}` : undefined,
      ].filter((token): token is string => Boolean(token)).map(token => ({ mention, token })));
      candidates.sort((left, right) => right.token.length - left.token.length);
      const first = candidates.find(candidate => text.startsWith(candidate.token));
      return first ? matchesTarget(first.mention) : false;
    }

    const inner = content?.zh_cn ?? content?.en_us ?? content;
    if (typeof inner?.title === 'string' && inner.title.trim()) return false;
    if (!Array.isArray(inner?.content)) return false;
    for (const paragraph of inner.content) {
      if (!Array.isArray(paragraph)) continue;
      for (const node of paragraph) {
        if (node?.tag === 'text') {
          if (typeof node.text === 'string' && node.text.trim()) return false;
          continue;
        }
        if (node?.tag === 'at') {
          return Boolean(
            (target.openId && node.user_id === target.openId)
            || (target.appId && node.user_id === target.appId),
          );
        }
        return false;
      }
    }
  } catch {
    return false;
  }
  return false;
}
