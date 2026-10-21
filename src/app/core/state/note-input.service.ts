import { Injectable, inject, signal } from '@angular/core';
import { pitchFromClickY } from '../models/notation.util';
import { Clef, NoteDuration, createNote, createRest } from '../models/score.model';
import { ScoreModelService } from './score-model.service';

/** UI-stanje za "mod unosa nota": da li je aktivan i koje je trenutno trajanje. */
@Injectable({ providedIn: 'root' })
export class NoteInputService {
  private readonly scoreModel = inject(ScoreModelService);

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

  /** y je u SVG px (ista vrednost važi za sve taktove — svi stavovi su u istom redu). */
  enterPitchFromClick(clef: Clef, y: number, topLineY: number, halfStepPx: number): void {
    if (!this.active()) {
      return;
    }
    const pitch = pitchFromClickY(clef, y, topLineY, halfStepPx);
    this.scoreModel.appendElement(createNote(pitch.step, pitch.octave, this.currentDuration()));
  }

  enterRest(): void {
    if (!this.active()) {
      return;
    }
    this.scoreModel.appendElement(createRest(this.currentDuration()));
  }

  nudgeLastPitch(delta: 1 | -1): void {
    if (!this.active()) {
      return;
    }
    this.scoreModel.adjustLastNotePitch(delta);
  }
}
