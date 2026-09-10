/** Versioned identity shared by reply-card producers and the card parser.
 * The marker uses visible link text because Lark may discard zero-width links
 * while simplifying a card into Format A. */
export const REPLY_CARD_FOOTER_ELEMENT_ID = 'agent_reply_footer';
export const REPLY_CARD_FOOTER_MARKER_URL =
  'https://www.feishu.cn/#agent-reply-card-footer-v1';
export const REPLY_CARD_FOOTER_MARKER =
  `[·](${REPLY_CARD_FOOTER_MARKER_URL})`;
