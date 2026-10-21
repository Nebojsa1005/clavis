import { Injectable, inject } from '@angular/core';
import MidiWriter from 'midi-writer-js';
import { toToneNoteName } from '../models/notation.util';
import { AccidentalValue, Measure, MeasureElement, NoteDuration, Score } from '../models/score.model';
import { triggerDownload } from '../utils/download.util';
import { NotationRendererService } from './notation-renderer.service';

/** XML-ski broj "divisions" po četvrtinki; mora deliti sve naše trajanja na cele brojeve. */
const MUSICXML_DIVISIONS = 4;

const MUSICXML_DURATION_UNITS: Record<NoteDuration, number> = {
  whole: 16,
  half: 8,
  quarter: 4,
  eighth: 2,
  sixteenth: 1,
};

const MUSICXML_TYPE: Record<NoteDuration, string> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  sixteenth: '16th',
};

const MUSICXML_CLEF: Record<Score['clef'], { sign: string; line: number }> = {
  treble: { sign: 'G', line: 2 },
  bass: { sign: 'F', line: 4 },
  alto: { sign: 'C', line: 3 },
  tenor: { sign: 'C', line: 4 },
};

const MUSICXML_FIFTHS_BY_KEY: Record<string, number> = {
  C: 0,
  G: 1,
  D: 2,
  A: 3,
  E: 4,
  B: 5,
  'F#': 6,
  'C#': 7,
  F: -1,
  Bb: -2,
  Eb: -3,
  Ab: -4,
  Db: -5,
  Gb: -6,
  Cb: -7,
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
    const fifths = MUSICXML_FIFTHS_BY_KEY[score.keySignature] ?? 0;
    const measuresXml = score.measures
      .map((measure, index) => this.measureToXml(measure, score, index, clef, fifths))
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

    let pendingWait: string[] = [];
    for (const measure of score.measures) {
      for (const element of measure.elements) {
        const token = MIDI_DURATION_TOKEN[element.duration];
        if (element.kind === 'rest') {
          pendingWait.push(token);
          continue;
        }
        track.addEvent(
          new MidiWriter.NoteEvent({
            pitch: [toToneNoteName(element.pitch)],
            duration: token,
            wait: pendingWait.length > 0 ? pendingWait : undefined,
          }),
        );
        pendingWait = [];
      }
    }

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
    fifths: number,
  ): string {
    const notesXml = measure.elements.map((el) => this.elementToXml(el)).join('\n');
    const attributes =
      index === 0
        ? `      <attributes>
        <divisions>${MUSICXML_DIVISIONS}</divisions>
        <key><fifths>${fifths}</fifths></key>
        <time><beats>${score.timeSignature.numerator}</beats><beat-type>${score.timeSignature.denominator}</beat-type></time>
        <clef><sign>${clef.sign}</sign><line>${clef.line}</line></clef>
      </attributes>\n`
        : '';

    return `    <measure number="${index + 1}">\n${attributes}${notesXml}\n    </measure>`;
  }

  private elementToXml(element: MeasureElement): string {
    const duration = MUSICXML_DURATION_UNITS[element.duration];
    const type = MUSICXML_TYPE[element.duration];

    if (element.kind === 'rest') {
      return `      <note>\n        <rest/>\n        <duration>${duration}</duration>\n        <type>${type}</type>\n      </note>`;
    }

    const alter = element.pitch.accidental ? MUSICXML_ALTER[element.pitch.accidental] : 0;
    const alterXml = alter !== 0 ? `\n          <alter>${alter}</alter>` : '';
    const accidentalXml = element.pitch.accidental
      ? `\n        <accidental>${element.pitch.accidental}</accidental>`
      : '';

    return [
      '      <note>',
      '        <pitch>',
      `          <step>${element.pitch.step}</step>${alterXml}`,
      `          <octave>${element.pitch.octave}</octave>`,
      '        </pitch>',
      `        <duration>${duration}</duration>`,
      `        <type>${type}</type>${accidentalXml}`,
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
