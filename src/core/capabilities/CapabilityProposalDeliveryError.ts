export class CapabilityProposalDeliveryError extends Error {
  readonly proposalDiscarded: boolean;

  constructor(message: string, options: { proposalDiscarded: boolean; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'CapabilityProposalDeliveryError';
    this.proposalDiscarded = options.proposalDiscarded;
  }
}
