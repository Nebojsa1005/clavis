import { createEmptyScore, createMeasure, createNote, createRest, MeasureElement, Note, Score } from './score.model';
import { canTie, sanitizeTies, setTieFlag, tieLinks, tieNoteBefore, tiedTargetIds } from './tie.util';

const tied = (note: Note): Note => ({ ...note, tieToNext: true });
const scoreOf = (...measures: MeasureElement[][]): Score => ({
  ...createEmptyScore(),
  measures: measures.map((elements) => createMeasure(elements)),
});
const flagsOf = (score: Score) =>
  score.measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' && el.tieToNext ? 'T' : '-')));

describe('canTie', () => {
  it('accepts two notes of the same pitch', () => {
    expect(canTie(createNote('C', 4, 'quarter'), createNote('C', 4, 'half'), 'C')).toBeTrue();
  });

  it('rejects different steps, octaves and accidentals', () => {
    const c4 = createNote('C', 4, 'quarter');
    expect(canTie(c4, createNote('D', 4, 'quarter'), 'C')).toBeFalse();
    expect(canTie(c4, createNote('C', 5, 'quarter'), 'C')).toBeFalse();
    expect(canTie(c4, createNote('C', 4, 'quarter', 'sharp'), 'C')).toBeFalse();
  });

  it('never ties rests or missing neighbours', () => {
    const c4 = createNote('C', 4, 'quarter');
    expect(canTie(c4, createRest('quarter'), 'C')).toBeFalse();
    expect(canTie(createRest('quarter'), c4, 'C')).toBeFalse();
    expect(canTie(c4, undefined, 'C')).toBeFalse();
    expect(canTie(undefined, c4, 'C')).toBeFalse();
  });

  it('compares the sounding pitch, so key-implied and explicit accidentals match', () => {
    const plainF = createNote('F', 4, 'quarter');
    const sharpF = createNote('F', 4, 'quarter', 'sharp');

    expect(canTie(plainF, sharpF, 'G')).toBeTrue();
    expect(canTie(plainF, sharpF, 'C')).toBeFalse();
    expect(canTie(plainF, createNote('F', 4, 'quarter', 'natural'), 'G')).toBeFalse();
  });
});

describe('tieLinks', () => {
  it('links a flagged note to the same-pitch note after it', () => {
    const a = tied(createNote('C', 4, 'quarter'));
    const b = createNote('C', 4, 'quarter');

    const links = tieLinks(scoreOf([a, b]));

    expect(links.length).toBe(1);
    expect(links[0].from.id).toBe(a.id);
    expect(links[0].to.id).toBe(b.id);
  });

  it('follows a chain of several notes as consecutive links', () => {
    const a = tied(createNote('C', 4, 'quarter'));
    const b = tied(createNote('C', 4, 'quarter'));
    const c = createNote('C', 4, 'half');

    const links = tieLinks(scoreOf([a, b, c]));

    expect(links.map((l) => [l.from.id, l.to.id])).toEqual([
      [a.id, b.id],
      [b.id, c.id],
    ]);
  });

  it('crosses barlines', () => {
    const a = tied(createNote('G', 4, 'quarter'));
    const b = createNote('G', 4, 'quarter');

    expect(tieLinks(scoreOf([createNote('C', 4, 'half'), a], [b])).length).toBe(1);
  });

  it('ignores flags that do not join same-pitch neighbours', () => {
    const toOther = tied(createNote('C', 4, 'quarter'));
    const toRest = tied(createNote('D', 4, 'quarter'));
    const last = tied(createNote('E', 4, 'quarter'));

    expect(tieLinks(scoreOf([toOther, createNote('D', 4, 'quarter'), toRest, createRest('quarter'), last])).length).toBe(0);
  });

  it('does not link notes that are merely equal but not flagged', () => {
    expect(tieLinks(scoreOf([createNote('C', 4, 'quarter'), createNote('C', 4, 'quarter')])).length).toBe(0);
  });

  it('collects the ids of tie targets', () => {
    const a = tied(createNote('C', 4, 'quarter'));
    const b = tied(createNote('C', 4, 'quarter'));
    const c = createNote('C', 4, 'quarter');

    expect(tiedTargetIds(tieLinks(scoreOf([a, b, c])))).toEqual(new Set([b.id, c.id]));
  });
});

describe('sanitizeTies', () => {
  it('returns the very same score when every tie is still valid', () => {
    const score = scoreOf([tied(createNote('C', 4, 'quarter')), createNote('C', 4, 'quarter')]);

    expect(sanitizeTies(score)).toBe(score);
  });

  it('clears a flag whose neighbour changed pitch', () => {
    const score = scoreOf([tied(createNote('C', 4, 'quarter')), createNote('D', 4, 'quarter')]);

    expect(flagsOf(sanitizeTies(score))).toEqual(['-', '-']);
  });

  it('clears a flag on the last note and in front of a rest', () => {
    const score = scoreOf([tied(createNote('C', 4, 'quarter')), createRest('quarter'), tied(createNote('C', 4, 'quarter'))]);

    expect(flagsOf(sanitizeTies(score))).toEqual(['-', '-', '-']);
  });

  it('only clears the broken part of a chain', () => {
    const score = scoreOf([
      tied(createNote('C', 4, 'quarter')),
      tied(createNote('C', 4, 'quarter')),
      createNote('D', 4, 'quarter'),
    ]);

    expect(flagsOf(sanitizeTies(score))).toEqual(['T', '-', '-']);
  });

  it('does not mutate its input', () => {
    const a = tied(createNote('C', 4, 'quarter'));
    const score = scoreOf([a, createNote('D', 4, 'quarter')]);

    sanitizeTies(score);

    expect(a.tieToNext).toBeTrue();
  });
});

describe('setTieFlag / tieNoteBefore', () => {
  it('sets and clears flags on the given notes only', () => {
    const [a, b, c] = ['C', 'C', 'C'].map((s) => createNote(s as 'C', 4, 'quarter'));
    const score = scoreOf([a, b, c]);

    const set = setTieFlag(score, new Set([a.id, b.id]), true);
    expect(flagsOf(set)).toEqual(['T', 'T', '-']);

    const cleared = setTieFlag(set, new Set([a.id]), false);
    expect(flagsOf(cleared)).toEqual(['-', 'T', '-']);
  });

  it('ties the note before an element when the pitch matches', () => {
    const a = createNote('C', 4, 'quarter');
    const b = createNote('C', 4, 'quarter');

    expect(flagsOf(tieNoteBefore(scoreOf([a, b]), b.id))).toEqual(['T', '-']);
  });

  it('leaves the score alone for a different pitch, a first element or an unknown id', () => {
    const a = createNote('C', 4, 'quarter');
    const b = createNote('D', 4, 'quarter');
    const score = scoreOf([a, b]);

    expect(tieNoteBefore(score, b.id)).toBe(score);
    expect(tieNoteBefore(score, a.id)).toBe(score);
    expect(tieNoteBefore(score, 'nope')).toBe(score);
  });
});
