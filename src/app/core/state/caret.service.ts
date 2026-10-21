import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CARET_START,
  CaretPosition,
  endOfScore,
  insertionIndex,
  nextCaret,
  normalizeCaret,
  previousCaret,
} from '../models/caret.util';
import { ScoreModelService } from './score-model.service';

/**
 * Caret position for note entry. Stores the requested position, while `position` is always valid
 * for the current score (e.g. after a delete or undo the caret snaps to the nearest boundary).
 */
@Injectable({ providedIn: 'root' })
export class CaretService {
  private readonly scoreModel = inject(ScoreModelService);
  private readonly requested = signal<CaretPosition>(CARET_START);

  readonly position = computed(() => normalizeCaret(this.scoreModel.score(), this.requested()));

  /** Index in the current measure of the element a new one would be inserted before. */
  readonly insertionIndex = computed(() => {
    const { measureIndex, tick } = this.position();
    return insertionIndex(this.scoreModel.score().measures[measureIndex], tick);
  });

  setPosition(position: CaretPosition): void {
    this.requested.set(normalizeCaret(this.scoreModel.score(), position));
  }

  moveLeft(): void {
    this.requested.set(previousCaret(this.scoreModel.score(), this.position()));
  }

  moveRight(): void {
    this.requested.set(nextCaret(this.scoreModel.score(), this.position()));
  }

  moveToStart(): void {
    this.requested.set(CARET_START);
  }

  moveToEnd(): void {
    this.requested.set(endOfScore(this.scoreModel.score()));
  }
}
