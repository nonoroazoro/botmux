import { describe, expect, it } from 'vitest';
import {
  ASK_SKILL,
  BUILTIN_SKILLS,
  ON_DEMAND_BUILTIN_SKILLS,
  WHITEBOARD_SKILL,
  WHITEBOARD_SKILL_NAME,
  type SkillDef,
} from '../src/skills/definitions.js';

function contentOf(name: string, definitions: SkillDef[] = BUILTIN_SKILLS): string {
  const skill = definitions.find((candidate) => candidate.name === name);
  expect(skill, `Missing built-in skill: ${name}`).toBeDefined();
  return skill?.content ?? '';
}

describe('botmux-send', () => {
  it('defines transport without prescribing conversation content', () => {
    const content = contentOf('botmux-send');
    expect(content).toContain('defines transport only');
    expect(content).toContain('does not decide what the agent should say or when a reply is warranted');
  });

  it('documents safe content transport across Unix and Windows shells', () => {
    const content = contentOf('botmux-send');
    expect(content).toContain("botmux send --mention-back <<'EOF'");
    expect(content).toContain('powershell');
    expect(content).toContain('Set-Content -LiteralPath $messageFile -Encoding utf8');
    expect(content).toContain('--content-file');
    expect(content).toContain('Only `--card-json` and `--card-file` are parsed as JSON');
    expect(content).toContain('literal `\\n` sequences');
    expect(content).toContain('Avoid command substitution');
  });

  it('documents notification switches and body precedence', () => {
    const content = contentOf('botmux-send');
    expect(content).toContain('`--mention-back` and `--no-mention` are switches and take no value');
    expect(content).toContain('--mention <open_id[:name]>');
    expect(content).toContain('Body precedence is `--content-file`, then the positional argument, then stdin');
  });

  it('documents the attention lifecycle and restrictions', () => {
    const content = contentOf('botmux-send');
    const frontmatter = content.split('---')[1] ?? '';
    expect(frontmatter).toContain('--attention');
    expect(frontmatter).toContain('blocked');
    expect(content).toContain('--attention=authz');
    expect(content).toContain('non-blocking');
    expect(content).toContain('clears automatically');
    expect(content).toContain('botmux ask');
    expect(content).toContain('--top-level');
  });
});

describe('botmux-history and botmux-quoted', () => {
  it('documents paginated group, direct-message, and thread history', () => {
    const content = contentOf('botmux-history');
    expect(content).toContain('--scope ambient');
    expect(content).toContain('--scope chat');
    expect(content).toContain('--cursor <nextCursor>');
    expect(content).toContain('hasMore');
    expect(content).toContain('nextCursor');
    expect(content).toContain('Automatic lookup is allowed only');
    expect(content).toContain('unless the user explicitly requests history outside the topic');
    expect(content).toContain('use the open ID from prompt metadata');
  });

  it('documents quote-hint discovery and resource retrieval', () => {
    const content = contentOf('botmux-quoted');
    expect(content).toContain('[The user quoted a message');
    expect(content).toContain('botmux quoted <message_id>');
    expect(content).toContain('--raw');
    expect(content).toContain('attachments');
  });

});

