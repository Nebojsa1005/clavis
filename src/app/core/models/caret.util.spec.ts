import {
  CARET_START,
  durationToTicks,
  elementBoundaries,
  endOfScore,
  caretStops,
  insertionIndex,
  measureCapacityTicks,
  nextCaret,
  normalizeCaret,
  positionAfterElement,
  previousCaret,
  snapTick,
} from './caret.util';
import { createEmptyScore, createMeasure, createNote, createRest, Score } from './score.model';

function scoreWithMeasures(...measures: ReturnType<typeof createMeasure>[]): Score {
  return { ...createEmptyScore(), measures };
}

describe('caret.util', () => {
  const halfPlusQuarters = createMeasure([
    createNote('C', 4, 'half'),
    createRest('quarter'),
    createNote('E', 4, 'quarter'),
  ]);

  it('converts durations to ticks', () => {
    expect(durationToTicks('whole')).toBe(256);
    expect(durationToTicks('quarter')).toBe(64);
    expect(durationToTicks('sixteenth')).toBe(16);
  });

  it('computes measure capacity for different time signatures', () => {
    expect(measureCapacityTicks({ numerator: 4, denominator: 4 })).toBe(256);
    expect(measureCapacityTicks({ numerator: 3, denominator: 4 })).toBe(192);
    expect(measureCapacityTicks({ numerator: 6, denominator: 8 })).toBe(192);
  });

  describe('elementBoundaries', () => {
    it('is just [0] for an empty measure', () => {
      expect(elementBoundaries(createMeasure([]))).toEqual([0]);
    });

    it('lists the start of every element plus the end', () => {
      expect(elementBoundaries(halfPlusQuarters)).toEqual([0, 128, 192, 256]);
    });
  });

  describe('snapTick', () => {
    it('keeps ticks that already sit on a boundary', () => {
      expect(snapTick(halfPlusQuarters, 192)).toBe(192);
    });

    it('snaps to the nearest boundary', () => {
      expect(snapTick(halfPlusQuarters, 150)).toBe(128);
      expect(snapTick(halfPlusQuarters, 170)).toBe(192);
    });

    it('prefers the earlier boundary on a tie', () => {
      expect(snapTick(halfPlusQuarters, 160)).toBe(128);
    });

    it('clamps ticks outside the measure', () => {
      expect(snapTick(halfPlusQuarters, -50)).toBe(0);
      expect(snapTick(halfPlusQuarters, 9999)).toBe(256);
    });
  });

  describe('normalizeCaret', () => {
    const score = scoreWithMeasures(halfPlusQuarters, createMeasure([createNote('G', 4, 'quarter')]));

    it('returns valid positions unchanged', () => {
      expect(normalizeCaret(score, { measureIndex: 1, voice: 0, tick: 64 })).toEqual({
        measureIndex: 1,
        voice: 0,
        tick: 64,
      });
    });

    it('clamps the measure index into range', () => {
      expect(normalizeCaret(score, { measureIndex: 7, voice: 0, tick: 0 }).measureIndex).toBe(1);
      expect(normalizeCaret(score, { measureIndex: -3, voice: 0, tick: 0 }).measureIndex).toBe(0);
    });

    it('forces the voice to 0 while only one voice exists', () => {
      expect(normalizeCaret(score, { measureIndex: 0, voice: 2, tick: 0 }).voice).toBe(0);
    });

    it('expresses the end of a full, non-last measure as the start of the next one', () => {
      expect(normalizeCaret(score, { measureIndex: 0, voice: 0, tick: 256 })).toEqual({
        measureIndex: 1,
        voice: 0,
        tick: 0,
      });
    });

    it('keeps the end of the last measure even when it is full', () => {
      const fullLast = scoreWithMeasures(halfPlusQuarters);
      expect(normalizeCaret(fullLast, { measureIndex: 0, voice: 0, tick: 256 }).tick).toBe(256);
    });

    it('keeps the end of an incomplete non-last measure', () => {
      const incomplete = scoreWithMeasures(createMeasure([createNote('C', 4, 'quarter')]), halfPlusQuarters);
      expect(normalizeCaret(incomplete, { measureIndex: 0, voice: 0, tick: 64 })).toEqual({
        measureIndex: 0,
        voice: 0,
        tick: 64,
      });
    });

    it('snaps the tick against the clamped measure', () => {
      expect(normalizeCaret(score, { measureIndex: 1, voice: 0, tick: 200 }).tick).toBe(64);
    });
  });

  describe('endOfScore', () => {
    it('points past the last element of the last measure', () => {
      const score = scoreWithMeasures(halfPlusQuarters, createMeasure([createNote('G', 4, 'half')]));
      expect(endOfScore(score)).toEqual({ measureIndex: 1, voice: 0, tick: 128 });
    });

    it('points at the start of an empty score', () => {
      expect(endOfScore(createEmptyScore())).toEqual(CARET_START);
    });
  });

  describe('insertionIndex', () => {
    it('counts the elements before the caret', () => {
      expect(insertionIndex(halfPlusQuarters, 0)).toBe(0);
      expect(insertionIndex(halfPlusQuarters, 128)).toBe(1);
      expect(insertionIndex(halfPlusQuarters, 256)).toBe(3);
    });
  });

  describe('navigation', () => {
    const full = () => createMeasure([createNote('C', 4, 'half'), createNote('D', 4, 'half')]);
    const score = () => scoreWithMeasures(full(), createMeasure([createRest('quarter')]));

    it('lists stops without a duplicate at the barline', () => {
      expect(caretStops(score())).toEqual([
        { measureIndex: 0, voice: 0, tick: 0 },
        { measureIndex: 0, voice: 0, tick: 128 },
        { measureIndex: 1, voice: 0, tick: 0 },
        { measureIndex: 1, voice: 0, tick: 64 },
      ]);
    });

    it('moves right through elements', () => {
      expect(nextCaret(score(), { measureIndex: 0, voice: 0, tick: 0 }).tick).toBe(128);
    });

    it('crosses the barline going right', () => {
      expect(nextCaret(score(), { measureIndex: 0, voice: 0, tick: 128 })).toEqual({
        measureIndex: 1,
        voice: 0,
        tick: 0,
      });
    });

    it('stays at the end of the score when moving right', () => {
      expect(nextCaret(score(), { measureIndex: 1, voice: 0, tick: 64 })).toEqual({
        measureIndex: 1,
        voice: 0,
        tick: 64,
      });
    });

    it('crosses the barline going left', () => {
      expect(previousCaret(score(), { measureIndex: 1, voice: 0, tick: 0 })).toEqual({
        measureIndex: 0,
        voice: 0,
        tick: 128,
      });
    });

    it('stays at the start of the score when moving left', () => {
      expect(previousCaret(score(), CARET_START)).toEqual(CARET_START);
    });

    it('treats the end of a full measure as the start of the next when navigating', () => {
      expect(nextCaret(score(), { measureIndex: 0, voice: 0, tick: 256 })).toEqual({
        measureIndex: 1,
        voice: 0,
        tick: 64,
      });
    });
  });

  describe('positionAfterElement', () => {
    it('points right after the element inside its measure', () => {
      const first = createNote('C', 4, 'quarter');
      const second = createNote('D', 4, 'quarter');
      const score = scoreWithMeasures(createMeasure([first, second]));

      expect(positionAfterElement(score, first.id)).toEqual({ measureIndex: 0, voice: 0, tick: 64 });
      expect(positionAfterElement(score, second.id)).toEqual({ measureIndex: 0, voice: 0, tick: 128 });
    });

    it('rolls over to the next measure when the element completes its measure', () => {
      const last = createNote('F', 4, 'quarter');
      const full = createMeasure([
        createNote('C', 4, 'quarter'),
        createNote('D', 4, 'quarter'),
        createNote('E', 4, 'quarter'),
        last,
      ]);
      const score = scoreWithMeasures(full, createMeasure([createRest('quarter')]));

      expect(positionAfterElement(score, last.id)).toEqual({ measureIndex: 1, voice: 0, tick: 0 });
    });

    it('returns null for an unknown id', () => {
      expect(positionAfterElement(createEmptyScore(), 'nope')).toBeNull();
    });
  });
});
