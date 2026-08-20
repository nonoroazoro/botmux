import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import { canonicalJsonStringify } from '../../utils/canonical-json.js';
import { withFileLockSync } from '../../utils/file-lock.js';
import {
  createCapability,
  deleteCapability,
  listCapabilities,
  readCapability,
  readCapabilityRevision,
  reviseCapability,
  validateCapabilityDraft,
} from './library-store.js';
import { validatePersonalPrincipal, type PersonalPrincipal } from './personal-principal.js';
import { validateWorkflowTrialAssessment } from './workflow-trial-assessment.js';
import type {
  CapabilityDraft,
  CapabilityProposal,
  CapabilityScope,
  WorkflowTrialAssessment,
} from './types.js';

const PROPOSAL_ID_RE = /^cp_[0-9a-f]{32}$/;
const NONCE_RE = /^[0-9a-f]{64}$/;
const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1_000;

export function capabilityProposalDispatchUuid(proposalId: string, nonce: string): string {
  if (!PROPOSAL_ID_RE.test(proposalId)) throw new Error('Invalid capability proposal id');
  if (!NONCE_RE.test(nonce)) throw new Error('Invalid capability proposal nonce');
  return `cap-${proposalId.slice('cp_'.length)}-${nonce.slice(0, 12)}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function proposalRoot(dataDir: string): string {
  return join(dataDir, 'capability-proposals');
}

function proposalPath(dataDir: string, proposalId: string): string {
  if (!PROPOSAL_ID_RE.test(proposalId)) throw new Error('Invalid capability proposal id');
  return join(proposalRoot(dataDir), `${proposalId}.json`);
}

function readProposalFile(dataDir: string, proposalId: string): CapabilityProposal {
  const proposal = JSON.parse(readFileSync(proposalPath(dataDir, proposalId), 'utf8')) as CapabilityProposal;
  if (
    proposal.schemaVersion !== 1
    || proposal.proposalId !== proposalId
    || (proposal.operation !== 'save'
      && proposal.operation !== 'contribute'
      && proposal.operation !== 'delete')
    || (proposal.state !== 'pending' && proposal.state !== 'accepted' && proposal.state !== 'rejected')
    || typeof proposal.nonceHash !== 'string'
    || !NONCE_RE.test(proposal.nonceHash)
    || typeof proposal.requesterOpenId !== 'string'
    || !proposal.requesterOpenId.startsWith('ou_')
    || typeof proposal.larkAppId !== 'string'
    || !proposal.larkAppId.trim()
    || typeof proposal.sessionId !== 'string'
    || !proposal.sessionId.trim()
    || typeof proposal.turnId !== 'string'
    || !proposal.turnId.trim()
    || typeof proposal.createdAt !== 'string'
    || !Number.isFinite(Date.parse(proposal.createdAt))
    || typeof proposal.updatedAt !== 'string'
    || !Number.isFinite(Date.parse(proposal.updatedAt))
    || typeof proposal.expiresAt !== 'string'
    || !Number.isFinite(Date.parse(proposal.expiresAt))
    || !proposal.targetScope
    || typeof proposal.targetScope !== 'object'
  ) {
    throw new Error('Invalid capability proposal');
  }
  const requester = validatePersonalPrincipal(proposal.requester);
  const personalTargetMatches = proposal.targetScope.kind === 'personal'
    && proposal.targetScope.larkAppId === proposal.larkAppId
    && canonicalJsonStringify(validatePersonalPrincipal(proposal.targetScope.principal))
      === canonicalJsonStringify(requester);
  const botTargetMatches = proposal.targetScope.kind === 'bot'
    && proposal.targetScope.larkAppId === proposal.larkAppId;
  const targetMatches = proposal.operation === 'contribute'
    ? botTargetMatches
    : personalTargetMatches || botTargetMatches;
  if (!targetMatches) throw new Error('Invalid capability proposal scope');
  const targetScope: CapabilityScope = proposal.targetScope.kind === 'personal'
    ? { kind: 'personal', larkAppId: proposal.larkAppId, principal: requester }
    : { kind: 'bot', larkAppId: proposal.larkAppId };
  if (proposal.operation === 'delete') {
    const target = proposal.target;
    if (
      !target
      || typeof target !== 'object'
      || !/^cap_[0-9a-f]{32}$/.test(target.artifactId)
      || !/^rev_[0-9a-f]{64}$/.test(target.revisionId)
      || (target.type !== 'knowledge' && target.type !== 'skill' && target.type !== 'workflow')
      || typeof target.name !== 'string'
      || !target.name.trim()
      || typeof target.description !== 'string'
      || !target.description.trim()
    ) throw new Error('Invalid capability delete proposal');
    return { ...proposal, requester, targetScope, target };
  }
  const expectedTargetValid = (
    proposal.expectedArtifactId === undefined
    && proposal.expectedRevisionId === undefined
  ) || (
    typeof proposal.expectedArtifactId === 'string'
    && /^cap_[0-9a-f]{32}$/.test(proposal.expectedArtifactId)
    && typeof proposal.expectedRevisionId === 'string'
    && /^rev_[0-9a-f]{64}$/.test(proposal.expectedRevisionId)
  );
  if (!expectedTargetValid) throw new Error('Invalid capability proposal target revision');
  const draft = validateCapabilityDraft(proposal.draft);
  if (draft.type === 'workflow' && !proposal.workflowTrial) {
    throw new Error('Workflow trial assessment is required');
  }
  const workflowTrial = proposal.workflowTrial
    ? validateWorkflowTrialAssessment(proposal.workflowTrial)
    : undefined;
  if (draft.type !== 'workflow' && proposal.workflowTrial !== undefined) {
    throw new Error('Workflow trial assessment requires a Workflow proposal');
  }
  return {
    ...proposal,
    requester,
    targetScope,
    draft,
    ...(workflowTrial ? { workflowTrial } : {}),
  };
}

function writeProposal(dataDir: string, proposal: CapabilityProposal): void {
  const root = proposalRoot(dataDir);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  atomicWriteFileSync(
    proposalPath(dataDir, proposal.proposalId),
    `${canonicalJsonStringify(proposal)}\n`,
    { mode: 0o600, durable: true, followTargetSymlink: false },
  );
}

function pruneExpiredProposals(dataDir: string, now: Date): void {
  const root = proposalRoot(dataDir);
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    if (!/^cp_[0-9a-f]{32}\.json$/.test(name)) continue;
    const proposalId = name.slice(0, -'.json'.length);
    try {
      const proposal = readProposalFile(dataDir, proposalId);
      if (Date.parse(proposal.expiresAt) <= now.getTime()) {
        unlinkSync(proposalPath(dataDir, proposalId));
      }
    } catch {
      // Preserve malformed files for explicit diagnosis instead of deleting data.
    }
  }
}

export function createCapabilitySaveProposal(input: {
  dataDir: string;
  requester: PersonalPrincipal;
  requesterOpenId: string;
  larkAppId: string;
  sessionId: string;
  turnId: string;
  targetScope: CapabilityScope;
  draft: CapabilityDraft;
  workflowTrial?: WorkflowTrialAssessment;
  now?: Date;
}): { proposal: CapabilityProposal; nonce: string } {
  const requester = validatePersonalPrincipal(input.requester);
  if (!input.requesterOpenId.startsWith('ou_')) throw new Error('Invalid proposal requester');
  if (!input.larkAppId.trim() || !input.sessionId.trim() || !input.turnId.trim()) {
    throw new Error('Invalid proposal context');
  }
  if (
    requester.kind === 'app_open'
    && (requester.larkAppId !== input.larkAppId || requester.openId !== input.requesterOpenId)
  ) {
    throw new Error('Proposal requester does not match its app-scoped identity');
  }
  const targetScope: CapabilityScope = input.targetScope.kind === 'personal'
    ? {
        kind: 'personal',
        larkAppId: input.targetScope.larkAppId,
        principal: validatePersonalPrincipal(input.targetScope.principal),
      }
    : { kind: 'bot', larkAppId: input.targetScope.larkAppId };
  if (
    targetScope.larkAppId !== input.larkAppId
    || (targetScope.kind === 'personal'
      && canonicalJsonStringify(targetScope.principal) !== canonicalJsonStringify(requester))
  ) {
    throw new Error('Proposal target does not match its requester');
  }
  const draft = validateCapabilityDraft(input.draft);
  if (draft.type === 'workflow' && !input.workflowTrial) {
    throw new Error('Workflow trial assessment is required');
  }
  const workflowTrial = input.workflowTrial
    ? validateWorkflowTrialAssessment(input.workflowTrial)
    : undefined;
  if (draft.type !== 'workflow' && input.workflowTrial !== undefined) {
    throw new Error('Workflow trial assessment requires a Workflow proposal');
  }
  const matches = listCapabilities(input.dataDir, targetScope)
    .filter((metadata) => metadata.name === draft.name);
  if (matches.length > 1) throw new Error('Duplicate capability names require manual repair');
  const existing = matches[0];
  if (existing && existing.type !== draft.type) {
    throw new Error('Capability name already exists with a different type');
  }
  const now = input.now ?? new Date();
  pruneExpiredProposals(input.dataDir, now);
  const nonce = randomBytes(32).toString('hex');
  const proposal: CapabilityProposal = {
    schemaVersion: 1,
    proposalId: `cp_${randomUUID().replace(/-/g, '')}`,
    operation: 'save',
    state: 'pending',
    requester,
    requesterOpenId: input.requesterOpenId,
    larkAppId: input.larkAppId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    targetScope,
    draft,
    ...(workflowTrial ? { workflowTrial } : {}),
    ...(existing ? {
      expectedArtifactId: existing.artifactId,
      expectedRevisionId: existing.latestRevision,
    } : {}),
    nonceHash: sha256(nonce),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  };
  writeProposal(input.dataDir, proposal);
  return { proposal, nonce };
}

export function createCapabilityDeleteProposal(input: {
  dataDir: string;
  requester: PersonalPrincipal;
  requesterOpenId: string;
  larkAppId: string;
  sessionId: string;
  turnId: string;
  targetScope: CapabilityScope;
  artifactId: string;
  now?: Date;
}): { proposal: CapabilityProposal; nonce: string } {
  const requester = validatePersonalPrincipal(input.requester);
  if (!input.requesterOpenId.startsWith('ou_')) throw new Error('Invalid proposal requester');
  if (!input.larkAppId.trim() || !input.sessionId.trim() || !input.turnId.trim()) {
    throw new Error('Invalid proposal context');
  }
  if (
    requester.kind === 'app_open'
    && (requester.larkAppId !== input.larkAppId || requester.openId !== input.requesterOpenId)
  ) {
    throw new Error('Proposal requester does not match its app-scoped identity');
  }
  const targetScope: CapabilityScope = input.targetScope.kind === 'personal'
    ? {
        kind: 'personal',
        larkAppId: input.targetScope.larkAppId,
        principal: validatePersonalPrincipal(input.targetScope.principal),
      }
    : { kind: 'bot', larkAppId: input.targetScope.larkAppId };
  if (
    targetScope.larkAppId !== input.larkAppId
    || (targetScope.kind === 'personal'
      && canonicalJsonStringify(targetScope.principal) !== canonicalJsonStringify(requester))
  ) {
    throw new Error('Proposal target does not match its requester');
  }
  const metadata = readCapability(input.dataDir, targetScope, input.artifactId);
  const now = input.now ?? new Date();
  pruneExpiredProposals(input.dataDir, now);
  const nonce = randomBytes(32).toString('hex');
  const proposal: CapabilityProposal = {
    schemaVersion: 1,
    proposalId: `cp_${randomUUID().replace(/-/g, '')}`,
    operation: 'delete',
    state: 'pending',
    requester,
    requesterOpenId: input.requesterOpenId,
    larkAppId: input.larkAppId,
    sessionId: input.sessionId,
    turnId: input.turnId,
    targetScope,
    target: {
      artifactId: metadata.artifactId,
      revisionId: metadata.latestRevision,
      type: metadata.type,
      name: metadata.name,
      description: metadata.description,
    },
    nonceHash: sha256(nonce),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  };
  writeProposal(input.dataDir, proposal);
  return { proposal, nonce };
}

export function loadCapabilityProposal(
  dataDir: string,
  proposalId: string,
): CapabilityProposal | undefined {
  if (!PROPOSAL_ID_RE.test(proposalId)) return undefined;
  const path = proposalPath(dataDir, proposalId);
  if (!existsSync(path)) return undefined;
  return readProposalFile(dataDir, proposalId);
}

export function listPendingCapabilityProposals(
  dataDir: string,
  larkAppId: string,
  now: Date = new Date(),
): CapabilityProposal[] {
  pruneExpiredProposals(dataDir, now);
  const root = proposalRoot(dataDir);
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((name) => /^cp_[0-9a-f]{32}\.json$/.test(name))
    .flatMap((name) => {
      const proposalId = name.slice(0, -'.json'.length);
      try {
        const proposal = readProposalFile(dataDir, proposalId);
        return proposal.state === 'pending'
          && proposal.larkAppId === larkAppId
          && Date.parse(proposal.expiresAt) > now.getTime()
          ? [proposal]
          : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function rotateCapabilityProposalNonce(
  dataDir: string,
  proposalId: string,
  now: Date = new Date(),
): { proposal: CapabilityProposal; nonce: string } {
  const path = proposalPath(dataDir, proposalId);
  return withFileLockSync(path, () => {
    const proposal = readProposalFile(dataDir, proposalId);
    if (proposal.state !== 'pending') throw new Error('Capability proposal is no longer pending');
    if (Date.parse(proposal.expiresAt) <= now.getTime()) throw new Error('Capability proposal expired');
    const nonce = randomBytes(32).toString('hex');
    const rotated: CapabilityProposal = {
      ...proposal,
      nonceHash: sha256(nonce),
      updatedAt: now.toISOString(),
    };
    writeProposal(dataDir, rotated);
    return { proposal: rotated, nonce };
  });
}

function verifyPendingProposal(
  proposal: CapabilityProposal,
  nonce: string,
  now: Date,
): void {
  if (!NONCE_RE.test(nonce) || sha256(nonce) !== proposal.nonceHash) {
    throw new Error('Capability proposal nonce mismatch');
  }
  if (proposal.state !== 'pending') throw new Error('Capability proposal is no longer pending');
  if (Date.parse(proposal.expiresAt) <= now.getTime()) throw new Error('Capability proposal expired');
}

function capabilityWriteLockTarget(
  dataDir: string,
  scope: CapabilityScope,
  name: string,
): string {
  const key = sha256(canonicalJsonStringify({ scope, name }));
  return join(proposalRoot(dataDir), `.write-${key}`);
}

function isCapabilityProposalOperator(input: {
  proposal: CapabilityProposal;
  operatorOpenId: string;
  operatorUnionId?: string;
  ownerOpenId?: string;
}): boolean {
  if (input.proposal.targetScope.kind === 'bot') {
    return Boolean(input.ownerOpenId && input.operatorOpenId === input.ownerOpenId);
  }
  if (input.operatorOpenId !== input.proposal.requesterOpenId) return false;
  return input.proposal.requester.kind === 'union'
    ? input.operatorUnionId === input.proposal.requester.unionId
    : input.operatorOpenId === input.proposal.requester.openId
      && input.proposal.larkAppId === input.proposal.requester.larkAppId;
}

export function acceptCapabilityProposal(input: {
  dataDir: string;
  proposalId: string;
  nonce: string;
  operatorOpenId: string;
  operatorUnionId?: string;
  ownerOpenId?: string;
  now?: Date;
}): CapabilityProposal {
  const path = proposalPath(input.dataDir, input.proposalId);
  return withFileLockSync(path, () => {
    const proposal = readProposalFile(input.dataDir, input.proposalId);
    const now = input.now ?? new Date();
    verifyPendingProposal(proposal, input.nonce, now);
    if (!isCapabilityProposalOperator({
      proposal,
      operatorOpenId: input.operatorOpenId,
      operatorUnionId: input.operatorUnionId,
      ownerOpenId: input.ownerOpenId,
    })) throw new Error('Capability proposal operator mismatch');
    const targetName = proposal.operation === 'delete'
      ? proposal.target.name
      : proposal.draft.name;
    const writeLock = capabilityWriteLockTarget(
      input.dataDir,
      proposal.targetScope,
      targetName,
    );
    const result = withFileLockSync(writeLock, () => {
      if (proposal.operation === 'delete') {
        let current: ReturnType<typeof readCapability>;
        try {
          current = readCapability(
            input.dataDir,
            proposal.targetScope,
            proposal.target.artifactId,
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return {
            artifactId: proposal.target.artifactId,
            revisionId: proposal.target.revisionId,
          };
        }
        if (current.type !== proposal.target.type || current.name !== proposal.target.name) {
          throw new Error('Capability delete target changed');
        }
        deleteCapability(
          input.dataDir,
          proposal.targetScope,
          proposal.target.artifactId,
          proposal.target.revisionId,
        );
        return {
          artifactId: proposal.target.artifactId,
          revisionId: proposal.target.revisionId,
        };
      }
      const matches = listCapabilities(input.dataDir, proposal.targetScope)
        .filter((metadata) => metadata.name === proposal.draft.name);
      if (matches.length > 1) throw new Error('Duplicate capability names require manual repair');
      const existing = matches[0];
      const current = existing
        ? readCapabilityRevision(
            input.dataDir,
            proposal.targetScope,
            existing.artifactId,
            existing.latestRevision,
          )
        : undefined;
      const alreadyApplied = existing?.type === proposal.draft.type
        && current?.payload.description === proposal.draft.description
        && current.payload.instructions === proposal.draft.instructions;
      if (proposal.expectedArtifactId && proposal.expectedRevisionId) {
        if (
          !existing
          || existing.artifactId !== proposal.expectedArtifactId
          || (existing.latestRevision !== proposal.expectedRevisionId && !alreadyApplied)
        ) throw new Error('Capability revision conflict');
      } else if (existing) {
        if (!alreadyApplied) throw new Error('Capability was created after this proposal');
      }
      if (existing) {
        if (existing.type !== proposal.draft.type) {
          throw new Error('Capability name already exists with a different type');
        }
        if (alreadyApplied) {
          return {
            artifactId: existing.artifactId,
            revisionId: existing.latestRevision,
          };
        }
        const revised = reviseCapability(
          input.dataDir,
          proposal.targetScope,
          existing.artifactId,
          proposal.draft,
          {
            now,
            expectedLatestRevision: existing.latestRevision,
          },
        );
        return {
          artifactId: revised.metadata.artifactId,
          revisionId: revised.revision.revisionId,
        };
      }
      const created = createCapability(
        input.dataDir,
        proposal.targetScope,
        proposal.draft,
        { now },
      );
      return {
        artifactId: created.metadata.artifactId,
        revisionId: created.revision.revisionId,
      };
    });
    const accepted: CapabilityProposal = {
      ...proposal,
      state: 'accepted',
      resultArtifactId: result.artifactId,
      resultRevisionId: result.revisionId,
      updatedAt: now.toISOString(),
    };
    writeProposal(input.dataDir, accepted);
    return accepted;
  });
}

export function rejectCapabilityProposal(input: {
  dataDir: string;
  proposalId: string;
  nonce: string;
  operatorOpenId: string;
  operatorUnionId?: string;
  ownerOpenId?: string;
  now?: Date;
}): CapabilityProposal {
  const path = proposalPath(input.dataDir, input.proposalId);
  return withFileLockSync(path, () => {
    const proposal = readProposalFile(input.dataDir, input.proposalId);
    const now = input.now ?? new Date();
    verifyPendingProposal(proposal, input.nonce, now);
    if (!isCapabilityProposalOperator({
      proposal,
      operatorOpenId: input.operatorOpenId,
      operatorUnionId: input.operatorUnionId,
      ownerOpenId: input.ownerOpenId,
    })) throw new Error('Capability proposal operator mismatch');
    const rejected: CapabilityProposal = {
      ...proposal,
      state: 'rejected',
      updatedAt: now.toISOString(),
    };
    unlinkSync(path);
    return rejected;
  });
}

export function createCapabilityContributionProposal(input: {
  dataDir: string;
  saveProposalId: string;
  requesterOpenId: string;
  now?: Date;
}): { proposal: CapabilityProposal; nonce: string } {
  const captured = readProposalFile(input.dataDir, input.saveProposalId);
  if (
    captured.operation !== 'save'
    || captured.state !== 'accepted'
    || captured.targetScope.kind !== 'personal'
    || !captured.resultArtifactId
    || !captured.resultRevisionId
    || captured.requesterOpenId !== input.requesterOpenId
  ) {
    throw new Error('Accepted personal capability required');
  }
  const sourceScope: CapabilityScope = {
    kind: 'personal',
    larkAppId: captured.larkAppId,
    principal: captured.requester,
  };
  const revision = readCapabilityRevision(
    input.dataDir,
    sourceScope,
    captured.resultArtifactId,
    captured.resultRevisionId,
  );
  const targetScope: CapabilityScope = { kind: 'bot', larkAppId: captured.larkAppId };
  const matches = listCapabilities(input.dataDir, targetScope)
    .filter((metadata) => metadata.name === revision.payload.name);
  if (matches.length > 1) throw new Error('Duplicate capability names require manual repair');
  const existing = matches[0];
  if (existing && existing.type !== revision.payload.type) {
    throw new Error('Capability name already exists with a different type');
  }
  const now = input.now ?? new Date();
  pruneExpiredProposals(input.dataDir, now);
  const nonce = randomBytes(32).toString('hex');
  const proposal: CapabilityProposal = {
    schemaVersion: 1,
    proposalId: `cp_${randomUUID().replace(/-/g, '')}`,
    operation: 'contribute',
    state: 'pending',
    requester: captured.requester,
    requesterOpenId: input.requesterOpenId,
    larkAppId: captured.larkAppId,
    sessionId: captured.sessionId,
    turnId: captured.turnId,
    targetScope,
    draft: {
      type: revision.payload.type,
      name: revision.payload.name,
      description: revision.payload.description,
      instructions: revision.payload.instructions,
    },
    ...(captured.workflowTrial ? { workflowTrial: captured.workflowTrial } : {}),
    ...(existing ? {
      expectedArtifactId: existing.artifactId,
      expectedRevisionId: existing.latestRevision,
    } : {}),
    nonceHash: sha256(nonce),
    sourceArtifactId: captured.resultArtifactId,
    sourceRevisionId: captured.resultRevisionId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + PROPOSAL_TTL_MS).toISOString(),
  };
  writeProposal(input.dataDir, proposal);
  return { proposal, nonce };
}
