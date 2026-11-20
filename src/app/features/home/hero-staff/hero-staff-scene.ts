import { animate, createDrawable, createTimeline, remove, stagger, type Timeline } from 'animejs';
import { G_CLEF, GLYPH_UNITS_PER_STAFF_SPACE, NOTEHEAD_BLACK } from '../../../shared/smufl-glyphs';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Staff positions: 0 = bottom line (E4 in treble), each step is a line or a space. */
export const PITCH_MIN = -5;
export const PITCH_MAX = 13;

/** Ode to Joy, three bars of quarter notes: E E F G | G F E D | C C D E. */
export const OPENING_MELODY = [0, 0, 1, 2, 2, 1, 0, -1, -2, -2, -1, 0];

const NOTES_PER_BAR = 4;
const MIDDLE_LINE = 4;
const LEDGER_BELOW = -2;
const LEDGER_ABOVE = 10;
/** Width of the content column the staff's clef lines up with (matches the page container). */
const CONTENT_MAX_WIDTH = 1200;

export interface StaffGeometry {
  width: number;
  height: number;
  /** One staff space in px. */
  space: number;
  /** Glyph unit → px. */
  scale: number;
  left: number;
  right: number;
  clefEnd: number;
  firstNoteX: number;
  slot: number;
  barGap: number;
  top: number;
  bottom: number;
}

export function staffGeometry(width: number): StaffGeometry {
  const space = width < 640 ? 9 : width < 1024 ? 11 : 13;
  const gutter = width < 640 ? 16 : width < 1024 ? 24 : 32;
  const left = width > CONTENT_MAX_WIDTH ? (width - CONTENT_MAX_WIDTH) / 2 + gutter : gutter;
  const scale = space / GLYPH_UNITS_PER_STAFF_SPACE;
  const top = space * 5;
  const bottom = top + space * 4;
  const clefEnd = left + G_CLEF.width * scale;
  return {
    width,
    height: bottom + space * 5,
    space,
    scale,
    left,
    right: width - left,
    clefEnd,
    firstNoteX: clefEnd + space * 3,
    slot: space * 3.6,
    barGap: space * 1.4,
    top,
    bottom,
  };
}

export function noteX(g: StaffGeometry, index: number): number {
  return g.firstNoteX + index * g.slot + Math.floor(index / NOTES_PER_BAR) * g.barGap;
}

export function pitchY(g: StaffGeometry, pitch: number): number {
  return g.bottom - (pitch * g.space) / 2;
}

/** Nearest staff position under a y coordinate, clamped to the playable range. */
export function pitchAt(g: StaffGeometry, y: number): number {
  const pitch = Math.round((g.bottom - y) / (g.space / 2));
  return Math.min(PITCH_MAX, Math.max(PITCH_MIN, pitch));
}

/** How many opening notes fit: whole bars only, leaving room for the caret and one more note. */
export function openingNoteCount(g: StaffGeometry): number {
  for (let bars = OPENING_MELODY.length / NOTES_PER_BAR; bars > 1; bars--) {
    if (noteX(g, bars * NOTES_PER_BAR) + g.slot <= g.right) {
      return bars * NOTES_PER_BAR;
    }
  }
  return NOTES_PER_BAR;
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, String(value));
  }
  return el;
}

interface PlacedNote {
  index: number;
  pitch: number;
  /** Outer group: follows the scroll wave. Inner `body` is what anime.js animates. */
  el: SVGGElement;
  body: SVGGElement;
}

export interface HeroStaffOptions {
  reducedMotion: boolean;
}

/**
 * A live, self-writing staff for the landing page hero.
 *
 * Draws itself on start (lines → clef → notes → caret), then behaves like a tiny version of the
 * editor: a ghost note follows the pointer's pitch at the caret, a click drops a note there and the
 * caret moves on. Scrolling makes the lines ripple like a sound wave. Pure DOM + anime.js, no Angular.
 */
export class HeroStaffScene {
  private readonly root: SVGSVGElement;
  private g: StaffGeometry;
  private notes: PlacedNote[] = [];
  private nextIndex = 0;
  private offset = 0;
  private ghostPitch = 2;
  private ghostVisible = false;

  private lines: SVGPathElement[] = [];
  private music!: SVGGElement;
  private caret!: SVGLineElement;
  private ghost!: SVGGElement;
  private barlines = new Map<number, SVGLineElement>();
  private intro: Timeline | null = null;

