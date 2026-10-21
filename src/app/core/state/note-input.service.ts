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
  readonly dotted = signal(false);
  /** When on, the next note entered is tied to the note before it (if both are the same pitch). */
  readonly tieArmed = signal(false);

  toggle(): void {
    this.setActive(!this.active());
  }

  setActive(value: boolean): void {
    this.active.set(value);
    if (!value) {
      this.tieArmed.set(false);
    }
  }

  toggleTieArmed(): void {
    this.tieArmed.update((value) => !value);
  }

  setDuration(duration: NoteDuration): void {
    this.currentDuration.set(duration);
  }

  toggleDotted(): void {
    this.dotted.update((value) => !value);
  }

  /** Inserts a note at the caret; y is in SVG px (the same for every measure, they share one row). */
  enterPitchFromClick(clef: Clef, y: number, topLineY: number, halfStepPx: number): void {
    if (!this.active()) {
      return;
    }
    const pitch = pitchFromClickY(clef, y, topLineY, halfStepPx);
    const tiePrevious = this.tieArmed();
    this.tieArmed.set(false);
    this.caret.insertAtCaret(
      createNote(pitch.step, pitch.octave, this.currentDuration(), null, this.dotted()),
      tiePrevious,
    );
  }

  enterRest(): void {
    if (!this.active()) {
      return;
    }
    this.tieArmed.set(false);
    this.caret.insertAtCaret(createRest(this.currentDuration(), this.dotted()));
  }

  /** Moves the pitch of the note just before the caret by one diatonic step. */
  nudgeLastPitch(delta: 1 | -1): void {
    if (!this.active()) {
      return;
    }
    this.scoreModel.adjustNotePitchBefore(this.caret.position().measureIndex, this.caret.insertionIndex(), delta);
  }
}
