/** G clef (treble), F clef (bass) and the two common C clefs (alto = line 3, tenor = line 4). */
import { isKeySignature } from './key-signature.util';

export type Clef = 'treble' | 'bass' | 'alto' | 'tenor';

export const CLEFS: readonly Clef[] = ['treble', 'bass', 'alto', 'tenor'];

export type Step = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export type AccidentalValue = 'sharp' | 'flat' | 'natural' | null;

export type NoteDuration = 'whole' | 'half' | 'quarter' | 'eighth' | 'sixteenth';

export interface NotePitch {
  step: Step;
  octave: number;
  accidental: AccidentalValue;
}

export interface Note {
  readonly id: string;
  kind: 'note';
  pitch: NotePitch;
  duration: NoteDuration;
  tieToNext?: boolean;
}

export interface Rest {
  readonly id: string;
  kind: 'rest';
  duration: NoteDuration;
}

export type MeasureElement = Note | Rest;

export interface Measure {
  readonly id: string;
  elements: MeasureElement[];
}

export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export interface Score {
  clef: Clef;
  timeSignature: TimeSignature;
  keySignature: string;
  measures: Measure[];
}

export function createId(): string {
  return crypto.randomUUID();
}

export function createNote(
  step: Step,
  octave: number,
  duration: NoteDuration,
  accidental: AccidentalValue = null,
): Note {
  return { id: createId(), kind: 'note', pitch: { step, octave, accidental }, duration };
}

export function createRest(duration: NoteDuration): Rest {
  return { id: createId(), kind: 'rest', duration };
}

export function createMeasure(elements: MeasureElement[]): Measure {
  return { id: createId(), elements };
}

export function createEmptyScore(clef: Clef = 'treble'): Score {
  return {
    clef,
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: 'C',
    measures: [createMeasure([])],
  };
}

/** Plitka runtime provera strukture — čuva import od "ovo nije Clavis fajl" grešaka. */
export function isScore(value: unknown): value is Score {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Record<string, unknown>;

  if (!CLEFS.includes(candidate['clef'] as Clef)) {
    return false;
  }
  const timeSignature = candidate['timeSignature'] as Record<string, unknown> | undefined;
  if (!timeSignature || typeof timeSignature['numerator'] !== 'number' || typeof timeSignature['denominator'] !== 'number') {
    return false;
  }
  if (!isKeySignature(candidate['keySignature'])) {
    return false;
  }
  return Array.isArray(candidate['measures']);
}

/** Fiksna test-partitura, koristi se za proveru VexFlow integracije (T2). */
export function createTestScore(): Score {
  return {
    clef: 'treble',
    timeSignature: { numerator: 4, denominator: 4 },
    keySignature: 'C',
    measures: [
      createMeasure([
        createNote('C', 4, 'quarter'),
        createNote('D', 4, 'quarter'),
        createNote('E', 4, 'quarter'),
        createNote('F', 4, 'quarter'),
      ]),
      createMeasure([
        createNote('G', 4, 'half'),
        createRest('quarter'),
        createNote('A', 4, 'quarter', 'sharp'),
      ]),
    ],
  };
}
