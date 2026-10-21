import { Injectable, computed, signal } from '@angular/core';
import { changeTimeSignature, insertManyWithReflow, insertWithReflow } from '../models/insert.util';
import { findInstrumentPreset } from '../models/instruments';
import {
  createPart,
  documentFromScore,
  findStaff,
  firstStaffId,
  mapStaffScores,
  normalizeDocument,
  ScoreDocument,
  withStaffScore,
} from '../models/score-document';
import { durationToBeats, stepDiatonic } from '../models/notation.util';
import { Clef, createMeasure, createTestScore, MeasureElement, Score, TimeSignature } from '../models/score.model';
import { isKeySignature } from '../models/key-signature.util';
import { setTieFlag, tieNoteBefore } from '../models/tie.util';
import { validateTimeSignature } from '../models/time-signature.util';

const MAX_HISTORY = 20;

/**
 * Source of truth for the piece: the document (instruments with their staves), edits and
 * undo/redo history (20 steps). Editing works on ONE staff at a time, the active staff, which is
 * exposed as `score`; everything that edits a score (caret, insert, ties, selection, ...) goes
 * through it. Time and key signatures are shared by all staves.
 */
@Injectable({ providedIn: 'root' })
export class ScoreModelService {
  private readonly documentState = signal<ScoreDocument>(documentFromScore(createTestScore()));
  private readonly requestedStaffId = signal<string | null>(null);
  private readonly pastStack = signal<ScoreDocument[]>([]);
  private readonly futureStack = signal<ScoreDocument[]>([]);

  readonly document = this.documentState.asReadonly();

  /** The staff being edited. Falls back to the first one when the chosen staff no longer exists. */
  readonly activeStaffId = computed(() => {
    const doc = this.documentState();
    const requested = this.requestedStaffId();
    return requested && findStaff(doc, requested) ? requested : firstStaffId(doc);
  });

  /** The score of the active staff. */
  readonly score = computed(() => findStaff(this.documentState(), this.activeStaffId())!.score);

  readonly canUndo = computed(() => this.pastStack().length > 0);
  readonly canRedo = computed(() => this.futureStack().length > 0);

  /** Loads a single-staff score as the whole piece. Not an edit: clears the history. */
  replaceScore(score: Score): void {
    this.replaceDocument(documentFromScore(score));
  }

  /** Loads a whole piece. Not an edit: clears the history and goes back to the first staff. */
  replaceDocument(doc: ScoreDocument): void {
    this.documentState.set(normalizeDocument(doc));
    this.requestedStaffId.set(null);
    this.pastStack.set([]);
    this.futureStack.set([]);
  }

  /** Chooses which staff the editing commands act on. Not an edit, so it is not undoable. */
  setActiveStaff(staffId: string): void {
    if (findStaff(this.documentState(), staffId)) {
      this.requestedStaffId.set(staffId);
    }
  }

  /**
   * Adds an instrument (all its staves, empty) at the bottom of the score and makes its first staff
   * the active one. Returns the new part's id, or null for an unknown instrument.
   */
  addPart(presetId: string): string | null {
    const preset = findInstrumentPreset(presetId);
    if (!preset) {
      return null;
    }
    const { timeSignature, keySignature } = this.score();
    const part = createPart(
      preset.name,
      preset.clefs.map((clef) => ({ clef, timeSignature: { ...timeSignature }, keySignature, measures: [createMeasure([])] })),
    );
    this.mutateDocument((doc) => ({ ...doc, parts: [...doc.parts, part] }));
    this.requestedStaffId.set(part.staves[0].id);
    return part.id;
  }

