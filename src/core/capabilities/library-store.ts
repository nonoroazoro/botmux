import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import { canonicalJsonStringify } from '../../utils/canonical-json.js';
import {
  personalPrincipalKey,
  validatePersonalPrincipal,
} from './personal-principal.js';
import type {
  CapabilityDraft,
  CapabilityMetadata,
  CapabilityRevision,
  CapabilityRevisionPayload,
  CapabilityScope,
} from './types.js';
import { findSensitiveCapabilityContent } from './redaction.js';

const ARTIFACT_ID_RE = /^cap_[0-9a-f]{32}$/;
const REVISION_ID_RE = /^rev_[0-9a-f]{64}$/;
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  atomicWriteFileSync(path, content, {
    mode: 0o600,
    durable: true,
    followTargetSymlink: false,
  });
}

function scopeKey(scope: CapabilityScope): string {
  if (scope.kind === 'personal') {
    return `personal/${sha256(scope.larkAppId).slice(0, 32)}/${personalPrincipalKey(scope.principal)}`;
  }
  if (!scope.larkAppId.trim()) throw new Error('Bot capability scope requires larkAppId');
  return `bot/${sha256(scope.larkAppId).slice(0, 32)}`;
}

function validateText(value: string, field: string, maxBytes: number): string {
  const normalized = value.trim().normalize('NFC');
  if (!normalized) throw new Error(`${field} must not be empty`);
  if (Buffer.byteLength(normalized, 'utf8') > maxBytes) throw new Error(`${field} is too large`);
  if (normalized.includes('\0')) throw new Error(`${field} contains a null byte`);
  return normalized;
}

export function validateCapabilityDraft(draft: CapabilityDraft): CapabilityDraft {
  if (draft.type !== 'knowledge' && draft.type !== 'skill' && draft.type !== 'workflow') {
    throw new Error('Capability type must be knowledge, skill, or workflow');
  }
  const name = validateText(draft.name, 'name', 64);
  if (!SKILL_NAME_RE.test(name)) {
    throw new Error('Capability name must use lowercase letters, digits, and single hyphens');
  }
  const description = validateText(draft.description, 'description', 1_024);
  const instructions = validateText(draft.instructions, 'instructions', 64 * 1_024);
  if (draft.type === 'workflow') {
    for (const heading of ['## Inputs', '## Steps', '## Success criteria']) {
      const pattern = new RegExp(`^${heading}\\s*$`, 'm');
      if (!pattern.test(instructions)) {
        throw new Error(`Workflow instructions must include ${heading}`);
      }
    }
  }
  const sensitive = findSensitiveCapabilityContent(`${description}\n${instructions}`);
  if (sensitive.length > 0) {
    throw new Error(`Capability content may contain secrets: ${sensitive.join(', ')}`);
  }
  return {
    type: draft.type,
    name,
    description,
    instructions,
  };
}

function validateScope(scope: CapabilityScope): CapabilityScope {
  if (scope.kind === 'personal') {
    if (!scope.larkAppId.trim()) throw new Error('Personal capability scope requires larkAppId');
    return {
      kind: 'personal',
      larkAppId: scope.larkAppId.trim(),
      principal: validatePersonalPrincipal(scope.principal),
    };
  }
  if (scope.kind === 'bot' && scope.larkAppId.trim()) {
    return { kind: 'bot', larkAppId: scope.larkAppId.trim() };
  }
  throw new Error('Invalid capability scope');
}

export function capabilityLibraryRoot(dataDir: string): string {
  if (!dataDir.trim()) throw new Error('dataDir is required');
  return join(dataDir, 'capability-library');
}

function scopeRoot(dataDir: string, scope: CapabilityScope): string {
  return join(capabilityLibraryRoot(dataDir), scopeKey(validateScope(scope)));
}

export function capabilityArtifactRoot(
  dataDir: string,
  scope: CapabilityScope,
  artifactId: string,
): string {
  if (!ARTIFACT_ID_RE.test(artifactId)) throw new Error('Invalid capability artifact id');
  return join(scopeRoot(dataDir, scope), artifactId);
}

