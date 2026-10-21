import { Injectable, inject } from '@angular/core';
import MidiWriter from 'midi-writer-js';
import { elementTicks, TICKS_PER_WHOLE } from '../models/caret.util';
import { effectiveAccidental, findKeySignature } from '../models/key-signature.util';
import { toToneNoteName } from '../models/notation.util';
import { AccidentalValue, Measure, MeasureElement, NoteDuration, Score } from '../models/score.model';
import { tieLinks, tiedTargetIds } from '../models/tie.util';
import { triggerDownload } from '../utils/download.util';
import { NotationRendererService } from './notation-renderer.service';

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

  toMusicXml(score: Score): string {
    const clef = MUSICXML_CLEF[score.clef];
    const key = findKeySignature(score.keySignature) ?? { fifths: 0, mode: 'major' as const };
    const links = tieLinks(score);
    const ties: TieSets = { starts: new Set(links.map((link) => link.from.id)), stops: tiedTargetIds(links) };
    const measuresXml = score.measures
      .map((measure, index) => this.measureToXml(measure, score, index, clef, key, ties))
      .join('\n');

    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
      '<score-partwise version="4.0">',
      '  <part-list>',
      '    <score-part id="P1"><part-name>Clavis</part-name></score-part>',
      '  </part-list>',
      '  <part id="P1">',
      measuresXml,
      '  </part>',
      '</score-partwise>',
      '',
    ].join('\n');
  }

  toMidi(score: Score, bpm = 120): Uint8Array {
    const track = new MidiWriter.Track();
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

    return new MidiWriter.Writer(track).buildFile();
  }

  toSvgString(score: Score): string {
    const svg = this.renderOffscreenSvg(score);
    return new XMLSerializer().serializeToString(svg);
  }

  async toPngBlob(score: Score): Promise<Blob> {
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

  downloadMusicXml(score: Score, filename = 'partitura.musicxml'): void {
    this.downloadText(this.toMusicXml(score), filename, 'application/vnd.recordare.musicxml+xml');
  }

  downloadMidi(score: Score, bpm = 120, filename = 'partitura.mid'): void {
    triggerDownload(new Blob([this.toMidi(score, bpm) as BlobPart], { type: 'audio/midi' }), filename);
  }

  downloadSvg(score: Score, filename = 'partitura.svg'): void {
    this.downloadText(this.toSvgString(score), filename, 'image/svg+xml');
  }

  async downloadPng(score: Score, filename = 'partitura.png'): Promise<void> {
    triggerDownload(await this.toPngBlob(score), filename);
  }

  private measureToXml(
    measure: Measure,
    score: Score,
    index: number,
    clef: { sign: string; line: number },
    key: { fifths: number; mode: 'major' | 'minor' },
    ties: TieSets,
  ): string {
    const notesXml = measure.elements.map((el) => this.elementToXml(el, score.keySignature, ties)).join('\n');
    const attributes =
      index === 0
        ? `      <attributes>
        <divisions>${MUSICXML_DIVISIONS}</divisions>
        <key><fifths>${key.fifths}</fifths><mode>${key.mode}</mode></key>
        <time><beats>${score.timeSignature.numerator}</beats><beat-type>${score.timeSignature.denominator}</beat-type></time>
        <clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>
      </attributes>\n`
        : '';

    return `    <measure number="${index + 1}">\n${attributes}${notesXml}\n    </measure>`;
  }

  private elementToXml(element: MeasureElement, keySignature: string, ties: TieSets): string {
    const duration = (elementTicks(element) * MUSICXML_DIVISIONS * 4) / TICKS_PER_WHOLE;
    const type = MUSICXML_TYPE[element.duration];
    const dotXml = element.dotted ? '\n        <dot/>' : '';

    if (element.kind === 'rest') {
      return `      <note>\n        <rest/>\n        <duration>${duration}</duration>\n        <type>${type}</type>${dotXml}\n      </note>`;
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
      `        <type>${type}</type>${dotXml}${accidentalXml}${tiedXml}`,
      '      </note>',
    ].join('\n');
  }

  private renderOffscreenSvg(score: Score): SVGSVGElement {
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
