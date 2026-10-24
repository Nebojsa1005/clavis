import { createEmptyScore, createMeasure, createNote, createRest, MeasureElement, Score } from './score.model';
import {
  allStaves,
  asDocument,
  createPart,
  documentFromScore,
  documentMeasureCount,
  findStaff,
  firstStaffId,
  isScoreDocument,
  mapStaffScores,
  normalizeDocument,
  toDocument,
  withStaffScore,
} from './score-document';

const scoreOf = (...measures: MeasureElement[][]): Score => ({
  ...createEmptyScore(),
  measures: measures.map((elements) => createMeasure(elements)),
});
const quarter = () => createNote('C', 4, 'quarter');

describe('score document', () => {
  describe('construction', () => {
    it('wraps a score into a document with one instrument and one staff', () => {
      const score = createEmptyScore();

      const doc = documentFromScore(score);

      expect(doc.parts.length).toBe(1);
      expect(doc.parts[0].staves.length).toBe(1);
      expect(doc.parts[0].staves[0].score).toBe(score);
    });

    it('gives every part and staff its own id', () => {
      const doc = { parts: [createPart('Klavir', [createEmptyScore(), createEmptyScore('bass')]), createPart('Violina', [createEmptyScore()])] };

      const ids = [...doc.parts.map((p) => p.id), ...allStaves(doc).map((r) => r.staff.id)];

      expect(new Set(ids).size).toBe(5);
    });

    it('asDocument wraps a score but leaves a document alone', () => {
      const doc = documentFromScore(createEmptyScore());

      expect(asDocument(doc)).toBe(doc);
      expect(asDocument(createEmptyScore()).parts.length).toBe(1);
    });
  });

  describe('validation', () => {
    const valid = () => ({ parts: [createPart('Klavir', [createEmptyScore(), createEmptyScore('bass')])] });

    it('accepts a well-formed document', () => {
      expect(isScoreDocument(valid())).toBeTrue();
    });

    it('rejects things that are not documents', () => {
      expect(isScoreDocument(null)).toBeFalse();
      expect(isScoreDocument('x')).toBeFalse();
      expect(isScoreDocument({})).toBeFalse();
      expect(isScoreDocument({ parts: [] })).toBeFalse();
      expect(isScoreDocument(createEmptyScore())).toBeFalse();
    });

    it('rejects parts without staves or with broken staves', () => {
      expect(isScoreDocument({ parts: [{ id: 'p', name: 'X', staves: [] }] })).toBeFalse();
      expect(isScoreDocument({ parts: [{ id: 'p', name: 'X', staves: [{ id: 's', score: { clef: 'treble' } }] }] })).toBeFalse();
      expect(isScoreDocument({ parts: [{ id: 'p', staves: [{ id: 's', score: createEmptyScore() }] }] })).toBeFalse();
    });

    it('accepts staff text and rejects text that is not a string', () => {
      const withText = (text: unknown) => ({ parts: [{ id: 'p', name: 'X', staves: [{ id: 's', score: createEmptyScore(), text }] }] });

      expect(isScoreDocument(withText('la la'))).toBeTrue();
      expect(isScoreDocument(withText(undefined))).toBeTrue();
      expect(isScoreDocument(withText(42))).toBeFalse();
    });

    it('toDocument returns documents, upgrades old single-staff scores and rejects the rest', () => {
      const doc = valid();
      const legacy = createEmptyScore('bass');

      expect(toDocument(doc)).toBe(doc);
      expect(toDocument(legacy)?.parts[0].staves[0].score).toBe(legacy);
      expect(toDocument({ hello: 'world' })).toBeNull();
      expect(toDocument(undefined)).toBeNull();
    });
  });

  describe('lookups', () => {
    const doc = () => ({
      parts: [createPart('Klavir', [createEmptyScore(), createEmptyScore('bass')]), createPart('Violina', [createEmptyScore()])],
    });

    it('lists staves top to bottom with their positions', () => {
      const refs = allStaves(doc());

      expect(refs.map((r) => [r.partIndex, r.staffIndex, r.globalIndex])).toEqual([
        [0, 0, 0],
        [0, 1, 1],
        [1, 0, 2],
      ]);
    });

    it('finds a staff by id and knows the first one', () => {
      const d = doc();
      const bass = d.parts[0].staves[1];

      expect(findStaff(d, bass.id)).toBe(bass);
      expect(findStaff(d, 'nope')).toBeUndefined();
      expect(firstStaffId(d)).toBe(d.parts[0].staves[0].id);
    });

    it('withStaffScore replaces only the named staff', () => {
      const d = doc();
      const bass = d.parts[0].staves[1];
      const replacement = createEmptyScore('alto');

      const next = withStaffScore(d, bass.id, replacement);

      expect(findStaff(next, bass.id)?.score).toBe(replacement);
      expect(next.parts[0].staves[0].score).toBe(d.parts[0].staves[0].score);
      expect(next.parts[1].staves[0].score).toBe(d.parts[1].staves[0].score);
      expect(findStaff(d, bass.id)?.score).not.toBe(replacement);
    });

    it('mapStaffScores visits every staff', () => {
      const next = mapStaffScores(doc(), (score) => ({ ...score, keySignature: 'D' }));

      expect(allStaves(next).every((r) => r.staff.score.keySignature === 'D')).toBeTrue();
    });
  });

  describe('normalizeDocument', () => {
    it('returns the same object when nothing needs fixing', () => {
      const doc = { parts: [createPart('Klavir', [scoreOf([quarter()]), scoreOf([quarter()])])] };

      expect(normalizeDocument(doc)).toBe(doc);
    });

    it('gives shorter staves empty measures up to the longest one', () => {
      const doc = { parts: [createPart('Klavir', [scoreOf([quarter()], [quarter()], [quarter()]), scoreOf([quarter()])])] };

      const result = normalizeDocument(doc);

      expect(allStaves(result).map((r) => r.staff.score.measures.length)).toEqual([3, 3]);
      expect(documentMeasureCount(result)).toBe(3);
      expect(result.parts[0].staves[1].score.measures[2].elements).toEqual([]);
    });

    it('drops trailing measures that are empty in every staff but keeps the first', () => {
      const doc = { parts: [createPart('Klavir', [scoreOf([quarter()], [], []), scoreOf([], [])])] };

      expect(documentMeasureCount(normalizeDocument(doc))).toBe(1);

      const empty = { parts: [createPart('X', [scoreOf([], [])])] };
      expect(documentMeasureCount(normalizeDocument(empty))).toBe(1);
    });

    it('keeps a trailing measure that has content in any staff', () => {
      const doc = { parts: [createPart('Klavir', [scoreOf([quarter()], []), scoreOf([quarter()], [quarter()])])] };

      expect(documentMeasureCount(normalizeDocument(doc))).toBe(2);
    });

    it('makes every staff use the signatures of the first one', () => {
      const first = { ...scoreOf([quarter()]), keySignature: 'G', timeSignature: { numerator: 3, denominator: 4 } };
      const doc = { parts: [createPart('Klavir', [first, scoreOf([quarter()])])] };

      const result = normalizeDocument(doc);

      const second = result.parts[0].staves[1].score;
      expect(second.keySignature).toBe('G');
      expect(second.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    });

    it('drops ties that no longer join same-pitch neighbours', () => {
      const stale = { ...createNote('C', 4, 'quarter'), tieToNext: true };
      const doc = { parts: [createPart('X', [scoreOf([stale, createRest('quarter')])])] };

      const result = normalizeDocument(doc);

      const first = result.parts[0].staves[0].score.measures[0].elements[0];
      expect(first.kind === 'note' && first.tieToNext).toBeFalsy();
    });

    it('does not change its input', () => {
      const doc = { parts: [createPart('Klavir', [scoreOf([quarter()], [quarter()]), scoreOf([quarter()])])] };

      normalizeDocument(doc);

      expect(doc.parts[0].staves[1].score.measures.length).toBe(1);
    });
  });
});
