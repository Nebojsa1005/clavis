import { durationToTicks, TICKS_PER_WHOLE } from './caret.util';
import { effectiveAccidental } from './key-signature.util';
import { Clef, NoteDuration, NotePitch, Score, Step, TimeSignature } from './score.model';

const DIATONIC_ORDER: Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Pomera prirodnu (bez predznaka) notu `delta` dijatonskih koraka gore/dole. */
export function stepDiatonic(step: Step, octave: number, delta: number): { step: Step; octave: number } {
  let index = DIATONIC_ORDER.indexOf(step) + delta;
  let nextOctave = octave;
  while (index < 0) {
    index += 7;
    nextOctave -= 1;
  }
  while (index >= 7) {
    index -= 7;
    nextOctave += 1;
  }
  return { step: DIATONIC_ORDER[index], octave: nextOctave };
}

/** Length in beats, where a beat is the note value given by the time signature's denominator. */
export function durationToBeats(duration: NoteDuration, timeSignature: TimeSignature, dotted = false): number {
  return (durationToTicks(duration, dotted) / TICKS_PER_WHOLE) * timeSignature.denominator;
}

const TOP_LINE_PITCH: Record<Clef, { step: Step; octave: number }> = {
  treble: { step: 'F', octave: 5 },
  bass: { step: 'A', octave: 3 },
  alto: { step: 'G', octave: 4 },
  tenor: { step: 'E', octave: 4 },
};

/**
 * Mapira y koordinatu klika (SVG px, ista za sve taktove jer su na istom redu)
 * na najbližu dijatonsku liniju/prostor za dati ključ.
 */
export function pitchFromClickY(
  clef: Clef,
  y: number,
  topLineY: number,
  halfStepPx: number,
): { step: Step; octave: number } {
  const stepsBelowTop = Math.round((y - topLineY) / halfStepPx);
  const ref = TOP_LINE_PITCH[clef];
  return stepDiatonic(ref.step, ref.octave, -stepsBelowTop);
}

const ACCIDENTAL_SUFFIX: Record<'sharp' | 'flat' | 'natural', string> = {
  sharp: '#',
  flat: 'b',
  natural: '',
};

/** Tone.js note name (e.g. "C#4"); a note without its own accidental follows the key signature. */
export function toToneNoteName(pitch: NotePitch, keySignature = 'C'): string {
  const accidental = effectiveAccidental(pitch.accidental, keySignature, pitch.step);
  const suffix = accidental ? ACCIDENTAL_SUFFIX[accidental] : '';
  return `${pitch.step}${suffix}${pitch.octave}`;
}

export interface ScheduledNote {
  offsetSeconds: number;
  durationSeconds: number;
  noteName: string;
}

export interface PlaybackSchedule {
  notes: ScheduledNote[];
  totalSeconds: number;
}

/**
 * Pretvara interni Score model u listu nota za zakazivanje na audio engine-u (vremenski niz,
 * BPM = otkucaji u minuti gde je otkucaj nota jednaka imeniocu takta — za 4/4 i 3/4 to je četvrtina).
 * Čista funkcija, nezavisna od Tone.js — lako testabilna.
 */
export function buildPlaybackSchedule(score: Score, bpm: number): PlaybackSchedule {
  const beatSeconds = 60 / bpm;
  let elapsed = 0;
  const notes: ScheduledNote[] = [];

  for (const measure of score.measures) {
    for (const element of measure.elements) {
      const durationSeconds = durationToBeats(element.duration, score.timeSignature, element.dotted) * beatSeconds;
      if (element.kind === 'note') {
        notes.push({ offsetSeconds: elapsed, durationSeconds, noteName: toToneNoteName(element.pitch, score.keySignature) });
      }
      elapsed += durationSeconds;
    }
  }

  return { notes, totalSeconds: elapsed };
}
