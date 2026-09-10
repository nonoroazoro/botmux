import { fs, vol } from 'memfs';
import { resolve } from 'node:path';
import defaultSoul from '../../../src/core/personality/default-soul.md?raw';
import reactionPolicy from '../../../src/core/personality/reaction-policy.md?raw';

const bundledFiles = {
  [resolve('src/core/personality/default-soul.md')]: defaultSoul,
  [resolve('src/core/personality/reaction-policy.md')]: reactionPolicy,
};

/**
 * Reset test fixtures in memory, including the immutable bundled prompts read
 * by production modules. No read or write falls back to the host filesystem.
 */
export function resetMemoryFs(fixtures: Record<string, string | Buffer | null>): void {
  vol.reset();
  vol.fromJSON({ ...bundledFiles, ...fixtures });
}

resetMemoryFs({});

export { fs };
