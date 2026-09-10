import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEST_TEMP_ROOT_ENV = 'BOTMUX_TEST_TEMP_ROOT';

/**
 * Give one Vitest project a single owned temp root and remove it at teardown.
 * Tests may create any number of children without leaking them into the host
 * temp directory, including when an assertion fails before local cleanup.
 */
export default function setupTestTempRoot(): () => void {
  const hostTempRoot = realpathSync(tmpdir());
  const testTempRoot = mkdtempSync(join(hostTempRoot, `botmux-test-run-${process.pid}-`));
  const testHome = join(testTempRoot, 'home');
  mkdirSync(testHome, { recursive: true });
  const isolatedEnvironment: Record<string, string | undefined> = {
    HOME: testHome,
    USERPROFILE: testHome,
    XDG_CONFIG_HOME: join(testHome, '.config'),
    XDG_CACHE_HOME: join(testHome, '.cache'),
    XDG_DATA_HOME: join(testHome, '.local', 'share'),
    XDG_STATE_HOME: join(testHome, '.local', 'state'),
    SESSION_DATA_DIR: join(testHome, '.botmux', 'data'),
    // Explicit CLI/data selectors override HOME. Tests opt into their own
    // fixtures instead of inheriting a developer's active runtime paths.
    CODEX_HOME: undefined,
    CLAUDE_CONFIG_DIR: undefined,
    BOTS_CONFIG: undefined,
    PM2_HOME: undefined,
    npm_config_cache: join(testHome, '.npm'),
    TMPDIR: testTempRoot,
    TMP: testTempRoot,
    TEMP: testTempRoot,
    [TEST_TEMP_ROOT_ENV]: testTempRoot,
  };
  const previous = Object.fromEntries(
    Object.keys(isolatedEnvironment).map(key => [key, process.env[key]]),
  );

  for (const [key, value] of Object.entries(isolatedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  return () => {
    try {
      rmSync(testTempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      if (existsSync(testTempRoot)) {
        throw new Error(`Vitest temp root was not removed: ${testTempRoot}`);
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  };
}
