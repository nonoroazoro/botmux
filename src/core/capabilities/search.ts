import type { CapabilityMetadata } from './types.js';

const WORD_RE = /[\p{L}\p{N}]+/gu;
const MAX_INDEXED_TEXT_LENGTH = 1_024;

interface SearchDocument {
  item: CapabilityMetadata;
  normalizedName: string;
  words: Set<string>;
  nameWords: Set<string>;
  trigrams: Set<string>;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .slice(0, MAX_INDEXED_TEXT_LENGTH);
}

function words(value: string): string[] {
  return normalizeText(value).match(WORD_RE) ?? [];
}

function trigrams(value: string): Set<string> {
  const compact = normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '');
  if (!compact) return new Set();
  if (compact.length <= 3) return new Set([compact]);
  const result = new Set<string>();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    result.add(compact.slice(index, index + 3));
  }
  return result;
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const smaller = left.size <= right.size ? left : right;
  const larger = left.size <= right.size ? right : left;
  let count = 0;
  for (const value of smaller) {
    if (larger.has(value)) count += 1;
  }
  return count;
}

/**
 * Returns a bounded lexical candidate set for later semantic review by the active LLM.
 *
 * @param items Artifact metadata in one scope and type.
 * @param query A compact query containing the proposed name, description, and aliases.
 * @param limit Maximum number of candidates to return.
 */
export function searchCapabilityMetadata(
  items: readonly CapabilityMetadata[],
  query: string,
  limit = 8,
): CapabilityMetadata[] {
  const queryNormalized = normalizeText(query).trim();
  const queryWords = new Set(words(query));
  const queryTrigrams = trigrams(query);
  if (!queryNormalized || (queryWords.size === 0 && queryTrigrams.size === 0)) return [];

  const documents: SearchDocument[] = items.map((item) => {
    const nameWords = new Set(words(item.name));
    return {
      item,
      normalizedName: normalizeText(item.name).trim(),
      words: new Set(words(`${item.name} ${item.description}`)),
      nameWords,
      trigrams: trigrams(item.name),
    };
  });
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    for (const word of document.words) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
  }

  const scored = documents.flatMap((document) => {
    let lexicalScore = 0;
    let sharedWords = 0;
    for (const word of queryWords) {
      if (!document.words.has(word)) continue;
      sharedWords += 1;
      const frequency = documentFrequency.get(word) ?? 1;
      const inverseFrequency = Math.log(1 + (documents.length + 1) / frequency);
      lexicalScore += inverseFrequency * (document.nameWords.has(word) ? 3 : 1);
    }
    const sharedTrigrams = intersectionSize(queryTrigrams, document.trigrams);
    const trigramRecall = queryTrigrams.size > 0 ? sharedTrigrams / queryTrigrams.size : 0;
    const exactNameBonus = document.normalizedName
      && queryNormalized.includes(document.normalizedName)
      ? 8
      : 0;
    if (sharedWords === 0 && exactNameBonus === 0 && trigramRecall < 0.12) return [];
    return [{
      item: document.item,
      score: lexicalScore + exactNameBonus + trigramRecall * 2,
    }];
  });

  const boundedLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  return scored
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))
    .slice(0, boundedLimit)
    .map(({ item }) => item);
}
