import { durationToTicks, TICKS_PER_WHOLE } from './caret.util';
import { effectiveAccidental } from './key-signature.util';
import { Clef, NoteDuration, NotePitch, Score, Step, TimeSignature } from './score.model';
import { allStaves, asDocument, ScoreDocument } from './score-document';
import { tieLinks, tiedTargetIds } from './tie.util';

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
  /** Start and length in beats, where a beat is the note value of the time signature's denominator. */
  offsetBeats: number;
  durationBeats: number;
  offsetSeconds: number;
  durationSeconds: number;
  noteName: string;
}

export interface PlaybackSchedule {
  notes: ScheduledNote[];
  totalBeats: number;
  totalSeconds: number;
}

/**
 * Turns one staff into the list of notes to schedule on the audio engine. Times are given in beats
 * (tempo independent) and in seconds at the given BPM. BPM counts beats per minute, where a beat is
 * the note value of the time signature's denominator: a quarter in 4/4 and 3/4, an eighth in 6/8.
 * A pure function, independent of Tone.js, so it is easy to test.
 */
export function buildPlaybackSchedule(score: Score, bpm: number): PlaybackSchedule {
  const beatSeconds = 60 / bpm;
  let elapsedBeats = 0;
  const notes: ScheduledNote[] = [];
  const continuesPreviousNote = tiedTargetIds(tieLinks(score));
  let sustained: ScheduledNote | null = null;

  for (const measure of score.measures) {
    for (const element of measure.elements) {
      const durationBeats = durationToBeats(element.duration, score.timeSignature, element.dotted);
      if (element.kind === 'note') {
        if (sustained && continuesPreviousNote.has(element.id)) {
          // A tied note is not struck again: it only lengthens the note it is tied to.
          sustained.durationBeats += durationBeats;
          sustained.durationSeconds = sustained.durationBeats * beatSeconds;
        } else {
          sustained = {
            offsetBeats: elapsedBeats,
            durationBeats,
            offsetSeconds: elapsedBeats * beatSeconds,
            durationSeconds: durationBeats * beatSeconds,
            noteName: toToneNoteName(element.pitch, score.keySignature),
          };
          notes.push(sustained);
        }
      } else {
        sustained = null;
      }
      elapsedBeats += durationBeats;
    }
  }

  return { notes, totalBeats: elapsedBeats, totalSeconds: elapsedBeats * beatSeconds };
}

/** The notes of every staff of a document on one timeline; staves play simultaneously. */
export function buildDocumentSchedule(input: Score | ScoreDocument, bpm: number): PlaybackSchedule {
  const schedules = allStaves(asDocument(input)).map((ref) => buildPlaybackSchedule(ref.staff.score, bpm));
  return {
    notes: schedules.flatMap((schedule) => schedule.notes).sort((a, b) => a.offsetBeats - b.offsetBeats),
    totalBeats: Math.max(...schedules.map((schedule) => schedule.totalBeats)),
    totalSeconds: Math.max(...schedules.map((schedule) => schedule.totalSeconds)),
  };
}
