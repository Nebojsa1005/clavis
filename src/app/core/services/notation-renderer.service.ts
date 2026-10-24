import { Injectable } from '@angular/core';
import {
  Accidental,
  Beam,
  Dot,
  Formatter,
  Renderer,
  Stave,
  StaveConnector,
  StaveNote,
  StaveTie,
  Voice,
} from 'vexflow';
import { beamGroups } from '../models/beam.util';
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
/** Width the notes of an editor measure are spread over. */
const EDITOR_FORMAT_WIDTH = STAVE_WIDTH - 50;
/** Distance between the tops of two staves of one instrument (a grand staff) and of different instruments. */
const STAFF_GAP_SAME_PART = 100;
const STAFF_GAP_BETWEEN_PARTS = 130;
/** Text field under every staff: its distance from the bottom staff line (room for ledger lines) and its height. */
const STAFF_TEXT_OFFSET_Y = 34;
export const STAFF_TEXT_HEIGHT = 30;

/** How the editor's text field is laid out; must match `.staff-text` in staff-view.scss. */
const EDITOR_TEXT_FONT = "14px ui-monospace, 'Cascadia Mono', Consolas, monospace";
/** Padding plus border between the left edge of the text field and its first character. */
const EDITOR_TEXT_INSET = 7;

/** A printed sheet is laid out at 1.5 × A4 at 96 dpi, so staves come out about 7 mm high. */
export const SHEET_WIDTH = 1190;
export const SHEET_PAGE_HEIGHT = Math.round(SHEET_WIDTH * Math.SQRT2);
const SHEET_MARGIN_X = 80;
const SHEET_MARGIN_Y = 80;
const SHEET_TITLE_FONT_SIZE = 32;
/** Room the title takes above the first system. */
const SHEET_TITLE_HEIGHT = 90;
const SHEET_MIN_MEASURE_WIDTH = 230;
/** Gap between the notes of a measure and its right barline. */
const SHEET_MEASURE_END_PADDING = 15;
/** Extra room between two systems, on top of the room kept for notes above and below the staves. */
const SHEET_SYSTEM_GAP = 30;
/** Room below the bottom line of the lowest staff of a system, for low notes and ledger lines. */
const SHEET_ROOM_BELOW = 30;
const SHEET_FONT_FAMILY = "Georgia, 'Times New Roman', serif";
const SHEET_TEXT_FONT_SIZE = 18;
const SHEET_TEXT_LINE_HEIGHT = 24;
/** Distance from the bottom staff line to the baseline of the first text line. */
const SHEET_TEXT_OFFSET_Y = 34;
/** Space kept between two words of text so they never run into each other. */
const SHEET_TEXT_MIN_GAP = 12;
/**
 * A measure with text gets at least this much more room than its words need side by side: the
 * notes do not start right at the barline, and they are not spaced exactly like the words.
 */
const SHEET_TEXT_ROOM_FACTOR = 1.25;
const SHEET_TEXT_MEASURE_PADDING = 40;
/** A last system shorter than this share of the sheet width keeps its natural width. */
const SHEET_STRETCH_LAST_SYSTEM = 0.7;

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

/** Where the text field of a staff goes, in SVG px relative to the rendered score. */
export interface StaffTextSlot {
  staffId: string;
  top: number;
  left: number;
  width: number;
}

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
  /** X of every element of the measure, in order. */
  noteXs: number[];
}

type DrawingContext = ReturnType<Renderer['getContext']>;

export interface SheetOptions {
  /** Printed centred above the first system. */
  title: string;
  /** Splits the sheet into pages of this height (sheet px); without it the sheet is one long page. */
  pageHeight?: number;
}

/**
 * One word of the text under a staff, anchored to where it starts in the editor: in a measure,
 * between two anchors (the barline, the notes in order, the next barline) and how far between them.
 */
interface SheetWord {
  text: string;
  line: number;
  measureIndex: number;
  /** Index of the anchor the word starts after; anchor 0 is the barline before the first note. */
  anchor: number;
  fraction: number;
}

/** A row of measures with all staves, placed at `y` (the stave y of its first staff) on `page`. */
interface SheetSystem {
  firstMeasure: number;
  /** Width of each measure of the system, without the signatures at its start. */
  widths: number[];
  header: StaveHeader;
  page: number;
  y: number;
}

/** Which signatures open a stave: clef, key and time ('full'), clef and key ('clef'), or nothing. */
type StaveHeader = 'full' | 'clef' | 'none';

