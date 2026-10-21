import { TimeSignature } from './score.model';

export const MAX_NUMERATOR = 32;
export const ALLOWED_DENOMINATORS: readonly number[] = [1, 2, 4, 8, 16, 32];

/** Common time signatures offered as presets in the UI. */
export const PRESET_TIME_SIGNATURES: readonly TimeSignature[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 5, denominator: 4 },
  { numerator: 2, denominator: 2 },
  { numerator: 3, denominator: 8 },
  { numerator: 6, denominator: 8 },
  { numerator: 7, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

export function timeSignatureLabel(timeSignature: TimeSignature): string {
  return `${timeSignature.numerator}/${timeSignature.denominator}`;
}

export function isPresetTimeSignature(timeSignature: TimeSignature): boolean {
  return PRESET_TIME_SIGNATURES.some(
    (preset) => preset.numerator === timeSignature.numerator && preset.denominator === timeSignature.denominator,
  );
}

/** Returns a user-facing error message, or null when the time signature is usable. */
export function validateTimeSignature(numerator: number, denominator: number): string | null {
  if (!Number.isInteger(numerator) || numerator < 1 || numerator > MAX_NUMERATOR) {
    return `Brojilac mora biti ceo broj od 1 do ${MAX_NUMERATOR}.`;
  }
  if (!ALLOWED_DENOMINATORS.includes(denominator)) {
    return `Imenilac mora biti jedan od: ${ALLOWED_DENOMINATORS.join(', ')}.`;
  }
  return null;
}
