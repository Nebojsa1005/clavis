import {
  beamGroups,
  beamLevels,
  beamedToNextIds,
  beatTicks,
  isBeamable,
  sanitizeBeams,
  setBeamMode,
} from './beam.util';
import { createEmptyScore, createMeasure, createNote, createRest, MeasureElement, Note, NoteDuration, Score, Step } from './score.model';

const fourFour = { numerator: 4, denominator: 4 };
const note = (duration: NoteDuration, beamToNext?: 'on' | 'off', step: Step = 'C'): Note => ({
  ...createNote(step, 4, duration),
  ...(beamToNext ? { beamToNext } : {}),
});
const eighths = (count: number): Note[] => Array.from({ length: count }, () => note('eighth'));
const measureOf = (...elements: MeasureElement[]) => createMeasure(elements);
/** Beam groups described by the positions of their notes in the measure. */
const positions = (elements: MeasureElement[], timeSignature = fourFour) =>
  beamGroups(measureOf(...elements), timeSignature).map((group) => group.map((n) => elements.indexOf(n)));
const scoreOf = (...measures: MeasureElement[][]): Score => ({
  ...createEmptyScore(),
  measures: measures.map((elements) => createMeasure(elements)),
});

describe('beam.util', () => {
  describe('isBeamable / beamLevels', () => {
    it('accepts notes of an eighth or shorter only', () => {
      for (const duration of ['eighth', 'sixteenth', 'thirtysecond', 'sixtyfourth'] as const) {
        expect(isBeamable(note(duration))).withContext(duration).toBeTrue();
      }
      for (const duration of ['whole', 'half', 'quarter'] as const) {
        expect(isBeamable(note(duration))).withContext(duration).toBeFalse();
      }
    });

    it('never beams rests or nothing', () => {
      expect(isBeamable(createRest('eighth'))).toBeFalse();
      expect(isBeamable(undefined)).toBeFalse();
    });

    it('counts one beam per flag', () => {
      expect([note('eighth'), note('sixteenth'), note('thirtysecond'), note('sixtyfourth')].map(beamLevels)).toEqual([1, 2, 3, 4]);
    });
  });

  describe('beatTicks', () => {
    const ticks = (numerator: number, denominator: number) => beatTicks({ numerator, denominator });

    it('is the denominator note in simple meters', () => {
      expect(ticks(4, 4)).toBe(64);
      expect(ticks(3, 4)).toBe(64);
      expect(ticks(2, 4)).toBe(64);
      expect(ticks(2, 2)).toBe(128);
      expect(ticks(5, 8)).toBe(32);
      expect(ticks(7, 8)).toBe(32);
    });

    it('is three eighths in compound meters', () => {
      for (const numerator of [3, 6, 9, 12]) {
        expect(ticks(numerator, 8)).withContext(`${numerator}/8`).toBe(96);
      }
    });
  });

  describe('beamGroups: automatic', () => {
    it('joins eighths by the beat', () => {
      expect(positions(eighths(4))).toEqual([[0, 1], [2, 3]]);
      expect(positions(eighths(8))).toEqual([[0, 1], [2, 3], [4, 5], [6, 7]]);
    });

    it('leaves a lone eighth without a beam', () => {
      expect(positions(eighths(3))).toEqual([[0, 1]]);
    });

    it('does not join across a note longer than an eighth', () => {
      expect(positions([note('eighth'), note('quarter'), note('eighth')])).toEqual([]);
    });

    it('does not join across a rest', () => {
      expect(positions([note('eighth'), createRest('eighth'), note('eighth'), note('eighth')])).toEqual([[2, 3]]);
    });

    it('groups notes that start in the same beat even when they are of different lengths', () => {
      expect(positions([note('sixteenth'), note('eighth'), note('sixteenth')])).toEqual([[0, 1, 2]]);
      expect(positions([note('eighth', undefined), note('sixteenth'), note('sixteenth')])).toEqual([[0, 1, 2]]);
    });

    it('groups sixteenths four to a beat in 2/4', () => {
      const sixteenths = Array.from({ length: 8 }, () => note('sixteenth'));
      expect(positions(sixteenths, { numerator: 2, denominator: 4 })).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
    });

    it('treats a dotted eighth and a sixteenth as one beat', () => {
      const dotted = { ...note('eighth'), dotted: true };
      expect(positions([dotted, note('sixteenth')])).toEqual([[0, 1]]);
    });

    it('beams three eighths together in 6/8 and 3/8', () => {
      expect(positions(eighths(6), { numerator: 6, denominator: 8 })).toEqual([[0, 1, 2], [3, 4, 5]]);
      expect(positions(eighths(3), { numerator: 3, denominator: 8 })).toEqual([[0, 1, 2]]);
    });

    it('beams eighths by the half note in 2/2', () => {
      expect(positions(eighths(8), { numerator: 2, denominator: 2 })).toEqual([[0, 1, 2, 3], [4, 5, 6, 7]]);
    });

    it('returns nothing for an empty measure or for long notes only', () => {
      expect(positions([])).toEqual([]);
      expect(positions([note('quarter'), note('half')])).toEqual([]);
    });
  });

  describe('beamGroups: manual', () => {
    it('joins across a beat when the earlier note is forced on', () => {
      const elements = [note('eighth'), note('eighth', 'on'), note('eighth'), note('eighth')];

      expect(positions(elements)).toEqual([[0, 1, 2, 3]]);
    });

    it('splits inside a beat when the earlier note is forced off', () => {
      const elements = [note('eighth', 'off'), note('eighth'), note('eighth'), note('eighth')];

      expect(positions(elements)).toEqual([[2, 3]]);
    });

    it('can force a beam between notes that sit in different beats', () => {
      const elements = [createRest('eighth'), note('eighth', 'on'), note('eighth')];

      expect(positions(elements)).toEqual([[1, 2]]);
    });

    it('cannot join a note to something that cannot be beamed', () => {
      expect(positions([note('eighth', 'on'), note('quarter')])).toEqual([]);
      expect(positions([note('eighth', 'on'), createRest('eighth')])).toEqual([]);
    });

    it('ignores a setting on the last note of the measure', () => {
      expect(positions([note('quarter'), note('eighth', 'on')])).toEqual([]);
    });
  });

  describe('beamedToNextIds', () => {
    it('lists every note of a group but the last', () => {
      const a = note('eighth');
      const b = note('eighth');
      const c = note('eighth');
      const d = note('quarter');

      const ids = beamedToNextIds(scoreOf([a, b, c, d]));

      expect(ids).toEqual(new Set([a.id]));
    });

    it('covers all measures', () => {
      const first = eighths(2);
      const second = eighths(2);

      const ids = beamedToNextIds(scoreOf(first, second));

      expect(ids).toEqual(new Set([first[0].id, second[0].id]));
    });
  });

  describe('sanitizeBeams', () => {
    it('returns the same score when every setting is still valid', () => {
      const score = scoreOf([note('eighth', 'on'), note('eighth', 'off'), note('eighth')]);

      expect(sanitizeBeams(score)).toBe(score);
    });

    it('clears a setting before something that cannot be beamed', () => {
      const score = scoreOf([note('eighth', 'on'), note('quarter')], [note('eighth', 'off'), createRest('eighth')]);

      const flags = sanitizeBeams(score).measures.flatMap((m) => m.elements.map((el) => el.kind === 'note' && el.beamToNext));

      expect(flags.every((flag) => !flag)).toBeTrue();
    });

    it('clears a setting on the last note of a measure', () => {
      const score = scoreOf([note('eighth'), note('eighth', 'on')], [note('eighth')]);

      const last = sanitizeBeams(score).measures[0].elements[1];

      expect(last.kind === 'note' && last.beamToNext).toBeFalsy();
    });

    it('clears a setting on a note that is no longer beamable', () => {
      const score = scoreOf([note('quarter', 'on'), note('eighth')]);

      expect((sanitizeBeams(score).measures[0].elements[0] as Note).beamToNext).toBeUndefined();
    });

    it('keeps the valid settings next to a broken one', () => {
      const score = scoreOf([note('eighth', 'on'), note('eighth', 'on'), note('quarter')]);

      const [first, second] = sanitizeBeams(score).measures[0].elements as Note[];

      expect(first.beamToNext).toBe('on');
      expect(second.beamToNext).toBeUndefined();
    });

    it('does not change its input', () => {
      const flagged = note('eighth', 'on');
      const score = scoreOf([flagged, note('quarter')]);

      sanitizeBeams(score);

      expect(flagged.beamToNext).toBe('on');
    });
  });

  describe('setBeamMode', () => {
    it('sets a mode on the given notes only', () => {
      const [a, b, c] = eighths(3);

      const result = setBeamMode(scoreOf([a, b, c]), new Set([a.id, b.id]), 'on');

      expect((result.measures[0].elements as Note[]).map((n) => n.beamToNext)).toEqual(['on', 'on', undefined]);
    });

    it('hands notes back to automatic with null', () => {
      const [a, b] = [note('eighth', 'off'), note('eighth', 'on')];

      const result = setBeamMode(scoreOf([a, b]), new Set([a.id]), null);

      expect((result.measures[0].elements as Note[]).map((n) => n.beamToNext)).toEqual([undefined, 'on']);
      expect('beamToNext' in result.measures[0].elements[0]).toBeFalse();
    });
  });
});
