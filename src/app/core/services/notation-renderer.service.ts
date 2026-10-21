import { Injectable } from '@angular/core';
import {
  Accidental,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Voice,
} from 'vexflow';
import { CaretPosition, elementBoundaries } from '../models/caret.util';
import { Measure, MeasureElement, NoteDuration, Score } from '../models/score.model';
import { allStaves, asDocument, documentMeasureCount, ScoreDocument, StaffRef } from '../models/score-document';
import { tieLinks } from '../models/tie.util';

const VEXFLOW_DURATION: Record<NoteDuration, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
  thirtysecond: '32',
  sixtyfourth: '64',
};

const VEXFLOW_ACCIDENTAL: Record<'sharp' | 'flat' | 'natural', string> = {
  sharp: '#',
  flat: 'b',
  natural: 'n',
};

const STAVE_WIDTH = 260;
const STAVE_MARGIN_X = 10;
const STAVE_Y = 40;
const MIN_CANVAS_HEIGHT = 200;
/** Distance between the tops of two staves of one instrument (a grand staff) and of different instruments. */
const STAFF_GAP_SAME_PART = 100;
const STAFF_GAP_BETWEEN_PARTS = 130;
/** Room kept below the last staff for low notes and ledger lines. */
const CANVAS_BOTTOM_PADDING = 80;
const STAVE_HEIGHT_TO_BOTTOM_LINE = 80;

/** Mora pratiti vrednost --color-accent iz styles.scss (VexFlow ne čita CSS custom properties). */
const SELECTED_NOTE_COLOR = '#3b5bfd';

export const SCORE_ELEMENT_ID_ATTR = 'data-score-element-id';
export const SCORE_STAFF_ID_ATTR = 'data-score-staff-id';
export const CARET_CLASS = 'clavis-caret';

/** Horizontal gap between the caret and the note head it sits in front of. */
const CARET_GAP_BEFORE_NOTE = 8;
/** Extra gap used when the note has an accidental, so the caret does not cut through it. */
const CARET_GAP_BEFORE_ACCIDENTAL = 18;
/** Distance from the last note head to a caret placed after it. */
const CARET_GAP_AFTER_LAST_NOTE = 24;
/** How far the caret line extends above and below the staff lines. */
const CARET_OVERSHOOT_Y = 14;

export interface StaffGeometry {
  topLineY: number;
  halfStepPx: number;
}

/** Caret stops of one measure: tick values (`elementBoundaries()`) and their x coordinates in SVG px. */
export interface MeasureLayout {
  startX: number;
  endX: number;
  ticks: number[];
  stopXs: number[];
}

type DrawingContext = ReturnType<Renderer['getContext']>;

/** What a staff needs while a measure column is drawn. */
interface ColumnStaff {
  ref: StaffRef;
  stave: Stave;
  notes: StaveNote[];
  measure: Measure;
}

/** Wrapper around VexFlow: draws the model (one staff or a whole document), keeps no model state. */
@Injectable({ providedIn: 'root' })
export class NotationRendererService {
  private defaultGeometry: StaffGeometry | null = null;
  /** Caret stops per staff id, from the last render. */
  private layouts = new Map<string, MeasureLayout[]>();
  /** Y of the top line of every staff, in staff order, from the last render. */
  private staffTops: { id: string; topLineY: number }[] = [];
  /** Staff that position queries refer to when the caller does not name one. */
  private queryStaffId: string | null = null;

  /** Geometry of a staff (the first one when `staffId` is omitted or unknown). */
  getStaffGeometry(staffId?: string): StaffGeometry {
    const known = this.staffTops.find((staff) => staff.id === staffId);
    const base = this.defaultStaffGeometry();
    return known ? { ...base, topLineY: known.topLineY } : base;
  }

