import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCapability,
  deleteCapability,
  listCapabilities,
  readCapabilityRevision,
  resolvePersonalCapabilitySkills,
  reviseCapability,
  type CapabilityScope,
} from '../../../src/core/capabilities/index.js';

describe('capability library store', () => {
  let dataDir: string;
  let scope: CapabilityScope;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'botmux-capability-library-'));
    scope = { kind: 'personal', larkAppId: 'app_1', principal: { kind: 'union', unionId: 'on_user' } };
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('injects a personal artifact as a session skill', () => {
    const created = createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'product-context',
      description: 'Product repository context',
      instructions: 'The product has a legacy internal alias.',
    }, { now: new Date('2026-08-12T00:00:00.000Z') });

    const skills = resolvePersonalCapabilitySkills(dataDir, 'app_1', { kind: 'union', unionId: 'on_user' });
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('product-context');
    expect(readFileSync(join(skills[0].rootDir, skills[0].entrypoint), 'utf8'))
      .toContain('The product has a legacy internal alias.');
    expect(readCapabilityRevision(dataDir, scope, created.metadata.artifactId, created.revision.revisionId))
      .toEqual(created.revision);
  });

  it('does not expose one user artifact to another user', () => {
    createCapability(dataDir, scope, {
      type: 'skill',
      name: 'product-debugging',
      description: 'Debug Product issues',
      instructions: 'Clone the relevant repository before inspecting code.',
    });

    expect(resolvePersonalCapabilitySkills(dataDir, 'app_1', { kind: 'union', unionId: 'on_other' }))
      .toEqual([]);
  });

  it('injects a Dynamic Workflow as agent-executed instructions', () => {
    createCapability(dataDir, scope, {
      type: 'workflow',
      name: 'weekly-product-report',
      description: 'Create the weekly Product report for a requested region',
      instructions: [
        '## Inputs',
        '- `region` (required): Report region.',
        '',
        '## Steps',
        '1. Collect the Product metrics for the region.',
        '2. Write the weekly report.',
        '',
        '## Success criteria',
        '- The report contains the requested region and current metrics.',
      ].join('\n'),
    });

    const skills = resolvePersonalCapabilitySkills(
      dataDir,
      'app_1',
      { kind: 'union', unionId: 'on_user' },
    );
    const workflow = skills.find((skill) => skill.name === 'weekly-product-report');
    expect(workflow).toBeDefined();
    const markdown = workflow ? readFileSync(join(workflow.rootDir, workflow.entrypoint), 'utf8') : '';
    expect(markdown).toContain('This is a Dynamic Workflow.');
    expect(markdown).toContain('Execute the steps with the current agent');
  });

  it('rejects a Dynamic Workflow without its execution contract', () => {
    expect(() => createCapability(dataDir, scope, {
      type: 'workflow',
      name: 'incomplete-workflow',
      description: 'Incomplete workflow',
      instructions: '## Steps\n1. Do something.',
    })).toThrow('Workflow instructions must include ## Inputs');
  });

  it('keeps immutable revisions and supports optimistic updates', () => {
    const created = createCapability(dataDir, scope, {
      type: 'skill',
      name: 'product-debugging',
      description: 'Debug Product issues',
      instructions: 'Clone repositories first.',
    }, { now: new Date('2026-08-12T00:00:00.000Z') });
    const revised = reviseCapability(dataDir, scope, created.metadata.artifactId, {
      type: 'skill',
      name: 'product-debugging',
      description: 'Debug Product issues',
      instructions: 'Clone every relevant repository first.',
    }, {
      expectedLatestRevision: created.revision.revisionId,
      now: new Date('2026-08-12T01:00:00.000Z'),
    });

    expect(revised.revision.revisionId).not.toBe(created.revision.revisionId);
    expect(readCapabilityRevision(dataDir, scope, created.metadata.artifactId, created.revision.revisionId))
      .toEqual(created.revision);
    expect(() => reviseCapability(dataDir, scope, created.metadata.artifactId, {
      type: 'skill',
      name: 'product-debugging',
      description: 'Debug Product issues',
      instructions: 'Conflicting edit.',
    }, { expectedLatestRevision: created.revision.revisionId }))
      .toThrow('Capability revision conflict');
  });

  it('rejects likely secrets before writing an artifact', () => {
    expect(() => createCapability(dataDir, scope, {
      type: 'knowledge',
      name: 'unsafe-context',
      description: 'Unsafe context',
      instructions: 'api_key = "abcdefghijklmnop123456"',
    })).toThrow('may contain secrets');
    expect(listCapabilities(dataDir, scope)).toEqual([]);
  });

  it('hard deletes source revisions and derived delivery files', () => {
    const created = createCapability(dataDir, scope, {
      type: 'skill',
      name: 'product-debugging',
      description: 'Debug Product issues',
      instructions: 'Clone every relevant repository first.',
    });
    const delivered = resolvePersonalCapabilitySkills(
      dataDir,
      'app_1',
      { kind: 'union', unionId: 'on_user' },
    )[0];
    expect(delivered).toBeDefined();
    if (!delivered) throw new Error('Expected a delivered skill');
    expect(existsSync(join(delivered.rootDir, delivered.entrypoint))).toBe(true);

    deleteCapability(
      dataDir,
      scope,
      created.metadata.artifactId,
      created.revision.revisionId,
    );

    expect(listCapabilities(dataDir, scope)).toEqual([]);
    expect(existsSync(join(delivered.rootDir, delivered.entrypoint))).toBe(false);
    expect(() => readCapabilityRevision(
      dataDir,
      scope,
      created.metadata.artifactId,
      created.revision.revisionId,
    )).toThrow();
  });
});
