import { Injectable, computed, inject, signal } from '@angular/core';
import {
  CARET_START,
  CaretPosition,
  endOfScore,
  insertionIndex,
  normalizeCaret,
} from '../models/caret.util';
import { ScoreModelService } from './score-model.service';

/**
 * Pozicija kursora za unos nota. Čuva "željenu" poziciju, a `position` je uvek važeća za trenutnu
 * partituru (npr. posle brisanja ili undo-a kursor se sam prilepi na najbližu granicu).
 */
@Injectable({ providedIn: 'root' })
export class CaretService {
  private readonly scoreModel = inject(ScoreModelService);
  private readonly requested = signal<CaretPosition>(CARET_START);

  readonly position = computed(() => normalizeCaret(this.scoreModel.score(), this.requested()));

  /** Indeks elementa u trenutnom taktu ispred kog se umeće. */
  readonly insertionIndex = computed(() => {
    const { measureIndex, tick } = this.position();
    return insertionIndex(this.scoreModel.score().measures[measureIndex], tick);
  });

  setPosition(position: CaretPosition): void {
    this.requested.set(normalizeCaret(this.scoreModel.score(), position));
  }

  moveToStart(): void {
    this.requested.set(CARET_START);
  }

  moveToEnd(): void {
    this.requested.set(endOfScore(this.scoreModel.score()));
  }
}
