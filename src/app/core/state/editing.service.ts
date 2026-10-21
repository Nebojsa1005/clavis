import { Injectable, inject } from '@angular/core';
import { positionBeforeElement } from '../models/caret.util';
import { CaretService } from './caret.service';
import { ClipboardService } from './clipboard.service';
import { ScoreModelService } from './score-model.service';
import { SelectionService } from './selection.service';

/** Operations on the current selection: delete, copy, cut and paste. */
@Injectable({ providedIn: 'root' })
export class EditingService {
  private readonly scoreModel = inject(ScoreModelService);
  private readonly selection = inject(SelectionService);
  private readonly caret = inject(CaretService);
  private readonly clipboard = inject(ClipboardService);

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
