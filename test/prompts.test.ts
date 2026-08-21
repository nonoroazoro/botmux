import { describe, expect, it } from 'vitest';
import { buildBotmuxShellHints, buildBotmuxSystemPromptText } from '../src/adapters/cli/shared-hints.js';
import { buildDocCommentApplicationContext, buildDocCommentPrompt, buildDocWatchWarmupPrompt, buildDocWatchWarmupVisibleText } from '../src/core/doc-comment-prompt.js';
import { renderPollPromptHint } from '../src/features/poll/prompt.js';
import { buildKickoffPrompt } from '../src/im/lark/issue-command-deps.js';
import { buildWorkflowGrillPrompt } from '../src/im/lark/workflow-slash-command.js';
import { INTERNAL_INSTRUCTIONS } from '../src/prompts.js';
import { DEFAULT_SUMMARY_PROMPT } from '../src/services/summary-range-store.js';
import { VC_MEETING_CONSUMER_PROFILE_TEMPLATE_CATALOG } from '../src/services/vc-meeting-consumer-profile-templates.js';
import { BUILTIN_SKILLS, ON_DEMAND_BUILTIN_SKILLS } from '../src/skills/definitions.js';
import { buildArchitectGoal } from '../src/workflows/v3/architect.js';
import { buildV3DistillationModelPrompt, buildV3DistillationSystemPrompt } from '../src/workflows/v3/distillation-runner.js';

const HAN = /\p{Script=Han}/u;

function expectInternalEnglish(name: string, value: string): void {
  expect(value, `${name} contains Han characters`).not.toMatch(HAN);
  expect(value, `${name} contains an Em Dash`).not.toContain(String.fromCodePoint(0x2014));
  expect(value.trim(), `${name} is empty`).not.toBe('');
}

describe('model-facing instruction language', () => {
  it('keeps the canonical internal instruction registry in concise English', () => {
    for (const [key, value] of Object.entries(INTERNAL_INSTRUCTIONS)) {
      expectInternalEnglish(key, value);
    }
  });

  it('keeps generated routing prompts English regardless of UI locale', () => {
    expectInternalEnglish('shell hints zh locale', buildBotmuxShellHints('zh').join('\n'));
    expectInternalEnglish('system prompt zh locale', buildBotmuxSystemPromptText({
      locale: 'zh',
      botName: 'Finder Master',
      botOpenId: 'ou_bot',
    }));
  });

  it('keeps built-in skills and specialized prompts in English', () => {
    for (const skill of [...BUILTIN_SKILLS, ...ON_DEMAND_BUILTIN_SKILLS]) {
      expectInternalEnglish(skill.name, skill.content);
    }

    const prompts = {
      summary: DEFAULT_SUMMARY_PROMPT,
      documentComment: buildDocCommentPrompt({
        fileToken: 'doc_token',
        fileType: 'docx',
        question: 'What changed?',
        author: 'Alice',
        locale: 'zh',
      }),
      documentCommentApplication: buildDocCommentApplicationContext({ locale: 'zh' }),
      documentWarmup: buildDocWatchWarmupPrompt({ fileToken: 'doc_token', fileType: 'docx', locale: 'zh' }),
      poll: renderPollPromptHint('创建一个投票', 'zh'),
      issueKickoff: buildKickoffPrompt({ title: 'Fix timeout', workingDir: '/work/repo', issueId: 'issue-1' }),
      workflowGrill: buildWorkflowGrillPrompt('Investigate the failure'),
      workflowArchitect: buildArchitectGoal('/run/spec.md', '/run/spec.json'),
      distillationSystem: buildV3DistillationSystemPrompt(),
      distillationModel: buildV3DistillationModelPrompt({ schemaVersion: 1, fields: [] }),
    };

    for (const [name, value] of Object.entries(prompts)) {
      expectInternalEnglish(name, value);
    }
  });
});

describe('user-visible localization boundary', () => {
  it('preserves localized Chinese UI text', () => {
    expect(buildDocWatchWarmupVisibleText({
      fileToken: 'doc_token',
      fileType: 'docx',
      locale: 'zh',
    })).toBe('文档评论助手预热：https://feishu.cn/docx/doc_token');
    expect(VC_MEETING_CONSUMER_PROFILE_TEMPLATE_CATALOG.templates[0]?.title.zh).toBe('会议重要信息同步');
  });
});