/** How one measure column is laid out. */
interface ColumnFrame {
  width: number;
  header: StaveHeader;
  /** Width the notes are spread over, given the (first) stave of the column. */
  formatWidth: (stave: Stave) => number;
  /** Whether to keep caret stops and hit-test tags (only for the editor). */
  record: boolean;
}

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
  private textSlots: StaffTextSlot[] = [];
  private measureContext: CanvasRenderingContext2D | null = null;
  /** Staff that position queries refer to when the caller does not name one. */
  private queryStaffId: string | null = null;

  /** Geometry of a staff (the first one when `staffId` is omitted or unknown). */
  getStaffGeometry(staffId?: string): StaffGeometry {
    const known = this.staffTops.find((staff) => staff.id === staffId);
    const base = this.defaultStaffGeometry();
    return known ? { ...base, topLineY: known.topLineY } : base;
  }

  /** Text field position of every staff, in staff order, from the last render. */
  getStaffTextSlots(): StaffTextSlot[] {
    return this.textSlots;
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
    const bottomLineOffset = geometry.halfStepPx * 8;
    this.textSlots = this.staffTops.map((staff) => ({
      staffId: staff.id,
      top: staff.topLineY + bottomLineOffset + STAFF_TEXT_OFFSET_Y,
      left: STAVE_MARGIN_X,
      width: STAVE_WIDTH * columns,
    }));
    const lastTextBottom = this.textSlots[this.textSlots.length - 1].top + STAFF_TEXT_HEIGHT;
    const height = Math.max(MIN_CANVAS_HEIGHT, lastTextBottom + STAFF_TEXT_OFFSET_Y);
    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(Math.max(totalWidth, container.clientWidth || totalWidth), height);
    const context = renderer.getContext();

    const notesById = new Map<string, StaveNote>();
    for (let column = 0; column < columns; column++) {
      const x = STAVE_MARGIN_X + column * STAVE_WIDTH;
      const frame: ColumnFrame = {
        width: STAVE_WIDTH,
        header: column === 0 ? 'full' : 'none',
        formatWidth: () => EDITOR_FORMAT_WIDTH,
        record: true,
      };
      const columnStaves = this.drawColumn(context, refs, staffYs, column, x, selectedIds, notesById, frame);
      this.drawConnectors(context, doc, columnStaves, column === 0);
    }
    this.drawTies(context, refs, notesById);

    if (caret) {
      this.drawCaret(container, caret, this.queryStaffId);
    }
  }

  /**
   * Draws the piece as printed music into `host`: a title, then the measures broken into systems
   * that fill the sheet width, each staff with its text below it. Returns one SVG per page. Keeps
   * none of the editor's state (caret stops, text fields), so it can run next to the editor.
   */
  renderSheet(host: HTMLElement, input: Score | ScoreDocument, options: SheetOptions): SVGSVGElement[] {
    const doc = asDocument(input);
    const refs = allStaves(doc);
    const measureCount = Math.max(documentMeasureCount(doc), 1);
    const editorLayouts = this.editorLayouts(host, doc);
    const words = refs.map((ref) => this.staffWords(ref.staff.text ?? '', editorLayouts.get(ref.staff.id) ?? []));
    const textLines = words.map((list) => list.reduce((lines, word) => Math.max(lines, word.line + 1), 0));

    // Every staff keeps its usual gap to the next one, plus the height of its text.
    const textBlock = (index: number) => (textLines[index] > 0 ? textLines[index] * SHEET_TEXT_LINE_HEIGHT + 10 : 0);
    const staffOffsets = this.staffYs(refs, 0).map((y, index, ys) => {
      const textAbove = refs.slice(0, index).reduce((sum, _, before) => sum + textBlock(before), 0);
      return y - ys[0] + textAbove;
    });
    const lastStaff = refs.length - 1;
    const geometry = this.defaultStaffGeometry();
    const bottomLineOffset = geometry.topLineY - STAVE_Y + geometry.halfStepPx * 8;
    const systemHeight = staffOffsets[lastStaff] + bottomLineOffset + SHEET_ROOM_BELOW + textBlock(lastStaff);

    const systems: SheetSystem[] = [];
    let page = 0;
    let cursor = SHEET_MARGIN_Y + SHEET_TITLE_HEIGHT;
    for (const row of this.breakIntoSystems(refs, words, measureCount)) {
      const pageFull = options.pageHeight !== undefined && cursor + systemHeight > options.pageHeight - SHEET_MARGIN_Y;
      if (pageFull && systems.some((system) => system.page === page)) {
        page++;
        cursor = SHEET_MARGIN_Y;
      }
      systems.push({ ...row, page, y: cursor });
      cursor += systemHeight + SHEET_SYSTEM_GAP;
    }

    const pages: SVGSVGElement[] = [];
    for (let index = 0; index <= page; index++) {
      const own = systems.filter((system) => system.page === index);
      const last = own[own.length - 1];
      const height = options.pageHeight ?? last.y + systemHeight + SHEET_MARGIN_Y;

      const container = document.createElement('div');
      host.appendChild(container);
      const renderer = new Renderer(container, Renderer.Backends.SVG);
      renderer.resize(SHEET_WIDTH, height);
      const context = renderer.getContext();
      const svg = container.querySelector('svg')!;

      if (index === 0) {
        this.appendText(svg, options.title, SHEET_WIDTH / 2, SHEET_MARGIN_Y + SHEET_TITLE_FONT_SIZE, SHEET_TITLE_FONT_SIZE, 'middle');
      }
      for (const system of own) {
        this.drawSheetSystem(context, svg, doc, refs, system, staffOffsets, words, bottomLineOffset);
      }
      pages.push(svg);
    }
    return pages;
  }

  /** Draws one system of the sheet: its measures on every staff, the ties and the text below the staves. */
  private drawSheetSystem(
    context: DrawingContext,
    svg: SVGSVGElement,
    doc: ScoreDocument,
    refs: StaffRef[],
    system: SheetSystem,
    staffOffsets: number[],
    words: SheetWord[][],
    bottomLineOffset: number,
  ): void {
    const headerWidth = this.headerWidth(refs, system.header);
    const staffYs = staffOffsets.map((offset) => system.y + offset);

    const notesById = new Map<string, StaveNote>();
    // Per staff, per measure: the barline, every note and the next barline, left to right.
    const anchors = refs.map(() => new Map<number, number[]>());
    let x = SHEET_MARGIN_X;
    for (let column = system.firstMeasure; column < system.firstMeasure + system.widths.length; column++) {
      const isFirst = column === system.firstMeasure;
      const width = system.widths[column - system.firstMeasure] + (isFirst ? headerWidth : 0);
      const frame: ColumnFrame = {
        width,
        header: isFirst ? system.header : 'none',
        formatWidth: (stave) => stave.getNoteEndX() - stave.getNoteStartX() - SHEET_MEASURE_END_PADDING,
        record: false,
      };
      const columnStaves = this.drawColumn(context, refs, staffYs, column, x, new Set(), notesById, frame);
      this.drawConnectors(context, doc, columnStaves, isFirst);
      columnStaves.forEach((entry, staffIndex) =>
        anchors[staffIndex].set(column, [x, ...entry.notes.map((note) => note.getAbsoluteX()), x + width]),
      );
      x += width;
    }
    this.drawTies(context, refs, notesById, true);

    refs.forEach((_, staffIndex) => {
      const baseline = staffYs[staffIndex] + bottomLineOffset + SHEET_TEXT_OFFSET_Y;
      const lineEnds = new Map<number, number>();
      const placed = words[staffIndex]
        .filter((word) => anchors[staffIndex].has(word.measureIndex))
        .map((word) => {
          const xs = anchors[staffIndex].get(word.measureIndex)!;
          const from = xs[Math.min(word.anchor, xs.length - 2)];
          const to = xs[Math.min(word.anchor + 1, xs.length - 1)];
          return { word, x: from + word.fraction * (to - from) };
        })
        .sort((a, b) => a.x - b.x);
      for (const { word, x: wordX } of placed) {
        const left = Math.max(wordX, lineEnds.get(word.line) ?? -Infinity);
        this.appendText(svg, word.text, left, baseline + word.line * SHEET_TEXT_LINE_HEIGHT, SHEET_TEXT_FONT_SIZE, 'start');
        lineEnds.set(word.line, left + this.textWidth(word.text) + SHEET_TEXT_MIN_GAP);
      }
    });
  }

  /**
   * Fills each system with as many measures as fit, a measure being at least wide enough for the
   * text under it, then spreads the leftover width over the measures in proportion.
   */
  private breakIntoSystems(refs: StaffRef[], words: SheetWord[][], measureCount: number): Omit<SheetSystem, 'page' | 'y'>[] {
    const minWidths = this.measureMinWidths(words, measureCount);
    const rows: Omit<SheetSystem, 'page' | 'y'>[] = [];
    let first = 0;
    while (first < measureCount) {
      const header: StaveHeader = first === 0 ? 'full' : 'clef';
      const available = SHEET_WIDTH - SHEET_MARGIN_X * 2 - this.headerWidth(refs, header);
      const natural: number[] = [Math.min(minWidths[first], available)];
      let used = natural[0];
      while (first + natural.length < measureCount && used + minWidths[first + natural.length] <= available) {
        const next = minWidths[first + natural.length];
        used += next;
        natural.push(next);
      }
      const isLast = first + natural.length === measureCount;
      const stretch = isLast && used < available * SHEET_STRETCH_LAST_SYSTEM ? 1 : available / used;
      rows.push({ firstMeasure: first, widths: natural.map((width) => width * stretch), header });
      first += natural.length;
    }
    return rows;
  }

  /** The narrowest each measure may be: the usual minimum, or more when its text needs the room. */
  private measureMinWidths(words: SheetWord[][], measureCount: number): number[] {
    const widths = Array.from({ length: measureCount }, () => SHEET_MIN_MEASURE_WIDTH);
    for (const staffWords of words) {
      const textPerLine = new Map<string, number>();
      for (const word of staffWords) {
        const key = `${word.measureIndex}/${word.line}`;
        textPerLine.set(key, (textPerLine.get(key) ?? 0) + this.textWidth(word.text) + SHEET_TEXT_MIN_GAP);
      }
      textPerLine.forEach((text, key) => {
        const measureIndex = Number(key.split('/')[0]);
        const needed = text * SHEET_TEXT_ROOM_FACTOR + SHEET_TEXT_MEASURE_PADDING;
        widths[measureIndex] = Math.max(widths[measureIndex], needed);
      });
    }
    return widths;
  }

  /**
   * Splits the text under a staff into words and anchors each one to the notes it sits between in
   * the editor, so it lands under the same notes however the printed measure is spaced.
   */
  private staffWords(text: string, layout: MeasureLayout[]): SheetWord[] {
    if (layout.length === 0) {
      return [];
    }
    const charWidth = this.editorCharWidth();
    const words: SheetWord[] = [];
    text.split('\n').forEach((lineText, line) => {
      for (const match of lineText.matchAll(/\S+/g)) {
        const editorX = STAVE_MARGIN_X + EDITOR_TEXT_INSET + match.index * charWidth;
        const found = layout.findIndex((measure) => editorX < measure.endX);
        const measureIndex = found === -1 ? layout.length - 1 : found;
        const { startX, endX, noteXs } = layout[measureIndex];
        const xs = [startX, ...noteXs, endX];
        let anchor = 0;
        while (anchor < xs.length - 2 && xs[anchor + 1] <= editorX) {
          anchor++;
        }
        const fraction = Math.min(Math.max((editorX - xs[anchor]) / (xs[anchor + 1] - xs[anchor]), 0), 1);
        words.push({ text: match[0], line, measureIndex, anchor, fraction });
      }
    });
    return words;
  }

  /**
   * Caret layouts of every staff as the editor draws `doc`, from a throwaway render. The editor's
   * own state (caret stops, text fields of the last real render) is left as it was.
   */
  private editorLayouts(host: HTMLElement, doc: ScoreDocument): Map<string, MeasureLayout[]> {
    const saved = { layouts: this.layouts, staffTops: this.staffTops, textSlots: this.textSlots, queryStaffId: this.queryStaffId };
    const container = document.createElement('div');
    host.appendChild(container);
    try {
      this.render(container, doc);
      return this.layouts;
    } finally {
      container.remove();
      this.layouts = saved.layouts;
      this.staffTops = saved.staffTops;
      this.textSlots = saved.textSlots;
      this.queryStaffId = saved.queryStaffId;
    }
  }

  /** How much wider the signatures at the start of a system make its first measure. */
  private headerWidth(refs: StaffRef[], header: StaveHeader): number {
    const plain = new Stave(0, STAVE_Y, STAVE_WIDTH).getNoteStartX();
    return Math.max(...refs.map((ref) => this.createStave(ref.staff.score, 0, STAVE_Y, STAVE_WIDTH, header).getNoteStartX())) - plain;
  }

  private appendText(svg: SVGSVGElement, text: string, x: number, y: number, size: number, anchor: 'start' | 'middle'): void {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('x', String(x));
    node.setAttribute('y', String(y));
    node.setAttribute('font-family', SHEET_FONT_FAMILY);
    node.setAttribute('font-size', String(size));
    node.setAttribute('text-anchor', anchor);
    node.setAttribute('fill', '#000');
    node.textContent = text;
    svg.appendChild(node);
  }

  private textWidth(text: string): number {
    return this.measureText(text, `${SHEET_TEXT_FONT_SIZE}px ${SHEET_FONT_FAMILY}`);
  }

  /** Width of one character in the editor's monospace text field. */
  private editorCharWidth(): number {
    const sample = '0'.repeat(50);
    return this.measureText(sample, EDITOR_TEXT_FONT) / sample.length;
  }

  private measureText(text: string, font: string): number {
    this.measureContext ??= document.createElement('canvas').getContext('2d');
    if (!this.measureContext) {
      return text.length * 8;
    }
    this.measureContext.font = font;
    return this.measureContext.measureText(text).width;
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

  /**
   * The y VexFlow gets for each staff: staves of one instrument sit closer than separate instruments,
   * and in the editor every staff keeps `textRoom` below it for its text field.
   */
  private staffYs(refs: StaffRef[], textRoom = STAFF_TEXT_OFFSET_Y + STAFF_TEXT_HEIGHT): number[] {
    const ys: number[] = [];
    refs.forEach((ref, index) => {
      if (index === 0) {
        ys.push(STAVE_Y);
      } else {
        const gap = ref.staffIndex > 0 ? STAFF_GAP_SAME_PART : STAFF_GAP_BETWEEN_PARTS;
        ys.push(ys[index - 1] + gap + textRoom);
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
    frame: ColumnFrame,
  ): ColumnStaff[] {
    const staves = refs.map((ref, index) => this.createStave(ref.staff.score, x, staffYs[index], frame.width, frame.header));
    if (frame.header !== 'none') {
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

    // Beams have to exist before the notes are formatted and drawn: they take over the flags and
    // decide the stem direction of the whole group.
    const beams = columnStaves.flatMap((entry) => {
      const noteById = new Map(entry.measure.elements.map((el, index) => [el.id, entry.notes[index]]));
      return beamGroups(entry.measure, entry.ref.staff.score.timeSignature).map((group) => {
        const beam = new Beam(group.map((note) => noteById.get(note.id)!), true);
        if (group.every((note) => selectedIds.has(note.id))) {
          beam.setStyle({ fillStyle: SELECTED_NOTE_COLOR, strokeStyle: SELECTED_NOTE_COLOR });
        }
        return beam;
      });
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
      formatter.format(voices.map((item) => item.voice), frame.formatWidth(staves[0]));
    }
    voices.forEach(({ entry, voice }) => voice.draw(context, entry.stave));
    beams.forEach((beam) => beam.setContext(context).draw());

    if (frame.record) {
      for (const entry of columnStaves) {
        this.recordLayout(entry, x);
      }
    }
    return columnStaves;
  }

  private createStave(score: Score, x: number, y: number, width: number, header: StaveHeader): Stave {
    const stave = new Stave(x, y, width);
    if (header !== 'none') {
      stave.addClef(score.clef);
      if (header === 'full') {
        stave.addTimeSignature(`${score.timeSignature.numerator}/${score.timeSignature.denominator}`);
      }
      if (score.keySignature !== 'C') {
        stave.addKeySignature(score.keySignature);
      }
    }
    return stave;
  }

  /**
   * Ties of every staff. They go last: both notes have to be positioned first, and a tie may cross
   * a barline. With `partial`, a tie whose other note was not drawn (it is on another system) is
   * drawn as a half tie running off the edge.
   */
  private drawTies(context: DrawingContext, refs: StaffRef[], notesById: Map<string, StaveNote>, partial = false): void {
    for (const ref of refs) {
      for (const link of tieLinks(ref.staff.score)) {
        const first = notesById.get(link.from.id);
        const last = notesById.get(link.to.id);
        if ((first && last) || (partial && (first || last))) {
          new StaveTie({ firstNote: first ?? null, lastNote: last ?? null, firstIndexes: [0], lastIndexes: [0] })
            .setContext(context)
            .draw();
        }
      }
    }
  }

  /** Tags the drawn notes for hit-testing and stores where the caret can stop in this measure. */
  private recordLayout(entry: ColumnStaff, x: number): void {
    const { ref, stave, notes, measure } = entry;
    const layout = this.layouts.get(ref.staff.id)!;

    if (notes.length === 0) {
      layout.push({ startX: x, endX: x + STAVE_WIDTH, ticks: [0], stopXs: [stave.getNoteStartX()], noteXs: [] });
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
    layout.push({ startX: x, endX: x + STAVE_WIDTH, ticks: elementBoundaries(measure), stopXs, noteXs: notes.map((note) => note.getAbsoluteX()) });
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
