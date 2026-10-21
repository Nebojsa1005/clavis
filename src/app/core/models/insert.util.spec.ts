import { insertWithReflow } from './insert.util';
import { createEmptyScore, createMeasure, createNote, createRest, MeasureElement, Score } from './score.model';

function scoreOf(...measures: MeasureElement[][]): Score {
  return { ...createEmptyScore(), measures: measures.map((elements) => createMeasure(elements)) };
}

const quarters = (...steps: ('C' | 'D' | 'E' | 'F' | 'G')[]) => steps.map((step) => createNote(step, 4, 'quarter'));
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
