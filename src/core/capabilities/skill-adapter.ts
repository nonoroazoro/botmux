import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import type { SkillPackage } from '../skills/types.js';
import {
  capabilityArtifactRoot,
  listCapabilities,
  readCapabilityRevision,
} from './library-store.js';
import { personalPrincipalKey, type PersonalPrincipal } from './personal-principal.js';
import type { CapabilityMetadata, CapabilityRevision } from './types.js';

function renderCapabilitySkill(revision: CapabilityRevision): string {
  const payload = revision.payload;
  const workflowPreamble = payload.type === 'workflow'
    ? [
        'This is a Dynamic Workflow.',
        'Resolve declared inputs from the user request and ask only for missing required inputs.',
        'Execute the steps with the current agent and its available tools, then verify the success criteria.',
        '',
      ]
    : [];
  return [
    '---',
    `name: ${payload.name}`,
    `description: ${JSON.stringify(payload.description)}`,
    '---',
    '',
    ...workflowPreamble,
    payload.instructions,
    '',
  ].join('\n');
}

function packageFromMetadata(
  dataDir: string,
  metadata: CapabilityMetadata,
): SkillPackage | undefined {
  const rootDir = join(
    capabilityArtifactRoot(dataDir, metadata.scope, metadata.artifactId),
    'delivery',
    'skills',
    metadata.latestRevision,
  );
  let revision: CapabilityRevision;
  try {
    revision = readCapabilityRevision(
      dataDir,
      metadata.scope,
      metadata.artifactId,
      metadata.latestRevision,
    );
    if (
      revision.payload.name !== metadata.name
      || revision.payload.description !== metadata.description
      || revision.payload.type !== metadata.type
    ) return undefined;
  } catch {
    return undefined;
  }
  const entrypoint = 'SKILL.md';
  const entrypointPath = join(rootDir, entrypoint);
  const markdown = renderCapabilitySkill(revision);
  let current: string | undefined;
  if (existsSync(entrypointPath)) {
    try { current = readFileSync(entrypointPath, 'utf8'); } catch { /* regenerate below */ }
  }
  if (current !== markdown) {
    mkdirSync(rootDir, { recursive: true, mode: 0o700 });
    atomicWriteFileSync(entrypointPath, markdown, {
      mode: 0o600,
      durable: true,
      followTargetSymlink: false,
    });
  }
  const canonicalRootDir = realpathSync(rootDir);
  const source = metadata.scope.kind === 'personal'
    ? {
        type: 'personal-artifact' as const,
        principalKey: personalPrincipalKey(metadata.scope.principal),
        artifactId: metadata.artifactId,
        artifactType: metadata.type,
      }
    : {
        type: 'bot-artifact' as const,
        larkAppId: metadata.scope.larkAppId,
        artifactId: metadata.artifactId,
        artifactType: metadata.type,
      };
  return {
    id: metadata.artifactId,
    name: metadata.name,
    displayName: metadata.name,
    description: metadata.description,
    tags: [metadata.type, metadata.scope.kind],
    rootDir: canonicalRootDir,
    entrypoint,
    source,
    checksum: metadata.latestRevision,
    installedAt: metadata.createdAt,
    updatedAt: metadata.updatedAt,
  };
}

export function resolvePersonalCapabilitySkills(
  dataDir: string,
  larkAppId: string,
  principal: PersonalPrincipal | undefined,
): SkillPackage[] {
  if (!principal) return [];
  return listCapabilities(dataDir, { kind: 'personal', larkAppId, principal })
    .flatMap((metadata) => {
      const skill = packageFromMetadata(dataDir, metadata);
      return skill ? [skill] : [];
    });
}

export function resolveBotCapabilitySkills(
  dataDir: string,
  larkAppId: string,
  excludedNames?: ReadonlySet<string>,
): SkillPackage[] {
  return listCapabilities(dataDir, { kind: 'bot', larkAppId })
    .filter((metadata) => !excludedNames?.has(metadata.name))
    .flatMap((metadata) => {
      const skill = packageFromMetadata(dataDir, metadata);
      return skill ? [skill] : [];
    });
}
