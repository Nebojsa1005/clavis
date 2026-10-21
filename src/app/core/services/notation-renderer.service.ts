import { Injectable } from '@angular/core';
import { Accidental, Dot, Formatter, Renderer, Stave, StaveNote, StaveTie, Voice } from 'vexflow';
import { CaretPosition, elementBoundaries } from '../models/caret.util';
import { Measure, MeasureElement, NoteDuration, Score } from '../models/score.model';
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
const CANVAS_HEIGHT = 200;

/** Mora pratiti vrednost --color-accent iz styles.scss (VexFlow ne čita CSS custom properties). */
const SELECTED_NOTE_COLOR = '#3b5bfd';

export const SCORE_ELEMENT_ID_ATTR = 'data-score-element-id';
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

/** Wrapper oko VexFlow-a: crta interni Score model, bez sopstvenog stanja. */
@Injectable({ providedIn: 'root' })
export class NotationRendererService {
  private cachedGeometry: StaffGeometry | null = null;
  private layout: MeasureLayout[] = [];

  /** Geometrija je ista za sve taktove (svi staff-ovi su na istom y=STAVE_Y), zato se računa jednom. */
  getStaffGeometry(): StaffGeometry {
    if (!this.cachedGeometry) {
      const probe = new Stave(0, STAVE_Y, STAVE_WIDTH);
      this.cachedGeometry = {
        topLineY: probe.getYForLine(0),
        halfStepPx: probe.getSpacingBetweenLines() / 2,
      };
    }
    return this.cachedGeometry;
  }

  /** X coordinate of a caret position in the last render, or null if the measure was not rendered. */
  getCaretX(position: CaretPosition): number | null {
    const measure = this.layout[position.measureIndex];
    if (!measure) {
      return null;
    }
    const index = measure.ticks.indexOf(position.tick);
    return index === -1 ? null : (measure.stopXs[index] ?? null);
  }

  /**
   * Maps an x coordinate (SVG px, relative to the rendered score) to the nearest caret position.
   * Clicks left of / right of the score resolve to the first / last measure.
   */
  caretFromX(x: number): CaretPosition | null {
    if (this.layout.length === 0) {
      return null;
    }

    const found = this.layout.findIndex((measure) => x < measure.endX);
    const measureIndex = found === -1 ? this.layout.length - 1 : found;
    const { stopXs, ticks } = this.layout[measureIndex];

    let nearest = 0;
    stopXs.forEach((stopX, index) => {
      if (Math.abs(stopX - x) < Math.abs(stopXs[nearest] - x)) {
        nearest = index;
      }
    });
    return { measureIndex, voice: 0, tick: ticks[nearest] };
  }

  render(
    container: HTMLDivElement,
    score: Score,
    selectedIds: ReadonlySet<string> = new Set(),
    caret: CaretPosition | null = null,
  ): void {
    container.replaceChildren();
    this.layout = [];

    const measureCount = score.measures.length || 1;
    const totalWidth = STAVE_MARGIN_X * 2 + STAVE_WIDTH * measureCount;

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(Math.max(totalWidth, container.clientWidth || totalWidth), CANVAS_HEIGHT);
    const context = renderer.getContext();

    const notesById = new Map<string, StaveNote>();
    let x = STAVE_MARGIN_X;
    score.measures.forEach((measure, index) => {
      this.renderMeasure(context, measure, score, x, index === 0, selectedIds, notesById);
      x += STAVE_WIDTH;
    });

    // Ties go last: both notes have to be positioned first, and a tie may cross a barline.
    for (const link of tieLinks(score)) {
      const first = notesById.get(link.from.id);
      const last = notesById.get(link.to.id);
      if (first && last) {
        new StaveTie({ firstNote: first, lastNote: last, firstIndexes: [0], lastIndexes: [0] })
          .setContext(context)
          .draw();
      }
    }

    if (caret) {
      this.drawCaret(container, caret);
    }
  }

  private drawCaret(container: HTMLDivElement, caret: CaretPosition): void {
    const x = this.getCaretX(caret);
    const svg = container.querySelector('svg');
    if (x === null || !svg) {
      return;
    }

    const { topLineY, halfStepPx } = this.getStaffGeometry();
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

  private renderMeasure(
    context: ReturnType<Renderer['getContext']>,
    measure: Measure,
    score: Score,
    x: number,
    isFirst: boolean,
    selectedIds: ReadonlySet<string>,
    notesById: Map<string, StaveNote>,
  ): void {
    const stave = new Stave(x, STAVE_Y, STAVE_WIDTH);
    if (isFirst) {
      stave.addClef(score.clef);
      stave.addTimeSignature(`${score.timeSignature.numerator}/${score.timeSignature.denominator}`);
      if (score.keySignature !== 'C') {
        stave.addKeySignature(score.keySignature);
      }
    }
    stave.setContext(context).draw();

    const idByNote = new Map<StaveNote, string>();
    const tickables = measure.elements.map((el) => {
      const note = this.toStaveNote(el, score.clef);
      if (selectedIds.has(el.id)) {
        note.setStyle({ fillStyle: SELECTED_NOTE_COLOR, strokeStyle: SELECTED_NOTE_COLOR });
      }
      idByNote.set(note, el.id);
      notesById.set(el.id, note);
      return note;
    });
    if (tickables.length === 0) {
      this.layout.push({ startX: x, endX: x + STAVE_WIDTH, ticks: [0], stopXs: [stave.getNoteStartX()] });
      return;
    }

    const voice = new Voice({ numBeats: score.timeSignature.numerator, beatValue: score.timeSignature.denominator });
    voice.setStrict(false);
    voice.addTickables(tickables);

    new Formatter().joinVoices([voice]).format([voice], STAVE_WIDTH - 50);
    voice.draw(context, stave);

    for (const note of tickables) {
      note.getSVGElement()?.setAttribute(SCORE_ELEMENT_ID_ATTR, idByNote.get(note)!);
    }

    const stopXs = tickables.map(
      (note) => note.getAbsoluteX() - (note.getModifiersByType(Accidental.CATEGORY).length > 0 ? CARET_GAP_BEFORE_ACCIDENTAL : CARET_GAP_BEFORE_NOTE),
    );
    const lastNote = tickables[tickables.length - 1];
    stopXs.push(Math.min(lastNote.getAbsoluteX() + CARET_GAP_AFTER_LAST_NOTE, stave.getNoteEndX()));
    this.layout.push({ startX: x, endX: x + STAVE_WIDTH, ticks: elementBoundaries(measure), stopXs });
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
    const note = new StaveNote({ keys: [key], duration, clef });
    if (element.pitch.accidental) {
      note.addModifier(new Accidental(VEXFLOW_ACCIDENTAL[element.pitch.accidental]));
    }
    if (element.dotted) {
      Dot.buildAndAttach([note], { all: true });
    }
    return note;
  }
}
