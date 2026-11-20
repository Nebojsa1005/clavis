import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
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
import { allStaves, findStaff } from '../../core/models/score-document';
import { pitchFromClickY } from '../../core/models/notation.util';
import { CaretService } from '../../core/state/caret.service';
import { NoteInputService } from '../../core/state/note-input.service';
import { ScoreModelService } from '../../core/state/score-model.service';
import { SelectionService } from '../../core/state/selection.service';
import { ViewZoomService } from '../../core/state/view-zoom.service';
import {
  AUGMENTATION_DOT,
  GLYPH_UNITS_PER_STAFF_SPACE,
  NOTE_GLYPHS,
  NOTE_GLYPHS_STEM_DOWN,
  NOTEHEAD_BLACK,
} from '../../shared/smufl-glyphs';

/** Pointer travel (px) before a press on the staff turns into a drag selection instead of a click. */
const DRAG_THRESHOLD_PX = 4;

/** How strongly a pinch (or Ctrl + wheel) zooms per pixel of wheel travel. */
const WHEEL_ZOOM_SPEED = 0.01;
/** The preview note head sits this far right of the caret line, where the inserted note will be. */
const GHOST_OFFSET_X = 14;

/** Staff position of the middle line, counted in half steps down from the top line. */
const MIDDLE_LINE_STEPS = 4;
const BOTTOM_LINE_STEPS = 8;

/** Where the next click would put a note: the spot on the staff and the pitch it stands for. */
export interface NoteGhost {
  x: number;
  y: number;
  label: string;
  /** Half steps below the top staff line (negative above the staff). */
  steps: number;
  /** One staff space in px. */
  space: number;
}

/** The preview drawn as a real note of the selected duration, in px relative to its notehead centre. */
interface GhostNote {
  x: number;
  y: number;
  label: string;
  path: string;
  transform: string;
  ledgers: { y: number; x1: number; x2: number }[];
  ledgerWidth: number;
  dot: { path: string; transform: string } | null;
  labelX: number;
  labelY: number;
}

