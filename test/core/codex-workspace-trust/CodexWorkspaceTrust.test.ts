import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { ensureCodexWorkspaceTrusted } from '../../../src/core/codex-workspace-trust/index.js';

const roots: string[] = [];

function fixture(): { root: string; configPath: string } {
  const root = mkdtempSync(join(tmpdir(), 'botmux-codex-trust-'));
  roots.push(root);
  const configPath = join(root, '.codex', 'config.toml');
  mkdirSync(join(root, '.codex'), { recursive: true });
  return { root, configPath };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ensureCodexWorkspaceTrusted', () => {
  it('creates an identity-scoped trust entry', () => {
    const { root, configPath } = fixture();
    const workspace = join(root, 'workspace');

    expect(ensureCodexWorkspaceTrusted(configPath, workspace)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toBe(
      `[projects.${JSON.stringify(workspace)}]\ntrust_level = "trusted"\n`,
    );
  });

  it('preserves unrelated config and updates an existing project section', () => {
    const { root, configPath } = fixture();
    const workspace = join(root, 'workspace');
    writeFileSync(
      configPath,
      `model = "gpt-5"\n\n[projects.${JSON.stringify(workspace)}]\ntrust_level = "untrusted"\ncustom = true\n\n[features]\napps = true\n`,
    );

    expect(ensureCodexWorkspaceTrusted(configPath, workspace)).toBe(true);
    expect(readFileSync(configPath, 'utf8')).toBe(
      `model = "gpt-5"\n\n[projects.${JSON.stringify(workspace)}]\ntrust_level = "trusted"\ncustom = true\n\n[features]\napps = true\n`,
    );
  });

  it('is idempotent and retains trust for multiple workspaces', () => {
    const { root, configPath } = fixture();
    const first = join(root, 'first');
    const second = join(root, 'second');

    expect(ensureCodexWorkspaceTrusted(configPath, first)).toBe(true);
    expect(ensureCodexWorkspaceTrusted(configPath, second)).toBe(true);
    expect(ensureCodexWorkspaceTrusted(configPath, first)).toBe(false);

    const config = readFileSync(configPath, 'utf8');
    expect(config).toContain(`[projects.${JSON.stringify(first)}]\ntrust_level = "trusted"`);
    expect(config).toContain(`[projects.${JSON.stringify(second)}]\ntrust_level = "trusted"`);
  });

  it('rejects relative authority paths', () => {
    const { root, configPath } = fixture();

    expect(() => ensureCodexWorkspaceTrusted(configPath, 'workspace')).toThrow(
      'Codex workspace path must be absolute',
    );
    expect(() => ensureCodexWorkspaceTrusted('config.toml', join(root, 'workspace'))).toThrow(
      'Codex config path must be absolute',
    );
  });
});
