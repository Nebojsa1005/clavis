import { Injectable, inject } from '@angular/core';
import MidiWriter from 'midi-writer-js';
import { elementTicks, TICKS_PER_WHOLE } from '../models/caret.util';
import { effectiveAccidental, findKeySignature } from '../models/key-signature.util';
import { toToneNoteName } from '../models/notation.util';
import { AccidentalValue, MeasureElement, NoteDuration, Score } from '../models/score.model';
import { allStaves, asDocument, Part, ScoreDocument } from '../models/score-document';
import { tieLinks, tiedTargetIds } from '../models/tie.util';
import { triggerDownload } from '../utils/download.util';
import { NotationRendererService } from './notation-renderer.service';

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Length of a run of elements in MusicXML divisions, as needed by <backup>. */
function divisionsOf(elements: readonly MeasureElement[]): number {
  return elements.reduce((sum, element) => sum + (elementTicks(element) * MUSICXML_DIVISIONS * 4) / TICKS_PER_WHOLE, 0);
}

/** Ids of notes where a tie starts / stops, for MusicXML. */
interface TieSets {
  starts: Set<string>;
  stops: Set<string>;
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
    const ties: TieSets = { starts: new Set(links.map((link) => link.from.id)), stops: tiedTargetIds(links) };

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

  toSvgString(score: Score | ScoreDocument): string {
    const svg = this.renderOffscreenSvg(score);
    return new XMLSerializer().serializeToString(svg);
  }

  async toPngBlob(score: Score | ScoreDocument): Promise<Blob> {
    const svg = this.renderOffscreenSvg(score);
    const width = Number(svg.getAttribute('width'));
    const height = Number(svg.getAttribute('height'));
    const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    try {
      const image = await this.loadImage(url);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob nije vratio blob'))), 'image/png');
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  downloadMusicXml(score: Score | ScoreDocument, filename = 'partitura.musicxml'): void {
    this.downloadText(this.toMusicXml(score), filename, 'application/vnd.recordare.musicxml+xml');
  }

  downloadMidi(score: Score | ScoreDocument, bpm = 120, filename = 'partitura.mid'): void {
    triggerDownload(new Blob([this.toMidi(score, bpm) as BlobPart], { type: 'audio/midi' }), filename);
  }

  downloadSvg(score: Score | ScoreDocument, filename = 'partitura.svg'): void {
    this.downloadText(this.toSvgString(score), filename, 'image/svg+xml');
  }

  async downloadPng(score: Score | ScoreDocument, filename = 'partitura.png'): Promise<void> {
    triggerDownload(await this.toPngBlob(score), filename);
  }

  private partToXml(part: Part, partIndex: number, key: { fifths: number; mode: 'major' | 'minor' }, ties: TieSets): string {
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

  private elementToXml(element: MeasureElement, keySignature: string, ties: TieSets, staffNumber?: number): string {
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
      `        <type>${type}</type>${dotXml}${accidentalXml}${staffXml}${tiedXml}`,
      '      </note>',
    ].join('\n');
  }

  private renderOffscreenSvg(score: Score | ScoreDocument): SVGSVGElement {
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.visibility = 'hidden';
    document.body.appendChild(container);
    try {
      this.notationRenderer.render(container, score);
      const svg = container.querySelector('svg');
      if (!svg) {
        throw new Error('VexFlow render nije proizveo <svg>');
      }
      return svg as SVGSVGElement;
    } finally {
      container.remove();
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
