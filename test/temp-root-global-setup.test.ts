import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Vitest temp ownership', () => {
  it('routes every test process into the run-scoped temp root', () => {
    const ownedRoot = process.env.BOTMUX_TEST_TEMP_ROOT;
    expect(ownedRoot).toBeTruthy();
    expect(realpathSync(tmpdir())).toBe(realpathSync(ownedRoot!));
    expect(realpathSync(homedir())).toBe(realpathSync(join(ownedRoot!, 'home')));
    expect(process.env.npm_config_cache).toBe(join(ownedRoot!, 'home', '.npm'));
    expect(process.env.XDG_STATE_HOME).toBe(join(ownedRoot!, 'home', '.local', 'state'));
    expect(process.env.SESSION_DATA_DIR).toBe(join(ownedRoot!, 'home', '.botmux', 'data'));
    for (const key of ['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'BOTS_CONFIG', 'PM2_HOME']) {
      expect(process.env[key], key).toBeUndefined();
    }
  });
});
