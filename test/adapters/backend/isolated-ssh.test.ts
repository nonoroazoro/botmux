import { describe, expect, it } from 'vitest';

import { isolatedSshMountArgs } from '../../../src/adapters/backend/isolated-ssh.js';

describe('isolatedSshMountArgs', () => {
  it('mounts only the current principal SSH directory at the native home', () => {
    expect(isolatedSshMountArgs(
      '/var/lib/botmux/users/alice/home/.ssh',
      '/home/service',
    )).toEqual([
      '--dir', '/home',
      '--dir', '/home/service',
      '--bind',
      '/var/lib/botmux/users/alice/home/.ssh',
      '/home/service/.ssh',
    ]);
  });

  it('rejects relative and root paths', () => {
    expect(() => isolatedSshMountArgs('alice/.ssh', '/home/service')).toThrow();
    expect(() => isolatedSshMountArgs('/var/lib/alice/.ssh', '/')).toThrow();
  });
});
