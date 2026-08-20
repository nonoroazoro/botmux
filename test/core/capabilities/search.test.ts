import { describe, expect, it } from 'vitest';

import {
  searchCapabilityMetadata,
  type CapabilityMetadata,
  type CapabilityType,
} from '../../../src/core/capabilities/index.js';

function artifact(
  name: string,
  description: string,
  type: CapabilityType = 'skill',
): CapabilityMetadata {
  return {
    schemaVersion: 1,
    artifactId: `artifact-${name}`,
    type,
    name,
    description,
    scope: {
      kind: 'personal',
      larkAppId: 'cli_test',
      principal: { kind: 'union', unionId: 'on_test' },
    },
    latestRevision: 'revision-1',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
  };
}

describe('searchCapabilityMetadata', () => {
  it('ranks rare name and description terms above shared product vocabulary', () => {
    const candidates = searchCapabilityMetadata([
      artifact('product-release-check', 'Run Product release smoke checks.'),
      artifact('product-bug-brief', 'Turn a Product issue investigation into a reusable bug brief.'),
      artifact('product-dashboard-review', 'Review Product dashboard charts.'),
    ], 'Product issue investigation reusable bug brief diagnosis', 8);

    expect(candidates.map((candidate) => candidate.name)).toEqual([
      'product-bug-brief',
      'product-dashboard-review',
      'product-release-check',
    ]);
  });

  it('recalls a slightly different spelling of a short artifact name', () => {
    const candidates = searchCapabilityMetadata([
      artifact('incident-triage', 'Triage production incidents.'),
      artifact('release-check', 'Check a release.'),
    ], 'incdent triage workflow', 8);

    expect(candidates[0]?.name).toBe('incident-triage');
  });

  it('returns only a bounded metadata candidate set', () => {
    const items = Array.from({ length: 1_000 }, (_, index) => artifact(
      `product-check-${index}`,
      `Product check procedure ${index}`,
    ));

    expect(searchCapabilityMetadata(items, 'Product check procedure', 8)).toHaveLength(8);
    expect(searchCapabilityMetadata(items, 'unrelated vocabulary', 8)).toEqual([]);
  });
});
