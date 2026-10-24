import { Injectable, inject } from '@angular/core';
import MidiWriter from 'midi-writer-js';
import { Bravura } from 'vexflow-bravura-font';
import { elementTicks, TICKS_PER_WHOLE } from '../models/caret.util';
import { effectiveAccidental, findKeySignature } from '../models/key-signature.util';
import { toToneNoteName } from '../models/notation.util';
import { AccidentalValue, MeasureElement, NoteDuration, Score } from '../models/score.model';
import { allStaves, asDocument, Part, ScoreDocument } from '../models/score-document';
import { beamGroups, beamLevels } from '../models/beam.util';
import { tieLinks, tiedTargetIds } from '../models/tie.util';
import { triggerDownload } from '../utils/download.util';
import { NotationRendererService, SHEET_PAGE_HEIGHT, SheetOptions } from './notation-renderer.service';

/** Title printed on a sheet when the piece has no name of its own. */
export const DEFAULT_SHEET_TITLE = 'Partitura';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** PNG pixels per sheet px; the sheet is 1190 px wide, so the PNG is 2380 px wide. */
const PNG_SCALE = 2;
/** Sheet px → PDF page image px; 1190 × 2.5 ≈ 2975 px across 210 mm, about 360 dpi. */
const PDF_SCALE = 2.5;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** A title as a file name: characters Windows and macOS refuse are dropped. */
function fileNameOf(title: string): string {
  return title.replace(/[\\/:*?"<>|]+/g, '').trim() || DEFAULT_SHEET_TITLE;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Length of a run of elements in MusicXML divisions, as needed by <backup>. */
function divisionsOf(elements: readonly MeasureElement[]): number {
  return elements.reduce((sum, element) => sum + (elementTicks(element) * MUSICXML_DIVISIONS * 4) / TICKS_PER_WHOLE, 0);
}

/** A beam level of one note in MusicXML terms, e.g. { number: 1, state: 'begin' }. */
interface BeamMark {
  number: number;
  state: 'begin' | 'continue' | 'end' | 'forward hook' | 'backward hook';
}

/** What MusicXML needs to know about notes beyond their own data: ties and beams, by note id. */
interface NoteMarks {
  starts: Set<string>;
  stops: Set<string>;
  beams: Map<string, BeamMark[]>;
}

/**
 * Beam marks for every beamed note of a staff. Each level of a note continues, begins or ends a
 * beam depending on whether its neighbours carry that level too; a level shared with no
 * neighbour is a short hook.
 */
function beamMarks(score: Score): Map<string, BeamMark[]> {
  const marks = new Map<string, BeamMark[]>();
  for (const measure of score.measures) {
    for (const group of beamGroups(measure, score.timeSignature)) {
      group.forEach((note, index) => {
        const levels: BeamMark[] = [];
        for (let level = 1; level <= beamLevels(note); level++) {
          const before = index > 0 && beamLevels(group[index - 1]) >= level;
          const after = index < group.length - 1 && beamLevels(group[index + 1]) >= level;
          const state = before && after ? 'continue' : before ? 'end' : after ? 'begin' : index > 0 ? 'backward hook' : 'forward hook';
          levels.push({ number: level, state });
        }
        marks.set(note.id, levels);
      });
    }
  }
  return marks;
}

/** MusicXML "divisions" per quarter note; 32 keeps even a dotted 64th (3 divisions) an integer. */
const MUSICXML_DIVISIONS = 32;

const MUSICXML_TYPE: Record<NoteDuration, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  sixteenth: '16th',
  thirtysecond: '32nd',
  sixtyfourth: '64th',
};

const MUSICXML_CLEF: Record<Score['clef'], { sign: string; line: number }> = {
  treble: { sign: 'G', line: 2 },
  bass: { sign: 'F', line: 4 },
  alto: { sign: 'C', line: 3 },
  tenor: { sign: 'C', line: 4 },
};

const MUSICXML_ALTER: Record<Exclude<AccidentalValue, null>, number> = {
  sharp: 1,
  flat: -1,
  natural: 0,
};

/** MIDI token = imenilac trajanja (1=cela, 2=polovina, 4=četvrtina, 8=osminka, 16=šesnaestinka). */
const MIDI_DURATION_TOKEN: Record<NoteDuration, string> = {
  whole: '1',
  half: '2',
  quarter: '4',
  eighth: '8',
  sixteenth: '16',
  thirtysecond: '32',
  sixtyfourth: '64',
};

/**
 * Export internog Score modela u MusicXML, MIDI i PNG/SVG. Nema sopstveno stanje — sve metode su
 * čiste transformacije modela, ili tanki DOM-download wrapperi oko njih.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly notationRenderer = inject(NotationRendererService);

  toMusicXml(input: Score | ScoreDocument): string {
    const doc = asDocument(input);
    const refs = allStaves(doc);
    const reference = refs[0].staff.score;
    const key = findKeySignature(reference.keySignature) ?? { fifths: 0, mode: 'major' as const };

    // Ties are looked up by note id, and ids are unique across the whole document.
    const links = refs.flatMap((ref) => tieLinks(ref.staff.score));
    const beams = new Map<string, BeamMark[]>();
    for (const ref of refs) {
      beamMarks(ref.staff.score).forEach((marks, id) => beams.set(id, marks));
    }
    const ties: NoteMarks = { starts: new Set(links.map((link) => link.from.id)), stops: tiedTargetIds(links), beams };

    const partList = doc.parts.map(
      (part, index) => `    <score-part id="P${index + 1}"><part-name>${escapeXml(part.name)}</part-name></score-part>`,
    );
    const partsXml = doc.parts.map((part, index) => this.partToXml(part, index, key, ties));

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
      '<score-partwise version="4.0">',
      '  <part-list>',
      ...partList,
      '  </part-list>',
      ...partsXml,
      '</score-partwise>',
      '',
    ].join('\n');
  }

  /** One MIDI track per staff (the two hands of a piano play simultaneously, so they need two tracks). */
  toMidi(input: Score | ScoreDocument, bpm = 120): Uint8Array {
    const tracks = allStaves(asDocument(input)).map((ref) => this.staffToMidiTrack(ref.staff.score, ref.part.name, bpm));
    return new MidiWriter.Writer(tracks).buildFile();
  }

  private staffToMidiTrack(score: Score, name: string, bpm: number) {
    const track = new MidiWriter.Track();
    track.addTrackName(name);
    track.setTempo(bpm);
    track.setTimeSignature(score.timeSignature.numerator, score.timeSignature.denominator, 24, 8);

    const continuesPreviousNote = tiedTargetIds(tieLinks(score));
    let pendingWait: string[] = [];
    // A tied chain becomes ONE note event whose duration is the sum of its parts.
    let open: { pitch: string; durations: string[]; wait: string[] | undefined } | null = null;
    const flush = () => {
      if (open) {
        track.addEvent(
          new MidiWriter.NoteEvent({
            pitch: [open.pitch],
            duration: open.durations.length === 1 ? open.durations[0] : open.durations,
            wait: open.wait,
          }),
        );
        open = null;
      }
    };

    for (const measure of score.measures) {
      for (const element of measure.elements) {
        // midi-writer-js marks a dotted duration with a leading "d" ("d4" = dotted quarter).
        const token = (element.dotted ? 'd' : '') + MIDI_DURATION_TOKEN[element.duration];
        if (element.kind === 'rest') {
          flush();
          pendingWait.push(token);
          continue;
        }
        if (open && continuesPreviousNote.has(element.id)) {
          open.durations.push(token);
          continue;
        }
        flush();
        open = {
          pitch: toToneNoteName(element.pitch, score.keySignature),
          durations: [token],
          wait: pendingWait.length > 0 ? pendingWait : undefined,
        };
        pendingWait = [];
      }
    }
    flush();

    return track;
  }

  /** The piece as printed music (title, systems, text under the staves) on one long sheet. */
  toSvgString(score: Score | ScoreDocument, title = DEFAULT_SHEET_TITLE): string {
    const [svg] = this.renderSheetSvgs(score, { title });
    return new XMLSerializer().serializeToString(svg);
  }

  /** The same sheet as `toSvgString`, as a PNG at twice the sheet's resolution. */
  async toPngBlob(score: Score | ScoreDocument, title = DEFAULT_SHEET_TITLE): Promise<Blob> {
    const [svg] = this.renderSheetSvgs(score, { title });
    const canvas = await this.rasterize(svg, PNG_SCALE);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob nije vratio blob'))), 'image/png');
    });
  }

  /** The piece on A4 pages, ready to print. Each page is embedded as a high-resolution image. */
  async toPdfBlob(score: Score | ScoreDocument, title = DEFAULT_SHEET_TITLE): Promise<Blob> {
    const pages = this.renderSheetSvgs(score, { title, pageHeight: SHEET_PAGE_HEIGHT });
    // jsPDF is big and only needed here, so it is loaded on the first PDF export.
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    pdf.setProperties({ title });
    for (const [index, svg] of pages.entries()) {
      const canvas = await this.rasterize(svg, PDF_SCALE);
      if (index > 0) {
        pdf.addPage();
      }
      pdf.addImage(canvas, 'PNG', 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM, undefined, 'FAST');
    }
    return pdf.output('blob');
  }

  downloadMusicXml(score: Score | ScoreDocument, filename = 'partitura.musicxml'): void {
    this.downloadText(this.toMusicXml(score), filename, 'application/vnd.recordare.musicxml+xml');
  }

  downloadMidi(score: Score | ScoreDocument, bpm = 120, filename = 'partitura.mid'): void {
    triggerDownload(new Blob([this.toMidi(score, bpm) as BlobPart], { type: 'audio/midi' }), filename);
  }

  downloadSvg(score: Score | ScoreDocument, title = DEFAULT_SHEET_TITLE): void {
    this.downloadText(this.toSvgString(score, title), `${fileNameOf(title)}.svg`, 'image/svg+xml');
  }

  async downloadPng(score: Score | ScoreDocument, title = DEFAULT_SHEET_TITLE): Promise<void> {
    triggerDownload(await this.toPngBlob(score, title), `${fileNameOf(title)}.png`);
  }

  async downloadPdf(score: Score | ScoreDocument, title = DEFAULT_SHEET_TITLE): Promise<void> {
    triggerDownload(await this.toPdfBlob(score, title), `${fileNameOf(title)}.pdf`);
  }

  private partToXml(part: Part, partIndex: number, key: { fifths: number; mode: 'major' | 'minor' }, ties: NoteMarks): string {
    const staves = part.staves;
    const multiStaff = staves.length > 1;
    const reference = staves[0].score;
    const measureCount = Math.max(...staves.map((staff) => staff.score.measures.length));

    const measures = Array.from({ length: measureCount }, (_, index) => {
      const attributes = index === 0 ? this.attributesXml(part, key) : '';

      // Staves of one part share a measure: write one staff, step back, write the next.
      const staffXml = staves.map((staff, staffIndex) => {
        const elements = staff.score.measures[index]?.elements ?? [];
        const notes = elements
          .map((el) => this.elementToXml(el, reference.keySignature, ties, multiStaff ? staffIndex + 1 : undefined))
          .join('\n');
        const isLast = staffIndex === staves.length - 1;
        const stepBack = divisionsOf(elements);
        const backup = isLast || stepBack === 0 ? '' : `\n      <backup>\n        <duration>${stepBack}</duration>\n      </backup>`;
        return notes + backup;
      });

      return `    <measure number="${index + 1}">\n${attributes}${staffXml.join('\n')}\n    </measure>`;
    }).join('\n');

    return `  <part id="P${partIndex + 1}">\n${measures}\n  </part>`;
  }

  private attributesXml(part: Part, key: { fifths: number; mode: 'major' | 'minor' }): string {
    const { timeSignature } = part.staves[0].score;
    const multiStaff = part.staves.length > 1;
    const clefs = part.staves
      .map((staff, index) => {
        const clef = MUSICXML_CLEF[staff.score.clef];
        const number = multiStaff ? ` number="${index + 1}"` : '';
        return `        <clef${number}><sign>${clef.sign}</sign><line>${clef.line}</line></clef>`;
      })
      .join('\n');
    const staves = multiStaff ? `        <staves>${part.staves.length}</staves>\n` : '';

    return `      <attributes>
        <divisions>${MUSICXML_DIVISIONS}</divisions>
        <key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>
        <time><beats>${timeSignature.numerator}</beats><beat-type>${timeSignature.denominator}</beat-type></time>
${staves}${clefs}
      </attributes>\n`;
  }

  private elementToXml(element: MeasureElement, keySignature: string, ties: NoteMarks, staffNumber?: number): string {
    const duration = (elementTicks(element) * MUSICXML_DIVISIONS * 4) / TICKS_PER_WHOLE;
    const type = MUSICXML_TYPE[element.duration];
    const dotXml = element.dotted ? '\n        <dot/>' : '';
    // Only parts with several staves say which staff a note belongs to.
    const staffXml = staffNumber ? `\n        <staff>${staffNumber}</staff>` : '';

    if (element.kind === 'rest') {
      return `      <note>\n        <rest/>\n        <duration>${duration}</duration>\n        <type>${type}</type>${dotXml}${staffXml}\n      </note>`;
    }

    // <alter> is the sounding alteration (key signature included); <accidental> only what is written.
    const sounding = effectiveAccidental(element.pitch.accidental, keySignature, element.pitch.step);
    const alter = sounding ? MUSICXML_ALTER[sounding] : 0;
    const alterXml = alter !== 0 ? `\n          <alter>${alter}</alter>` : '';
    const accidentalXml = element.pitch.accidental
      ? `\n        <accidental>${element.pitch.accidental}</accidental>`
      : '';

    // <tie> is the sounding connection (before <type>); <tied> is the engraved arc (in <notations>).
    const stops = ties.stops.has(element.id);
    const starts = ties.starts.has(element.id);
    const beamXml = (ties.beams.get(element.id) ?? [])
      .map((beam) => `\n        <beam number="${beam.number}">${beam.state}</beam>`)
      .join('');
    const tieXml = (stops ? '\n        <tie type="stop"/>' : '') + (starts ? '\n        <tie type="start"/>' : '');
    const tiedXml =
      stops || starts
        ? `\n        <notations>${stops ? '<tied type="stop"/>' : ''}${starts ? '<tied type="start"/>' : ''}</notations>`
        : '';

    return [
      '      <note>',
      '        <pitch>',
      `          <step>${element.pitch.step}</step>${alterXml}`,
      `          <octave>${element.pitch.octave}</octave>`,
      '        </pitch>',
      `        <duration>${duration}</duration>${tieXml}`,
      `        <type>${type}</type>${dotXml}${accidentalXml}${staffXml}${beamXml}${tiedXml}`,
      '      </note>',
    ].join('\n');
  }

  /**
   * Sheet pages as standalone SVGs: white background, and the music font embedded, because an SVG
   * opened as a file or drawn as an image cannot see the fonts the page loaded.
   */
  private renderSheetSvgs(score: Score | ScoreDocument, options: SheetOptions): SVGSVGElement[] {
    const host = document.createElement('div');
    host.style.position = 'absolute';
    host.style.visibility = 'hidden';
    document.body.appendChild(host);
    try {
      return this.notationRenderer.renderSheet(host, score, options).map((svg) => {
        const style = document.createElementNS(SVG_NS, 'style');
        style.textContent = `@font-face { font-family: "Bravura"; src: url("${Bravura}") format("woff2"); }`;
        const background = document.createElementNS(SVG_NS, 'rect');
        background.setAttribute('width', '100%');
        background.setAttribute('height', '100%');
        background.setAttribute('fill', '#ffffff');
        svg.prepend(style, background);
        return svg;
      });
    } finally {
      host.remove();
    }
  }

  /** Draws an SVG onto a canvas `scale` times its size. */
  private async rasterize(svg: SVGSVGElement, scale: number): Promise<HTMLCanvasElement> {
    const width = Number(svg.getAttribute('width'));
    const height = Number(svg.getAttribute('height'));
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    try {
      const image = await this.loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Učitavanje SVG slike nije uspelo'));
      image.src = src;
    });
  }

  private downloadText(content: string, filename: string, mimeType: string): void {
    triggerDownload(new Blob([content], { type: mimeType }), filename);
  }
}