  /** Id of the staff nearest to a y coordinate (SVG px), or null before anything was rendered. */
  staffIdAtY(y: number): string | null {
    const middleOffset = this.defaultStaffGeometry().halfStepPx * 4;
    let nearest: { id: string; distance: number } | null = null;
    for (const staff of this.staffTops) {
      const distance = Math.abs(y - (staff.topLineY + middleOffset));
      if (!nearest || distance < nearest.distance) {
        nearest = { id: staff.id, distance };
      }
    }
    return nearest?.id ?? null;
  }

  /** X coordinate of a caret position in the last render, or null if the measure was not rendered. */
  getCaretX(position: CaretPosition, staffId?: string): number | null {
    const measure = this.layoutOf(staffId)[position.measureIndex];
    if (!measure) {
      return null;
    }
    const index = measure.ticks.indexOf(position.tick);
    return index === -1 ? null : (measure.stopXs[index] ?? null);
  }

  /**
   * Maps an x coordinate (SVG px, relative to the rendered score) to the nearest caret position of
   * a staff. Clicks left of / right of the score resolve to the first / last measure.
   */
  caretFromX(x: number, staffId?: string): CaretPosition | null {
    const layout = this.layoutOf(staffId);
    if (layout.length === 0) {
      return null;
    }

    const found = layout.findIndex((measure) => x < measure.endX);
    const measureIndex = found === -1 ? layout.length - 1 : found;
    const { stopXs, ticks } = layout[measureIndex];

    let nearest = 0;
    stopXs.forEach((stopX, index) => {
      if (Math.abs(stopX - x) < Math.abs(stopXs[nearest] - x)) {
        nearest = index;
      }
    });
    return { measureIndex, voice: 0, tick: ticks[nearest] };
  }

  /**
   * Draws a single-staff score or a whole document. The caret, if any, is drawn on `activeStaffId`
   * (the first staff by default), and position queries afterwards refer to that staff.
   */
  render(
    container: HTMLDivElement,
    input: Score | ScoreDocument,
    selectedIds: ReadonlySet<string> = new Set(),
    caret: CaretPosition | null = null,
    activeStaffId?: string,
  ): void {
    const doc = asDocument(input);
    const refs = allStaves(doc);
    const columns = Math.max(documentMeasureCount(doc), 1);

    container.replaceChildren();
    this.layouts = new Map(refs.map((ref) => [ref.staff.id, []]));
    this.queryStaffId = refs.some((ref) => ref.staff.id === activeStaffId) ? activeStaffId! : refs[0].staff.id;

    const staffYs = this.staffYs(refs);
    const geometry = this.defaultStaffGeometry();
    this.staffTops = refs.map((ref, index) => ({ id: ref.staff.id, topLineY: staffYs[index] + (geometry.topLineY - STAVE_Y) }));

    const totalWidth = STAVE_MARGIN_X * 2 + STAVE_WIDTH * columns;
    const height = Math.max(MIN_CANVAS_HEIGHT, staffYs[staffYs.length - 1] + STAVE_HEIGHT_TO_BOTTOM_LINE + CANVAS_BOTTOM_PADDING);
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(Math.max(totalWidth, container.clientWidth || totalWidth), height);
    const context = renderer.getContext();

    const notesById = new Map<string, StaveNote>();
    for (let column = 0; column < columns; column++) {
      const x = STAVE_MARGIN_X + column * STAVE_WIDTH;
      const columnStaves = this.drawColumn(context, refs, staffYs, column, x, selectedIds, notesById);
      this.drawConnectors(context, doc, columnStaves, column === 0);
    }

    // Ties go last: both notes have to be positioned first, and a tie may cross a barline.
    for (const ref of refs) {
      for (const link of tieLinks(ref.staff.score)) {
        const first = notesById.get(link.from.id);
        const last = notesById.get(link.to.id);
        if (first && last) {
          new StaveTie({ firstNote: first, lastNote: last, firstIndexes: [0], lastIndexes: [0] })
            .setContext(context)
            .draw();
        }
      }
    }

    if (caret) {
      this.drawCaret(container, caret, this.queryStaffId);
    }
  }

