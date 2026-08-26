import type { CodexAppTurnInput } from '../types.js';
import { withCodexAppContext } from './codex-app-context.js';

/** Add the effective agent context when a requested resume becomes a fresh context. */
export function applyAgentContextFallback(
  prompt: string,
  codexAppInput: CodexAppTurnInput | undefined,
  fallbackBlock: string | undefined,
  agentContextIncluded = false,
): { prompt: string; codexAppInput?: CodexAppTurnInput } {
  if (agentContextIncluded || !fallbackBlock) {
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
            'botmux_agent_context',
            fallbackBlock,
            'application',
          ),
        }
      : {}),
  };
}