function metadataPath(dataDir: string, scope: CapabilityScope, artifactId: string): string {
  return join(capabilityArtifactRoot(dataDir, scope, artifactId), 'metadata.json');
}

function revisionDir(
  dataDir: string,
  scope: CapabilityScope,
  artifactId: string,
  revisionId: string,
): string {
  if (!REVISION_ID_RE.test(revisionId)) throw new Error('Invalid capability revision id');
  return join(capabilityArtifactRoot(dataDir, scope, artifactId), 'revisions', revisionId);
}

function buildRevision(payload: CapabilityRevisionPayload): CapabilityRevision {
  const contentHash = `sha256:${sha256(canonicalJsonStringify(payload))}`;
  return {
    schemaVersion: 1,
    revisionId: `rev_${contentHash.slice('sha256:'.length)}`,
    contentHash,
    payload,
  };
}

function readMetadata(
  path: string,
  expectedScope: CapabilityScope,
  expectedArtifactId: string,
): CapabilityMetadata {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as CapabilityMetadata;
  if (
    raw.schemaVersion !== 1 ||
    !ARTIFACT_ID_RE.test(raw.artifactId) ||
    !REVISION_ID_RE.test(raw.latestRevision) ||
    (raw.type !== 'knowledge' && raw.type !== 'skill' && raw.type !== 'workflow') ||
    typeof raw.name !== 'string' ||
    typeof raw.description !== 'string' ||
    typeof raw.createdAt !== 'string' ||
    typeof raw.updatedAt !== 'string'
  ) {
    throw new Error('Invalid capability metadata');
  }
  const scope = validateScope(raw.scope);
  if (
    raw.artifactId !== expectedArtifactId
    || canonicalJsonStringify(scope) !== canonicalJsonStringify(expectedScope)
  ) {
    throw new Error('Capability metadata does not match its storage scope');
  }
  return { ...raw, scope };
}

export function createCapability(
  dataDir: string,
  scopeInput: CapabilityScope,
  draftInput: CapabilityDraft,
  options: { now?: Date; artifactId?: string } = {},
): { metadata: CapabilityMetadata; revision: CapabilityRevision } {
  const scope = validateScope(scopeInput);
  const draft = validateCapabilityDraft(draftInput);
  const artifactId = options.artifactId ?? `cap_${randomUUID().replace(/-/g, '')}`;
  if (!ARTIFACT_ID_RE.test(artifactId)) throw new Error('Invalid capability artifact id');
  const directory = capabilityArtifactRoot(dataDir, scope, artifactId);
  if (existsSync(directory)) throw new Error(`Capability ${artifactId} already exists`);
  const now = (options.now ?? new Date()).toISOString();
  const revision = buildRevision({
    artifactId,
    type: draft.type,
    name: draft.name,
    description: draft.description,
    instructions: draft.instructions,
    createdAt: now,
  });
  const metadata: CapabilityMetadata = {
    schemaVersion: 1,
    artifactId,
    type: draft.type,
    name: draft.name,
    description: draft.description,
    scope,
    latestRevision: revision.revisionId,
    createdAt: now,
    updatedAt: now,
  };
  const root = scopeRoot(dataDir, scope);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const stagingDir = join(root, `.staging-${artifactId}-${randomUUID()}`);
  const targetRevisionDir = join(stagingDir, 'revisions', revision.revisionId);
  mkdirSync(targetRevisionDir, { recursive: true, mode: 0o700 });
  atomicWrite(join(targetRevisionDir, 'revision.json'), `${canonicalJsonStringify(revision)}\n`);
  atomicWrite(join(stagingDir, 'metadata.json'), `${canonicalJsonStringify(metadata)}\n`);
  renameSync(stagingDir, directory);
  return { metadata, revision };
}

export function readCapability(
  dataDir: string,
  scopeInput: CapabilityScope,
  artifactId: string,
): CapabilityMetadata {
  const scope = validateScope(scopeInput);
  return readMetadata(metadataPath(dataDir, scope, artifactId), scope, artifactId);
}

