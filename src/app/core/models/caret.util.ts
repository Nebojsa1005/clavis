import { Measure, NoteDuration, Score, TimeSignature } from './score.model';

/** Position resolution inside a measure: 256 ticks per whole note (enough for a dotted 64th). */
export const TICKS_PER_WHOLE = 256;

const DURATION_TICKS: Record<NoteDuration, number> = {
  whole: TICKS_PER_WHOLE,
  half: TICKS_PER_WHOLE / 2,
  quarter: TICKS_PER_WHOLE / 4,
  eighth: TICKS_PER_WHOLE / 8,
  sixteenth: TICKS_PER_WHOLE / 16,
};

/** Caret position: measure, voice and tick inside the measure (0 = start of the measure). */
export interface CaretPosition {
  measureIndex: number;
  voice: number;
  tick: number;
}

export const CARET_START: CaretPosition = { measureIndex: 0, voice: 0, tick: 0 };

export function durationToTicks(duration: NoteDuration): number {
  return DURATION_TICKS[duration];
}

export function measureCapacityTicks(timeSignature: TimeSignature): number {
  return (timeSignature.numerator * TICKS_PER_WHOLE) / timeSignature.denominator;
}

/** Ticks where the caret may sit in a measure: the start of every element plus the end of the last. */
export function elementBoundaries(measure: Measure): number[] {
  const boundaries = [0];
  let elapsed = 0;
  for (const element of measure.elements) {
    elapsed += durationToTicks(element.duration);
    boundaries.push(elapsed);
  }
  return boundaries;
}

/** Nearest allowed boundary; the earlier one wins on a tie. */
export function snapTick(measure: Measure, tick: number): number {
  const boundaries = elementBoundaries(measure);
  return boundaries.reduce((best, boundary) =>
    Math.abs(boundary - tick) < Math.abs(best - tick) ? boundary : best,
  );
}

/** Returns a valid position: measure in range, voice 0 (single voice for now), tick snapped to an element boundary. */
export function normalizeCaret(score: Score, caret: CaretPosition): CaretPosition {
  const lastIndex = Math.max(score.measures.length - 1, 0);
  const measureIndex = Math.min(Math.max(Math.trunc(caret.measureIndex), 0), lastIndex);
  const measure = score.measures[measureIndex];
  return { measureIndex, voice: 0, tick: measure ? snapTick(measure, caret.tick) : 0 };
}

/** Position after the last element of the score. */
export function endOfScore(score: Score): CaretPosition {
  const measureIndex = Math.max(score.measures.length - 1, 0);
  const measure = score.measures[measureIndex];
  const tick = measure ? elementBoundaries(measure).at(-1)! : 0;
  return { measureIndex, voice: 0, tick };
}

/** Index in `measure.elements` that a new element would be inserted before (== number of elements before the caret). */
export function insertionIndex(measure: Measure, tick: number): number {
  return elementBoundaries(measure).indexOf(snapTick(measure, tick));
}
