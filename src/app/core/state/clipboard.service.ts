import { Injectable, computed, signal } from '@angular/core';
import { cloneElement, MeasureElement } from '../models/score.model';

/** In-app clipboard for notes and rests. Holds copies, so later edits never change what was copied. */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly items = signal<readonly MeasureElement[]>([]);

  readonly hasContent = computed(() => this.items().length > 0);

  copy(elements: readonly MeasureElement[]): void {
    this.items.set(elements.map(cloneElement));
  }

  /** Fresh copies (new ids) of the clipboard content, so one copy can be pasted any number of times. */
  paste(): MeasureElement[] {
    return this.items().map(cloneElement);
  }
}
