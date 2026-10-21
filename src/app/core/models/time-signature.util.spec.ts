import {
  isPresetTimeSignature,
  PRESET_TIME_SIGNATURES,
  timeSignatureLabel,
  validateTimeSignature,
} from './time-signature.util';

describe('validateTimeSignature', () => {
  it('accepts every preset', () => {
    for (const preset of PRESET_TIME_SIGNATURES) {
      expect(validateTimeSignature(preset.numerator, preset.denominator)).toBeNull();
    }
  });

  it('accepts custom values within the limits', () => {
    expect(validateTimeSignature(11, 16)).toBeNull();
    expect(validateTimeSignature(1, 1)).toBeNull();
    expect(validateTimeSignature(32, 32)).toBeNull();
  });

  it('rejects a numerator that is not a whole number in range', () => {
    expect(validateTimeSignature(0, 4)).not.toBeNull();
    expect(validateTimeSignature(-3, 4)).not.toBeNull();
    expect(validateTimeSignature(33, 4)).not.toBeNull();
    expect(validateTimeSignature(2.5, 4)).not.toBeNull();
    expect(validateTimeSignature(NaN, 4)).not.toBeNull();
  });

  it('rejects a denominator that is not a power of two note value', () => {
    expect(validateTimeSignature(4, 3)).not.toBeNull();
    expect(validateTimeSignature(4, 0)).not.toBeNull();
    expect(validateTimeSignature(4, 64)).not.toBeNull();
  });
});

describe('time signature helpers', () => {
  it('formats a label', () => {
    expect(timeSignatureLabel({ numerator: 6, denominator: 8 })).toBe('6/8');
  });

  it('recognises presets', () => {
    expect(isPresetTimeSignature({ numerator: 3, denominator: 4 })).toBeTrue();
    expect(isPresetTimeSignature({ numerator: 11, denominator: 16 })).toBeFalse();
  });
});
