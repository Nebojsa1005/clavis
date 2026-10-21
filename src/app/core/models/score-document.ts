import { createId, createMeasure, isScore, Score } from './score.model';
import { sanitizeTies } from './tie.util';

/**
 * A whole piece: instruments (parts), each with one or more staves. One staff is what the editing
 * code (caret, insert, ties, ...) works on; it is a self-contained `Score` that also carries the
 * time and key signature, which every staff of a document shares.
 */
export interface Staff {
  readonly id: string;
  score: Score;
}

export interface Part {
  readonly id: string;
  name: string;
  /** One staff for most instruments, two for a grand staff (piano). */
  staves: Staff[];
}

export interface ScoreDocument {
  parts: Part[];
}

export interface StaffRef {
  part: Part;
  staff: Staff;
  partIndex: number;
  /** Index of the staff inside its part. */
  staffIndex: number;
  /** Index of the staff among all staves of the document, top to bottom. */
  globalIndex: number;
}

export const DEFAULT_PART_NAME = 'Instrument';

export function createStaff(score: Score): Staff {
  return { id: createId(), score };
}

export function createPart(name: string, scores: readonly Score[]): Part {
  return { id: createId(), name, staves: scores.map(createStaff) };
}

export function documentFromScore(score: Score, partName = DEFAULT_PART_NAME): ScoreDocument {
  return { parts: [createPart(partName, [score])] };
}

export function isScoreDocument(value: unknown): value is ScoreDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const parts = (value as Record<string, unknown>)['parts'];
  return (
    Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every((part: unknown) => {
      const candidate = part as Record<string, unknown> | null;
      const staves = candidate?.['staves'];
      return (
        typeof candidate?.['id'] === 'string' &&
        typeof candidate['name'] === 'string' &&
        Array.isArray(staves) &&
        staves.length > 0 &&
        staves.every((staff: unknown) => {
          const entry = staff as Record<string, unknown> | null;
          return typeof entry?.['id'] === 'string' && isScore(entry['score']);
        })
      );
    })
  );
}

/** A document as is, a score from the single-staff days wrapped into one, or null for anything else. */
export function toDocument(value: unknown): ScoreDocument | null {
  if (isScoreDocument(value)) {
    return value;
  }
  return isScore(value) ? documentFromScore(value) : null;
}

/** Lets code that handles a whole document also accept a plain single-staff score. */
export function asDocument(input: Score | ScoreDocument): ScoreDocument {
  return 'parts' in input ? input : documentFromScore(input);
}

export function allStaves(doc: ScoreDocument): StaffRef[] {
  const refs: StaffRef[] = [];
  doc.parts.forEach((part, partIndex) => {
    part.staves.forEach((staff, staffIndex) => refs.push({ part, staff, partIndex, staffIndex, globalIndex: refs.length }));
  });
  return refs;
}

export function findStaff(doc: ScoreDocument, staffId: string): Staff | undefined {
  return allStaves(doc).find((ref) => ref.staff.id === staffId)?.staff;
}

export function firstStaffId(doc: ScoreDocument): string {
  return doc.parts[0].staves[0].id;
}

/** Applies `change` to the score of every staff; untouched staves keep their identity. */
export function mapStaffScores(doc: ScoreDocument, change: (score: Score, ref: StaffRef) => Score): ScoreDocument {
  const refs = allStaves(doc);
  return {
    parts: doc.parts.map((part) => ({
      ...part,
      staves: part.staves.map((staff) => {
        const ref = refs.find((candidate) => candidate.staff.id === staff.id)!;
        return { ...staff, score: change(staff.score, ref) };
      }),
    })),
  };
}

export function withStaffScore(doc: ScoreDocument, staffId: string, score: Score): ScoreDocument {
  return mapStaffScores(doc, (current, ref) => (ref.staff.id === staffId ? score : current));
}

export function documentMeasureCount(doc: ScoreDocument): number {
  return Math.max(...allStaves(doc).map((ref) => ref.staff.score.measures.length));
}

/**
 * Brings a document into its invariant shape: every staff uses the signatures of the first one,
 * has no stale ties, and all staves have the same number of measures (shorter ones get empty
 * measures, trailing measures that are empty everywhere are dropped, the first one always stays).
 * Returns the same object when nothing needs to change.
 */
export function normalizeDocument(doc: ScoreDocument): ScoreDocument {
  const refs = allStaves(doc);
  const reference = refs[0].staff.score;

  let target = Math.max(...refs.map((ref) => ref.staff.score.measures.length));
  while (target > 1 && refs.every((ref) => (ref.staff.score.measures[target - 1]?.elements.length ?? 0) === 0)) {
    target--;
  }

  let changed = false;
  const next = mapStaffScores(doc, (score) => {
    let result = sanitizeTies(score);
    const sameSignatures =
      result.timeSignature.numerator === reference.timeSignature.numerator &&
      result.timeSignature.denominator === reference.timeSignature.denominator &&
      result.keySignature === reference.keySignature;
    if (!sameSignatures) {
      result = { ...result, timeSignature: { ...reference.timeSignature }, keySignature: reference.keySignature };
    }
    if (result.measures.length !== target) {
      const measures = result.measures.slice(0, target);
      while (measures.length < target) {
        measures.push(createMeasure([]));
      }
      result = { ...result, measures };
    }
    changed ||= result !== score;
    return result;
  });
  return changed ? next : doc;
}
