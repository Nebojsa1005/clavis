import { createEmptyScore, isScore } from './score.model';

describe('isScore', () => {
  it('accepts a well-formed score', () => {
    expect(isScore(createEmptyScore())).toBe(true);
  });

  it('rejects non-objects', () => {
    expect(isScore(null)).toBe(false);
    expect(isScore(undefined)).toBe(false);
    expect(isScore('score')).toBe(false);
    expect(isScore(42)).toBe(false);
  });

  it('rejects an invalid clef', () => {
    expect(isScore({ ...createEmptyScore(), clef: 'alto' })).toBe(false);
  });

  it('rejects a missing/malformed timeSignature', () => {
    expect(isScore({ ...createEmptyScore(), timeSignature: { numerator: '4', denominator: 4 } })).toBe(false);
    expect(isScore({ ...createEmptyScore(), timeSignature: undefined })).toBe(false);
  });

  it('rejects a non-string keySignature', () => {
    expect(isScore({ ...createEmptyScore(), keySignature: 0 })).toBe(false);
  });

  it('rejects a non-array measures field', () => {
    expect(isScore({ ...createEmptyScore(), measures: 'C4' })).toBe(false);
  });
});
