import { Injectable, computed, signal } from '@angular/core';
import { changeTimeSignature, insertWithReflow } from '../models/insert.util';
import { durationToBeats, stepDiatonic } from '../models/notation.util';
import { Clef, createMeasure, createTestScore, MeasureElement, Score, TimeSignature } from '../models/score.model';
import { validateTimeSignature } from '../models/time-signature.util';

const MAX_HISTORY = 20;

/**
 * Izvor istine za partituru. Drži reaktivno stanje, mutacije (unos, brisanje, pomeranje visine
 * tona) i undo/redo istoriju (min. 20 koraka).
 */
@Injectable({ providedIn: 'root' })
export class ScoreModelService {
  private readonly scoreState = signal<Score>(createTestScore());
  private readonly pastStack = signal<Score[]>([]);
  private readonly futureStack = signal<Score[]>([]);

  readonly score = this.scoreState.asReadonly();
  readonly canUndo = computed(() => this.pastStack().length > 0);
  readonly canRedo = computed(() => this.futureStack().length > 0);

  /** Učitavanje potpuno novog dokumenta — nije undo-ovanje, briše istoriju. */
  replaceScore(score: Score): void {
    this.scoreState.set(score);
    this.pastStack.set([]);
    this.futureStack.set([]);
  }

  /** Dodaje element na kraj partiture; otvara novi takt kad trenutni ne može da primi element. */
  appendElement(element: MeasureElement): void {
    this.mutate((score) => {
      const measures = score.measures.map((measure) => ({ ...measure, elements: [...measure.elements] }));
      const last = measures[measures.length - 1];
      const usedBeats = last.elements.reduce((sum, el) => sum + durationToBeats(el.duration, score.timeSignature), 0);
      const elementBeats = durationToBeats(element.duration, score.timeSignature);

      if (usedBeats + elementBeats <= score.timeSignature.numerator + 1e-6) {
        last.elements.push(element);
      } else {
        measures.push(createMeasure([element]));
      }

      return { ...score, measures };
    });
  }

  /** Changes the clef. Notes keep their pitch; only how they are drawn and entered changes. */
  setClef(clef: Clef): void {
    if (clef === this.scoreState().clef) {
      return;
    }
    this.mutate((score) => ({ ...score, clef }));
  }

  /**
   * Changes the time signature; measures that no longer fit spill into the following ones.
   * Returns false (and changes nothing) for an invalid time signature.
   */
  setTimeSignature(timeSignature: TimeSignature): boolean {
    if (validateTimeSignature(timeSignature.numerator, timeSignature.denominator) !== null) {
      return false;
    }
    const current = this.scoreState().timeSignature;
    if (current.numerator === timeSignature.numerator && current.denominator === timeSignature.denominator) {
      return true;
    }
    this.mutate((score) => changeTimeSignature(score, timeSignature));
    return true;
  }

  /** Inserts an element before `index` in a measure; overflow spills into the following measures. */
  insertElement(measureIndex: number, index: number, element: MeasureElement): void {
    this.mutate((score) => insertWithReflow(score, measureIndex, index, element));
  }

  /**
   * Moves the pitch of the nearest note before the given position (skipping rests, crossing
   * barlines) by `delta` diatonic steps. `index` counts the elements before the caret in the measure.
   */
  adjustNotePitchBefore(measureIndex: number, index: number, delta: 1 | -1): void {
    this.mutate((score) => {
      const measures = score.measures.map((measure) => ({ ...measure, elements: [...measure.elements] }));

      for (let mi = measureIndex; mi >= 0; mi--) {
        const elements = measures[mi].elements;
        const start = mi === measureIndex ? index - 1 : elements.length - 1;
        for (let ei = start; ei >= 0; ei--) {
          const el = elements[ei];
          if (el.kind === 'note') {
            const next = stepDiatonic(el.pitch.step, el.pitch.octave, delta);
            elements[ei] = { ...el, pitch: { ...el.pitch, step: next.step, octave: next.octave } };
            return { ...score, measures };
          }
        }
      }

      return score;
    });
  }

  /** Briše element (notu/pauzu) po id-u, gde god u partituri da se nalazi. */
  deleteElement(id: string): void {
    this.mutate((score) => {
      const measures = score.measures.map((measure) => ({
        ...measure,
        elements: measure.elements.filter((el) => el.id !== id),
      }));
      return { ...score, measures };
    });
  }

  undo(): void {
    const past = this.pastStack();
    if (past.length === 0) {
      return;
    }
    const previous = past[past.length - 1];
    this.pastStack.set(past.slice(0, -1));
    this.futureStack.update((future) => [...future, this.scoreState()]);
    this.scoreState.set(previous);
  }

  redo(): void {
    const future = this.futureStack();
    if (future.length === 0) {
      return;
    }
    const next = future[future.length - 1];
    this.futureStack.set(future.slice(0, -1));
    this.pastStack.update((past) => [...past, this.scoreState()]);
    this.scoreState.set(next);
  }

  private mutate(mutator: (score: Score) => Score): void {
    const current = this.scoreState();
    this.pastStack.update((stack) => {
      const next = [...stack, current];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    this.futureStack.set([]);
    this.scoreState.set(mutator(current));
  }
}
