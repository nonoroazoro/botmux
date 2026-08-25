import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acceptCapabilityProposal,
  capabilityProposalDispatchUuid,
  capabilityProposalRecipientOpenId,
  capabilityRequesterNotificationDispatchUuid,
  createCapability,
  deleteCapability,
  createCapabilityDeleteProposal,
  createCapabilitySaveProposal,
  createCapabilityContributionProposal,
  discardUndeliveredCapabilityProposal,
  listPendingCapabilityProposals,
  listPendingCapabilityRequesterNotifications,
  listCapabilities,
  loadCapabilityProposal,
  markCapabilityRequesterNotificationQueued,
  readCapabilityRevision,
  rejectCapabilityProposal,
  reviseCapability,
  rotateCapabilityProposalNonce,
} from '../../../src/core/capabilities/index.js';

describe('capability proposal store', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'botmux-capability-proposal-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function save() {
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
        type: 'knowledge',
        name: 'product-context',
        description: 'Product team context',
        instructions: 'The product has a legacy internal alias.',
      },
      now: new Date('2026-08-12T00:00:00.000Z'),
    });
  }

  it('rejects an exact retry while the original save proposal is pending', () => {
    const proposed = save();

    expect(() => save()).toThrow('capability_save_request_already_pending');
    expect(listPendingCapabilityProposals(
      dataDir,
      'app_1',
      new Date('2026-08-12T01:00:00.000Z'),
    )).toEqual([proposed.proposal]);
  });

  it('requires the exact requester to accept a personal proposal', () => {
    const proposed = save();
    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_other',
      operatorUnionId: 'on_other',
      now: new Date('2026-08-12T01:00:00.000Z'),
    })).toThrow('operator mismatch');

    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });

    expect(accepted.state).toBe('accepted');
    expect(listCapabilities(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_user' },
    })).toHaveLength(1);
    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T02:00:00.000Z'),
    })).toThrow('no longer pending');
  });

  it('routes every team proposal to the owner during recovery', () => {
    const personal = save().proposal;
    expect(capabilityProposalRecipientOpenId(personal, 'ou_owner')).toBe('ou_user');

    const bot = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_bot',
      targetScope: { kind: 'bot', larkAppId: 'app_1' },
      draft: {
        type: 'knowledge',
        name: 'team-context',
        description: 'Shared team context.',
        instructions: 'Use the shared context.',
      },
    }).proposal;

    expect(capabilityProposalRecipientOpenId(bot, 'ou_owner')).toBe('ou_owner');
    expect(capabilityProposalRecipientOpenId(bot, undefined)).toBeUndefined();
  });

  it('creates a separate immutable contribution for owner approval', () => {
    const proposed = save();
    acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const contribution = createCapabilityContributionProposal({
      dataDir,
      saveProposalId: proposed.proposal.proposalId,
      requesterOpenId: 'ou_user',
      now: new Date('2026-08-12T02:00:00.000Z'),
    });

    expect(contribution.proposal.operation).toBe('contribute');
    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: contribution.proposal.proposalId,
      nonce: contribution.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      ownerOpenId: 'ou_owner',
      now: new Date('2026-08-12T03:00:00.000Z'),
    })).toThrow('operator mismatch');
    acceptCapabilityProposal({
      dataDir,
      proposalId: contribution.proposal.proposalId,
      nonce: contribution.nonce,
      operatorOpenId: 'ou_owner',
      ownerOpenId: 'ou_owner',
      now: new Date('2026-08-12T03:00:00.000Z'),
    });

    const personal = listCapabilities(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_user' },
    });
    const bot = listCapabilities(dataDir, { kind: 'bot', larkAppId: 'app_1' });
    expect(personal).toHaveLength(1);
    expect(bot).toHaveLength(1);
    expect(bot[0].artifactId).not.toBe(personal[0].artifactId);
    const botRevision = readCapabilityRevision(
      dataDir,
      { kind: 'bot', larkAppId: 'app_1' },
      bot[0].artifactId,
      bot[0].latestRevision,
    );
    expect(JSON.stringify(botRevision)).not.toContain('on_user');
    expect(JSON.stringify(botRevision)).not.toContain('session_1');
    expect(JSON.stringify(botRevision)).not.toContain('turn_1');
  });

  it('requires the bot owner for direct bot save and delete operations', () => {
    const proposed = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_owner' },
      requesterOpenId: 'ou_owner',
      larkAppId: 'app_1',
      sessionId: 'session_owner',
      turnId: 'turn_1',
      targetScope: { kind: 'bot', larkAppId: 'app_1' },
      draft: {
        type: 'skill',
        name: 'product-debugging',
        description: 'Debug Product issues',
        instructions: 'Clone every relevant repository before inspecting code.',
      },
    });
    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      ownerOpenId: 'ou_owner',
    })).toThrow('operator mismatch');
    acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_owner',
      ownerOpenId: 'ou_owner',
    });
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifact = listCapabilities(dataDir, scope)[0];
    expect(artifact).toBeDefined();
    if (!artifact) throw new Error('Expected a saved bot artifact');
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_owner' },
      requesterOpenId: 'ou_owner',
      larkAppId: 'app_1',
      sessionId: 'session_owner',
      turnId: 'turn_2',
      targetScope: scope,
      artifactId: artifact.artifactId,
      reason: 'The shared Skill is obsolete.',
    });
    acceptCapabilityProposal({
      dataDir,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
      operatorOpenId: 'ou_owner',
      ownerOpenId: 'ou_owner',
    });
    expect(listCapabilities(dataDir, scope)).toEqual([]);
  });

  it('expires or rejects a proposal without publishing', () => {
    const proposed = save();
    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-14T00:00:00.000Z'),
    })).toThrow('expired');
    const rejected = rejectCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    expect(rejected.state).toBe('rejected');
    expect(loadCapabilityProposal(dataDir, proposed.proposal.proposalId)).toBeUndefined();
    expect(listPendingCapabilityProposals(dataDir, 'app_1')).toEqual([]);
    expect(listCapabilities(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_user' },
    })).toEqual([]);
  });

  it('updates a same-name artifact as a new immutable revision', () => {
    const first = save();
    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: first.proposal.proposalId,
      nonce: first.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const second = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_2',
      targetScope: {
        kind: 'personal',
        larkAppId: 'app_1',
        principal: { kind: 'union', unionId: 'on_user' },
      },
      draft: {
        type: 'knowledge',
        name: 'product-context',
        description: 'Product team context',
        instructions: 'The product has a legacy internal alias. The replay platform is shared.',
      },
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    const revised = acceptCapabilityProposal({
      dataDir,
      proposalId: second.proposal.proposalId,
      nonce: second.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T03:00:00.000Z'),
    });

    expect(revised.resultArtifactId).toBe(accepted.resultArtifactId);
    expect(revised.resultRevisionId).not.toBe(accepted.resultRevisionId);
    expect(listCapabilities(dataDir, {
      kind: 'personal',
      larkAppId: 'app_1',
      principal: { kind: 'union', unionId: 'on_user' },
    })).toHaveLength(1);
  });

  it('rejects a stale update proposal instead of overwriting a newer revision', () => {
    const first = save();
    acceptCapabilityProposal({
      dataDir,
      proposalId: first.proposal.proposalId,
      nonce: first.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const scope = {
      kind: 'personal' as const,
      larkAppId: 'app_1',
      principal: { kind: 'union' as const, unionId: 'on_user' },
    };
    const proposeUpdate = (turnId: string, instructions: string) => createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId,
      targetScope: scope,
      draft: {
        type: 'knowledge',
        name: 'product-context',
        description: 'Product team context',
        instructions,
      },
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    const earlier = proposeUpdate('turn_2', 'Product context revision two.');
    const later = proposeUpdate('turn_3', 'Product context revision three.');
    acceptCapabilityProposal({
      dataDir,
      proposalId: later.proposal.proposalId,
      nonce: later.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T03:00:00.000Z'),
    });

    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: earlier.proposal.proposalId,
      nonce: earlier.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T04:00:00.000Z'),
    })).toThrow('revision conflict');
  });

  it('hard deletes an artifact and all revisions after requester confirmation', () => {
    const proposed = save();
    acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const scope = {
      kind: 'personal' as const,
      larkAppId: 'app_1',
      principal: { kind: 'union' as const, unionId: 'on_user' },
    };
    const artifact = listCapabilities(dataDir, scope)[0];
    expect(artifact).toBeDefined();
    if (!artifact) throw new Error('Expected a saved personal artifact');
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_2',
      targetScope: scope,
      artifactId: artifact.artifactId,
      now: new Date('2026-08-12T02:00:00.000Z'),
    });

    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
      operatorOpenId: 'ou_other',
      operatorUnionId: 'on_other',
      now: new Date('2026-08-12T03:00:00.000Z'),
    })).toThrow('operator mismatch');

    const deleted = acceptCapabilityProposal({
      dataDir,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T03:00:00.000Z'),
    });
    expect(deleted.operation).toBe('delete');
    expect(deleted.state).toBe('accepted');
    expect(listCapabilities(dataDir, scope)).toEqual([]);
    expect(() => readCapabilityRevision(
      dataDir,
      scope,
      artifact.artifactId,
      artifact.latestRevision,
    )).toThrow();
  });

  it('requires a reason and deduplicates pending team deletion requests', () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifact = createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'obsolete-context',
      description: 'An obsolete team convention.',
      instructions: 'Use the obsolete convention.',
    }).metadata;
    const request = {
      dataDir,
      requester: { kind: 'app_open' as const, larkAppId: 'app_1', openId: 'ou_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_1',
      targetScope: scope,
      artifactId: artifact.artifactId,
    };

    expect(() => createCapabilityDeleteProposal(request))
      .toThrow('capability_delete_reason_required');
    const proposed = createCapabilityDeleteProposal({
      ...request,
      reason: 'The convention is no longer valid.',
    });
    expect(proposed.proposal).toMatchObject({
      operation: 'delete',
      reason: 'The convention is no longer valid.',
    });
    expect(() => createCapabilityDeleteProposal({
      ...request,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_other' },
      requesterOpenId: 'ou_other',
      reason: 'A second request must not create another owner card.',
    })).toThrow('capability_delete_request_already_pending');

    discardUndeliveredCapabilityProposal(dataDir, proposed.proposal.proposalId, proposed.nonce);
    expect(listPendingCapabilityProposals(dataDir, 'app_1')).toEqual([]);
    expect(createCapabilityDeleteProposal({
      ...request,
      reason: 'The convention is no longer valid.',
    }).proposal.state).toBe('pending');
  });

  it('allows only the bot owner to decide a team deletion request', () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifact = createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'obsolete-owner-context',
      description: 'An obsolete team convention.',
      instructions: 'Use the obsolete convention.',
    }).metadata;
    const proposed = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_contributor' },
      requesterOpenId: 'ou_contributor',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_1',
      targetScope: scope,
      artifactId: artifact.artifactId,
      reason: 'The convention is no longer valid.',
    });

    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_contributor',
      ownerOpenId: 'ou_owner',
    })).toThrow('operator mismatch');
    expect(() => rejectCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_other',
      ownerOpenId: 'ou_owner',
    })).toThrow('operator mismatch');

    const rejected = rejectCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_owner',
      ownerOpenId: 'ou_owner',
    });
    expect(rejected.state).toBe('rejected');
    expect(rejected).toMatchObject({ requesterNotificationState: 'pending' });
    expect(capabilityRequesterNotificationDispatchUuid(rejected.proposalId, 'rejected'))
      .toMatch(/^capr-[0-9a-f]{16}-rejected$/);
    expect(listPendingCapabilityRequesterNotifications(dataDir, 'app_1'))
      .toEqual([rejected]);
    markCapabilityRequesterNotificationQueued(dataDir, rejected.proposalId);
    expect(loadCapabilityProposal(dataDir, rejected.proposalId))
      .toMatchObject({ requesterNotificationState: 'queued' });
    expect(listPendingCapabilityRequesterNotifications(dataDir, 'app_1')).toEqual([]);
    expect(listCapabilities(dataDir, scope)).toHaveLength(1);
  });

  it('journals an accepted team deletion until requester notification is queued', () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifact = createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'accepted-deletion-context',
      description: 'A team convention awaiting deletion.',
      instructions: 'Use the convention until it is deleted.',
    }).metadata;
    const proposed = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_contributor' },
      requesterOpenId: 'ou_contributor',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_1',
      targetScope: scope,
      artifactId: artifact.artifactId,
      reason: 'The convention is obsolete.',
    });

    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_owner',
      ownerOpenId: 'ou_owner',
    });

    expect(accepted).toMatchObject({
      state: 'accepted',
      requesterNotificationState: 'pending',
    });
    expect(listPendingCapabilityRequesterNotifications(dataDir, 'app_1'))
      .toEqual([accepted]);
    expect(listCapabilities(dataDir, scope)).toEqual([]);
  });

  it('retains a terminal requester notification beyond the proposal deadline', () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifact = createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'late-deletion-context',
      description: 'A team convention awaiting a late deletion decision.',
      instructions: 'Use the convention until it is deleted.',
    }).metadata;
    const proposed = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'app_open', larkAppId: 'app_1', openId: 'ou_contributor' },
      requesterOpenId: 'ou_contributor',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_1',
      targetScope: scope,
      artifactId: artifact.artifactId,
      reason: 'The convention is obsolete.',
      now: new Date('2026-08-20T00:00:00.000Z'),
    });
    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_owner',
      ownerOpenId: 'ou_owner',
      now: new Date('2026-08-20T23:59:00.000Z'),
    });

    expect(listPendingCapabilityRequesterNotifications(
      dataDir,
      'app_1',
      new Date('2026-08-21T00:01:00.000Z'),
    )).toEqual([accepted]);
    expect(listPendingCapabilityRequesterNotifications(
      dataDir,
      'app_1',
      new Date('2026-08-21T23:59:01.000Z'),
    )).toEqual([]);
  });

  it('limits pending team deletion requests per requester', () => {
    const scope = { kind: 'bot' as const, larkAppId: 'app_1' };
    const artifacts = Array.from({ length: 6 }, (_, index) => createCapability(dataDir, scope, {
      type: 'knowledge',
      name: `obsolete-context-${index}`,
      description: `Obsolete team convention ${index}.`,
      instructions: `Use obsolete convention ${index}.`,
    }).metadata);
    const request = (index: number) => ({
      dataDir,
      requester: { kind: 'app_open' as const, larkAppId: 'app_1', openId: 'ou_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: `turn_${index}`,
      targetScope: scope,
      artifactId: artifacts[index]?.artifactId ?? '',
      reason: `The team convention ${index} is obsolete.`,
    });

    for (let index = 0; index < 5; index += 1) {
      expect(createCapabilityDeleteProposal(request(index)).proposal.state).toBe('pending');
    }
    expect(() => createCapabilityDeleteProposal(request(5)))
      .toThrow('capability_delete_request_rate_limited');
  });

  it('rejects deletion when a newer revision exists', () => {
    const first = save();
    acceptCapabilityProposal({
      dataDir,
      proposalId: first.proposal.proposalId,
      nonce: first.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const scope = {
      kind: 'personal' as const,
      larkAppId: 'app_1',
      principal: { kind: 'union' as const, unionId: 'on_user' },
    };
    const artifact = listCapabilities(dataDir, scope)[0];
    expect(artifact).toBeDefined();
    if (!artifact) throw new Error('Expected a saved personal artifact');
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_2',
      targetScope: scope,
      artifactId: artifact.artifactId,
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    const update = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_user' },
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_3',
      targetScope: scope,
      draft: {
        type: 'knowledge',
        name: 'product-context',
        description: 'Updated Product team context',
        instructions: 'The product alias and context have changed.',
      },
      now: new Date('2026-08-12T03:00:00.000Z'),
    });
    acceptCapabilityProposal({
      dataDir,
      proposalId: update.proposal.proposalId,
      nonce: update.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T04:00:00.000Z'),
    });

    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T05:00:00.000Z'),
    })).toThrow('revision conflict');
    expect(listCapabilities(dataDir, scope)).toHaveLength(1);
  });

  it('rotates recovery nonces and invalidates older cards', () => {
    const proposed = save();
    expect(listPendingCapabilityProposals(
      dataDir,
      'app_1',
      new Date('2026-08-12T01:00:00.000Z'),
    )).toHaveLength(1);
    const rotated = rotateCapabilityProposalNonce(
      dataDir,
      proposed.proposal.proposalId,
      new Date('2026-08-12T01:00:00.000Z'),
    );
    expect(rotated.nonce).not.toBe(proposed.nonce);
    expect(capabilityProposalDispatchUuid(
      proposed.proposal.proposalId,
      rotated.nonce,
    )).not.toBe(capabilityProposalDispatchUuid(
      proposed.proposal.proposalId,
      proposed.nonce,
    ));
    expect(capabilityProposalDispatchUuid(
      proposed.proposal.proposalId,
      rotated.nonce,
    ).length).toBeLessThanOrEqual(50);
    expect(() => acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T02:00:00.000Z'),
    })).toThrow('nonce mismatch');
    acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: rotated.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    expect(listPendingCapabilityProposals(
      dataDir,
      'app_1',
      new Date('2026-08-12T03:00:00.000Z'),
    )).toEqual([]);
  });

  it('does not recover expired proposals', () => {
    const proposed = save();
    expect(listPendingCapabilityProposals(
      dataDir,
      'app_1',
      new Date('2026-08-14T00:00:00.000Z'),
    )).toEqual([]);
    expect(loadCapabilityProposal(dataDir, proposed.proposal.proposalId)).toBeUndefined();
  });

  it('recovers a create committed before the proposal state write', () => {
    const proposed = save();
    createCapability(dataDir, proposed.proposal.targetScope, proposed.proposal.draft, {
      now: new Date('2026-08-12T01:00:00.000Z'),
    });

    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: proposed.proposal.proposalId,
      nonce: proposed.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T02:00:00.000Z'),
    });

    expect(accepted.state).toBe('accepted');
    expect(listCapabilities(dataDir, proposed.proposal.targetScope)).toHaveLength(1);
  });

  it('recovers a revision committed before the proposal state write', () => {
    const first = save();
    acceptCapabilityProposal({
      dataDir,
      proposalId: first.proposal.proposalId,
      nonce: first.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const scope = first.proposal.targetScope;
    const artifact = listCapabilities(dataDir, scope)[0];
    if (!artifact) throw new Error('Expected the initial capability');
    const update = createCapabilitySaveProposal({
      dataDir,
      requester: first.proposal.requester,
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_2',
      targetScope: scope,
      draft: {
        ...first.proposal.draft,
        instructions: 'The updated content was committed before proposal settlement.',
      },
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    reviseCapability(dataDir, scope, artifact.artifactId, update.proposal.draft, {
      expectedLatestRevision: artifact.latestRevision,
      now: new Date('2026-08-12T03:00:00.000Z'),
    });

    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: update.proposal.proposalId,
      nonce: update.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T04:00:00.000Z'),
    });

    expect(accepted.state).toBe('accepted');
    expect(accepted.resultArtifactId).toBe(artifact.artifactId);
  });

  it('recovers a delete committed before the proposal state write', () => {
    const first = save();
    acceptCapabilityProposal({
      dataDir,
      proposalId: first.proposal.proposalId,
      nonce: first.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T01:00:00.000Z'),
    });
    const scope = first.proposal.targetScope;
    const artifact = listCapabilities(dataDir, scope)[0];
    if (!artifact) throw new Error('Expected the initial capability');
    const deletion = createCapabilityDeleteProposal({
      dataDir,
      requester: first.proposal.requester,
      requesterOpenId: 'ou_user',
      larkAppId: 'app_1',
      sessionId: 'session_1',
      turnId: 'turn_2',
      targetScope: scope,
      artifactId: artifact.artifactId,
      now: new Date('2026-08-12T02:00:00.000Z'),
    });
    deleteCapability(dataDir, scope, artifact.artifactId, artifact.latestRevision);

    const accepted = acceptCapabilityProposal({
      dataDir,
      proposalId: deletion.proposal.proposalId,
      nonce: deletion.nonce,
      operatorOpenId: 'ou_user',
      operatorUnionId: 'on_user',
      now: new Date('2026-08-12T03:00:00.000Z'),
    });

    expect(accepted.state).toBe('accepted');
    expect(listCapabilities(dataDir, scope)).toEqual([]);
  });
});
