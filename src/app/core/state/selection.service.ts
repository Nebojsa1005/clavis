import { Injectable, computed, inject, signal } from '@angular/core';
import { ScoreModelService } from './score-model.service';

/**
 * Selected score elements (notes and rests) by id. Supports a single element, a contiguous range
 * (anchor to clicked element, in score order), toggling single elements and whole measures.
 * Ids that are no longer in the score (after undo, delete, ...) silently drop out of the selection.
 */
@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly scoreModel = inject(ScoreModelService);

  private readonly rawIds = signal<ReadonlySet<string>>(new Set());
  private readonly anchorId = signal<string | null>(null);

  /** Every element id of the score, in playing order. */
  private readonly orderedIds = computed(() =>
    this.scoreModel.score().measures.flatMap((measure) => measure.elements.map((element) => element.id)),
  );

  /** Selected ids in score order. */
  readonly selectedIds = computed(() => {
    const raw = this.rawIds();
    return this.orderedIds().filter((id) => raw.has(id));
  });

  /** The selected id when exactly one element is selected, otherwise null. */
  readonly selectedId = computed(() => {
    const ids = this.selectedIds();
    return ids.length === 1 ? ids[0] : null;
  });

  readonly count = computed(() => this.selectedIds().length);

  select(id: string): void {
    this.rawIds.set(new Set([id]));
    this.anchorId.set(id);
  }

  /** Adds the element to the selection, or removes it when it is already selected. */
  toggle(id: string): void {
    const next = new Set(this.rawIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      this.anchorId.set(id);
    }
    this.rawIds.set(next);
  }

  /** Selects everything between the anchor and `id` (inclusive); acts like `select` without an anchor. */
  extendTo(id: string): void {
    const ordered = this.orderedIds();
    const anchorIndex = ordered.indexOf(this.anchorId() ?? '');
    const targetIndex = ordered.indexOf(id);
    if (anchorIndex === -1 || targetIndex === -1) {
      this.select(id);
      return;
    }
    const from = Math.min(anchorIndex, targetIndex);
    const to = Math.max(anchorIndex, targetIndex);
    this.rawIds.set(new Set(ordered.slice(from, to + 1)));
  }

  selectMany(ids: readonly string[]): void {
    this.rawIds.set(new Set(ids));
    this.anchorId.set(ids[0] ?? null);
  }

  /** Selects every element of a measure, or extends the range to the end of that measure. */
  selectMeasure(measureIndex: number, extend = false): void {
    const ids = this.scoreModel.score().measures[measureIndex]?.elements.map((element) => element.id) ?? [];
    if (extend && ids.length > 0) {
      this.extendTo(ids[ids.length - 1]);
    } else {
      this.selectMany(ids);
    }
  }

  selectAll(): void {
    this.selectMany(this.orderedIds());
  }

  clear(): void {
    this.rawIds.set(new Set());
    this.anchorId.set(null);
  }
}
