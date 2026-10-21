import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { NotationRendererService, SCORE_ELEMENT_ID_ATTR } from '../../core/services/notation-renderer.service';
import { CaretService } from '../../core/state/caret.service';
import { NoteInputService } from '../../core/state/note-input.service';
import { ScoreModelService } from '../../core/state/score-model.service';
import { SelectionService } from '../../core/state/selection.service';

@Component({
  selector: 'app-staff-view',
  templateUrl: './staff-view.html',
  styleUrl: './staff-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StaffView {
  private readonly scoreModel = inject(ScoreModelService);
  private readonly notationRenderer = inject(NotationRendererService);
  private readonly caretService = inject(CaretService);
  protected readonly noteInput = inject(NoteInputService);
  protected readonly selection = inject(SelectionService);

  protected readonly canvasHost = viewChild<ElementRef<HTMLDivElement>>('canvasHost');

  constructor() {
    effect(() => {
      const score = this.scoreModel.score();
      const selectedId = this.selection.selectedId();
      // The caret is only meaningful (and visible) while note input mode is on.
      const caret = this.noteInput.active() ? this.caretService.position() : null;
      const host = this.canvasHost()?.nativeElement;
      if (!host) {
        return;
      }
      this.notationRenderer.render(host, score, selectedId, caret);
    });
  }

  protected onCanvasClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const hit = target?.closest(`[${SCORE_ELEMENT_ID_ATTR}]`);
    if (hit) {
      this.selection.select(hit.getAttribute(SCORE_ELEMENT_ID_ATTR)!);
      return;
    }

    const host = this.canvasHost()?.nativeElement;
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const position = this.notationRenderer.caretFromX(event.clientX - rect.left);
    if (position) {
      this.caretService.setPosition(position);
    }
    const geometry = this.notationRenderer.getStaffGeometry();
    this.noteInput.enterPitchFromClick(this.scoreModel.score().clef, y, geometry.topLineY, geometry.halfStepPx);
  }
}
