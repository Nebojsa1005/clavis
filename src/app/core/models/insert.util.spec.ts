import { changeTimeSignature, insertManyWithReflow, insertWithReflow } from './insert.util';
import { createEmptyScore, createMeasure, createNote, createRest, MeasureElement, Score, Step } from './score.model';

function scoreOf(...measures: MeasureElement[][]): Score {
  return { ...createEmptyScore(), measures: measures.map((elements) => createMeasure(elements)) };
}

const quarters = (...steps: Step[]) => steps.map((step) => createNote(step, 4, 'quarter'));
const stepsOf = (score: Score, measureIndex: number) =>
  score.measures[measureIndex].elements.map((el) => (el.kind === 'note' ? el.pitch.step : 'r'));

describe('insertWithReflow', () => {
  it('inserts into a measure that has room', () => {
    const score = scoreOf(quarters('C', 'E'));

    const result = insertWithReflow(score, 0, 1, createNote('D', 4, 'quarter'));

    expect(stepsOf(result, 0)).toEqual(['C', 'D', 'E']);
    expect(result.measures.length).toBe(1);
  });

  it('inserts into an empty measure', () => {
    const result = insertWithReflow(scoreOf([]), 0, 0, createNote('C', 4, 'whole'));

    expect(stepsOf(result, 0)).toEqual(['C']);
  });

  it('pushes the last element of a full measure into a new measure', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    const result = insertWithReflow(score, 0, 1, createNote('G', 4, 'quarter'));

    expect(stepsOf(result, 0)).toEqual(['C', 'G', 'D', 'E']);
    expect(stepsOf(result, 1)).toEqual(['F']);
  });

  it('prepends the overflow to the next measure and cascades', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'), quarters('C', 'D', 'E', 'F'));

    const result = insertWithReflow(score, 0, 0, createNote('G', 4, 'quarter'));

    expect(stepsOf(result, 0)).toEqual(['G', 'C', 'D', 'E']);
    expect(stepsOf(result, 1)).toEqual(['F', 'C', 'D', 'E']);
    expect(stepsOf(result, 2)).toEqual(['F']);
  });

  it('stops cascading once a measure has room', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'), quarters('C', 'D'));

    const result = insertWithReflow(score, 0, 0, createNote('G', 4, 'quarter'));

    expect(result.measures.length).toBe(2);
    expect(stepsOf(result, 1)).toEqual(['F', 'C', 'D']);
  });

  it('moves several trailing elements when the inserted one is long', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    const result = insertWithReflow(score, 0, 0, createNote('G', 4, 'half'));

    expect(stepsOf(result, 0)).toEqual(['G', 'C', 'D']);
    expect(stepsOf(result, 1)).toEqual(['E', 'F']);
  });

  it('opens a new measure when appending after the last element of a full last measure', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    const result = insertWithReflow(score, 0, 4, createRest('quarter'));

    expect(stepsOf(result, 0)).toEqual(['C', 'D', 'E', 'F']);
    expect(stepsOf(result, 1)).toEqual(['r']);
  });

  it('counts the dot when deciding what overflows', () => {
    const score = scoreOf([createNote('C', 4, 'half', null, true), createNote('D', 4, 'quarter')]);

    const result = insertWithReflow(score, 0, 0, createNote('E', 4, 'quarter'));

    expect(stepsOf(result, 0)).toEqual(['E', 'C']);
    expect(stepsOf(result, 1)).toEqual(['D']);
  });

  it('does not mutate the input score', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    insertWithReflow(score, 0, 0, createNote('G', 4, 'quarter'));

    expect(stepsOf(score, 0)).toEqual(['C', 'D', 'E', 'F']);
    expect(score.measures.length).toBe(1);
  });

  it('respects the time signature', () => {
    const score = { ...scoreOf(quarters('C', 'D', 'E')), timeSignature: { numerator: 3, denominator: 4 } };

    const result = insertWithReflow(score, 0, 0, createNote('G', 4, 'quarter'));

    expect(stepsOf(result, 0)).toEqual(['G', 'C', 'D']);
    expect(stepsOf(result, 1)).toEqual(['E']);
  });
});

describe('changeTimeSignature', () => {
  it('only swaps the time signature when everything still fits', () => {
    const score = scoreOf(quarters('C', 'D'));

    const result = changeTimeSignature(score, { numerator: 3, denominator: 4 });

    expect(result.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(stepsOf(result, 0)).toEqual(['C', 'D']);
    expect(result.measures.length).toBe(1);
  });

  it('moves the overflow of a shrinking measure into the next one', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    const result = changeTimeSignature(score, { numerator: 3, denominator: 4 });

    expect(stepsOf(result, 0)).toEqual(['C', 'D', 'E']);
    expect(stepsOf(result, 1)).toEqual(['F']);
  });

  it('reflows every measure, not only the first', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'), quarters('C', 'D', 'E', 'F'));

    const result = changeTimeSignature(score, { numerator: 2, denominator: 4 });

    expect(result.measures.map((m) => m.elements.length)).toEqual([2, 2, 2, 2]);
  });

  it('keeps the total number of elements', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'), quarters('G', 'C'));

    const result = changeTimeSignature(score, { numerator: 3, denominator: 8 });

    const total = result.measures.reduce((sum, m) => sum + m.elements.length, 0);
    expect(total).toBe(6);
  });

  it('uses the new denominator for the capacity (6/8 holds six eighths)', () => {
    const eighths = Array.from({ length: 8 }, () => createNote('C', 4, 'eighth'));
    const score = scoreOf(eighths);

    const result = changeTimeSignature(score, { numerator: 6, denominator: 8 });

    expect(result.measures.map((m) => m.elements.length)).toEqual([6, 2]);
  });

  it('does not mutate the input score', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    changeTimeSignature(score, { numerator: 3, denominator: 4 });

    expect(score.timeSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(score.measures.length).toBe(1);
  });
});

describe('insertManyWithReflow', () => {
  it('inserts the elements in order at the given spot', () => {
    const score = scoreOf(quarters('C', 'G'));

    const result = insertManyWithReflow(score, 0, 1, quarters('D', 'E'));

    expect(stepsOf(result, 0)).toEqual(['C', 'D', 'E', 'G']);
  });

  it('keeps the order even when the first inserted element is pushed into the next measure', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'));

    const result = insertManyWithReflow(score, 0, 4, quarters('G', 'C', 'D'));

    expect(stepsOf(result, 0)).toEqual(['C', 'D', 'E', 'F']);
    expect(stepsOf(result, 1)).toEqual(['G', 'C', 'D']);
  });

  it('cascades the displaced elements across measures', () => {
    const score = scoreOf(quarters('C', 'D', 'E', 'F'), quarters('C', 'D', 'E', 'F'));

    const result = insertManyWithReflow(score, 0, 0, quarters('G', 'G'));

    expect(stepsOf(result, 0)).toEqual(['G', 'G', 'C', 'D']);
    expect(stepsOf(result, 1)).toEqual(['E', 'F', 'C', 'D']);
    expect(stepsOf(result, 2)).toEqual(['E', 'F']);
  });

  it('returns the score untouched for an empty list', () => {
    const score = scoreOf(quarters('C'));

    expect(insertManyWithReflow(score, 0, 0, [])).toBe(score);
  });
});
