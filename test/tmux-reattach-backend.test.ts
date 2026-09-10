import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/adapters/backend/pty-backend.js', () => ({
  PtyBackend: class MockPtyBackend {},
}));

vi.mock('../src/adapters/backend/tmux-backend.js', () => ({
  TmuxBackend: class MockTmuxBackend {
    static sessionName = vi.fn((id: string) => `bmx-${id.slice(0, 8)}`);
    static hasSession = vi.fn();
    constructor(public sessionName: string) {}
  },
}));

vi.mock('../src/adapters/backend/tmux-pipe-backend.js', () => ({
  TmuxPipeBackend: class MockTmuxPipeBackend {
    constructor(public paneTarget: string, public opts?: unknown) {}
  },
}));

vi.mock('../src/adapters/backend/herdr-backend.js', () => ({
  HerdrBackend: class MockHerdrBackend {
    static sessionName = vi.fn((id: string) => `bmx-${id.slice(0, 8)}`);
    static managedSessionName = vi.fn(() => 'botmux');
    static hasSession = vi.fn(() => false);
    static probeSession = vi.fn(() => 'missing');
    static hasAgent = vi.fn(() => false);
    static probeAgent = vi.fn(() => 'missing');
    static killAgent = vi.fn();
    constructor(public sessionName: string, public opts?: unknown) {}
  },
}));

vi.mock('../src/adapters/backend/zellij-backend.js', () => ({
  ZellijBackend: class MockZellijBackend {
    static sessionName = vi.fn((id: string) => `bmx-${id.slice(0, 8)}`);
    static hasSession = vi.fn(() => false);
    constructor(public sessionName: string, public opts?: unknown) {}
  },
}));

vi.mock('../src/adapters/backend/zmx-backend.js', () => ({
  ZmxBackend: class MockZmxBackend {
    static sessionName = vi.fn((id: string) => `bmx-${id.slice(0, 8)}`);
    static hasSession = vi.fn(() => false);
    constructor(public sessionName: string, public opts?: unknown) {}
  },
}));

import { TmuxBackend } from '../src/adapters/backend/tmux-backend.js';
import { HerdrBackend } from '../src/adapters/backend/herdr-backend.js';
import { ZellijBackend } from '../src/adapters/backend/zellij-backend.js';
import { ZmxBackend } from '../src/adapters/backend/zmx-backend.js';
import {
  backendSandboxCompatibilityError,
  isStrongManagedHerdrAgentName,
  managedHerdrAgentName,
  selectSessionBackend,
} from '../src/adapters/backend/session-backend-selector.js';