/** The nearest ancestor that scrolls, which is what has to move to keep the pointer still while zooming. */
function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/(auto|scroll)/.test(overflowX + overflowY)) {
      return node;
    }
  }
  return null;
}

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
  private readonly hostElement = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly noteInput = inject(NoteInputService);
  protected readonly selection = inject(SelectionService);
  protected readonly viewZoom = inject(ViewZoomService);

  protected readonly canvasHost = viewChild<ElementRef<HTMLDivElement>>('canvasHost');

  /** Rubber-band rectangle while dragging a selection, in px relative to the canvas. */
  protected readonly selectionBox = signal<{ left: number; width: number } | null>(null);

  /** Text field under every staff, placed where the last render left room for it. */
  protected readonly textFields = signal<(StaffTextSlot & { text: string })[]>([]);
  protected readonly textFieldHeight = STAFF_TEXT_HEIGHT;

  /** Preview of the note a click would enter, while the pointer is over the staff in note input. */
  protected readonly ghost = signal<NoteGhost | null>(null);

  /** The ghost as the note a click would enter: same glyph, stem direction, ledger lines and dot. */
  protected readonly ghostNote = computed<GhostNote | null>(() => {
    const ghost = this.ghost();
    if (!ghost) {
      return null;
    }
    const { steps, space } = ghost;
    const duration = this.noteInput.currentDuration();
    const stemDown = steps <= MIDDLE_LINE_STEPS;
    const glyph = (stemDown ? NOTE_GLYPHS_STEM_DOWN : NOTE_GLYPHS)[duration];
    const scale = space / GLYPH_UNITS_PER_STAFF_SPACE;
    const headWidth = (duration === 'whole' ? NOTE_GLYPHS.whole.bounds[2] : NOTEHEAD_BLACK.width) * scale;
    const half = space / 2;

    const ledgerHalf = headWidth * 0.8;
    const ledgers: GhostNote['ledgers'] = [];
    for (let s = -2; s >= steps; s -= 2) {
      ledgers.push({ y: (s - steps) * half, x1: -ledgerHalf, x2: ledgerHalf });
    }
    for (let s = BOTTOM_LINE_STEPS + 2; s <= steps; s += 2) {
      ledgers.push({ y: (s - steps) * half, x1: -ledgerHalf, x2: ledgerHalf });
    }

    // A dot on a line moves up into the space above, as in printed music.
    const dotX = headWidth / 2 + space * 0.5;
    const dotY = steps % 2 === 0 ? -half : 0;
    const dot = this.noteInput.dotted()
      ? { path: AUGMENTATION_DOT.path, transform: `translate(${dotX} ${dotY}) scale(${scale} ${-scale})` }
      : null;

    return {
      x: ghost.x,
      y: ghost.y,
      label: ghost.label,
      path: glyph.path,
      transform: `translate(${-headWidth / 2} 0) scale(${scale} ${-scale})`,
      ledgers,
      ledgerWidth: Math.max(1, space * 0.13),
      dot,
      labelX: dotX + space * (dot ? 1 : 0.2),
      labelY: -space * 1.4,
    };
  });

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

  /**
   * A touchpad pinch reaches the page as a wheel event with Ctrl held (so does Ctrl + mouse wheel).
   * It zooms the score instead of the whole page, keeping the spot under the pointer in place.
   */
  @HostListener('wheel', ['$event'])
  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey) {
      return;
    }
    event.preventDefault();
    this.zoomAround(this.viewZoom.zoom() * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED), event);
  }

  /** Sets the zoom and scrolls so the score point under the pointer stays under it. */
  private zoomAround(target: number, pointer: { clientX: number; clientY: number }): void {
    const host = this.canvasHost()?.nativeElement;
    const wrap = host?.parentElement;
    const scroller = scrollParent(this.hostElement.nativeElement);
    const previous = this.viewZoom.zoom();
    if (!host || !wrap || !scroller) {
      this.viewZoom.set(target);
      return;
    }

    const rect = host.getBoundingClientRect();
    const scoreX = (pointer.clientX - rect.left) / previous;
    const scoreY = (pointer.clientY - rect.top) / previous;
    const next = this.viewZoom.set(target);
    if (next === previous) {
      return;
    }
    // Apply the zoom right away (not on the next change detection) so the new layout can be measured.
    wrap.style.zoom = String(next);
    const after = host.getBoundingClientRect();
    scroller.scrollLeft += after.left + scoreX * next - pointer.clientX;
    scroller.scrollTop += after.top + scoreY * next - pointer.clientY;
  }

  protected onCanvasMouseMove(event: MouseEvent): void {
    if (!this.noteInput.active() || this.dragStartX !== null) {
      this.ghost.set(null);
      return;
    }
    const { x, y } = this.pointInScore(event);
    const staffId = this.notationRenderer.staffIdAtY(y);
    const staff = staffId ? findStaff(this.scoreModel.document(), staffId) : undefined;
    const position = staffId ? this.notationRenderer.caretFromX(x, staffId) : null;
    const caretX = position && staffId ? this.notationRenderer.getCaretX(position, staffId) : null;
    if (!staff || !staffId || caretX === null) {
      this.ghost.set(null);
      return;
    }
    const { topLineY, halfStepPx } = this.notationRenderer.getStaffGeometry(staffId);
    const steps = Math.round((y - topLineY) / halfStepPx);
    const pitch = pitchFromClickY(staff.score.clef, y, topLineY, halfStepPx);
    this.ghost.set({
      x: caretX + GHOST_OFFSET_X,
      y: topLineY + steps * halfStepPx,
      label: `${pitch.step}${pitch.octave}`,
      steps,
      space: halfStepPx * 2,
    });
  }

  protected onCanvasMouseLeave(): void {
    this.ghost.set(null);
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

    if (!this.canvasHost()) {
      return;
    }
    const { x, y } = this.pointInScore(event);
    // A click on empty space belongs to the staff nearest to it, which becomes the active one.
    this.activateStaff(this.notationRenderer.staffIdAtY(y));
    const activeStaffId = this.scoreModel.activeStaffId();
    const position = this.notationRenderer.caretFromX(x, activeStaffId);

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
    const geometry = this.notationRenderer.getStaffGeometry(activeStaffId);
    this.noteInput.enterPitchFromClick(this.scoreModel.score().clef, y, geometry.topLineY, geometry.halfStepPx);
  }

  /** Pointer position in the coordinates of the rendered score, whatever the zoom. */
  private pointInScore(event: MouseEvent): { x: number; y: number } {
    const rect = this.canvasHost()!.nativeElement.getBoundingClientRect();
    const zoom = this.viewZoom.zoom();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
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
    const zoom = this.viewZoom.zoom();
    this.selectionBox.set({ left: (left - hostLeft) / zoom, width: (right - left) / zoom });

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
