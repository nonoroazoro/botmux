import { describe, expect, it } from 'vitest';
import {
  CLI_SELECT_OPTIONS,
  CLI_SELECT_TREE,
  buildWrappedLaunch,
  decorateResumeForWrapper,
  lookupCliSelection,
  parseWrapperCli,
  resolveCliSelection,
  selectionKeyForBot,
  stripSettingsArgs,
} from '../src/setup/cli-selection.js';

describe('CLI selection', () => {
  it('groups Codex variants', () => {
    const group = CLI_SELECT_TREE.find(item => item.key === 'codex');
    expect(group?.children?.map(item => item.key)).toEqual(['codex', 'codex-app']);
  });

  it('groups TRAE variants', () => {
    const group = CLI_SELECT_TREE.find(item => item.key === 'trae');
    expect(group?.children?.map(item => item.key)).toEqual(['coco', 'traex']);
  });

  it('keeps Pi variants adjacent', () => {
    const keys = CLI_SELECT_OPTIONS.map(item => item.key);
    expect(keys.indexOf('oh-my-pi')).toBe(keys.indexOf('pi') + 1);
  });

  it('resolves native selections', () => {
    expect(resolveCliSelection('codex')).toEqual({ cliId: 'codex' });
    expect(resolveCliSelection('claude-code')).toEqual({ cliId: 'claude-code' });
    expect(lookupCliSelection('missing')).toBeUndefined();
  });

  it('rejects unknown selections', () => {
    expect(() => resolveCliSelection('missing')).toThrow('未知 CLI 选择项');
  });

  it('uses the CLI id when no built-in wrapper matches', () => {
    expect(selectionKeyForBot('codex', 'custom-wrapper codex')).toBe('codex');
  });
});

describe('generic wrapper launch', () => {
  it('parses a wrapper prefix', () => {
    expect(parseWrapperCli('  custom-wrapper   run ')).toEqual(['custom-wrapper', 'run']);
  });

  it('prepends wrapper tokens and preserves CLI arguments', () => {
    expect(buildWrappedLaunch('custom-wrapper run', ['resume', 'session-1'])).toEqual({
      bin: 'custom-wrapper',
      args: ['run', 'resume', 'session-1'],
    });
  });

  it('resolves the wrapper executable', () => {
    expect(buildWrappedLaunch('custom-wrapper run', ['--help'], bin => `/opt/bin/${bin}`)).toEqual({
      bin: '/opt/bin/custom-wrapper',
      args: ['run', '--help'],
    });
  });

  it('returns unchanged arguments for an empty wrapper', () => {
    expect(buildWrappedLaunch('  ', ['--help'])).toEqual({ bin: '', args: ['--help'] });
  });

  it('strips settings arguments when explicitly requested', () => {
    expect(stripSettingsArgs(['--settings', '{}', '--settings=other', '--model', 'test'])).toEqual([
      '--model',
      'test',
    ]);
  });

  it('decorates a resume command with the configured wrapper', () => {
    expect(decorateResumeForWrapper('codex resume session-1', 'custom-wrapper run'))
      .toBe('custom-wrapper run resume session-1');
    expect(decorateResumeForWrapper('codex resume session-1', undefined))
      .toBe('codex resume session-1');
  });
});
