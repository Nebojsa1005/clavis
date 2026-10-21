import {
  effectiveAccidental,
  findKeySignature,
  isKeySignature,
  KEY_SIGNATURE_OPTIONS,
  keyAccidentalForStep,
} from './key-signature.util';

describe('key signature options', () => {
  it('offers 15 major and 15 minor keys with unique values', () => {
    expect(KEY_SIGNATURE_OPTIONS.length).toBe(30);
    expect(new Set(KEY_SIGNATURE_OPTIONS.map((o) => o.value)).size).toBe(30);
  });

  it('labels keys with their accidentals', () => {
    expect(findKeySignature('C')!.label).toBe('C dur (bez predznaka)');
    expect(findKeySignature('G')!.label).toBe('G dur (1♯)');
    expect(findKeySignature('Bb')!.label).toBe('B♭ dur (2♭)');
    expect(findKeySignature('F#m')!.label).toBe('f♯ mol (3♯)');
  });

  it('knows the circle of fifths position of each key', () => {
    expect(findKeySignature('D')!.fifths).toBe(2);
    expect(findKeySignature('Eb')!.fifths).toBe(-3);
    expect(findKeySignature('Am')!.fifths).toBe(0);
    expect(findKeySignature('Cm')!.fifths).toBe(-3);
  });

  it('validates key values', () => {
    expect(isKeySignature('Ab')).toBeTrue();
    expect(isKeySignature('H')).toBeFalse();
    expect(isKeySignature(3)).toBeFalse();
    expect(isKeySignature(undefined)).toBeFalse();
  });
});

describe('keyAccidentalForStep', () => {
  it('sharpens F, C, G in A major but nothing else', () => {
    expect(keyAccidentalForStep('A', 'F')).toBe('sharp');
    expect(keyAccidentalForStep('A', 'C')).toBe('sharp');
    expect(keyAccidentalForStep('A', 'G')).toBe('sharp');
    expect(keyAccidentalForStep('A', 'D')).toBeNull();
  });

  it('flattens B, E and A in Eb major', () => {
    expect(keyAccidentalForStep('Eb', 'B')).toBe('flat');
    expect(keyAccidentalForStep('Eb', 'E')).toBe('flat');
    expect(keyAccidentalForStep('Eb', 'A')).toBe('flat');
    expect(keyAccidentalForStep('Eb', 'D')).toBeNull();
  });

  it('has no accidentals in C major or A minor', () => {
    for (const step of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const) {
      expect(keyAccidentalForStep('C', step)).toBeNull();
      expect(keyAccidentalForStep('Am', step)).toBeNull();
    }
  });

  it('sharpens every step in C# major', () => {
    for (const step of ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const) {
      expect(keyAccidentalForStep('C#', step)).toBe('sharp');
    }
  });
});

describe('effectiveAccidental', () => {
  it('follows the key when the note has no accidental of its own', () => {
    expect(effectiveAccidental(null, 'G', 'F')).toBe('sharp');
  });

  it('lets an explicit accidental win over the key', () => {
    expect(effectiveAccidental('flat', 'G', 'F')).toBe('flat');
    expect(effectiveAccidental('sharp', 'C', 'F')).toBe('sharp');
  });

  it('lets a natural cancel the key accidental', () => {
    expect(effectiveAccidental('natural', 'G', 'F')).toBeNull();
  });
});