export function readCapabilityRevision(
  dataDir: string,
  scopeInput: CapabilityScope,
  artifactId: string,
  revisionId: string,
): CapabilityRevision {
  const scope = validateScope(scopeInput);
  const path = join(revisionDir(dataDir, scope, artifactId, revisionId), 'revision.json');
  const revision = JSON.parse(readFileSync(path, 'utf8')) as CapabilityRevision;
  if (
    revision.schemaVersion !== 1
    || revision.revisionId !== revisionId
    || revision.payload.artifactId !== artifactId
    || revision.contentHash !== `sha256:${sha256(canonicalJsonStringify(revision.payload))}`
  ) {
    throw new Error('Invalid capability revision');
  }
  return revision;
}

export function listCapabilityRevisions(
  dataDir: string,
  scopeInput: CapabilityScope,
  artifactId: string,
): CapabilityRevision[] {
  const scope = validateScope(scopeInput);
  const root = join(capabilityArtifactRoot(dataDir, scope, artifactId), 'revisions');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((revisionId) => REVISION_ID_RE.test(revisionId))
    .flatMap((revisionId) => {
      try {
        return [readCapabilityRevision(dataDir, scope, artifactId, revisionId)];
      } catch {
        return [];
      }
    })
    .sort((left, right) => left.payload.createdAt.localeCompare(right.payload.createdAt));
}

export function reviseCapability(
  dataDir: string,
  scopeInput: CapabilityScope,
  artifactId: string,
  draftInput: CapabilityDraft,
  options: { now?: Date; expectedLatestRevision?: string } = {},
): { metadata: CapabilityMetadata; revision: CapabilityRevision } {
  const scope = validateScope(scopeInput);
  const current = readCapability(dataDir, scope, artifactId);
  if (options.expectedLatestRevision && current.latestRevision !== options.expectedLatestRevision) {
    throw new Error('Capability revision conflict');
  }
  const draft = validateCapabilityDraft(draftInput);
  if (draft.type !== current.type) throw new Error('Capability type cannot change');
  const now = (options.now ?? new Date()).toISOString();
  const revision = buildRevision({
    artifactId,
    type: draft.type,
    name: draft.name,
    description: draft.description,
    instructions: draft.instructions,
    createdAt: now,
  });
  const targetRevisionDir = revisionDir(dataDir, scope, artifactId, revision.revisionId);
  if (!existsSync(targetRevisionDir)) {
    mkdirSync(targetRevisionDir, { recursive: true, mode: 0o700 });
    atomicWrite(join(targetRevisionDir, 'revision.json'), `${canonicalJsonStringify(revision)}\n`);
  }
  const metadata: CapabilityMetadata = {
    ...current,
    name: draft.name,
    description: draft.description,
    latestRevision: revision.revisionId,
    updatedAt: now,
  };
  atomicWrite(metadataPath(dataDir, scope, artifactId), `${canonicalJsonStringify(metadata)}\n`);
  return { metadata, revision };
}

export function listCapabilities(dataDir: string, scopeInput: CapabilityScope): CapabilityMetadata[] {
  const scope = validateScope(scopeInput);
  const root = scopeRoot(dataDir, scope);
  if (!existsSync(root)) return [];
  const entries: CapabilityMetadata[] = [];
  for (const name of readdirSync(root)) {
    if (!ARTIFACT_ID_RE.test(name)) continue;
    try {
      entries.push(readMetadata(metadataPath(dataDir, scope, name), scope, name));
    } catch {
      continue;
    }
  }
  return entries.sort((left, right) => left.name.localeCompare(right.name));
}

export function deleteCapability(
  dataDir: string,
  scopeInput: CapabilityScope,
  artifactId: string,
  expectedLatestRevision: string,
): CapabilityMetadata {
  const scope = validateScope(scopeInput);
  const current = readCapability(dataDir, scope, artifactId);
  if (current.latestRevision !== expectedLatestRevision) {
    throw new Error('Capability revision conflict');
  }
  rmSync(capabilityArtifactRoot(dataDir, scope, artifactId), {
    recursive: true,
    force: false,
  });
  return current;
}
