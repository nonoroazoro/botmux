import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DaemonToWorker, WorkerToDaemon } from '../src/types.js';

const children = new Set<ChildProcess>();
const tempDirs = new Set<string>();

async function waitFor(
  predicate: () => boolean,
  logs: string[],
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
  }
  throw new Error(`worker condition timed out\n${logs.join('')}`);
}

afterEach(() => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }
  children.clear();
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs.clear();
});

describe('ordinary IM during real worker init', () => {
  it('publishes progress while a Codex turn waits for a restarted CLI', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-worker-startup-progress-'));
    tempDirs.add(root);
    const dataDir = join(root, 'session');
    mkdirSync(dataDir, { recursive: true });
    const fakeCodex = join(root, 'fake-codex');
    writeFileSync(fakeCodex, `#!/usr/bin/env node
if (process.argv.includes('app-server')) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const request = JSON.parse(line);
      if (request.id === undefined) continue;
      const result = request.method === 'thread/read'
        ? { thread: { updatedAt: 1 } }
        : {};
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
    }
  });
  setInterval(() => {}, 1_000);
} else {
  setTimeout(() => process.stdout.write('›\\n'), 2_000);
  setInterval(() => {}, 1_000);
}
`);
    chmodSync(fakeCodex, 0o755);

    const messages: WorkerToDaemon[] = [];
    const logs: string[] = [];
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('src/worker.ts')], {
      cwd: resolve('.'),
      env: {
        ...process.env,
        HOME: root,
        SESSION_DATA_DIR: dataDir,
        BOTMUX_SESSION_ID: 'sid-worker-startup-progress',
        LARK_APP_ID: 'app_test',
        LARK_APP_SECRET: 'secret',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    child.on('message', raw => {
      messages.push(raw as WorkerToDaemon);
      logs.push(`[ipc] ${JSON.stringify(raw)}\n`);
    });
    child.stdout?.on('data', chunk => logs.push(chunk.toString()));
    child.stderr?.on('data', chunk => logs.push(chunk.toString()));

    child.send({
      type: 'init',
      sessionId: 'sid-worker-startup-progress',
      chatId: 'oc_test',
      rootMessageId: 'om_root',
      workingDir: dataDir,
      cliId: 'codex',
      cliPathOverride: fakeCodex,
      backendType: 'pty',
      prompt: '',
      resume: true,
      cliSessionId: 'thread-existing',
      nativeSessionTitle: 'Existing title',
      larkAppId: 'app_test',
      larkAppSecret: 'secret',
    } satisfies DaemonToWorker);

    await waitFor(() => messages.some(message => message.type === 'ready'), logs);
    child.send({ type: 'restart' } satisfies DaemonToWorker);
    await waitFor(() => logs.some(line => line.includes('Restart requested (daemon request)')), logs);
    child.send({
      type: 'message',
      content: 'LIST_KNOWLEDGE_DURING_BOOT',
      turnId: 'om_startup_turn',
    } satisfies DaemonToWorker);

    await waitFor(() => messages.some(message =>
      message.type === 'screen_update'
      && message.status === 'working'
      && message.turnId === 'om_startup_turn'), logs, 5_000);

    expect(messages).toContainEqual(expect.objectContaining({
      type: 'screen_update',
      content: '',
      status: 'working',
      turnId: 'om_startup_turn',
    }));
  }, 15_000);

  it('queues a concurrent follow-up instead of rejecting it before cliAdapter is ready', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-worker-init-concurrency-'));
    tempDirs.add(root);
    const dataDir = join(root, 'session');
    mkdirSync(dataDir, { recursive: true });
    const fakePi = join(root, 'fake-pi');
    writeFileSync(fakePi, `#!/usr/bin/env node
setTimeout(() => process.stdout.write('Ready\\n'), 500);
setInterval(() => {}, 1_000);
`);
    chmodSync(fakePi, 0o755);

    const messages: WorkerToDaemon[] = [];
    const logs: string[] = [];
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('src/worker.ts')], {
      cwd: resolve('.'),
      env: {
        ...process.env,
        HOME: root,
        SESSION_DATA_DIR: dataDir,
        BOTMUX_SESSION_ID: 'sid-worker-init-concurrency',
        LARK_APP_ID: 'app_test',
        LARK_APP_SECRET: 'secret',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    child.on('message', raw => {
      messages.push(raw as WorkerToDaemon);
      logs.push(`[ipc] ${JSON.stringify(raw)}\n`);
    });
    child.stdout?.on('data', chunk => logs.push(chunk.toString()));
    child.stderr?.on('data', chunk => logs.push(chunk.toString()));

    child.send({
      type: 'init',
      sessionId: 'sid-worker-init-concurrency',
      chatId: 'oc_test',
      rootMessageId: 'om_root',
      workingDir: dataDir,
      cliId: 'pi',
      cliPathOverride: fakePi,
      backendType: 'pty',
      prompt: 'initial turn',
      promptAgentContextRevision: 'role-initial',
      larkAppId: 'app_test',
      larkAppSecret: 'secret',
      turnId: 'om_initial',
    } satisfies DaemonToWorker);
    child.send({
      type: 'message',
      content: 'follow-up during init',
      agentContextRevision: 'role-followup',
      turnId: 'om_followup',
    } satisfies DaemonToWorker);

    await waitFor(() => messages.some(message =>
      message.type === 'turn_input_committed' && message.turnId === 'om_followup'), logs);
    await waitFor(() => messages.some(message =>
      message.type === 'turn_input_committed' && message.turnId === 'om_initial'), logs);

    expect(messages).toEqual(expect.arrayContaining([
      { type: 'turn_input_received', turnId: 'om_initial' },
      { type: 'turn_input_received', turnId: 'om_followup' },
      { type: 'turn_input_committed', turnId: 'om_initial', agentContextRevision: 'role-initial' },
      { type: 'turn_input_committed', turnId: 'om_followup', agentContextRevision: 'role-followup' },
    ]));
    expect(messages).not.toContainEqual(expect.objectContaining({
      type: 'turn_input_rejected',
      turnId: 'om_followup',
    }));

    child.send({
      type: 'message',
      content: 'system turn without external id',
      agentContextRevision: 'role-system',
    } satisfies DaemonToWorker);
    await waitFor(() => messages.some(message =>
      message.type === 'turn_input_committed'
      && message.turnId === undefined
      && message.agentContextRevision === 'role-system'), logs);

    child.send({
      type: 'message',
      content: 'duplicate follow-up',
      agentContextRevision: 'role-retry-changed',
      turnId: 'om_followup',
    } satisfies DaemonToWorker);
    await waitFor(() => messages.filter(message =>
      message.type === 'turn_input_committed' && message.turnId === 'om_followup').length >= 2, logs);
    const duplicateAck = messages.filter(message =>
      message.type === 'turn_input_committed' && message.turnId === 'om_followup').at(-1);
    expect(duplicateAck).toEqual({ type: 'turn_input_committed', turnId: 'om_followup' });
  }, 15_000);

  it('holds a non-argv follow-up until the initial prompt owns the queue head', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botmux-worker-init-order-'));
    tempDirs.add(root);
    const dataDir = join(root, 'session');
    mkdirSync(dataDir, { recursive: true });
    const inputLog = join(root, 'stdin.log');
    const fakeCodex = join(root, 'fake-codex');
    writeFileSync(fakeCodex, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv.includes('app-server')) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      const request = JSON.parse(line);
      if (request.id === undefined) continue;
      const result = request.method === 'thread/read'
        ? { thread: { updatedAt: 1 } }
        : {};
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
    }
  });
  setInterval(() => {}, 1_000);
} else {
  let initialTurnCompleted = false;
  let observedInput = '';
  setTimeout(() => process.stdout.write('›\\n'), 200);
  process.stdin.on('data', chunk => {
    fs.appendFileSync(process.env.FAKE_INPUT_LOG, chunk);
    observedInput += chunk.toString();
    if (!initialTurnCompleted && observedInput.includes('INITIAL_ORDER_MARKER')) {
      initialTurnCompleted = true;
      setTimeout(() => process.stdout.write('›\\n'), 50);
    }
  });
  setInterval(() => {}, 1_000);
}
`);
    chmodSync(fakeCodex, 0o755);

    const messages: WorkerToDaemon[] = [];
    const logs: string[] = [];
    const child = spawn(process.execPath, ['--import', 'tsx', resolve('src/worker.ts')], {
      cwd: resolve('.'),
      env: {
        ...process.env,
        HOME: root,
        SESSION_DATA_DIR: dataDir,
        BOTMUX_SESSION_ID: 'sid-worker-init-order',
        // Collapse unrelated polling so this ordering probe remains
        // deterministic under full-suite contention.
        BOTMUX_TIME_SCALE: '0.05',
        LARK_APP_ID: 'app_test',
        LARK_APP_SECRET: 'secret',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    children.add(child);
    child.on('message', raw => {
      messages.push(raw as WorkerToDaemon);
      logs.push(`[ipc] ${JSON.stringify(raw)}\n`);
    });
    child.stdout?.on('data', chunk => logs.push(chunk.toString()));
    child.stderr?.on('data', chunk => logs.push(chunk.toString()));

    child.send({
      type: 'init',
      sessionId: 'sid-worker-init-order',
      chatId: 'oc_test',
      rootMessageId: 'om_root',
      workingDir: dataDir,
      cliId: 'codex',
      cliPathOverride: fakeCodex,
      backendType: 'pty',
      prompt: 'INITIAL_ORDER_MARKER',
      resume: true,
      cliSessionId: 'thread-existing',
      nativeSessionTitle: 'Existing title',
      env: { FAKE_INPUT_LOG: inputLog },
      larkAppId: 'app_test',
      larkAppSecret: 'secret',
      turnId: 'om_initial_order',
    } satisfies DaemonToWorker);
    child.send({
      type: 'message',
      content: 'FOLLOWUP_ORDER_MARKER',
      turnId: 'om_followup_order',
    } satisfies DaemonToWorker);

    await waitFor(() => {
      if (!existsSync(inputLog)) return false;
      const input = readFileSync(inputLog, 'utf8');
      return input.includes('INITIAL_ORDER_MARKER') && input.includes('FOLLOWUP_ORDER_MARKER');
    }, logs, 14_000);

    const input = readFileSync(inputLog, 'utf8');
    expect(input.indexOf('INITIAL_ORDER_MARKER')).toBeLessThan(input.indexOf('FOLLOWUP_ORDER_MARKER'));
    expect(messages).not.toContainEqual(expect.objectContaining({
      type: 'turn_input_rejected',
      turnId: 'om_followup_order',
    }));
  }, 20_000);
});
