import { describe, expect, it } from 'vitest';
import { canonicalJsonStringify } from '../../src/utils/canonical-json.js';

describe('canonicalJsonStringify', () => {
  it('sorts nested object keys while preserving array order and Unicode', () => {
    expect(canonicalJsonStringify({
      z: [3, { y: '雪', x: null }],
      a: { beta: false, alpha: 1 },
    })).toBe('{"a":{"alpha":1,"beta":false},"z":[3,{"x":null,"y":"雪"}]}');
  });
});
