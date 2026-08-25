import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CapabilityProposalOutbox } from '../../../src/core/capabilities/index.js';

const PROPOSAL_ID = `cp_${'ab'.repeat(16)}`;
const NONCE = 'cd'.repeat(32);

describe('CapabilityProposalOutbox', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'botmux-capability-proposal-outbox-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function enqueue(outbox: CapabilityProposalOutbox): void {
    outbox.enqueue({
      proposalId: PROPOSAL_ID,
      nonce: NONCE,
      recipientOpenId: 'ou_owner',
      card: '{"schema":"2.0"}',
      dispatchUuid: 'cap-abcd',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  it('recovers an ambiguous delivery with the same payload and dispatch UUID', async () => {
    const firstSend = vi.fn().mockRejectedValue(new Error('connection closed'));
    const first = new CapabilityProposalOutbox({
      dataDir,
      larkAppId: 'app_1',
      send: firstSend,
      isActive: () => true,
    });
    enqueue(first);

    expect(await first.deliver(PROPOSAL_ID)).toMatchObject({ state: 'failed' });
    expect(firstSend).toHaveBeenCalledWith(
      'ou_owner',
      '{"schema":"2.0"}',
      'cap-abcd',
    );

    const recoveredSend = vi.fn().mockResolvedValue('om_recovered');
    const recovered = new CapabilityProposalOutbox({
      dataDir,
      larkAppId: 'app_1',
      send: recoveredSend,
      isActive: () => true,
    });
    await recovered.flush();

    expect(recoveredSend).toHaveBeenCalledWith(
      'ou_owner',
      '{"schema":"2.0"}',
      'cap-abcd',
    );
    const receiptPath = join(
      dataDir,
      'capability-proposal-deliveries',
      'app_1',
      `${PROPOSAL_ID}.json`,
    );
    expect(existsSync(receiptPath)).toBe(true);

    const duplicateSend = vi.fn().mockResolvedValue('om_duplicate');
    const restarted = new CapabilityProposalOutbox({
      dataDir,
      larkAppId: 'app_1',
      send: duplicateSend,
      isActive: () => true,
    });
    await restarted.flush();

    expect(duplicateSend).not.toHaveBeenCalled();
    expect(restarted.has(PROPOSAL_ID)).toBe(true);
  });

  it('drops a delivery after its proposal is no longer actionable', async () => {
    const send = vi.fn().mockResolvedValue('om_unexpected');
    const outbox = new CapabilityProposalOutbox({
      dataDir,
      larkAppId: 'app_1',
      send,
      isActive: () => false,
    });
    enqueue(outbox);

    expect(await outbox.deliver(PROPOSAL_ID)).toEqual({ state: 'inactive' });
    expect(send).not.toHaveBeenCalled();
    expect(outbox.has(PROPOSAL_ID)).toBe(false);
  });

  it('coalesces concurrent delivery attempts for one proposal', async () => {
    let resolveSend: ((messageId: string) => void) | undefined;
    const send = vi.fn(() => new Promise<string>((resolve) => {
      resolveSend = resolve;
    }));
    const outbox = new CapabilityProposalOutbox({
      dataDir,
      larkAppId: 'app_1',
      send,
      isActive: () => true,
    });
    enqueue(outbox);

    const first = outbox.deliver(PROPOSAL_ID);
    const second = outbox.deliver(PROPOSAL_ID);
    expect(send).toHaveBeenCalledOnce();
    resolveSend?.('om_delivered');

    await expect(first).resolves.toEqual({ state: 'delivered', messageId: 'om_delivered' });
    await expect(second).resolves.toEqual({ state: 'delivered', messageId: 'om_delivered' });
  });
});
