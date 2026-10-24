import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  NotationRendererService,
  SCORE_ELEMENT_ID_ATTR,
  SCORE_STAFF_ID_ATTR,
  STAFF_TEXT_HEIGHT,
  StaffTextSlot,
} from '../../core/services/notation-renderer.service';
import { allStaves } from '../../core/models/score-document';
import { CaretService } from '../../core/state/caret.service';
import { NoteInputService } from '../../core/state/note-input.service';
import { ScoreModelService } from '../../core/state/score-model.service';
import { SelectionService } from '../../core/state/selection.service';

/** Pointer travel (px) before a press on the staff turns into a drag selection instead of a click. */
const DRAG_THRESHOLD_PX = 4;

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

  /** Rubber-band rectangle while dragging a selection, in px relative to the canvas. */
  protected readonly selectionBox = signal<{ left: number; width: number } | null>(null);

  /** Text field under every staff, placed where the last render left room for it. */
  protected readonly textFields = signal<(StaffTextSlot & { text: string })[]>([]);
  protected readonly textFieldHeight = STAFF_TEXT_HEIGHT;

  private dragStartX: number | null = null;
  private dragging = false;
  private suppressNextClick = false;

  constructor() {
    effect(() => {
      const document = this.scoreModel.document();
      const activeStaffId = this.scoreModel.activeStaffId();
      const selectedIds = new Set(this.selection.selectedIds());
      // The caret is only meaningful (and visible) while note input mode is on.
      const caret = this.noteInput.active() ? this.caretService.position() : null;
      const host = this.canvasHost()?.nativeElement;
      if (!host) {
        return;
      }
      this.notationRenderer.render(host, document, selectedIds, caret, activeStaffId);
      const texts = new Map(allStaves(document).map((ref) => [ref.staff.id, ref.staff.text ?? '']));
      this.textFields.set(
        this.notationRenderer.getStaffTextSlots().map((slot) => ({ ...slot, text: texts.get(slot.staffId) ?? '' })),
      );
    });
  }

  protected onTextInput(staffId: string, event: Event): void {
    this.scoreModel.setStaffText(staffId, (event.target as HTMLTextAreaElement).value);
  }

  protected onCanvasMouseDown(event: MouseEvent): void {
    // While entering notes a press is always a click that inserts, never a selection drag.
    if (event.button !== 0 || this.noteInput.active()) {
      return;
    }
    this.dragStartX = event.clientX;
    this.dragging = false;

    const onMove = (move: MouseEvent) => this.onDragMove(move);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.endDrag();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  protected onCanvasClick(event: MouseEvent): void {
    if (this.suppressNextClick) {
      return;
    }

    const target = event.target as Element | null;
    const hit = target?.closest(`[${SCORE_ELEMENT_ID_ATTR}]`);
    if (hit) {
      this.activateStaff(hit.getAttribute(SCORE_STAFF_ID_ATTR));
      const id = hit.getAttribute(SCORE_ELEMENT_ID_ATTR)!;
      if (event.shiftKey) {
        this.selection.extendTo(id);
      } else if (event.ctrlKey || event.metaKey) {
        this.selection.toggle(id);
      } else {
        this.selection.select(id);
      }
      return;
    }

    const host = this.canvasHost()?.nativeElement;
    if (!host) {
      return;
    }
    const rect = host.getBoundingClientRect();
    // A click on empty space belongs to the staff nearest to it, which becomes the active one.
    this.activateStaff(this.notationRenderer.staffIdAtY(event.clientY - rect.top));
    const activeStaffId = this.scoreModel.activeStaffId();
    const position = this.notationRenderer.caretFromX(event.clientX - rect.left, activeStaffId);

    if (!this.noteInput.active()) {
      // Outside note input a click on empty staff selects the whole measure under the pointer.
      if (position) {
        this.selection.selectMeasure(position.measureIndex, event.shiftKey);
      }
      return;
    }

    if (position) {
      this.caretService.setPosition(position);
    }
    const y = event.clientY - rect.top;
    const geometry = this.notationRenderer.getStaffGeometry(activeStaffId);
    this.noteInput.enterPitchFromClick(this.scoreModel.score().clef, y, geometry.topLineY, geometry.halfStepPx);
  }

  private activateStaff(staffId: string | null): void {
    if (staffId && staffId !== this.scoreModel.activeStaffId()) {
      this.scoreModel.setActiveStaff(staffId);
    }
  }

  private onDragMove(event: MouseEvent): void {
    const host = this.canvasHost()?.nativeElement;
    if (this.dragStartX === null || !host) {
      return;
    }
    if (!this.dragging && Math.abs(event.clientX - this.dragStartX) < DRAG_THRESHOLD_PX) {
      return;
    }
    this.dragging = true;

    const left = Math.min(this.dragStartX, event.clientX);
    const right = Math.max(this.dragStartX, event.clientX);
    const hostLeft = host.getBoundingClientRect().left;
    this.selectionBox.set({ left: left - hostLeft, width: right - left });

    const ids = Array.from(host.querySelectorAll(`[${SCORE_ELEMENT_ID_ATTR}]`))
      .filter((node) => {
        const box = node.getBoundingClientRect();
        return box.right >= left && box.left <= right;
      })
      .map((node) => node.getAttribute(SCORE_ELEMENT_ID_ATTR)!);
    this.selection.selectMany(ids);
  }

  private endDrag(): void {
    if (this.dragging) {
      // The browser still fires a click after the mouseup that ended the drag; ignore that one.
      this.suppressNextClick = true;
      setTimeout(() => (this.suppressNextClick = false));
    }
    this.dragStartX = null;
    this.dragging = false;
    this.selectionBox.set(null);
  }
}
