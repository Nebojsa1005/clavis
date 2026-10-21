import { Injectable } from '@angular/core';
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow';
import { Measure, MeasureElement, NoteDuration, Score } from '../models/score.model';

const VEXFLOW_DURATION: Record<NoteDuration, string> = {
  whole: 'w',
  half: 'h',
  quarter: 'q',
  eighth: '8',
  sixteenth: '16',
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

export interface StaffGeometry {
  topLineY: number;
  halfStepPx: number;
}

/** Wrapper oko VexFlow-a: crta interni Score model, bez sopstvenog stanja. */
@Injectable({ providedIn: 'root' })
export class NotationRendererService {
  private cachedGeometry: StaffGeometry | null = null;

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

  render(container: HTMLDivElement, score: Score, selectedId: string | null = null): void {
    container.replaceChildren();

    const measureCount = score.measures.length || 1;
    const totalWidth = STAVE_MARGIN_X * 2 + STAVE_WIDTH * measureCount;

    const renderer = new Renderer(container, Renderer.Backends.SVG);
    renderer.resize(Math.max(totalWidth, container.clientWidth || totalWidth), CANVAS_HEIGHT);
    const context = renderer.getContext();

    let x = STAVE_MARGIN_X;
    score.measures.forEach((measure, index) => {
      this.renderMeasure(context, measure, score, x, index === 0, selectedId);
      x += STAVE_WIDTH;
    });
  }

  private renderMeasure(
    context: ReturnType<Renderer['getContext']>,
    measure: Measure,
    score: Score,
    x: number,
    isFirst: boolean,
    selectedId: string | null,
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
      if (el.id === selectedId) {
        note.setStyle({ fillStyle: SELECTED_NOTE_COLOR, strokeStyle: SELECTED_NOTE_COLOR });
      }
      idByNote.set(note, el.id);
      return note;
    });
    if (tickables.length === 0) {
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
  }

  private toStaveNote(element: MeasureElement, clef: Score['clef']): StaveNote {
    const duration = VEXFLOW_DURATION[element.duration];

    if (element.kind === 'rest') {
      return new StaveNote({ keys: ['b/4'], duration: `${duration}r`, clef });
    }

    const key = `${element.pitch.step.toLowerCase()}/${element.pitch.octave}`;
    const note = new StaveNote({ keys: [key], duration, clef });
    if (element.pitch.accidental) {
      note.addModifier(new Accidental(VEXFLOW_ACCIDENTAL[element.pitch.accidental]));
    }
    return note;
  }
}
