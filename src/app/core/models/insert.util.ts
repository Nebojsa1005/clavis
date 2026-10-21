import { elementTicks, insertionIndex, measureCapacityTicks, positionAfterElement } from './caret.util';
import { createMeasure, Measure, MeasureElement, Score, TimeSignature } from './score.model';

function totalTicks(elements: MeasureElement[]): number {
  return elements.reduce((sum, element) => sum + elementTicks(element), 0);
}

/** Removes trailing elements until the rest fits in `capacity`; always leaves at least one element. */
function takeOverflow(elements: MeasureElement[], capacity: number): MeasureElement[] {
  const overflow: MeasureElement[] = [];
  let total = totalTicks(elements);
  while (total > capacity && elements.length > 1) {
    const last = elements.pop()!;
    total -= elementTicks(last);
    overflow.unshift(last);
  }
  return overflow;
}

/** Moves overflow forward starting at `startIndex`; stops as soon as a measure needs no change. */
function cascadeOverflow(measures: Measure[], startIndex: number, capacity: number): void {
  for (let i = startIndex; i < measures.length; i++) {
    const overflow = takeOverflow(measures[i].elements, capacity);
    if (overflow.length === 0) {
      break;
    }
    if (i === measures.length - 1) {
      measures.push(createMeasure([]));
    }
    measures[i + 1].elements.unshift(...overflow);
  }
}

/**
 * Inserts `element` before `index` in the given measure. Later elements shift forward, and whatever
 * no longer fits in a measure spills into the start of the next one (a new measure is appended
 * when the last one overflows).
 */
export function insertWithReflow(
  score: Score,
  measureIndex: number,
  index: number,
  element: MeasureElement,
): Score {
  const capacity = measureCapacityTicks(score.timeSignature);
  const measures = score.measures.map((measure) => ({ ...measure, elements: [...measure.elements] }));

  measures[measureIndex].elements.splice(index, 0, element);

  cascadeOverflow(measures, measureIndex, capacity);

  return { ...score, measures };
}

/**
 * Inserts several elements one after the other starting at the given spot, each right behind the
 * previous one even when reflow pushed that one into a later measure.
 */
export function insertManyWithReflow(
  score: Score,
  measureIndex: number,
  index: number,
  elements: readonly MeasureElement[],
): Score {
  let current = score;
  let nextMeasure = measureIndex;
  let nextIndex = index;

  for (const element of elements) {
    current = insertWithReflow(current, nextMeasure, nextIndex, element);
    const after = positionAfterElement(current, element.id);
    if (!after) {
      break;
    }
    nextMeasure = after.measureIndex;
    nextIndex = insertionIndex(current.measures[nextMeasure], after.tick);
  }
  return current;
}

/**
 * Applies a new time signature. Measures that no longer fit push their trailing elements into the
 * following measures; shorter content is left as is. Nothing is ever dropped.
 */
export function changeTimeSignature(score: Score, timeSignature: TimeSignature): Score {
  const capacity = measureCapacityTicks(timeSignature);
  const measures = score.measures.map((measure) => ({ ...measure, elements: [...measure.elements] }));

  // A cascade stops at the first measure that needs no change, so every measure is checked on its own.
  for (let i = 0; i < measures.length; i++) {
    cascadeOverflow(measures, i, capacity);
  }

  return { ...score, timeSignature: { ...timeSignature }, measures };
}
