import { realpathSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Resolve an isolated attachment directory to a physical filesystem path.
 *
 * @param homeDir The isolated user's logical home directory.
 * @param sessionId The owning session identifier.
 * @param messageId The source Lark message identifier.
 */
export function resolveIsolatedAttachmentDir(
  homeDir: string,
  sessionId: string,
  messageId: string,
): string {
  return join(
    realpathSync(homeDir),
    '.botmux',
    'attachments',
    sessionId,
    messageId,
  );
}
