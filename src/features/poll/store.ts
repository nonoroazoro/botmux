import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../../config.js';
import { atomicWriteFileSync } from '../../utils/atomic-write.js';
import { withFileLockSync } from '../../utils/file-lock.js';
import { detectPollLocale, type PollLocale } from './locale.js';

export type PollVoterKind = 'human' | 'bot';

export interface PollOption {
  id: string;
  text: string;
}

export interface PollVote {
  voterKey: string;
  kind: PollVoterKind;
  optionId: string;
  displayName?: string;
  openId?: string;
  votedAt: number;
}

export interface PollRecord {
  schemaVersion: 1;
  id: string;
  ownerLarkAppId: string;
  creatorOpenId?: string;
  chatId: string;
  messageId?: string;
  eligibleVoterCount?: number;
  locale?: PollLocale;
  title: string;
  description?: string;
  options: PollOption[];
  votes: Record<string, PollVote>;
  closedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CreatePollInput {
  ownerLarkAppId: string;
  creatorOpenId: string;
  chatId: string;
  eligibleVoterCount?: number;
  title: string;
  description?: string;
  options: string[];
}

export interface CastPollVoteInput {
  pollId: string;
  optionId: string;
  voterKey: string;
  kind: PollVoterKind;
  displayName?: string;
  openId?: string;
  now?: number;
}

export type CastPollVoteResult =
  | { ok: true; poll: PollRecord }
  | { ok: false; error: 'poll_not_found' | 'option_not_found' | 'already_voted' | 'poll_closed' | 'poll_store_invalid' };

export type ClosePollResult =
  | { ok: true; changed: boolean; poll: PollRecord }
  | { ok: false; error: 'poll_not_found' | 'not_creator' | 'poll_store_invalid' };

const POLL_ID_PATTERN = /^poll_[0-9a-f-]{36}$/u;
const MAX_OPTIONS = 8;
const MAX_TITLE_LENGTH = 120;
const MAX_OPTION_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 500;

function pollFile(pollId: string): string {
  if (!POLL_ID_PATTERN.test(pollId)) throw new Error('invalid_poll_id');
  return join(config.session.dataDir, 'polls', `${pollId}.json`);
}

function readPollFile(file: string): PollRecord | undefined {
  if (!existsSync(file)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as PollRecord;
    if (
      parsed?.schemaVersion !== 1
      || typeof parsed.id !== 'string'
      || typeof parsed.ownerLarkAppId !== 'string'
      || !Array.isArray(parsed.options)
      || !parsed.votes
      || typeof parsed.votes !== 'object'
    ) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writePollFile(file: string, poll: PollRecord): void {
  mkdirSync(dirname(file), { recursive: true });
  atomicWriteFileSync(file, `${JSON.stringify(poll, null, 2)}\n`, { mode: 0o600 });
}

function normalizeRequiredText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field}_required`);
  if (Array.from(normalized).length > maxLength) throw new Error(`${field}_too_long`);
  return normalized;
}

export function createPoll(input: CreatePollInput, now = Date.now()): PollRecord {
  const title = normalizeRequiredText(input.title, 'title', MAX_TITLE_LENGTH);
  const ownerLarkAppId = normalizeRequiredText(input.ownerLarkAppId, 'owner_lark_app_id', 256);
  const creatorOpenId = normalizeRequiredText(input.creatorOpenId, 'creator_open_id', 256);
  const chatId = normalizeRequiredText(input.chatId, 'chat_id', 256);
  const eligibleVoterCount = input.eligibleVoterCount;
  if (eligibleVoterCount !== undefined && (!Number.isSafeInteger(eligibleVoterCount) || eligibleVoterCount < 1)) {
    throw new Error('invalid_eligible_voter_count');
  }
  const options = input.options.map(option => normalizeRequiredText(option, 'option', MAX_OPTION_LENGTH));
  if (options.length < 2) throw new Error('at_least_two_options_required');
  if (options.length > MAX_OPTIONS) throw new Error('too_many_options');
  if (new Set(options).size !== options.length) throw new Error('duplicate_options');
  const description = input.description?.trim();
  if (description && Array.from(description).length > MAX_DESCRIPTION_LENGTH) {
    throw new Error('description_too_long');
  }

  const id = `poll_${randomUUID()}`;
  const poll: PollRecord = {
    schemaVersion: 1,
    id,
    ownerLarkAppId,
    creatorOpenId,
    chatId,
    ...(eligibleVoterCount !== undefined ? { eligibleVoterCount } : {}),
    locale: detectPollLocale([title, description ?? '', ...options]),
    title,
    ...(description ? { description } : {}),
    options: options.map((text, index) => ({ id: `opt_${index + 1}`, text })),
    votes: {},
    createdAt: now,
    updatedAt: now,
  };
  const file = pollFile(id);
  mkdirSync(dirname(file), { recursive: true });
  withFileLockSync(file, () => writePollFile(file, poll), { maxWaitMs: 3_000 });
  return poll;
}

export function getPoll(pollId: string): PollRecord | undefined {
  let file: string;
  try { file = pollFile(pollId); } catch { return undefined; }
  if (!existsSync(file)) return undefined;
  return withFileLockSync(file, () => readPollFile(file), { maxWaitMs: 3_000 });
}

export function attachPollMessage(pollId: string, messageId: string, now = Date.now()): PollRecord {
  const file = pollFile(pollId);
  return withFileLockSync(file, () => {
    const poll = readPollFile(file);
    if (!poll) throw new Error('poll_not_found');
    poll.messageId = normalizeRequiredText(messageId, 'message_id', 256);
    poll.updatedAt = now;
    writePollFile(file, poll);
    return poll;
  }, { maxWaitMs: 3_000 });
}

export function deletePoll(pollId: string): boolean {
  let file: string;
  try { file = pollFile(pollId); } catch { return false; }
  if (!existsSync(file)) return false;
  return withFileLockSync(file, () => {
    if (!existsSync(file)) return false;
    unlinkSync(file);
    return true;
  }, { maxWaitMs: 3_000 });
}

export function castPollVote(input: CastPollVoteInput): CastPollVoteResult {
  let file: string;
  try { file = pollFile(input.pollId); } catch { return { ok: false, error: 'poll_not_found' }; }
  if (!existsSync(file)) return { ok: false, error: 'poll_not_found' };
  return withFileLockSync(file, () => {
    const poll = readPollFile(file);
    if (!poll) return { ok: false, error: existsSync(file) ? 'poll_store_invalid' : 'poll_not_found' };
    if (poll.closedAt !== undefined) return { ok: false, error: 'poll_closed' };
    if (!poll.options.some(option => option.id === input.optionId)) {
      return { ok: false, error: 'option_not_found' };
    }
    const voterKey = normalizeRequiredText(input.voterKey, 'voter_key', 512);
    if (poll.votes[voterKey]) return { ok: false, error: 'already_voted' };
    const now = input.now ?? Date.now();
    poll.votes[voterKey] = {
      voterKey,
      kind: input.kind,
      optionId: input.optionId,
      ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
      ...(input.openId?.trim() ? { openId: input.openId.trim() } : {}),
      votedAt: now,
    };
    poll.updatedAt = now;
    writePollFile(file, poll);
    return { ok: true, poll };
  }, { maxWaitMs: 3_000 });
}

export function closePoll(pollId: string, creatorOpenId: string, now = Date.now()): ClosePollResult {
  let file: string;
  try { file = pollFile(pollId); } catch { return { ok: false, error: 'poll_not_found' }; }
  if (!existsSync(file)) return { ok: false, error: 'poll_not_found' };
  return withFileLockSync(file, () => {
    const poll = readPollFile(file);
    if (!poll) return { ok: false, error: existsSync(file) ? 'poll_store_invalid' : 'poll_not_found' };
    if (!poll.creatorOpenId || poll.creatorOpenId !== creatorOpenId) {
      return { ok: false, error: 'not_creator' };
    }
    if (poll.closedAt !== undefined) return { ok: true, changed: false, poll };
    poll.closedAt = now;
    poll.updatedAt = now;
    writePollFile(file, poll);
    return { ok: true, changed: true, poll };
  }, { maxWaitMs: 3_000 });
}
