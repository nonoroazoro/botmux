import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Create one unique test directory below Vitest's run-owned temp root.
 * The global teardown removes the complete root even when a test aborts.
 *
 * @param prefix Human-readable fixture prefix.
 * @param parent Optional parent for tests that verify path relationships.
 */
export function makeTestTempDir(prefix = 'case-', parent = tmpdir()): string {
  const directory = join(parent, `${prefix}${process.pid}-${randomUUID()}`);
  // Test files may mock node:fs. The shared temp helper must still create its
  // real run-owned directory, independent of the module mock graph.
  process.getBuiltinModule('node:fs').mkdirSync(directory, { recursive: false });
  return directory;
}