  /** Dodaje element na kraj partiture; otvara novi takt kad trenutni ne može da primi element. */
  appendElement(element: MeasureElement): void {
    this.mutate((score) => {
      const measures = score.measures.map((measure) => ({ ...measure, elements: [...measure.elements] }));
      const last = measures[measures.length - 1];
      const usedBeats = last.elements.reduce((sum, el) => sum + durationToBeats(el.duration, score.timeSignature, el.dotted), 0);
      const elementBeats = durationToBeats(element.duration, score.timeSignature, element.dotted);

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
    if (clef === this.score().clef) {
      return;
    }
    this.mutate((score) => ({ ...score, clef }));
  }

  /** Changes the key signature. Returns false (and changes nothing) for an unknown key. */
  setKeySignature(keySignature: string): boolean {
    if (!isKeySignature(keySignature)) {
      return false;
    }
    if (keySignature !== this.score().keySignature) {
      this.mutateDocument((doc) => mapStaffScores(doc, (score) => ({ ...score, keySignature })));
    }
    return true;
  }

  /**
   * Changes the time signature; measures that no longer fit spill into the following ones.
   * Returns false (and changes nothing) for an invalid time signature.
   */
  setTimeSignature(timeSignature: TimeSignature): boolean {
    if (validateTimeSignature(timeSignature.numerator, timeSignature.denominator) !== null) {
      return false;
    }
    const current = this.score().timeSignature;
    if (current.numerator === timeSignature.numerator && current.denominator === timeSignature.denominator) {
      return true;
    }
    this.mutateDocument((doc) => mapStaffScores(doc, (score) => changeTimeSignature(score, timeSignature)));
    return true;
  }

  /**
   * Inserts an element before `index` in a measure; overflow spills into the following measures.
   * With `tiePrevious` the note before it is tied to it when they share a pitch.
   */
  insertElement(measureIndex: number, index: number, element: MeasureElement, tiePrevious = false): void {
    this.mutate((score) => {
      const inserted = insertWithReflow(score, measureIndex, index, element);
      return tiePrevious ? tieNoteBefore(inserted, element.id) : inserted;
    });
  }

  /**
   * Sets or clears the tie from each given note to the element after it, as one undo step. Ties
   * that would not join two same-pitch notes are dropped by the usual sanitising.
   */
  setTies(ids: readonly string[], tied: boolean): void {
    this.mutate((score) => setTieFlag(score, new Set(ids), tied));
  }

  /** Inserts several elements in order as ONE undo step; see `insertManyWithReflow`. */
  insertElements(measureIndex: number, index: number, elements: readonly MeasureElement[]): void {
    if (elements.length === 0) {
      return;
    }
    this.mutate((score) => insertManyWithReflow(score, measureIndex, index, elements));
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

  /** Removes an element (note or rest) by id, wherever it is in the score. */
  deleteElement(id: string): void {
    this.deleteElements([id]);
  }

  /**
   * Removes several elements as ONE undo step. Later elements move up; measures that end up empty
   * at the end of the score are dropped (the first measure always stays). Unknown ids are ignored.
   */
  deleteElements(ids: readonly string[]): void {
    const doomed = new Set(ids);
    const exists = this.score().measures.some((measure) => measure.elements.some((el) => doomed.has(el.id)));
    if (!exists) {
      return;
    }

    this.mutate((score) => {
      const measures = score.measures.map((measure) => ({
        ...measure,
        elements: measure.elements.filter((el) => !doomed.has(el.id)),
      }));
      while (measures.length > 1 && measures[measures.length - 1].elements.length === 0) {
        measures.pop();
      }
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
    this.futureStack.update((future) => [...future, this.documentState()]);
    this.documentState.set(previous);
  }

  redo(): void {
    const future = this.futureStack();
    if (future.length === 0) {
      return;
    }
    const next = future[future.length - 1];
    this.futureStack.set(future.slice(0, -1));
    this.pastStack.update((past) => [...past, this.documentState()]);
    this.documentState.set(next);
  }

  /** An edit of the active staff. */
  private mutate(mutator: (score: Score) => Score): void {
    const staffId = this.activeStaffId();
    this.mutateDocument((doc) => withStaffScore(doc, staffId, mutator(findStaff(doc, staffId)!.score)));
  }

  private mutateDocument(mutator: (doc: ScoreDocument) => ScoreDocument): void {
    const current = this.documentState();
    this.pastStack.update((stack) => {
      const next = [...stack, current];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    this.futureStack.set([]);
    // Every edit passes through here, so ties never outlive their neighbours and all staves keep
    // the same signatures and number of measures.
    this.documentState.set(normalizeDocument(mutator(current)));
  }
}
