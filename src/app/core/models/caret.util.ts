import { Measure, MeasureElement, NoteDuration, Score, TimeSignature } from './score.model';

/** Position resolution inside a measure: 256 ticks per whole note (enough for a dotted 64th). */
export const TICKS_PER_WHOLE = 256;

const DURATION_TICKS: Record<NoteDuration, number> = {
  whole: TICKS_PER_WHOLE,
  half: TICKS_PER_WHOLE / 2,
  quarter: TICKS_PER_WHOLE / 4,
  eighth: TICKS_PER_WHOLE / 8,
  sixteenth: TICKS_PER_WHOLE / 16,
  thirtysecond: TICKS_PER_WHOLE / 32,
  sixtyfourth: TICKS_PER_WHOLE / 64,
};

/** Caret position: measure, voice and tick inside the measure (0 = start of the measure). */
export interface CaretPosition {
  measureIndex: number;
  voice: number;
  tick: number;
}

export const CARET_START: CaretPosition = { measureIndex: 0, voice: 0, tick: 0 };

export function durationToTicks(duration: NoteDuration, dotted = false): number {
  const ticks = DURATION_TICKS[duration];
  return dotted ? ticks * 1.5 : ticks;
}

export function elementTicks(element: MeasureElement): number {
  return durationToTicks(element.duration, element.dotted);
}

export function measureCapacityTicks(timeSignature: TimeSignature): number {
  return (timeSignature.numerator * TICKS_PER_WHOLE) / timeSignature.denominator;
}

/** Ticks where the caret may sit in a measure: the start of every element plus the end of the last. */
export function elementBoundaries(measure: Measure): number[] {
  const boundaries = [0];
  let elapsed = 0;
  for (const element of measure.elements) {
    elapsed += elementTicks(element);
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

/**
 * A full measure that is followed by another one has no stop at its end: that spot is the same
 * musical position as the start of the next measure, so the caret never rests on both.
 */
function endsAtNextMeasure(score: Score, measureIndex: number): boolean {
  const measure = score.measures[measureIndex];
  const isLast = measureIndex >= score.measures.length - 1;
  if (!measure || isLast) {
    return false;
  }
  const total = elementBoundaries(measure).at(-1)!;
  return total >= measureCapacityTicks(score.timeSignature);
}

/**
 * Returns a valid position: measure in range, voice 0 (single voice for now), tick snapped to an
 * element boundary, and the end of a full measure expressed as the start of the next one.
 */
export function normalizeCaret(score: Score, caret: CaretPosition): CaretPosition {
  const lastIndex = Math.max(score.measures.length - 1, 0);
  const measureIndex = Math.min(Math.max(Math.trunc(caret.measureIndex), 0), lastIndex);
  const measure = score.measures[measureIndex];
  const tick = measure ? snapTick(measure, caret.tick) : 0;

  if (measure && tick === elementBoundaries(measure).at(-1) && endsAtNextMeasure(score, measureIndex)) {
    return { measureIndex: measureIndex + 1, voice: 0, tick: 0 };
  }
  return { measureIndex, voice: 0, tick };
}

/** Every position the caret can rest on, in score order. */
export function caretStops(score: Score): CaretPosition[] {
  const stops: CaretPosition[] = [];
  score.measures.forEach((measure, measureIndex) => {
    const ticks = elementBoundaries(measure);
    const usable = endsAtNextMeasure(score, measureIndex) ? ticks.slice(0, -1) : ticks;
    usable.forEach((tick) => stops.push({ measureIndex, voice: 0, tick }));
  });
  return stops;
}

function stopIndex(score: Score, caret: CaretPosition): number {
  const normalized = normalizeCaret(score, caret);
  return caretStops(score).findIndex(
    (stop) => stop.measureIndex === normalized.measureIndex && stop.tick === normalized.tick,
  );
}

/** The stop after `caret`, or `caret` itself (normalized) when it is already the last one. */
export function nextCaret(score: Score, caret: CaretPosition): CaretPosition {
  const stops = caretStops(score);
  const index = stopIndex(score, caret);
  return stops[Math.min(index + 1, stops.length - 1)] ?? normalizeCaret(score, caret);
}

/** The stop before `caret`, or `caret` itself (normalized) when it is already the first one. */
export function previousCaret(score: Score, caret: CaretPosition): CaretPosition {
  const stops = caretStops(score);
  const index = stopIndex(score, caret);
  return stops[Math.max(index - 1, 0)] ?? normalizeCaret(score, caret);
}

/** Position after the last element of the score. */
export function endOfScore(score: Score): CaretPosition {
  const measureIndex = Math.max(score.measures.length - 1, 0);
  const measure = score.measures[measureIndex];
  const tick = measure ? elementBoundaries(measure).at(-1)! : 0;
  return { measureIndex, voice: 0, tick };
}

/** Caret position right after the element with the given id, or null if it is not in the score. */
export function positionAfterElement(score: Score, elementId: string): CaretPosition | null {
  for (let measureIndex = 0; measureIndex < score.measures.length; measureIndex++) {
    const elements = score.measures[measureIndex].elements;
    const index = elements.findIndex((element) => element.id === elementId);
    if (index !== -1) {
      const tick = elementBoundaries(score.measures[measureIndex])[index + 1];
      return normalizeCaret(score, { measureIndex, voice: 0, tick });
    }
  }
  return null;
}

/** Caret position right before the element with the given id, or null if it is not in the score. */
export function positionBeforeElement(score: Score, elementId: string): CaretPosition | null {
  for (let measureIndex = 0; measureIndex < score.measures.length; measureIndex++) {
    const index = score.measures[measureIndex].elements.findIndex((element) => element.id === elementId);
    if (index !== -1) {
      const tick = elementBoundaries(score.measures[measureIndex])[index];
      return normalizeCaret(score, { measureIndex, voice: 0, tick });
    }
  }
  return null;
}

/** Index in `measure.elements` that a new element would be inserted before (== number of elements before the caret). */
export function insertionIndex(measure: Measure, tick: number): number {
  return elementBoundaries(measure).indexOf(snapTick(measure, tick));
}
