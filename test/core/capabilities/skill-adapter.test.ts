import { mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  createCapability,
  resolvePersonalCapabilitySkills,
} from '../../../src/core/capabilities/index.js';
import { makeTestTempDir } from '../../helpers/test-temp-dir.js';

describe('capability skill adapter', () => {
  const cleanupPaths: string[] = [];

  afterEach(() => {
    for (const path of cleanupPaths.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it('stores a canonical delivery root when the data directory uses a symlinked prefix', () => {
    const container = makeTestTempDir('botmux-capability-symlink-');
    cleanupPaths.push(container);
    const realHome = join(container, 'real-home');
    const linkedHome = join(container, 'linked-home');
    mkdirSync(realHome);
    symlinkSync(realHome, linkedHome, 'dir');
    const dataDir = join(linkedHome, '.botmux', 'data');
    const scope = {
      kind: 'personal' as const,
      larkAppId: 'app_1',
      principal: { kind: 'union' as const, unionId: 'on_user' },
    };

    createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-context',
      description: 'Product repository context',
      instructions: 'The product has a legacy internal alias.',
    });

    const skill = resolvePersonalCapabilitySkills(
      dataDir,
      'app_1',
      scope.principal,
    )[0];

    expect(skill).toBeDefined();
    expect(skill?.rootDir.startsWith(realpathSync(dataDir) + '/')).toBe(true);
    expect(skill?.rootDir.startsWith(linkedHome + '/')).toBe(false);
  });
});
