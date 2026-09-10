import * as sessionStore from '../src/services/session-store.js';
import { resetMemoryFs } from './helpers/memory-fs/index.js';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async () => (await import('./helpers/memory-fs/index.js')).fs);
vi.mock('node:fs/promises', async () => (await import('./helpers/memory-fs/index.js')).fs.promises);

// Reset the in-memory fixture tree between cases; no host directories are created.
beforeEach(() => {
  resetMemoryFs({
    '/fixtures/botmux-capability-ipc-1': null,
  });
});

import { config } from '../src/config.js';
import { __testOnly_resetBotRegistry, registerBot } from '../src/bot-registry.js';
import {
  setIpcAuthSecret,
  startCapabilityProposalDelivery,
  startIpcServer,
  stopCapabilityProposalDelivery,
  type IpcServerHandle,
} from '../src/core/dashboard-ipc-server.js';
import * as askBroker from '../src/core/ask-broker.js';
import * as libraryStore from '../src/core/capabilities/library-store.js';
import {
  createCapabilitySaveProposal,
  listPendingCapabilityProposals,
} from '../src/core/capabilities/index.js';
import {
  issueWorkflowTrialTicket,
  resetWorkflowTrialTicketsForTest,
} from '../src/core/capabilities/workflow-trial-ticket.js';
import * as workerPool from '../src/core/worker-pool.js';
import { LarkMessageSendError } from '../src/im/index.js';
import * as larkClient from '../src/im/lark/client.js';

const CAPABILITY = 'cafe1234'.repeat(8);
const SESSION_ID = 'artifact-session';
const TURN_ID = 'om_artifact_turn';

let handle: IpcServerHandle | null = null;
let dataDir: string;
let previousDataDir: string;

beforeEach(() => {
  dataDir = '/fixtures/botmux-capability-ipc-1';
  previousDataDir = config.session.dataDir;
  config.session.dataDir = dataDir;
  sessionStore.init('cli_artifact_bot');
  registerBot({
    larkAppId: 'cli_artifact_bot',
    larkAppSecret: '',
    cliId: 'codex',
    apiOnly: true,
    ownerOpenId: 'ou_bot_owner',
    allowedUsers: ['ou_bot_owner'],
  });
});

