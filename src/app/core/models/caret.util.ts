import { Measure, NoteDuration, Score, TimeSignature } from './score.model';

/** Rezolucija pozicije u taktu: 256 tikova po celoj noti (dovoljno za 64-inku i tačkicu). */
export const TICKS_PER_WHOLE = 256;

const DURATION_TICKS: Record<NoteDuration, number> = {
  whole: TICKS_PER_WHOLE,
  half: TICKS_PER_WHOLE / 2,
  quarter: TICKS_PER_WHOLE / 4,
  eighth: TICKS_PER_WHOLE / 8,
  sixteenth: TICKS_PER_WHOLE / 16,
};

/** Pozicija kursora: takt, glas i tik unutar takta (0 = početak takta). */
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

/** Tikovi na kojima kursor može da stoji u taktu: početak svakog elementa + kraj poslednjeg. */
export function elementBoundaries(measure: Measure): number[] {
  const boundaries = [0];
  let elapsed = 0;
  for (const element of measure.elements) {
    elapsed += durationToTicks(element.duration);
    boundaries.push(elapsed);
  }
  return boundaries;
}

/** Najbliža dozvoljena granica; kod izjednačenja pobeđuje ranija. */
export function snapTick(measure: Measure, tick: number): number {
  const boundaries = elementBoundaries(measure);
  return boundaries.reduce((best, boundary) =>
    Math.abs(boundary - tick) < Math.abs(best - tick) ? boundary : best,
  );
}

/** Vraća važeću poziciju: takt u opsegu, glas 0 (za sada jedan glas), tik prilepljen na granicu elementa. */
export function normalizeCaret(score: Score, caret: CaretPosition): CaretPosition {
  const lastIndex = Math.max(score.measures.length - 1, 0);
  const measureIndex = Math.min(Math.max(Math.trunc(caret.measureIndex), 0), lastIndex);
  const measure = score.measures[measureIndex];
  return { measureIndex, voice: 0, tick: measure ? snapTick(measure, caret.tick) : 0 };
}

/** Pozicija iza poslednjeg elementa partiture. */
export function endOfScore(score: Score): CaretPosition {
  const measureIndex = Math.max(score.measures.length - 1, 0);
  const measure = score.measures[measureIndex];
  const tick = measure ? elementBoundaries(measure).at(-1)! : 0;
  return { measureIndex, voice: 0, tick };
}

/** Indeks u `measure.elements` ispred kog bi se umetnuo novi element (== broj elemenata pre kursora). */
export function insertionIndex(measure: Measure, tick: number): number {
  return elementBoundaries(measure).indexOf(snapTick(measure, tick));
}