  private layoutOf(staffId?: string): MeasureLayout[] {
    return this.layouts.get(staffId ?? this.queryStaffId ?? '') ?? [];
  }

  /** Geometry of a lone staff drawn at STAVE_Y; every staff has the same shape, only its y differs. */
  private defaultStaffGeometry(): StaffGeometry {
    if (!this.defaultGeometry) {
      const probe = new Stave(0, STAVE_Y, STAVE_WIDTH);
      this.defaultGeometry = {
        topLineY: probe.getYForLine(0),
        halfStepPx: probe.getSpacingBetweenLines() / 2,
      };
    }
    return this.defaultGeometry;
  }

  /** The y VexFlow gets for each staff: staves of one instrument sit closer than separate instruments. */
  private staffYs(refs: StaffRef[]): number[] {
    const ys: number[] = [];
    refs.forEach((ref, index) => {
      if (index === 0) {
        ys.push(STAVE_Y);
      } else {
        ys.push(ys[index - 1] + (ref.staffIndex > 0 ? STAFF_GAP_SAME_PART : STAFF_GAP_BETWEEN_PARTS));
      }
    });
    return ys;
  }

  private drawCaret(container: HTMLDivElement, caret: CaretPosition, staffId: string): void {
    const x = this.getCaretX(caret, staffId);
    const svg = container.querySelector('svg');
    if (x === null || !svg) {
      return;
    }

    const { topLineY, halfStepPx } = this.getStaffGeometry(staffId);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', CARET_CLASS);
    line.setAttribute('x1', String(x));
    line.setAttribute('x2', String(x));
    line.setAttribute('y1', String(topLineY - CARET_OVERSHOOT_Y));
    line.setAttribute('y2', String(topLineY + halfStepPx * 8 + CARET_OVERSHOOT_Y));
    line.setAttribute('stroke', SELECTED_NOTE_COLOR);
    line.setAttribute('stroke-width', '2');
    line.setAttribute('pointer-events', 'none');
    svg.appendChild(line);
  }

  /**
   * Draws one measure of every staff. All staves of the column are formatted together so notes that
   * sound at the same time line up vertically.
   */
  private drawColumn(
    context: DrawingContext,
    refs: StaffRef[],
    staffYs: number[],
    column: number,
    x: number,
    selectedIds: ReadonlySet<string>,
    notesById: Map<string, StaveNote>,
  ): ColumnStaff[] {
    const isFirst = column === 0;
    const staves = refs.map((ref, index) => this.createStave(ref.staff.score, x, staffYs[index], isFirst));
    if (isFirst) {
      // Clefs differ in width; give every staff the same start so the first notes line up.
      const noteStartX = Math.max(...staves.map((stave) => stave.getNoteStartX()));
      staves.forEach((stave) => stave.setNoteStartX(noteStartX));
    }
    staves.forEach((stave) => stave.setContext(context).draw());

    const columnStaves: ColumnStaff[] = refs.map((ref, index) => {
      const measure = ref.staff.score.measures[column] ?? { id: `${ref.staff.id}-pad-${column}`, elements: [] };
      const notes = measure.elements.map((el) => {
        const note = this.toStaveNote(el, ref.staff.score.clef);
        if (selectedIds.has(el.id)) {
          note.setStyle({ fillStyle: SELECTED_NOTE_COLOR, strokeStyle: SELECTED_NOTE_COLOR });
        }
        notesById.set(el.id, note);
        return note;
      });
      return { ref, stave: staves[index], notes, measure };
    });

    const formatter = new Formatter();
    const voices = columnStaves
      .filter((entry) => entry.notes.length > 0)
      .map((entry) => {
        const { timeSignature } = entry.ref.staff.score;
        const voice = new Voice({ numBeats: timeSignature.numerator, beatValue: timeSignature.denominator });
        voice.setStrict(false);
        voice.addTickables(entry.notes);
        formatter.joinVoices([voice]);
        return { entry, voice };
      });
    if (voices.length > 0) {
      formatter.format(voices.map((item) => item.voice), STAVE_WIDTH - 50);
    }
    voices.forEach(({ entry, voice }) => voice.draw(context, entry.stave));

    for (const entry of columnStaves) {
      this.recordLayout(entry, x);
    }
    return columnStaves;
  }

