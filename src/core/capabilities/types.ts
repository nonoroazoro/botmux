import type { PersonalPrincipal } from './personal-principal.js';

export type CapabilityType = 'knowledge' | 'skill' | 'workflow';
export type CapabilityScope =
  | { kind: 'personal'; larkAppId: string; principal: PersonalPrincipal }
  | { kind: 'bot'; larkAppId: string };

export interface CapabilityRevisionPayload {
  artifactId: string;
  type: CapabilityType;
  name: string;
  description: string;
  instructions: string;
  createdAt: string;
}

export interface CapabilityRevision {
  schemaVersion: 1;
  revisionId: string;
  contentHash: string;
  payload: CapabilityRevisionPayload;
}

export interface CapabilityMetadata {
  schemaVersion: 1;
  artifactId: string;
  type: CapabilityType;
  name: string;
  description: string;
  scope: CapabilityScope;
  latestRevision: string;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityDraft {
  type: CapabilityType;
  name: string;
  description: string;
  instructions: string;
}

export interface WorkflowTrialAssessment {
  outcome: 'passed' | 'passed_with_limitations';
  summary: string;
}

export type CapabilityProposalOperation = 'save' | 'contribute' | 'delete';
export type CapabilityProposalState = 'pending' | 'accepted' | 'rejected';

interface CapabilityProposalBase {
  schemaVersion: 1;
  proposalId: string;
  operation: CapabilityProposalOperation;
  state: CapabilityProposalState;
  requester: PersonalPrincipal;
  requesterOpenId: string;
  larkAppId: string;
  sessionId: string;
  turnId: string;
  targetScope: CapabilityScope;
  nonceHash: string;
  resultArtifactId?: string;
  resultRevisionId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CapabilityContentProposal extends CapabilityProposalBase {
  operation: 'save' | 'contribute';
  draft: CapabilityDraft;
  workflowTrial?: WorkflowTrialAssessment;
  expectedArtifactId?: string;
  expectedRevisionId?: string;
  sourceArtifactId?: string;
  sourceRevisionId?: string;
}

export interface CapabilityDeleteProposal extends CapabilityProposalBase {
  operation: 'delete';
  target: {
    artifactId: string;
    revisionId: string;
    type: CapabilityType;
    name: string;
    description: string;
  };
}

export type CapabilityProposal = CapabilityContentProposal | CapabilityDeleteProposal;