describe('selectSessionBackend', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(TmuxBackend.hasSession).mockReset();
    vi.mocked(TmuxBackend.sessionName).mockClear();
    vi.mocked(HerdrBackend.hasSession).mockReturnValue(false);
    vi.mocked(HerdrBackend.probeSession).mockReturnValue('missing');
    vi.mocked(HerdrBackend.hasAgent).mockReturnValue(false);
    vi.mocked(HerdrBackend.probeAgent).mockReturnValue('missing');
    vi.mocked(HerdrBackend.killAgent).mockReset();
  });

  it('uses owned pipe backend when reattaching to an existing tmux session', () => {
    vi.mocked(TmuxBackend.hasSession).mockReturnValue(true);

    const selected = selectSessionBackend({ sessionId: '9cfa0024-197d-4781-845b-c541dceb8980', backendType: 'tmux' });

    expect(selected.isTmuxMode).toBe(true);
    expect(selected.isPipeMode).toBe(true);
    expect(selected.backend.constructor.name).toBe('MockTmuxPipeBackend');
    expect((selected.backend as any).paneTarget).toBe('bmx-9cfa0024');
    expect((selected.backend as any).opts).toEqual({ ownsSession: true, isReattach: true });
    expect(selected.persistentBackendTarget).toEqual({
      backendType: 'tmux',
      sessionName: 'bmx-9cfa0024',
    });
  });

  it('uses managed pipe backend for a new tmux session', () => {
    vi.mocked(TmuxBackend.hasSession).mockReturnValue(false);

    const selected = selectSessionBackend({ sessionId: '9cfa0024-197d-4781-845b-c541dceb8980', backendType: 'tmux' });

    expect(selected.isTmuxMode).toBe(true);
    expect(selected.isPipeMode).toBe(true);
    expect(selected.backend.constructor.name).toBe('MockTmuxPipeBackend');
    expect((selected.backend as any).paneTarget).toBe('bmx-9cfa0024');
    expect((selected.backend as any).opts).toEqual({ createSession: true, ownsSession: true });
  });

  it('uses pty backend when backend is pty', () => {
    const selected = selectSessionBackend({ sessionId: '9cfa0024-197d-4781-845b-c541dceb8980', backendType: 'pty' });

    expect(selected.isTmuxMode).toBe(false);
    expect(selected.isPipeMode).toBe(false);
    expect(selected.isZellijMode).toBe(false);
    expect('tmuxBackend' in selected).toBe(false);
  });

  it('creates the machine-wide botmux Herdr host and a topic-specific agent', () => {
    const selected = selectSessionBackend({
      sessionId: '9cfa0024-197d-4781-845b-c541dceb8980',
      backendType: 'herdr',
    });

    expect((selected.backend as any).sessionName).toBe('botmux');
    expect((selected.backend as any).opts).toEqual({
      createSession: true,
      agentName: 'botmux-9ak8itbj1fuif1tinpg625vnk',
      isReattach: false,
      ownsSession: false,
      ownsAgent: true,
    });
    expect(selected.persistentBackendTarget).toEqual({
      backendType: 'herdr',
      sessionName: 'botmux',
      agentName: 'botmux-9ak8itbj1fuif1tinpg625vnk',
    });
    expect(selected.createdHerdrSessionName).toBe('botmux');
  });

  it('uses the full UUID identity within Herdr 0.7.5 naming limits', () => {
    vi.mocked(HerdrBackend.hasSession).mockImplementation(name => name === 'botmux');
    const first = selectSessionBackend({
      sessionId: '9cfa0024-197d-4781-845b-c541dceb8980',
      backendType: 'herdr',
    });
    const second = selectSessionBackend({
      sessionId: '9cfa0024-ffff-4781-845b-c541dceb8980',
      backendType: 'herdr',
    });

    const firstName = first.persistentBackendTarget?.backendType === 'herdr'
      ? first.persistentBackendTarget.agentName
      : undefined;
    const secondName = second.persistentBackendTarget?.backendType === 'herdr'
      ? second.persistentBackendTarget.agentName
      : undefined;
    expect(firstName).toMatch(/^botmux-[0-9a-z]{25}$/);
    expect(secondName).toMatch(/^botmux-[0-9a-z]{25}$/);
    expect(firstName).toHaveLength(32);
    expect(secondName).not.toBe(firstName);
    expect(HerdrBackend.hasAgent).toHaveBeenNthCalledWith(
      1,
      'botmux',
      'botmux-9ak8itbj1fuif1tinpg625vnk',
    );
    expect(HerdrBackend.hasAgent).toHaveBeenNthCalledWith(
      2,
      'botmux',
      'botmux-9ak8itig13ioazl4vy0ks7vy8',
    );
  });

  it('puts another bot or topic agent in the same machine-wide botmux host', () => {
    vi.mocked(HerdrBackend.hasSession).mockImplementation(name => name === 'botmux');

    const selected = selectSessionBackend({
      sessionId: 'fedcba98-197d-4781-845b-c541dceb8980',
      backendType: 'herdr',
    });

    expect((selected.backend as any).sessionName).toBe('botmux');
    expect((selected.backend as any).opts).toEqual({
      createSession: false,
      agentName: 'botmux-f36n7gsju73m9n07tm5ajhdhc',
      isReattach: false,
      ownsSession: false,
      ownsAgent: true,
    });
    expect(selected.createdHerdrSessionName).toBeUndefined();
  });

  it('uses zellij backend when backend is zellij', () => {
    vi.mocked(ZellijBackend.hasSession).mockReturnValue(false);

    const selected = selectSessionBackend({ sessionId: '9cfa0024-197d-4781-845b-c541dceb8980', backendType: 'zellij' });

    expect(selected.isZellijMode).toBe(true);
    expect(selected.isTmuxMode).toBe(false);
    expect(selected.isPipeMode).toBe(false);
    expect(selected.backend.constructor.name).toBe('MockZellijBackend');
    expect((selected.backend as any).opts).toEqual({ ownsSession: true, isReattach: false });
  });

  it('uses zmx tail signals, history snapshots, and send as a managed pipe backend', () => {
    vi.mocked(ZmxBackend.hasSession).mockReturnValue(true);

    const selected = selectSessionBackend({ sessionId: '9cfa0024-197d-4781-845b-c541dceb8980', backendType: 'zmx' });

    expect(selected.isZellijMode).toBe(false);
    expect(selected.isTmuxMode).toBe(false);
    expect(selected.isPipeMode).toBe(true);
    expect(selected.backend.constructor.name).toBe('MockZmxBackend');
    expect((selected.backend as any).opts).toEqual({
      ownsSession: true,
      isReattach: true,
      sessionId: '9cfa0024-197d-4781-845b-c541dceb8980',
    });
  });
});

