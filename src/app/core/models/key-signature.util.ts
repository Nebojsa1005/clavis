import type { AccidentalValue, Step } from './score.model';

export type KeyMode = 'major' | 'minor';

export interface KeySignatureOption {
  /** VexFlow / score key spec, e.g. "G", "Bb", "F#m". */
  value: string;
  label: string;
  /** Position on the circle of fifths: sharps are positive, flats negative. */
  fifths: number;
  mode: KeyMode;
}

const SHARP_ORDER: readonly Step[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: readonly Step[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

const MAJOR_KEYS: ReadonlyArray<[string, number]> = [
  ['Cb', -7], ['Gb', -6], ['Db', -5], ['Ab', -4], ['Eb', -3], ['Bb', -2], ['F', -1], ['C', 0],
  ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F#', 6], ['C#', 7],
];

const MINOR_KEYS: ReadonlyArray<[string, number]> = [
  ['Abm', -7], ['Ebm', -6], ['Bbm', -5], ['Fm', -4], ['Cm', -3], ['Gm', -2], ['Dm', -1], ['Am', 0],
  ['Em', 1], ['Bm', 2], ['F#m', 3], ['C#m', 4], ['G#m', 5], ['D#m', 6], ['A#m', 7],
];

function describeAccidentals(fifths: number): string {
  if (fifths === 0) {
    return 'bez predznaka';
  }
  return fifths > 0 ? `${fifths}♯` : `${-fifths}♭`;
}

function prettyRoot(root: string): string {
  return root.replace('#', '♯').replace(/(?<=.)b/, '♭');
}

function toOption([value, fifths]: [string, number], mode: KeyMode): KeySignatureOption {
  const root = mode === 'minor' ? value.slice(0, -1) : value;
  const name = mode === 'minor' ? `${prettyRoot(root).toLowerCase()} mol` : `${prettyRoot(root)} dur`;
  return { value, label: `${name} (${describeAccidentals(fifths)})`, fifths, mode };
}

export const MAJOR_KEY_OPTIONS: readonly KeySignatureOption[] = MAJOR_KEYS.map((key) => toOption(key, 'major'));
export const MINOR_KEY_OPTIONS: readonly KeySignatureOption[] = MINOR_KEYS.map((key) => toOption(key, 'minor'));
export const KEY_SIGNATURE_OPTIONS: readonly KeySignatureOption[] = [...MAJOR_KEY_OPTIONS, ...MINOR_KEY_OPTIONS];

export function findKeySignature(value: string): KeySignatureOption | undefined {
  return KEY_SIGNATURE_OPTIONS.find((option) => option.value === value);
}

export function isKeySignature(value: unknown): value is string {
  return typeof value === 'string' && findKeySignature(value) !== undefined;
}

/** The accidental the key signature puts on a given step, or null when the step is natural in that key. */
export function keyAccidentalForStep(keySignature: string, step: Step): 'sharp' | 'flat' | null {
  const fifths = findKeySignature(keySignature)?.fifths ?? 0;
  if (fifths > 0 && SHARP_ORDER.slice(0, fifths).includes(step)) {
    return 'sharp';
  }
  if (fifths < 0 && FLAT_ORDER.slice(0, -fifths).includes(step)) {
    return 'flat';
  }
  return null;
}

/**
 * The accidental that actually sounds. A note without its own accidental follows the key
 * signature; an explicit natural cancels it.
 */
export function effectiveAccidental(
  accidental: AccidentalValue,
  keySignature: string,
  step: Step,
): 'sharp' | 'flat' | null {
  if (accidental === 'natural') {
    return null;
  }
  return accidental ?? keyAccidentalForStep(keySignature, step);
}
