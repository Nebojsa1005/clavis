import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, createRest } from '../models/score.model';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    service = TestBed.inject(ExportService);
  });

  describe('toMusicXml', () => {
    it('includes part/measure/attributes scaffolding and a plain note', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<score-partwise version="4.0">');
      expect(xml).toContain('<divisions>4</divisions>');
      expect(xml).toContain('<time><beats>4</beats><beat-type>4</beat-type></time>');
      expect(xml).toContain('<clef><sign>G</sign><line>2</line></clef>');
      expect(xml).toContain('<step>C</step>');
      expect(xml).toContain('<octave>4</octave>');
      expect(xml).toContain('<duration>4</duration>');
      expect(xml).toContain('<type>quarter</type>');
    });

    it('writes the clef sign and line for every clef', () => {
      const expected = {
        treble: '<clef><sign>G</sign><line>2</line></clef>',
        bass: '<clef><sign>F</sign><line>4</line></clef>',
        alto: '<clef><sign>C</sign><line>3</line></clef>',
        tenor: '<clef><sign>C</sign><line>4</line></clef>',
      } as const;

      for (const [clef, xml] of Object.entries(expected)) {
        const score = { ...createEmptyScore(), clef: clef as keyof typeof expected };
        expect(service.toMusicXml(score)).withContext(clef).toContain(xml);
      }
    });

    it('writes the key as fifths and mode', () => {
      expect(service.toMusicXml({ ...createEmptyScore(), keySignature: 'D' })).toContain(
        '<key><fifths>2</fifths><mode>major</mode></key>',
      );
      expect(service.toMusicXml({ ...createEmptyScore(), keySignature: 'Cm' })).toContain(
        '<key><fifths>-3</fifths><mode>minor</mode></key>',
      );
    });

    it('writes the key-implied alteration without a written accidental', () => {
      const score = { ...createEmptyScore(), keySignature: 'G' };
      score.measures[0].elements.push(createNote('F', 4, 'quarter'));

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<alter>1</alter>');
      expect(xml).not.toContain('<accidental>');
    });

    it('encodes accidentals with both <alter> and <accidental>', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('F', 4, 'quarter', 'sharp'));

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<alter>1</alter>');
      expect(xml).toContain('<accidental>sharp</accidental>');
    });

    it('renders rests without a <pitch>', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createRest('eighth'));

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<rest/>');
      expect(xml).not.toContain('<pitch>');
    });

    it('uses F/line 4 for bass clef', () => {
      const score = createEmptyScore('bass');

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<clef><sign>F</sign><line>4</line></clef>');
    });
  });

  describe('toMidi', () => {
    it('produces a non-empty binary MIDI file with the correct header', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      const bytes = service.toMidi(score);

      expect(bytes.length).toBeGreaterThan(0);
      // "MThd" header chunk id
      expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
    });

    it('does not throw for a score that starts with a rest', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createRest('quarter'), createNote('D', 4, 'quarter'));

      expect(() => service.toMidi(score)).not.toThrow();
    });
  });

  describe('toSvgString / toPngBlob', () => {
    it('renders an SVG string containing the notated note', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      const svgString = service.toSvgString(score);

      expect(svgString).toContain('<svg');
      expect(svgString).toContain('vf-stavenote');
    });

    it('produces a PNG blob', async () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      const blob = await service.toPngBlob(score);

      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    });
  });
});
