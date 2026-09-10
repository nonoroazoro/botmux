import { resetMemoryFs } from '../../helpers/memory-fs/index.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('../../helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('../../helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-capability-card-1': null,
  });
});

import {
  createCapability,
  createCapabilityDeleteProposal,
  createCapabilitySaveProposal,
  listCapabilities,
  loadCapabilityProposal,
} from '../../../src/core/capabilities/index.js';
import { handleCapabilityCardAction } from '../../../src/im/lark/capability-card-handler.js';
import {
  CAPABILITY_ACCEPT_ACTION,
  CAPABILITY_ACCEPT_CONTRIBUTE_ACTION,
  CAPABILITY_REJECT_ACTION,
  buildCapabilityProposalCard,
  buildCapabilityDeleteRequestStatusCard,
  buildCapabilityProposalResultCard,
} from '../../../src/im/lark/capability-card.js';

describe('capability card handler', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = '/fixtures/botmux-capability-card-1';
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function proposeWorkflow() {
    return createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_1',
      targetScope: {
        kind: 'personal',
        larkAppId: 'app_1',
        principal: { kind: 'union', unionId: 'on_user' },
      },
      draft: {
        type: 'workflow',
        name: 'weekly-product-report',
        description: 'Create a weekly Product report for a requested region',
        instructions: [
          '## Inputs',
          '- `region` (required): Report region.',
          '',
          '## Steps',
          '1. Collect current Product metrics.',
          '2. Write the report.',
          '',
          '## Success criteria',
          '- The report contains the requested region and metrics.',
        ].join('\n'),
      },
      workflowTrial: {
        outcome: 'passed_with_limitations',
        summary: 'Tested the APAC input. The report contained the requested region and metrics; live publication was not attempted.',
      },
    });
  }

  it('saves a Dynamic Workflow personally and submits a separate team proposal', async () => {
    const proposed = proposeWorkflow();
    const deliverOwnerProposal = vi.fn(async () => undefined);
    const deps = {
      dataDir,
      ownerOpenId: () => 'ou_owner',
      resolveOperatorUnionId: async () => 'on_user',
      deliverOwnerProposal,
    };

    const personalResult = await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_CONTRIBUTE_ACTION,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
    }, {
      operator: { open_id: 'ou_user', union_id: 'on_user' },
    }, 'app_1', deps);

    expect(personalResult).toMatchObject({
      header: { title: { content: '已保存到个人助手' } },
      elements: [{
        text: { tag: 'lark_md', content: '**Dynamic Workflow:** weekly-product-report' },
      }],
    });
    expect(listCapabilities(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_user' },
    })).toHaveLength(1);
    expect(deliverOwnerProposal).toHaveBeenCalledTimes(1);
    expect(deliverOwnerProposal.mock.calls[0]?.[2]).toMatchObject({
      operation: 'contribute',
      targetScope: { kind: 'bot', larkAppId: 'app_1' },
      draft: { type: 'workflow', name: 'weekly-product-report' },
    });
    const contribution = deliverOwnerProposal.mock.calls[0]?.[2];
    const contributionNonce = deliverOwnerProposal.mock.calls[0]?.[3];
    expect(contributionNonce).toMatch(/^[0-9a-f]{64}$/);
    if (!contribution || !contributionNonce) throw new Error('Expected a team contribution');

    const ownerResult = await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_ACTION,
      proposalId: contribution.proposalId,
      nonce: contributionNonce,
    }, {
      operator: { open_id: 'ou_owner' },
    }, 'app_1', {
      ...deps,
      resolveOperatorUnionId: async () => undefined,
    });

    expect(ownerResult).toMatchObject({
      header: { title: { content: '已保存到团队' } },
      elements: [{
        text: { tag: 'lark_md', content: '**Dynamic Workflow:** weekly-product-report' },
      }],
    });
    const botArtifacts = listCapabilities(dataDir, { kind: 'bot', larkAppId: 'app_1' });
    expect(botArtifacts).toHaveLength(1);
    expect(botArtifacts[0]?.type).toBe('workflow');
  });

  it('does not save when team contribution is requested without a bot owner', async () => {
    const proposed = proposeWorkflow();
    const result = await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_CONTRIBUTE_ACTION,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
    }, {
      operator: { open_id: 'ou_user', union_id: 'on_user' },
    }, 'app_1', {
      dataDir,
      ownerOpenId: () => undefined,
      resolveOperatorUnionId: async () => 'on_user',
      deliverOwnerProposal: async () => undefined,
    });

    expect(result).toEqual({
      toast: {
        type: 'warning',
        content: '该机器人尚未配置 owner，无法申请共享给团队。',
      },
    });
    expect(listCapabilities(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_user' },
    })).toEqual([]);
  });

  it('requires a destructive confirmation card before hard deletion', async () => {
    const proposed = proposeWorkflow();
    const deps = {
      dataDir,
      ownerOpenId: () => 'ou_owner',
      resolveOperatorUnionId: async () => 'on_user',
      deliverOwnerProposal: async () => undefined,
    };
    await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_ACTION,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
    }, {
      operator: { open_id: 'ou_user', union_id: 'on_user' },
    }, 'app_1', deps);
    const scope = {
      kind: 'personal' as const,
      larkAppId: 'app_1',
      principal: { kind: 'union' as const, unionId: 'on_user' },
    };
    const artifact = listCapabilities(dataDir, scope)[0];
    expect(artifact).toBeDefined();
    if (!artifact) throw new Error('Expected a saved artifact');
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_2',
      targetScope: scope,
      artifactId: artifact.artifactId,
    });
    const card = JSON.parse(buildCapabilityProposalCard(
      deletion.proposal,
      deletion.nonce,
    )) as Record<string, unknown>;
    expect(JSON.stringify(card)).toContain('全部历史版本');
    expect(JSON.stringify(card)).toContain('"type":"danger"');

    const result = await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_ACTION,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
    }, {
      operator: { open_id: 'ou_user', union_id: 'on_user' },
    }, 'app_1', deps);

    expect(result).toMatchObject({
      header: { title: { content: '已删除个人内容' } },
    });
    expect(listCapabilities(dataDir, scope)).toEqual([]);
  });

  it('notifies the requester after the owner decides a team deletion request', async () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const saved = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_owner' },
      requesterOpenId: 'ou_owner',
      larkAppId: 'app_1',
      sessionId: 'session_owner',
      turnId: 'turn_save',
      targetScope: scope,
      draft: {
        type: 'knowledge',
        name: 'product-orange-release',
        description: 'Explain the shared orange release convention.',
        instructions: 'An orange release requires frontend and backend smoke checks.',
      },
    });
    await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_ACTION,
      proposalId: saved.proposal.proposalId,
      nonce: saved.nonce,
    }, {
      operator: { open_id: 'ou_owner' },
    }, 'app_1', {
      dataDir,
      ownerOpenId: () => 'ou_owner',
      resolveOperatorUnionId: async () => undefined,
      deliverOwnerProposal: async () => undefined,
    });
    const artifact = listCapabilities(dataDir, scope)[0];
    expect(artifact).toBeDefined();
    if (!artifact) throw new Error('Expected a team artifact');
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_contributor' },
      requesterOpenId: 'ou_contributor',
      larkAppId: 'app_1',
      sessionId: 'session_contributor',
      turnId: 'turn_delete',
      targetScope: scope,
      artifactId: artifact.artifactId,
      reason: 'The shared convention is obsolete.',
    });
    const enqueueRequesterCard = vi.fn();

    const result = await handleCapabilityCardAction({
      action: CAPABILITY_ACCEPT_ACTION,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
    }, {
      operator: { open_id: 'ou_owner' },
    }, 'app_1', {
      dataDir,
      ownerOpenId: () => 'ou_owner',
      resolveOperatorUnionId: async () => undefined,
      deliverOwnerProposal: async () => undefined,
      enqueueRequesterCard,
    });

    expect(result).toMatchObject({
      header: { title: { content: '已删除团队内容' } },
    });
    expect(enqueueRequesterCard).toHaveBeenCalledOnce();
    expect(enqueueRequesterCard.mock.calls[0]?.[1]).toBe('ou_contributor');
    expect(enqueueRequesterCard.mock.calls[0]?.[2]).toContain('团队删除申请已通过');
    expect(loadCapabilityProposal(dataDir, deletion.proposal.proposalId))
      .toMatchObject({ requesterNotificationState: 'queued' });
    expect(listCapabilities(dataDir, scope)).toEqual([]);
  });

  it('notifies the requester when the owner rejects a team deletion request', async () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifact = createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the shared orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    }).metadata;
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_contributor' },
      requesterOpenId: 'ou_contributor',
      larkAppId: 'app_1',
      sessionId: 'session_contributor',
      turnId: 'turn_delete',
      targetScope: scope,
      artifactId: artifact.artifactId,
      reason: 'The shared convention is obsolete.',
    });
    const enqueueRequesterCard = vi.fn();

    const result = await handleCapabilityCardAction({
      action: CAPABILITY_REJECT_ACTION,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
    }, {
      operator: { open_id: 'ou_owner' },
    }, 'app_1', {
      dataDir,
      ownerOpenId: () => 'ou_owner',
      resolveOperatorUnionId: async () => undefined,
      deliverOwnerProposal: async () => undefined,
      enqueueRequesterCard,
    });

    expect(result).toMatchObject({
      header: { title: { content: '已拒绝删除申请' } },
    });
    expect(enqueueRequesterCard).toHaveBeenCalledOnce();
    expect(enqueueRequesterCard.mock.calls[0]?.[1]).toBe('ou_contributor');
    expect(enqueueRequesterCard.mock.calls[0]?.[2]).toContain('团队删除申请已拒绝');
    expect(loadCapabilityProposal(dataDir, deletion.proposal.proposalId))
      .toMatchObject({ requesterNotificationState: 'queued' });
    expect(listCapabilities(dataDir, scope)).toHaveLength(1);
  });

  it('uses dedicated artifact status cards for team deletion requests', () => {
    const pending = JSON.parse(buildCapabilityDeleteRequestStatusCard({
      state: 'pending',
      type: 'knowledge',
      name: 'product-orange-release',
    }, 'zh')) as {
      header: { title: { content: string } };
      elements: Array<{ fields?: Array<{ text?: { content?: string } }> }>;
    };
    expect(pending.header.title.content).toBe('团队删除申请已提交');
    expect(pending.elements[0]?.fields?.map(field => field.text?.content)).toEqual([
      '**类型**\nKnowledge',
      '**名称**\nproduct-orange-release',
    ]);
  });

  it('renders explicit personal, team, and cancel choices in both locales', () => {
    const proposed = proposeWorkflow();
    const zhCard = JSON.parse(buildCapabilityProposalCard(
      proposed.proposal,
      proposed.nonce,
      'zh',
    )) as {
      header: { title: { content: string } };
      elements: Array<{
        text?: { tag?: string; content?: string };
        fields?: Array<{
          is_short?: boolean;
          text?: { tag?: string; content?: string };
        }>;
        actions?: Array<{ text?: { content?: string } }>;
      }>;
    };
    const zhMetadata = zhCard.elements.find(element => element.fields)?.fields;
    const zhFields = zhCard.elements
      .flatMap(element => element.fields ?? [])
      .map(field => field.text?.content);
    const zhContent = zhCard.elements
      .flatMap(element => element.text?.content ?? []);
    const zhButtons = zhCard.elements
      .flatMap(element => element.actions ?? [])
      .map(button => button.text?.content);
    expect(zhCard.header.title.content).toBe('请选择如何保存这条 Dynamic Workflow');
    expect(zhMetadata).toEqual([
      {
        is_short: true,
        text: { tag: 'lark_md', content: '**类型**\nDynamic Workflow' },
      },
      {
        is_short: true,
        text: { tag: 'lark_md', content: '**名称**\nweekly-product-report' },
      },
    ]);
    expect(zhContent).toContain('**说明**\nCreate a weekly Product report for a requested region');
    expect(zhContent.some(content => content.startsWith('**内容**\n\\#\\# Inputs'))).toBe(true);
    expect(zhFields).toContain('**Agent 试运行判断**\n通过，但存在限制');
    expect(zhContent).toContain('**试运行摘要**\nTested the APAC input. The report contained the requested region and metrics; live publication was not attempted.');
    expect(zhButtons).toEqual([
      '保存到个人',
      '保存到个人并申请共享给团队',
      '取消',
    ]);

    const enCard = JSON.parse(buildCapabilityProposalCard(
      proposed.proposal,
      proposed.nonce,
      'en',
    )) as typeof zhCard;
    const enMetadata = enCard.elements.find(element => element.fields)?.fields;
    const enFields = enCard.elements
      .flatMap(element => element.fields ?? [])
      .map(field => field.text?.content);
    const enContent = enCard.elements
      .flatMap(element => element.text?.content ?? []);
    const enButtons = enCard.elements
      .flatMap(element => element.actions ?? [])
      .map(button => button.text?.content);
    expect(enCard.header.title.content).toBe('Choose how to save this Dynamic Workflow');
    expect(enMetadata).toEqual([
      {
        is_short: true,
        text: { tag: 'lark_md', content: '**Type**\nDynamic Workflow' },
      },
      {
        is_short: true,
        text: { tag: 'lark_md', content: '**Name**\nweekly-product-report' },
      },
    ]);
    expect(enContent).toContain('**Description**\nCreate a weekly Product report for a requested region');
    expect(enContent.some(content => content.startsWith('**Instructions**\n\\#\\# Inputs'))).toBe(true);
    expect(enFields).toContain('**Agent trial assessment**\nPassed with limitations');
    expect(enContent).toContain('**Trial summary**\nTested the APAC input. The report contained the requested region and metrics; live publication was not attempted.');
    expect(enButtons).toEqual([
      'Save for me',
      'Save for me and request team sharing',
      'Cancel',
    ]);
  });

  it('escapes artifact content before rendering structured Markdown fields', () => {
    const proposed = proposeWorkflow();
    if (proposed.proposal.operation === 'delete') {
      throw new Error('Expected a content proposal');
    }
    proposed.proposal.draft.description = '<at id=all></at> **urgent** [details]';

    const card = JSON.parse(buildCapabilityProposalCard(
      proposed.proposal,
      proposed.nonce,
      'zh',
    )) as {
      elements: Array<{ text?: { content?: string } }>;
    };
    const description = card.elements
      .map(element => element.text?.content)
      .find(content => content?.startsWith('**说明**'));

    expect(description).toBe(
      '**说明**\n&lt;at id=all&gt;&lt;/at&gt; \\*\\*urgent\\*\\* \\[details\\]',
    );
  });

  it.each([
    ['knowledge', 'Knowledge', 'Reusable Product facts.'],
    ['skill', 'Skill', 'Reusable Product operating guidance.'],
    [
      'workflow',
      'Dynamic Workflow',
      '## Inputs\n- None.\n\n## Steps\n1. Check Product.\n\n## Success criteria\n- Product is checked.',
    ],
  ] as const)('uses the shared artifact card standard for %s', (type, label, instructions) => {
    const proposed = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: `turn_${type}`,
      targetScope: {
        kind: 'personal',
        larkAppId: 'app_1',
        principal: { kind: 'union', unionId: 'on_user' },
      },
      draft: {
        type,
        name: `product-${type}`,
        description: `Reusable Product ${type}.`,
        instructions,
      },
      ...(type === 'workflow' ? {
        workflowTrial: {
          outcome: 'passed' as const,
          summary: 'Tested the minimal input and observed the expected Product output.',
        },
      } : {}),
    });
    const proposalCard = JSON.parse(buildCapabilityProposalCard(
      proposed.proposal,
      proposed.nonce,
      'zh',
    )) as {
      elements: Array<{
        fields?: Array<{ text?: { content?: string } }>;
      }>;
    };
    const metadata = proposalCard.elements.find(element => element.fields)?.fields;
    expect(metadata?.[0]?.text?.content).toBe(`**类型**\n${label}`);
    expect(metadata?.[1]?.text?.content).toBe(`**名称**\nproduct-${type}`);

    const resultCard = JSON.parse(buildCapabilityProposalResultCard({
      state: 'accepted',
      operation: 'save',
      scope: 'personal',
      type,
      name: `product-${type}`,
    }, 'zh')) as {
      elements: Array<{ text?: { content?: string } }>;
    };
    expect(resultCard.elements[0]?.text?.content).toBe(`**${label}:** product-${type}`);
  });
});