  private createStave(score: Score, x: number, y: number, isFirst: boolean): Stave {
    const stave = new Stave(x, y, STAVE_WIDTH);
    if (isFirst) {
      stave.addClef(score.clef);
      stave.addTimeSignature(`${score.timeSignature.numerator}/${score.timeSignature.denominator}`);
      if (score.keySignature !== 'C') {
        stave.addKeySignature(score.keySignature);
      }
    }
    return stave;
  }

  /** Tags the drawn notes for hit-testing and stores where the caret can stop in this measure. */
  private recordLayout(entry: ColumnStaff, x: number): void {
    const { ref, stave, notes, measure } = entry;
    const layout = this.layouts.get(ref.staff.id)!;

    if (notes.length === 0) {
      layout.push({ startX: x, endX: x + STAVE_WIDTH, ticks: [0], stopXs: [stave.getNoteStartX()] });
      return;
    }

    notes.forEach((note, index) => {
      const svg = note.getSVGElement();
      svg?.setAttribute(SCORE_ELEMENT_ID_ATTR, measure.elements[index].id);
      svg?.setAttribute(SCORE_STAFF_ID_ATTR, ref.staff.id);
    });

    const stopXs = notes.map(
      (note) =>
        note.getAbsoluteX() -
        (note.getModifiersByType(Accidental.CATEGORY).length > 0 ? CARET_GAP_BEFORE_ACCIDENTAL : CARET_GAP_BEFORE_NOTE),
    );
    const lastNote = notes[notes.length - 1];
    stopXs.push(Math.min(lastNote.getAbsoluteX() + CARET_GAP_AFTER_LAST_NOTE, stave.getNoteEndX()));
    layout.push({ startX: x, endX: x + STAVE_WIDTH, ticks: elementBoundaries(measure), stopXs });
  }

  /** Brace and barlines that tie the staves of one instrument together, plus a line at the system start. */
  private drawConnectors(context: DrawingContext, doc: ScoreDocument, columnStaves: ColumnStaff[], isFirst: boolean): void {
    for (const part of doc.parts) {
      const own = columnStaves.filter((entry) => entry.ref.part.id === part.id);
      if (own.length < 2) {
        continue;
      }
      const top = own[0].stave;
      const bottom = own[own.length - 1].stave;
      if (isFirst) {
        new StaveConnector(top, bottom).setType('brace').setContext(context).draw();
      }
      new StaveConnector(top, bottom).setType('singleRight').setContext(context).draw();
    }

    if (isFirst && columnStaves.length > 1) {
      new StaveConnector(columnStaves[0].stave, columnStaves[columnStaves.length - 1].stave)
        .setType('singleLeft')
        .setContext(context)
        .draw();
    }
  }

  private toStaveNote(element: MeasureElement, clef: Score['clef']): StaveNote {
    // VexFlow encodes a dot in the duration string ("qd" = dotted quarter) and draws it via Dot.
    const duration = VEXFLOW_DURATION[element.duration] + (element.dotted ? 'd' : '');

    if (element.kind === 'rest') {
      const rest = new StaveNote({ keys: ['b/4'], duration: `${duration}r`, clef });
      if (element.dotted) {
        Dot.buildAndAttach([rest], { all: true });
      }
      return rest;
    }

    const key = `${element.pitch.step.toLowerCase()}/${element.pitch.octave}`;
    // autoStem: stem up for notes below the middle line, down for the middle line and above.
    const note = new StaveNote({ keys: [key], duration, clef, autoStem: true });
    if (element.pitch.accidental) {
      note.addModifier(new Accidental(VEXFLOW_ACCIDENTAL[element.pitch.accidental]));
    }
    if (element.dotted) {
      Dot.buildAndAttach([note], { all: true });
    }
    return note;
  }
}
