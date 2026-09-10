import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('botmux root help', () => {
  it('loads the CLI and advertises artifact management', () => {
    const stdout = execFileSync(
      process.execPath,
      ['--import', 'tsx', fileURLToPath(new URL('../src/cli.ts', import.meta.url)), '--help'],
      { cwd: process.cwd(), env: process.env, encoding: 'utf-8' },
    );

    expect(stdout).toContain('artifact');
    expect(stdout).toContain('Knowledge, Skill, and Dynamic Workflow');
  });
});
