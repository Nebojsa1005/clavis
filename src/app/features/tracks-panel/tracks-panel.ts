import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { INSTRUMENT_PRESETS } from '../../core/models/instruments';
import { Clef } from '../../core/models/score.model';
import { Part } from '../../core/models/score-document';
import { ScoreModelService } from '../../core/state/score-model.service';

const CLEF_NAMES: Record<Clef, string> = {
  treble: 'violinski ključ',
  bass: 'bas ključ',
  alto: 'alt ključ',
  tenor: 'tenor ključ',
};

/**
 * Side panel for the instruments of the score: pick the staff to edit, add an instrument from the
 * presets, rename, reorder and remove instruments.
 */
@Component({
  selector: 'app-tracks-panel',
  templateUrl: './tracks-panel.html',
  styleUrl: './tracks-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TracksPanel {
  protected readonly scoreModel = inject(ScoreModelService);
  protected readonly presets = INSTRUMENT_PRESETS;

  /** The instrument whose name is being edited, if any. */
  protected readonly editingPartId = signal<string | null>(null);
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    effect(() => {
      const input = this.renameInput()?.nativeElement;
      if (input) {
        input.focus();
        input.select();
      }
    });
  }

  protected staffLabel(part: Part, staffIndex: number): string {
    const clef = CLEF_NAMES[part.staves[staffIndex].score.clef];
    return part.staves.length > 1 ? `${staffIndex + 1}. štap, ${clef}` : clef;
  }

  protected onAdd(presetId: string): void {
    this.scoreModel.addPart(presetId);
  }

  protected onRemove(part: Part): void {
    this.scoreModel.removePart(part.id);
  }

  protected onMove(part: Part, direction: -1 | 1): void {
    this.scoreModel.movePart(part.id, direction);
  }

  protected startRename(part: Part): void {
    this.editingPartId.set(part.id);
  }

  protected commitRename(part: Part, name: string): void {
    // Escape cancels first, and the input then loses focus: that blur must not save anything.
    if (this.editingPartId() !== part.id) {
      return;
    }
    this.editingPartId.set(null);
    this.scoreModel.renamePart(part.id, name);
  }

  protected cancelRename(): void {
    this.editingPartId.set(null);
  }
}
