import type { CodexAppTurnInput } from '../types.js';
import { withCodexAppContext } from './codex-app-context.js';

/** Add the effective role when a requested resume becomes a fresh context. */
export function applyRoleContextFallback(
  prompt: string,
  codexAppInput: CodexAppTurnInput | undefined,
  fallbackBlock: string | undefined,
  roleContextIncluded = false,
): { prompt: string; codexAppInput?: CodexAppTurnInput } {
  if (roleContextIncluded || !fallbackBlock) {
    return {
      prompt,
      ...(codexAppInput ? { codexAppInput } : {}),
    };
  }
  return {
    prompt: [fallbackBlock, prompt].filter(Boolean).join('\n\n'),
    ...(codexAppInput
      ? {
          codexAppInput: withCodexAppContext(
            codexAppInput,
            'botmux_role',
            fallbackBlock,
            'application',
          ),
        }
      : {}),
  };
}
