import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import { withFileLockSync } from '../../utils/file-lock.js';

/**
 * Trust one exact workspace in the Codex config used by the current identity.
 *
 * @param configPath The identity-scoped Codex config path.
 * @param workspacePath The canonical absolute workspace path visible to Codex.
 * @returns Whether the config changed.
 */
export function ensureCodexWorkspaceTrusted(
  configPath: string,
  workspacePath: string,
): boolean {
  if (!isAbsolute(configPath)) throw new Error('Codex config path must be absolute');
  if (!isAbsolute(workspacePath)) throw new Error('Codex workspace path must be absolute');

  return withFileLockSync(configPath, () => {
    const original = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    const lines = original.split(/\r?\n/u);
    if (lines.at(-1) === '') lines.pop();

    const section = `[projects.${JSON.stringify(workspacePath)}]`;
    const sectionIndex = lines.findIndex(line => line.trim() === section);
    if (sectionIndex < 0) {
      if (lines.length > 0 && lines.at(-1)?.trim() !== '') lines.push('');
      lines.push(section, 'trust_level = "trusted"');
    } else {
      let sectionEnd = lines.length;
      for (let index = sectionIndex + 1; index < lines.length; index += 1) {
        if (/^\s*\[\[?.+\]\]?\s*(?:#.*)?$/u.test(lines[index] ?? '')) {
          sectionEnd = index;
          break;
        }
      }

      const trustIndexes: number[] = [];
      for (let index = sectionIndex + 1; index < sectionEnd; index += 1) {
        if (/^\s*trust_level\s*=/u.test(lines[index] ?? '')) trustIndexes.push(index);
      }
      if (trustIndexes.length === 0) {
        lines.splice(sectionEnd, 0, 'trust_level = "trusted"');
      } else {
        const first = trustIndexes[0];
        if (first !== undefined) lines[first] = 'trust_level = "trusted"';
        for (const duplicate of trustIndexes.slice(1).reverse()) lines.splice(duplicate, 1);
      }
    }

    const next = `${lines.join(eol)}${eol}`;
    if (next === original) return false;
    atomicWriteFileSync(configPath, next, { mode: 0o600, followTargetSymlink: false });
    return true;
  }, { maxWaitMs: 3_000 });
}
