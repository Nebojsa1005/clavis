import { Injectable, inject, signal } from '@angular/core';
import { pitchFromClickY } from '../models/notation.util';
import { Clef, NoteDuration, createNote, createRest } from '../models/score.model';
import { CaretService } from './caret.service';
import { ScoreModelService } from './score-model.service';

/** UI-stanje za "mod unosa nota": da li je aktivan i koje je trenutno trajanje. */
@Injectable({ providedIn: 'root' })
export class NoteInputService {
  private readonly scoreModel = inject(ScoreModelService);
  private readonly caret = inject(CaretService);

  readonly active = signal(false);
  readonly currentDuration = signal<NoteDuration>('quarter');

  toggle(): void {
    this.active.update((value) => !value);
  }

  setActive(value: boolean): void {
    this.active.set(value);
  }

  setDuration(duration: NoteDuration): void {
    this.currentDuration.set(duration);
  }

  /** Inserts a note at the caret; y is in SVG px (the same for every measure, they share one row). */
  enterPitchFromClick(clef: Clef, y: number, topLineY: number, halfStepPx: number): void {
    if (!this.active()) {
      return;
    }
    const pitch = pitchFromClickY(clef, y, topLineY, halfStepPx);
    this.caret.insertAtCaret(createNote(pitch.step, pitch.octave, this.currentDuration()));
  }

  enterRest(): void {
    if (!this.active()) {
      return;
    }
    this.caret.insertAtCaret(createRest(this.currentDuration()));
  }

  /** Moves the pitch of the note just before the caret by one diatonic step. */
  nudgeLastPitch(delta: 1 | -1): void {
    if (!this.active()) {
      return;
    }
    this.scoreModel.adjustNotePitchBefore(this.caret.position().measureIndex, this.caret.insertionIndex(), delta);
  }
}