describe('managed Herdr agent identity', () => {
  it('uses a deterministic strong fallback for imported non-UUID session ids', () => {
    const first = managedHerdrAgentName('imported-session-id');
    const second = managedHerdrAgentName('imported-session-id');

    expect(first).toBe(second);
    expect(first).toMatch(/^botmux-[0-9a-z]{25}$/);
    expect(isStrongManagedHerdrAgentName(first)).toBe(true);
  });

  it('separates the same complete session id across independent data roots', () => {
    const sessionId = '9cfa0024-197d-4781-845b-c541dceb8980';
    const first = managedHerdrAgentName(sessionId, '/tmp/botmux-root-a');
    const second = managedHerdrAgentName(sessionId, '/tmp/botmux-root-b');

    expect(first).toMatch(/^botmux-[0-9a-z]{25}$/);
    expect(first).toHaveLength(32);
    expect(second).not.toBe(first);
  });

  it('rejects truncated and malformed managed identities', () => {
    expect(isStrongManagedHerdrAgentName('botmux-9ak8itbj1fuif1tinpg625vnk')).toBe(true);
    expect(isStrongManagedHerdrAgentName('botmux-9cfa0024')).toBe(false);
    expect(isStrongManagedHerdrAgentName('botmux-9ak8itbj1fuif1tinpg625vn')).toBe(false);
    expect(isStrongManagedHerdrAgentName('botmux-9AK8ITBJ1FUIF1TINPG625VNK')).toBe(false);
  });
});

describe('backendSandboxCompatibilityError', () => {
  it('fails closed for local persistent backends outside the isolation wrapper', () => {
    for (const backendType of ['herdr', 'zellij', 'zmx'] as const) {
      expect(backendSandboxCompatibilityError({
        backendType,
        fileSandboxRequested: true,
      })).toContain(`backend "${backendType}"`);
    }
  });

  it('allows unsandboxed persistent backends and wrapper-owned local backends', () => {
    expect(backendSandboxCompatibilityError({
      backendType: 'zmx',
      fileSandboxRequested: false,
    })).toBeUndefined();
    expect(backendSandboxCompatibilityError({
      backendType: 'tmux',
      fileSandboxRequested: true,
    })).toBeUndefined();
    expect(backendSandboxCompatibilityError({
      backendType: 'pty',
      fileSandboxRequested: true,
    })).toBeUndefined();
  });
});
