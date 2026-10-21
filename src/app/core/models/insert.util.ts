import { durationToTicks, measureCapacityTicks } from './caret.util';
import { createMeasure, MeasureElement, Score } from './score.model';

function totalTicks(elements: MeasureElement[]): number {
  return elements.reduce((sum, element) => sum + durationToTicks(element.duration), 0);
}

/** Removes trailing elements until the rest fits in `capacity`; always leaves at least one element. */
function takeOverflow(elements: MeasureElement[], capacity: number): MeasureElement[] {
  const overflow: MeasureElement[] = [];
  let total = totalTicks(elements);
  while (total > capacity && elements.length > 1) {
    const last = elements.pop()!;
    total -= durationToTicks(last.duration);
    overflow.unshift(last);
  }
  return overflow;
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

  for (let i = measureIndex; i < measures.length; i++) {
    const overflow = takeOverflow(measures[i].elements, capacity);
    if (overflow.length === 0) {
      break;
    }
    if (i === measures.length - 1) {
      measures.push(createMeasure([]));
    }
    measures[i + 1].elements.unshift(...overflow);
  }

  return { ...score, measures };
}