afterEach(async () => {
  if (handle) await handle.close();
  handle = null;
  stopCapabilityProposalDelivery();
  setIpcAuthSecret(null);
  vi.restoreAllMocks();
  resetWorkflowTrialTicketsForTest();
  askBroker._resetForTest();
  __testOnly_resetBotRegistry();
  config.session.dataDir = previousDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

async function postManage(body: Record<string, unknown>): Promise<Response> {
  if (!handle) {
    handle = await startIpcServer({ port: 0, host: '127.0.0.1' });
  }
  return fetch(`http://127.0.0.1:${handle.port}/api/capabilities/manage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: SESSION_ID,
      action: 'list',
      scope: 'personal',
      ...body,
    }),
  });
}

function mockSession(capability = CAPABILITY): any {
  const ds = {
    session: {
      sessionId: SESSION_ID,
      status: 'active',
      scope: 'chat',
      ownerUnionId: 'on_artifact_user',
      replyTargets: {
        [TURN_ID]: { senderOpenId: 'ou_artifact_user' },
      },
    },
    chatType: 'p2p',
    chatId: 'oc_artifact_chat',
    larkAppId: 'cli_artifact_bot',
    managedTurnOrigin: {
      capability,
      turnId: TURN_ID,
      dispatchAttempt: 1,
    },
  } as any;
  vi.spyOn(workerPool, 'findActiveBySessionId').mockReturnValue(ds);
  vi.spyOn(libraryStore, 'listCapabilities').mockReturnValue([]);
  return ds;
}

describe('POST /api/capabilities/manage', () => {
  it('binds a capability-only isolated request to the verified live turn', async () => {
    mockSession();

    const response = await postManage({ originCapability: CAPABILITY });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, artifacts: [] });
  });

  it('returns a bounded metadata shortlist for semantic overlap review', async () => {
    mockSession();
    vi.mocked(libraryStore.listCapabilities).mockReturnValue([
      {
        schemaVersion: 1,
        artifactId: 'artifact-bug-brief',
        type: 'skill',
        name: 'product-bug-brief',
        description: 'Turn a Product issue investigation into a reusable bug brief.',
        scope: {
          kind: 'personal',
          larkAppId: 'cli_artifact_bot',
          principal: { kind: 'union', unionId: 'on_artifact_user' },
        },
        latestRevision: 'revision-1',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
      {
        schemaVersion: 1,
        artifactId: 'artifact-release',
        type: 'knowledge',
        name: 'product-release-check',
        description: 'Product release rules.',
        scope: {
          kind: 'personal',
          larkAppId: 'cli_artifact_bot',
          principal: { kind: 'union', unionId: 'on_artifact_user' },
        },
        latestRevision: 'revision-1',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
      },
    ]);

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'search',
      type: 'skill',
      query: 'Product issue investigation bug brief',
      limit: 8,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      candidates: [{
        name: 'product-bug-brief',
        description: 'Turn a Product issue investigation into a reusable bug brief.',
      }],
    });
  });

  it('rejects invalid artifact search bounds', async () => {
    mockSession();

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'search',
      type: 'skill',
      query: 'Product issue investigation',
      limit: 21,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: 'invalid_limit' });
  });

  it('rejects a stale capability before reading personal artifacts', async () => {
    mockSession('bad01234'.repeat(8));

    const response = await postManage({ originCapability: CAPABILITY });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: 'origin_unproven' });
    expect(libraryStore.listCapabilities).not.toHaveBeenCalled();
  });

  it('requires the verified live turn to resolve its Feishu sender', async () => {
    mockSession();
    vi.spyOn(workerPool, 'findActiveBySessionId').mockReturnValue({
      session: { sessionId: SESSION_ID, replyTargets: {} },
      chatType: 'p2p',
      larkAppId: 'cli_artifact_bot',
      managedTurnOrigin: { capability: CAPABILITY },
    } as any);

    const response = await postManage({ originCapability: CAPABILITY });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: 'current_turn_required' });
    expect(libraryStore.listCapabilities).not.toHaveBeenCalled();
  });

  it('rejects every personal artifact action from a shared group session', async () => {
    const ds = mockSession();
    ds.chatType = 'group';

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'save',
      type: 'knowledge',
      name: 'private-context',
      description: 'Private context.',
      instructions: 'This must never enter a shared group session.',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'personal_scope_requires_p2p',
    });
    expect(libraryStore.listCapabilities).not.toHaveBeenCalled();
  });

  it('marks a proposal card as the complete visible response for the turn', async () => {
    mockSession();
    vi.spyOn(larkClient, 'sendUserMessage').mockResolvedValue('om_proposal_card');

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'save',
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the personal orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'pending_confirmation',
      responseMode: 'card_only',
      instruction: 'The confirmation card is the complete response. Do not call botmux send. End the turn with exactly BOTMUX_NOTHING_TO_SEND.',
    });
    const marker = JSON.parse(readFileSync(
      join(dataDir, 'turn-sends', `${SESSION_ID}.jsonl`),
      'utf8',
    ).trim()) as Record<string, unknown>;
    expect(marker).toMatchObject({
      messageId: 'om_proposal_card',
      suppressFinalOutput: true,
    });
  });

  it('recovers a proposal created before its delivery record was persisted', async () => {
    const proposed = createCapabilitySaveProposal({
      dataDir,
      requester: { kind: 'union', unionId: 'on_artifact_user' },
      requesterOpenId: 'ou_artifact_user',
      larkAppId: 'cli_artifact_bot',
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      targetScope: {
        kind: 'personal',
        larkAppId: 'cli_artifact_bot',
        principal: { kind: 'union', unionId: 'on_artifact_user' },
      },
      draft: {
        type: 'knowledge',
        name: 'product-orange-release',
        description: 'Explain the personal orange release convention.',
        instructions: 'An orange release requires frontend and backend smoke checks.',
      },
    });
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockResolvedValue('om_recovered_proposal');

    startCapabilityProposalDelivery('cli_artifact_bot');

    await vi.waitFor(() => expect(sendUserMessage).toHaveBeenCalledOnce());
    expect(sendUserMessage.mock.calls[0]?.[1]).toBe('ou_artifact_user');
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain(proposed.proposal.proposalId);
    expect(sendUserMessage.mock.calls[0]?.[4]).toMatch(/^cap-/);
  });

  it('queues and deduplicates a save when card delivery is ambiguous', async () => {
    mockSession();
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockRejectedValue(new Error('connection closed after request write'));
    const request = {
      originCapability: CAPABILITY,
      action: 'save',
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the personal orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    };

    const queued = await postManage(request);

    expect(queued.status).toBe(200);
    expect(await queued.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
      responseMode: 'card_only',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
    await vi.waitFor(() => expect(sendUserMessage).toHaveBeenCalledTimes(2));

    const retried = await postManage(request);

    expect(retried.status).toBe(409);
    expect(await retried.json()).toMatchObject({
      ok: false,
      error: 'capability_save_request_already_pending',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
  });

  it('lets a non-owner request team deletion while keeping approval owner-only', async () => {
    const scope = { kind: 'bot' as const, larkAppId: 'cli_artifact_bot' };
    const created = libraryStore.createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the shared orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    });
    mockSession();
    vi.mocked(libraryStore.listCapabilities).mockReturnValue([created.metadata]);
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockImplementation(async (_larkAppId, receiverId) => (
        receiverId === 'ou_bot_owner' ? 'om_owner_approval' : 'om_requester_status'
      ));

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'delete',
      scope: 'bot',
      name: 'product-orange-release',
      reason: 'The shared convention is obsolete.',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
      responseMode: 'card_only',
    });
    expect(sendUserMessage).toHaveBeenCalledTimes(2);
    expect(sendUserMessage.mock.calls[0]?.[1]).toBe('ou_bot_owner');
    expect(sendUserMessage.mock.calls[1]?.[1]).toBe('ou_artifact_user');
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain('请决定是否删除团队 Knowledge');
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain('<at user_id=\\"ou_artifact_user\\"></at>');
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain('批准删除团队内容');
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain('拒绝删除申请');
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain('The shared convention is obsolete.');
    expect(sendUserMessage.mock.calls[1]?.[2]).toContain('团队删除申请已提交');
    expect(libraryStore.readCapability(
      dataDir,
      scope,
      created.metadata.artifactId,
    )).toMatchObject({ name: 'product-orange-release' });
  });

  it('discards a rejected approval proposal so the request can be retried', async () => {
    const scope = { kind: 'bot' as const, larkAppId: 'cli_artifact_bot' };
    const created = libraryStore.createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the shared orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    });
    mockSession();
    vi.mocked(libraryStore.listCapabilities).mockReturnValue([created.metadata]);
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage');
    sendUserMessage.mockRejectedValueOnce(new LarkMessageSendError(
      'owner delivery rejected',
      { deliveryRejected: true },
    ));

    const request = {
      originCapability: CAPABILITY,
      action: 'delete',
      scope: 'bot',
      name: 'product-orange-release',
      reason: 'The shared convention is obsolete.',
    };
    const failed = await postManage(request);

    expect(failed.status).toBe(400);
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toEqual([]);

    sendUserMessage.mockImplementation(async (_larkAppId, receiverId) => (
      receiverId === 'ou_bot_owner' ? 'om_owner_approval' : 'om_requester_status'
    ));
    const retried = await postManage(request);

    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
  });

  it('retains an approval proposal when its delivery outcome is uncertain', async () => {
    const scope = { kind: 'bot' as const, larkAppId: 'cli_artifact_bot' };
    const created = libraryStore.createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the shared orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    });
    mockSession();
    vi.mocked(libraryStore.listCapabilities).mockReturnValue([created.metadata]);
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockImplementation(async (_larkAppId, receiverOpenId) => {
        if (receiverOpenId === 'ou_bot_owner') {
          throw new Error('connection closed after request write');
        }
        return 'om_requester_status';
      });
    const request = {
      originCapability: CAPABILITY,
      action: 'delete',
      scope: 'bot',
      name: 'product-orange-release',
      reason: 'The shared convention is obsolete.',
    };

    const queued = await postManage(request);

    expect(queued.status).toBe(200);
    expect(await queued.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
      responseMode: 'card_only',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
    await vi.waitFor(() => expect(sendUserMessage.mock.calls.filter(
      call => call[1] === 'ou_bot_owner',
    ).length).toBeGreaterThanOrEqual(2));

    const retried = await postManage(request);

    expect(retried.status).toBe(409);
    expect(await retried.json()).toMatchObject({
      ok: false,
      error: 'capability_delete_request_already_pending',
    });
    expect(sendUserMessage.mock.calls.filter(
      call => call[1] === 'ou_bot_owner',
    ).length).toBeGreaterThanOrEqual(2);
  });

  it('still rejects direct team saves from a non-owner', async () => {
    mockSession();
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockResolvedValue('om_unexpected');

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'save',
      scope: 'bot',
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the shared orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, error: 'bot_owner_required' });
    expect(sendUserMessage).not.toHaveBeenCalled();
  });

  it('leaves a visible agent fallback when the requester status card fails', async () => {
    const scope = { kind: 'bot' as const, larkAppId: 'cli_artifact_bot' };
    const created = libraryStore.createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-orange-release',
      description: 'Explain the shared orange release convention.',
      instructions: 'An orange release requires frontend and backend smoke checks.',
    });
    mockSession();
    vi.mocked(libraryStore.listCapabilities).mockReturnValue([created.metadata]);
    vi.spyOn(larkClient, 'sendUserMessage').mockImplementation(async (_appId, receiverId) => {
      if (receiverId === 'ou_bot_owner') return 'om_owner_approval';
      throw new Error('requester delivery failed');
    });

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'delete',
      scope: 'bot',
      name: 'product-orange-release',
      reason: 'The shared convention is obsolete.',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      responseMode: 'agent_fallback',
    });
    expect(existsSync(join(dataDir, 'turn-sends', `${SESSION_ID}.jsonl`))).toBe(false);
  });

  it('returns immediately and starts a new agent turn after Workflow trial approval', async () => {
    const ds = mockSession();
    askBroker.setCanTalkChecker(() => true);
    askBroker.setCardDispatcher({
      send: async () => ({ messageId: 'om_workflow_trial_card' }),
    });
    const forkWorker = vi.spyOn(workerPool, 'forkWorker').mockImplementation(() => {});

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'trial',
      type: 'workflow',
      name: 'product-incident-report',
      description: 'Create a Product incident report.',
      instructions: '## Inputs\n- issue\n\n## Steps\n1. Inspect.\n\n## Success criteria\n- Reported.',
      requestId: 'workflow-trial-request',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'pending_decision',
      responseMode: 'card_only',
    });
    const pending = askBroker.listPendingAsks();
    expect(pending).toHaveLength(1);
    expect(askBroker.tryResolveAsk({
      askId: pending[0].askId,
      nonce: pending[0].nonce,
      selected: 'run',
      by: 'ou_other_authorized_user',
    })).toBe('unauthorized');
    expect(forkWorker).not.toHaveBeenCalled();
    expect(askBroker.tryResolveAsk({
      askId: pending[0].askId,
      nonce: pending[0].nonce,
      selected: 'run',
      by: 'ou_artifact_user',
    })).toBe('accepted');
    await Promise.resolve();
    expect(forkWorker).not.toHaveBeenCalled();
    ds.managedTurnOrigin = undefined;
    await vi.waitFor(() => expect(forkWorker).toHaveBeenCalledOnce());
    expect((forkWorker.mock.calls[0]?.[1] as { content: string }).content).toContain(
      'botmux artifact trial-read --trial-token wft_',
    );
  });

  it('returns immediately and starts a new agent turn after an overlap decision', async () => {
    const ds = mockSession();
    askBroker.setCanTalkChecker(() => true);
    askBroker.setCardDispatcher({
      send: async () => ({ messageId: 'om_artifact_overlap_card' }),
    });
    const forkWorker = vi.spyOn(workerPool, 'forkWorker').mockImplementation(() => {});

    const response = await postManage({
      originCapability: CAPABILITY,
      action: 'overlap',
      type: 'skill',
      name: 'product-incident-summary',
      existingName: 'product-incident-report',
      instructions: 'Both artifacts summarize Product incidents, but their output contracts differ.',
      requestId: 'artifact-overlap-request',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'pending_decision',
      responseMode: 'card_only',
    });
    const pending = askBroker.listPendingAsks();
    expect(pending).toHaveLength(1);
    expect(askBroker.tryResolveAsk({
      askId: pending[0].askId,
      nonce: pending[0].nonce,
      selected: 'update',
      by: 'ou_artifact_user',
    })).toBe('accepted');
    await Promise.resolve();
    expect(forkWorker).not.toHaveBeenCalled();
    ds.managedTurnOrigin = undefined;
    await vi.waitFor(() => expect(forkWorker).toHaveBeenCalledOnce());
    expect((forkWorker.mock.calls[0]?.[1] as { content: string }).content).toContain(
      'update the existing skill `product-incident-report`',
    );
  });

  it('requires the exact code-issued trial ticket before proposing a Workflow save', async () => {
    mockSession();
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockResolvedValue('om_workflow_proposal');
    const draft = {
      type: 'workflow' as const,
      name: 'product-incident-report',
      description: 'Create a Product incident report.',
      instructions: '## Inputs\n- issue\n\n## Steps\n1. Inspect.\n\n## Success criteria\n- Reported.',
    };

    const missing = await postManage({
      originCapability: CAPABILITY,
      action: 'save',
      ...draft,
      trialOutcome: 'passed',
      trialSummary: 'Tested one incident and observed the expected report.',
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({
      ok: false,
      error: expect.stringContaining('trial confirmation'),
    });

    const trialToken = issueWorkflowTrialTicket({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      draft,
    });
    const approved = await postManage({
      originCapability: CAPABILITY,
      action: 'save',
      type: 'workflow',
      trialToken,
      trialOutcome: 'passed',
      trialSummary: 'Tested one incident and observed the expected report.',
    });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
    });
    expect(sendUserMessage.mock.calls[0]?.[2]).toContain(
      'Tested one incident and observed the expected report.',
    );
  });

  it('restores a Workflow trial ticket when its proposal card cannot be delivered', async () => {
    mockSession();
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockRejectedValueOnce(new LarkMessageSendError(
        'proposal delivery rejected',
        { deliveryRejected: true },
      ))
      .mockResolvedValue('om_workflow_proposal');
    const draft = {
      type: 'workflow' as const,
      name: 'product-incident-report',
      description: 'Create a Product incident report.',
      instructions: '## Inputs\n- issue\n\n## Steps\n1. Inspect.\n\n## Success criteria\n- Reported.',
    };
    const trialToken = issueWorkflowTrialTicket({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      draft,
    });
    const request = {
      originCapability: CAPABILITY,
      action: 'save',
      type: 'workflow',
      trialToken,
      trialOutcome: 'passed',
      trialSummary: 'Tested one incident and observed the expected report.',
    };

    const failed = await postManage(request);
    expect(failed.status).toBe(400);
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toEqual([]);

    const retried = await postManage(request);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
    expect(sendUserMessage).toHaveBeenCalledTimes(2);
  });

  it('consumes a Workflow trial ticket when proposal delivery is uncertain', async () => {
    mockSession();
    const sendUserMessage = vi.spyOn(larkClient, 'sendUserMessage')
      .mockRejectedValue(new Error('connection closed after request write'));
    const draft = {
      type: 'workflow' as const,
      name: 'product-incident-report',
      description: 'Create a Product incident report.',
      instructions: '## Inputs\n- issue\n\n## Steps\n1. Inspect.\n\n## Success criteria\n- Reported.',
    };
    const trialToken = issueWorkflowTrialTicket({
      sessionId: SESSION_ID,
      turnId: TURN_ID,
      draft,
    });
    const request = {
      originCapability: CAPABILITY,
      action: 'save',
      type: 'workflow',
      trialToken,
      trialOutcome: 'passed',
      trialSummary: 'Tested one incident and observed the expected report.',
    };

    const queued = await postManage(request);

    expect(queued.status).toBe(200);
    expect(await queued.json()).toMatchObject({
      ok: true,
      status: 'pending_confirmation',
      responseMode: 'card_only',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
    await vi.waitFor(() => expect(sendUserMessage).toHaveBeenCalledTimes(2));

    const retried = await postManage(request);

    expect(retried.status).toBe(400);
    expect(await retried.json()).toMatchObject({
      ok: false,
      error: 'A valid Workflow trial confirmation is required',
    });
    expect(listPendingCapabilityProposals(dataDir, 'cli_artifact_bot')).toHaveLength(1);
    expect(sendUserMessage).toHaveBeenCalledTimes(2);
  });
});