  private waveAmp = 0;
  private waveTarget = 0;
  private wavePhase = 0;
  private lastScroll: { y: number; t: number } | null = null;
  private frame = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: HeroStaffOptions,
  ) {
    this.root = svg('svg', { class: 'hs-svg', 'aria-hidden': 'true', focusable: 'false' });
    this.host.appendChild(this.root);
    this.g = staffGeometry(this.host.clientWidth || 1024);
  }

  get geometry(): StaffGeometry {
    return this.g;
  }

  get noteCount(): number {
    return this.notes.length;
  }

  /** Builds the staff and plays the opening sequence (or shows the end state with reduced motion). */
  start(): void {
    const count = openingNoteCount(this.g);
    this.notes = [];
    this.nextIndex = 0;
    this.build();
    for (const pitch of OPENING_MELODY.slice(0, count)) {
      this.addNote(pitch, false);
    }
    this.positionCaret(false);

    if (this.options.reducedMotion) {
      this.caret.style.opacity = '1';
      return;
    }
    this.playIntro();
  }

  /** Re-lays everything out for a new width, keeping the notes that were written. */
  resize(width: number): void {
    if (Math.abs(width - this.g.width) < 1) {
      return;
    }
    this.intro?.complete();
    this.g = staffGeometry(width);
    const placed = this.notes.map((note) => note.pitch);
    const firstIndex = this.notes[0]?.index ?? 0;
    this.offset = 0;
    this.build();
    this.notes = [];
    this.nextIndex = firstIndex;
    for (const pitch of placed) {
      this.addNote(pitch, false);
    }
    this.caret.style.opacity = '1';
    this.scrollIntoView(false);
    this.positionCaret(false);
  }

  /** Shows the ghost note at the pitch under the pointer. */
  hover(clientY: number): void {
    this.ghostPitch = pitchAt(this.g, clientY - this.root.getBoundingClientRect().top);
    this.ghostVisible = true;
    this.drawGhost();
  }

  leave(): void {
    this.ghostVisible = false;
    this.drawGhost();
  }

  /** Keyboard counterpart of hover: moves the ghost one line/space. */
  nudge(delta: number): void {
    this.ghostPitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, this.ghostPitch + delta));
    this.ghostVisible = true;
    this.drawGhost();
  }

  /** Writes a note at the caret — at the pointer's pitch, or the ghost's for keyboard use. */
  place(clientY?: number): void {
    if (clientY !== undefined) {
      this.ghostPitch = pitchAt(this.g, clientY - this.root.getBoundingClientRect().top);
    }
    this.intro?.complete();
    this.addNote(this.ghostPitch, !this.options.reducedMotion);
    this.scrollIntoView(!this.options.reducedMotion);
    this.positionCaret(!this.options.reducedMotion);
    this.drawGhost();
  }

  removeLast(): void {
    const last = this.notes.pop();
    if (!last) {
      return;
    }
    last.el.remove();
    this.nextIndex = last.index;
    const bar = Math.floor(last.index / NOTES_PER_BAR);
    this.barlines.get(bar)?.remove();
    this.barlines.delete(bar);
    this.positionCaret(!this.options.reducedMotion);
    this.drawGhost();
  }

  /** Feed window scroll here; fast scrolling makes the staff lines ripple. */
  scrolled(scrollY: number, time: number): void {
    if (this.options.reducedMotion) {
      return;
    }
    if (this.lastScroll && time > this.lastScroll.t) {
      const velocity = Math.abs(scrollY - this.lastScroll.y) / (time - this.lastScroll.t);
      this.waveTarget = Math.min(this.g.space * 0.45, Math.max(this.waveTarget, velocity * this.g.space * 0.3));
    }
    this.wavePhase = scrollY * 0.012;
    this.lastScroll = { y: scrollY, t: time };
    this.requestWaveFrame();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.intro?.revert();
    remove(this.root.querySelectorAll('*'));
    this.root.remove();
  }

  private build(): void {
    const g = this.g;
    this.root.replaceChildren();
    this.root.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    this.root.setAttribute('width', String(g.width));
    this.root.setAttribute('height', String(g.height));
    this.barlines.clear();

    this.music = svg('g', { class: 'hs-music' });
    this.caret = svg('line', { class: 'hs-caret', 'stroke-width': Math.max(1.5, g.space * 0.16) });
    this.caret.style.opacity = '0';
    this.ghost = svg('g', { class: 'hs-ghost' });
    this.music.append(this.ghost, this.caret);
    this.music.style.transform = `translateX(${-this.offset}px)`;

    // Notes slide under the clef when the staff scrolls; this fade keeps the clef readable.
    const fadeId = `hs-fade-${Math.random().toString(36).slice(2, 8)}`;
    const defs = svg('defs');
    const gradient = svg('linearGradient', { id: fadeId, x1: 0, x2: g.clefEnd + g.space * 2.5, y1: 0, y2: 0, gradientUnits: 'userSpaceOnUse' });
    const solidUntil = (g.clefEnd + g.space * 0.8) / (g.clefEnd + g.space * 2.5);
    gradient.append(
      svg('stop', { offset: 0, class: 'hs-fade-stop' }),
      svg('stop', { offset: solidUntil, class: 'hs-fade-stop' }),
      svg('stop', { offset: 1, class: 'hs-fade-stop', 'stop-opacity': 0 }),
    );
    defs.append(gradient);
    const fade = svg('rect', { x: 0, y: 0, width: g.clefEnd + g.space * 2.5, height: g.height, fill: `url(#${fadeId})` });

    const lineWidth = Math.max(1, g.space * 0.11);
    this.lines = Array.from({ length: 5 }, (_, i) =>
      svg('path', { class: 'hs-line', d: this.linePath(i), fill: 'none', 'stroke-width': lineWidth }),
    );
    const staffLines = svg('g', { class: 'hs-lines' });
    staffLines.append(...this.lines);

    const clef = svg('g', { class: 'hs-clef' });
    clef.append(
      svg('path', {
        d: G_CLEF.path,
        transform: `translate(${g.left} ${pitchY(g, 2)}) scale(${g.scale} ${-g.scale})`,
      }),
    );

    this.root.append(defs, this.music, fade, staffLines, clef);
  }

  private playIntro(): void {
    const g = this.g;
    const clef = this.root.querySelector<SVGGElement>('.hs-clef')!;
    const bodies = this.notes.map((note) => note.body);
    const bars = [...this.barlines.values()];
    const noteStagger = 120;
    const lines = createDrawable(this.lines, 0, 0);
    const barDrawables = createDrawable(bars, 0, 0);
    clef.style.opacity = '0';

    this.intro = createTimeline({ defaults: { ease: 'inOutQuad' } })
      .add(lines, { draw: ['0 0', '0 1'], duration: 1100, delay: stagger(90) })
      .add(clef, { opacity: [0, 1], scale: [0.9, 1], duration: 700, ease: 'outExpo' }, '-=800')
      .label('notes', '-=350')
      .add(
        bodies,
        { y: [-g.space * 3, 0], opacity: [0, 1], duration: 560, ease: 'outBack(1.8)', delay: stagger(noteStagger) },
        'notes',
      )
      .add(
        barDrawables,
        { draw: ['0 0', '0 1'], duration: 260, delay: stagger(NOTES_PER_BAR * noteStagger, { start: NOTES_PER_BAR * noteStagger - 40 }) },
        'notes',
      )
      .add(this.caret, { opacity: [0, 1], duration: 240 }, '+=60');
  }

  private addNote(pitch: number, animated: boolean): void {
    const index = this.nextIndex++;
    const el = svg('g', { class: 'hs-note' });
    const body = svg('g', { class: 'hs-note-body' });
    body.append(...this.noteShapes(noteX(this.g, index), pitch));
    el.append(body);
    this.music.insertBefore(el, this.ghost);
    this.notes.push({ index, pitch, el, body });

    if ((index + 1) % NOTES_PER_BAR === 0) {
      this.addBarline(Math.floor(index / NOTES_PER_BAR), animated);
    }
    if (animated) {
      animate(body, { y: [-this.g.space * 1.6, 0], opacity: [0, 1], duration: 340, ease: 'outBack(2)' });
    } else if (!this.options.reducedMotion && this.intro === null) {
      // Opening notes start hidden; the intro timeline brings them in.
      body.style.opacity = '0';
    }
  }

  private addBarline(bar: number, animated: boolean): void {
    const g = this.g;
    const lastInBar = bar * NOTES_PER_BAR + NOTES_PER_BAR - 1;
    const x = noteX(g, lastInBar) + (g.slot + g.barGap) / 2;
    const line = svg('line', {
      class: 'hs-barline',
      x1: x,
      x2: x,
      y1: g.top,
      y2: g.bottom,
      'stroke-width': Math.max(1, g.space * 0.12),
    });
    this.music.insertBefore(line, this.ghost);
    this.barlines.set(bar, line);
    if (animated) {
      animate(createDrawable(line), { draw: ['0 0', '0 1'], duration: 220, ease: 'outQuad' });
    }
  }

  /** Notehead, stem and any ledger lines for one quarter note centred on x. */
  private noteShapes(x: number, pitch: number): SVGElement[] {
    const g = this.g;
    const y = pitchY(g, pitch);
    const headWidth = NOTEHEAD_BLACK.width * g.scale;
    const stemWidth = Math.max(1, g.space * 0.12);
    const stemUp = pitch < MIDDLE_LINE;
    const stemX = stemUp ? x + headWidth / 2 - stemWidth / 2 : x - headWidth / 2 + stemWidth / 2;
    const shapes: SVGElement[] = [];

    const ledgerHalf = headWidth * 0.85;
    const ledgerAttrs = (ly: number) => ({ class: 'hs-ledger', x1: x - ledgerHalf, x2: x + ledgerHalf, y1: ly, y2: ly, 'stroke-width': Math.max(1, g.space * 0.11) });
    for (let p = LEDGER_BELOW; p >= pitch; p -= 2) {
      shapes.push(svg('line', ledgerAttrs(pitchY(g, p))));
    }
    for (let p = LEDGER_ABOVE; p <= pitch; p += 2) {
      shapes.push(svg('line', ledgerAttrs(pitchY(g, p))));
    }

    shapes.push(
      svg('path', {
        class: 'hs-head',
        d: NOTEHEAD_BLACK.path,
        transform: `translate(${x - headWidth / 2} ${y}) scale(${g.scale} ${-g.scale})`,
      }),
      svg('line', {
        class: 'hs-stem',
        x1: stemX,
        x2: stemX,
        y1: y + (stemUp ? -0.2 : 0.2) * g.space,
        y2: y + (stemUp ? -3.5 : 3.5) * g.space,
        'stroke-width': stemWidth,
      }),
    );
    return shapes;
  }

  private positionCaret(animated: boolean): void {
    const g = this.g;
    const x = noteX(g, this.nextIndex) - NOTEHEAD_BLACK.width * g.scale * 1.1;
    this.caret.setAttribute('y1', String(g.top - g.space));
    this.caret.setAttribute('y2', String(g.bottom + g.space));
    this.caret.setAttribute('x1', '0');
    this.caret.setAttribute('x2', '0');
    if (animated) {
      animate(this.caret, { x, duration: 180, ease: 'outQuad' });
    } else {
      this.caret.style.transform = `translateX(${x}px)`;
    }
  }

  private drawGhost(): void {
    this.ghost.replaceChildren();
    if (!this.ghostVisible) {
      return;
    }
    this.ghost.append(...this.noteShapes(noteX(this.g, this.nextIndex), this.ghostPitch));
  }

  /** Slides the music left once the caret would run past the right edge, then drops what scrolled away. */
  private scrollIntoView(animated: boolean): void {
    const g = this.g;
    const needed = noteX(g, this.nextIndex) + g.slot - g.right;
    if (needed <= this.offset) {
      return;
    }
    this.offset = needed;
    if (animated) {
      animate(this.music, { x: -this.offset, duration: 420, ease: 'outExpo' });
    } else {
      this.music.style.transform = `translateX(${-this.offset}px)`;
    }

    const hiddenBefore = this.offset + g.clefEnd - g.slot * 2;
    while (this.notes.length > 0 && noteX(g, this.notes[0].index) < hiddenBefore) {
      this.notes.shift()!.el.remove();
    }
    for (const [bar, line] of this.barlines) {
      if (noteX(g, bar * NOTES_PER_BAR + NOTES_PER_BAR - 1) < hiddenBefore) {
        line.remove();
        this.barlines.delete(bar);
      }
    }
  }

  private linePath(line: number): string {
    const g = this.g;
    const y = g.top + line * g.space;
    if (this.waveAmp < 0.05) {
      return `M0 ${y}H${g.width}`;
    }
    let d = `M0 ${y + this.waveAt(0, line)}`;
    for (let x = 12; x < g.width + 12; x += 12) {
      d += `L${x} ${(y + this.waveAt(x, line)).toFixed(2)}`;
    }
    return d;
  }

  /** Vertical ripple at screen x; flat over the clef so the clef never detaches from its lines. */
  private waveAt(x: number, line: number): number {
    const g = this.g;
    const ramp = Math.min(1, Math.max(0, (x - g.clefEnd) / (g.space * 8)));
    return this.waveAmp * ramp * Math.sin(x * 0.011 + this.wavePhase + line * 0.45);
  }

  private requestWaveFrame(): void {
    if (this.frame === 0) {
      this.frame = requestAnimationFrame(() => this.waveFrame());
    }
  }

  private waveFrame(): void {
    this.frame = 0;
    this.waveAmp += (this.waveTarget - this.waveAmp) * 0.2;
    this.waveTarget *= 0.9;

    this.lines.forEach((line, i) => line.setAttribute('d', this.linePath(i)));
    for (const note of this.notes) {
      const dy = this.waveAt(noteX(this.g, note.index) - this.offset, 2);
      note.el.setAttribute('transform', `translate(0 ${dy.toFixed(2)})`);
    }

    if (this.waveAmp > 0.05 || this.waveTarget > 0.05) {
      this.requestWaveFrame();
    } else {
      this.waveAmp = 0;
      this.lines.forEach((line, i) => line.setAttribute('d', this.linePath(i)));
      this.notes.forEach((note) => note.el.removeAttribute('transform'));
    }
  }
}
