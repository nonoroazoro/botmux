export function personalityReactionsEnabled(config: {
  apiOnly?: boolean;
  personalityReactions?: boolean;
}): boolean {
  return config.apiOnly !== true && config.personalityReactions !== false;
}
