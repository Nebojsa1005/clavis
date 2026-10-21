import { CLEFS, createEmptyScore, isScore } from './score.model';

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

  it('accepts every supported clef', () => {
    for (const clef of CLEFS) {
      expect(isScore({ ...createEmptyScore(), clef })).toBe(true);
    }
  });

  it('rejects an invalid clef', () => {
    expect(isScore({ ...createEmptyScore(), clef: 'soprano' })).toBe(false);
  });

  it('rejects a missing/malformed timeSignature', () => {
    expect(isScore({ ...createEmptyScore(), timeSignature: { numerator: '4', denominator: 4 } })).toBe(false);
    expect(isScore({ ...createEmptyScore(), timeSignature: undefined })).toBe(false);
  });

  it('accepts major and minor key signatures', () => {
    expect(isScore({ ...createEmptyScore(), keySignature: 'Bb' })).toBe(true);
    expect(isScore({ ...createEmptyScore(), keySignature: 'F#m' })).toBe(true);
  });

  it('rejects an unknown keySignature', () => {
    expect(isScore({ ...createEmptyScore(), keySignature: 'H' })).toBe(false);
  });

  it('rejects a non-string keySignature', () => {
    expect(isScore({ ...createEmptyScore(), keySignature: 0 })).toBe(false);
  });

  it('rejects a non-array measures field', () => {
    expect(isScore({ ...createEmptyScore(), measures: 'C4' })).toBe(false);
  });
});
