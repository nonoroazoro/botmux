/** Natural-language `/workflow` entry for the v3 grill. */

export const WORKFLOW_USAGE =
  '用法：/workflow <目标>（即兴） | /workflow run <名称> | /workflow save last [名称] | /workflow cancel <runId> | /workflow list。';

export type WorkflowGrillTrigger =
  | { kind: 'goal'; goal: string }
  | { kind: 'usage' };

/**
 * Parse only the v3 grill entry. Reserved v3 verbs are handled by the saved
 * workflow/daemon command paths before this parser is called.
 */
export function parseWorkflowGrillTrigger(content: string): WorkflowGrillTrigger | null {
  const trimmed = content.trim();
  const match = /^\/workflow(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) return null;
  const tail = (match[1] ?? '').trim();
  if (!tail) return { kind: 'usage' };
  const firstToken = tail.split(/\s+/)[0] ?? '';
  if (['run', 'save', 'list', 'show', 'cancel', 'resume'].includes(firstToken)) return null;
  const goal = firstToken === 'new' ? tail.slice(firstToken.length).trim() : tail;
  return goal ? { kind: 'goal', goal } : { kind: 'usage' };
}

export function buildWorkflowGrillPrompt(goal: string): string {
  return [
    '[/workflow new] The user explicitly started an ad hoc Workflow.',
    'Read and follow the `botmux-workflow` skill. Skip intent confirmation, clarify the goal one question at a time in the current Lark topic, compile the approved specification into a DAG, and execute it to completion.',
    '',
    '<user_goal>',
    goal,
    '</user_goal>',
  ].join('\n');
}

/** `/template` is a stable tombstone after the v2 runtime retirement. */
export function isLegacyTemplateCommand(content: string): boolean {
  return /^\/template(?:\s|$)/.test(content.trim());
}

export const LEGACY_TEMPLATE_RETIRED_MESSAGE =
  'v2 workflow 已下线，`/template` 不再执行。请先运行 `botmux template migrate-v3` 迁移定义，' +
  '然后使用 `/workflow run <名称>`；历史运行仅可通过离线归档审计。';
