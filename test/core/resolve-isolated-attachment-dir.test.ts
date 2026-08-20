import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveIsolatedAttachmentDir } from '../../src/core/resolve-isolated-attachment-dir.js';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveIsolatedAttachmentDir', () => {
  it('returns a physical path when the configured home uses a symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-attachment-path-'));
    temporaryDirectories.push(root);
    const physicalHome = join(root, 'physical-home');
    const logicalHome = join(root, 'logical-home');
    mkdirSync(physicalHome);
    symlinkSync(physicalHome, logicalHome, 'dir');

    expect(resolveIsolatedAttachmentDir(logicalHome, 'session-one', 'om_one')).toBe(
      join(realpathSync(physicalHome), '.botmux', 'attachments', 'session-one', 'om_one'),
    );
  });
});
