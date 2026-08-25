export class LarkMessageSendError extends Error {
  readonly deliveryRejected: boolean;

  constructor(message: string, options: { deliveryRejected: boolean; cause?: unknown }) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'LarkMessageSendError';
    this.deliveryRejected = options.deliveryRejected;
  }
}