describe('personal assistant artifacts', () => {
  it('routes CRUD and semantic overlap review through code-controlled flows', () => {
    const content = contentOf('botmux-artifacts');
    for (const command of ['artifact list', 'artifact show', 'artifact history', 'artifact delete']) {
      expect(content).toContain(command);
    }
    for (const creator of ['botmux-knowledge-creator', 'botmux-skill-creator', 'botmux-workflow-creator']) {
      expect(content).toContain(`botmux skill show ${creator}`);
    }
    expect(content).toContain('Semantic overlap review');
    expect(content).toContain('artifact search --scope <scope> --type <type>');
    expect(content).toContain('at most three plausible candidates');
    expect(content).toContain('future behavior, not keyword similarity');
    expect(content).toContain('botmux artifact overlap');
    expect(content).toContain('code-controlled overlap card');
    expect(content).toContain('botmux code owns structured validation');
    expect(content).toContain('current agent performs those semantic steps');
    expect(content).toContain('Do not call `botmux send` or emit chat text');
    expect(content).not.toContain('botmux ask');
    expect(content).not.toContain('Codex');
    expect(content).not.toContain('Claude');
  });

  it('ships independent creators for Knowledge, Skill, and Dynamic Workflow', () => {
    const knowledge = contentOf('botmux-knowledge-creator');
    const skill = contentOf('botmux-skill-creator');
    const workflow = contentOf('botmux-workflow-creator');
    expect(knowledge).toContain('--type knowledge');
    expect(knowledge).toContain('source references');
    expect(knowledge).toContain('freshness or review dates');
    expect(skill).toContain('--type skill');
    expect(skill).toContain('single-file Skill');
    expect(skill).toContain('2 to 3 realistic prompts');
    expect(skill).toContain('Do not mutate external state solely for evaluation');
    expect(workflow).toContain('--type workflow');
    expect(workflow).toContain('current LLM executes the Workflow');
    expect(workflow).toContain('botmux artifact trial');
    expect(workflow).toContain('## Inputs');
    expect(workflow).toContain('## Success criteria');
    expect(workflow).toContain('## Failure handling');
    expect(workflow).toContain('bounded retries');
    expect(workflow).toContain('A failed, inconclusive, or changed draft requires another trial card');

    for (const content of [knowledge, skill, workflow]) {
      expect(content).toContain('artifact save');
      expect(content).toContain('using your semantic judgment');
      expect(content).toContain('Write it in English unless');
      expect(content).toContain('Input language alone is not such a request');
      expect(content).toContain('Work silently until the next code-owned card');
      expect(content).toContain('Personal scope controls visibility, not content portability');
      expect(content).toContain('must not be proposed to a team');
    }
  });
});

describe('collaboration skills', () => {
  it('documents roster fields and mention eligibility', () => {
    const content = contentOf('botmux-bots');
    for (const field of ['capability', 'hasTeamRole', 'mentionable=true', '/introduce', 'larkAppId', 'openId']) {
      expect(content).toContain(field);
    }
  });

  it('documents all five handoff fields', () => {
    const content = contentOf('botmux-handoff');
    for (const field of ['recipient', 'current conclusion', 'relevant context', 'requested next action', 'completion criteria']) {
      expect(content).toContain(field);
    }
    expect(content).toContain('botmux bots list');
    expect(content).toContain('botmux send --mention');
  });

  it('keeps long-running orchestration distinct from Dynamic Workflow', () => {
    const content = contentOf('botmux-orchestrate');
    expect(content).toContain('multiple bots own independent workstreams');
    expect(content).toContain('persistent multi-topic coordination');
    expect(content).toContain('shared task board');
    expect(content).toContain('Dynamic Workflow');
  });
});

describe('conditional skills', () => {
  it('keeps whiteboard opt-in and compare-and-set safe', () => {
    expect(BUILTIN_SKILLS.some((candidate) => candidate.name === WHITEBOARD_SKILL_NAME)).toBe(false);
    expect(WHITEBOARD_SKILL).toContain('disabled by default');
    expect(WHITEBOARD_SKILL).toContain('botmux whiteboard update');
    expect(WHITEBOARD_SKILL).toContain('--expected-updated-at');
    expect(WHITEBOARD_SKILL).toContain('Never write secrets');
    expect(WHITEBOARD_SKILL).not.toContain('botmux whiteboard post');
  });

  it('keeps ask conditional and documents stdout and clicker identity', () => {
    expect(BUILTIN_SKILLS.some((candidate) => candidate.name === 'botmux-ask')).toBe(false);
    expect(ASK_SKILL).toContain('writes the selected key to stdout');
    expect(ASK_SKILL).toContain('does not send stdout back to Lark');
    expect(ASK_SKILL).toContain('may differ from the card clicker');
    expect(ASK_SKILL).toContain('botmux send --mention <open_id>');
  });

});
