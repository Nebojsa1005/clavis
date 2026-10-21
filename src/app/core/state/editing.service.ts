import { Injectable, inject } from '@angular/core';
import { positionBeforeElement } from '../models/caret.util';
import { canTie } from '../models/tie.util';
import { MeasureElement, Note } from '../models/score.model';
import { CaretService } from './caret.service';
import { ClipboardService } from './clipboard.service';
import { NoteInputService } from './note-input.service';
import { ScoreModelService } from './score-model.service';
import { SelectionService } from './selection.service';

/** Operations on the current selection: delete, copy, cut and paste. */
@Injectable({ providedIn: 'root' })
export class EditingService {
  private readonly scoreModel = inject(ScoreModelService);
  private readonly selection = inject(SelectionService);
  private readonly caret = inject(CaretService);
  private readonly clipboard = inject(ClipboardService);
  private readonly noteInput = inject(NoteInputService);

  /** Deletes the selected elements (one undo step) and leaves the caret where the first one was. */
  deleteSelection(): void {
    const ids = this.selection.selectedIds();
    if (ids.length === 0) {
      return;
    }
    const start = positionBeforeElement(this.scoreModel.score(), ids[0]);

    this.scoreModel.deleteElements(ids);
    this.selection.clear();
    if (start) {
      this.caret.setPosition(start);
    }
  }

  /**
   * Toggles ties (T). With a selection: one note ties to the note after it; several notes tie to
   * each other, so selecting a run of same-pitch notes chains them into one long sound. Pairs that
   * cannot be tied (different pitch, rests) are skipped. With no selection in note input mode it
   * arms a tie for the next entered note instead.
   */
  toggleTie(): void {
    const selected = this.selection.selectedElements();
    if (selected.length === 0) {
      if (this.noteInput.active()) {
        this.noteInput.toggleTieArmed();
      }
      return;
    }

    const score = this.scoreModel.score();
    const flat: MeasureElement[] = score.measures.flatMap((measure) => measure.elements);
    const selectedIds = new Set(selected.map((element) => element.id));

    const candidates = selected.filter((element): element is Note => {
      if (element.kind !== 'note') {
        return false;
      }
      const next = flat[flat.findIndex((other) => other.id === element.id) + 1];
      if (selected.length >= 2 && !(next && selectedIds.has(next.id))) {
        return false;
      }
      return canTie(element, next, score.keySignature);
    });
    if (candidates.length === 0) {
      return;
    }

    const allTied = candidates.every((note) => note.tieToNext);
    this.scoreModel.setTies(
      candidates.map((note) => note.id),
      !allTied,
    );
  }

  /** Returns false when nothing is selected. */
  copySelection(): boolean {
    const elements = this.selection.selectedElements();
    if (elements.length === 0) {
      return false;
    }
    this.clipboard.copy(elements);
    return true;
  }

  cutSelection(): void {
    if (this.copySelection()) {
      this.deleteSelection();
    }
  }

  /**
   * Inserts the clipboard content (one undo step). It goes in front of the selection when there is
   * one, otherwise at the caret; the pasted elements become the new selection.
   */
  paste(): void {
    const pasted = this.clipboard.paste();
    if (pasted.length === 0) {
      return;
    }

    const firstSelected = this.selection.selectedIds()[0];
    const target = firstSelected ? positionBeforeElement(this.scoreModel.score(), firstSelected) : null;
    if (target) {
      this.caret.setPosition(target);
    }

    this.caret.insertManyAtCaret(pasted);
    this.selection.selectMany(pasted.map((element) => element.id));
  }
}
