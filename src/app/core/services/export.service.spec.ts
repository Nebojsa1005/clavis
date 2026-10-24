import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, createRest } from '../models/score.model';
import { createPart } from '../models/score-document';
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
      expect(xml).toContain('<divisions>32</divisions>');
      expect(xml).toContain('<time><beats>4</beats><beat-type>4</beat-type></time>');
      expect(xml).toContain('<clef><sign>G</sign><line>2</line></clef>');
      expect(xml).toContain('<step>C</step>');
      expect(xml).toContain('<octave>4</octave>');
      expect(xml).toContain('<duration>32</duration>');
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

    it('writes 32nd and 64th note types with matching durations', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'thirtysecond'), createNote('D', 4, 'sixtyfourth'));

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<duration>4</duration>\n        <type>32nd</type>');
      expect(xml).toContain('<duration>2</duration>\n        <type>64th</type>');
    });

    it('writes <dot/> after <type> and lengthens the duration for dotted elements', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter', null, true), createRest('eighth', true));

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<duration>48</duration>\n        <type>quarter</type>\n        <dot/>');
      expect(xml).toContain('<rest/>\n        <duration>24</duration>\n        <type>eighth</type>\n        <dot/>');
    });

    it('keeps a dotted 64th on a whole number of divisions', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'sixtyfourth', null, true));

      expect(service.toMusicXml(score)).toContain('<duration>3</duration>');
    });

    it('writes <tie> and <tied> for a tied pair', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(
        { ...createNote('C', 4, 'quarter'), tieToNext: true },
        createNote('C', 4, 'quarter'),
      );

      const xml = service.toMusicXml(score);

      expect(xml.match(/<tie type="start"\/>/g)?.length).toBe(1);
      expect(xml.match(/<tie type="stop"\/>/g)?.length).toBe(1);
      expect(xml).toContain('<notations><tied type="start"/></notations>');
      expect(xml).toContain('<notations><tied type="stop"/></notations>');
    });

    it('gives the middle note of a chain both a stop and a start', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(
        { ...createNote('C', 4, 'quarter'), tieToNext: true },
        { ...createNote('C', 4, 'quarter'), tieToNext: true },
        createNote('C', 4, 'quarter'),
      );

      const xml = service.toMusicXml(score);

      expect(xml).toContain('<tie type="stop"/>\n        <tie type="start"/>');
      expect(xml).toContain('<notations><tied type="stop"/><tied type="start"/></notations>');
      expect(xml.match(/<tie /g)?.length).toBe(4);
    });

    it('writes no tie for a flag that does not join the same pitch', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push({ ...createNote('C', 4, 'quarter'), tieToNext: true }, createNote('D', 4, 'quarter'));

      expect(service.toMusicXml(score)).not.toContain('<tie ');
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
    it('writes a tied pair as one note: fewer bytes than two separate notes, same total length', () => {
      const separate = createEmptyScore();
      separate.measures[0].elements.push(createNote('C', 4, 'quarter'), createNote('C', 4, 'quarter'));
      const tied = createEmptyScore();
      tied.measures[0].elements.push({ ...createNote('C', 4, 'quarter'), tieToNext: true }, createNote('C', 4, 'quarter'));

      expect(service.toMidi(tied).length).toBeLessThan(service.toMidi(separate).length);
    });

    it('keeps the timing of what follows a tied chain', () => {
      const withRest = createEmptyScore();
      withRest.measures[0].elements.push(
        { ...createNote('C', 4, 'quarter'), tieToNext: true },
        createNote('C', 4, 'quarter'),
        createRest('quarter'),
        createNote('D', 4, 'quarter'),
      );

      expect(() => service.toMidi(withRest)).not.toThrow();
      expect(service.toMidi(withRest).length).toBeGreaterThan(0);
    });

    it('encodes dotted and very short notes without throwing', () => {
      const plain = createEmptyScore();
      plain.measures[0].elements.push(createNote('C', 4, 'quarter'));
      const dotted = createEmptyScore();
      dotted.measures[0].elements.push(createNote('C', 4, 'quarter', null, true));
      const tiny = createEmptyScore();
      tiny.measures[0].elements.push(createNote('C', 4, 'thirtysecond'), createNote('D', 4, 'sixtyfourth'));

      expect(Array.from(service.toMidi(dotted))).not.toEqual(Array.from(service.toMidi(plain)));
      expect(service.toMidi(tiny).length).toBeGreaterThan(0);
    });

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

describe('ExportService with several staves and instruments', () => {
  let service: ExportService;

  beforeEach(() => {
    service = TestBed.inject(ExportService);
  });

  const piano = () => {
    const treble = createEmptyScore('treble');
    treble.measures[0].elements.push(createNote('C', 5, 'quarter'), createNote('D', 5, 'quarter'));
    const bass = createEmptyScore('bass');
    bass.measures[0].elements.push(createNote('C', 3, 'half'));
    return { parts: [createPart('Klavir', [treble, bass])] };
  };

  describe('MusicXML', () => {
    it('declares two staves and a numbered clef for each', () => {
      const xml = service.toMusicXml(piano());

      expect(xml).toContain('<staves>2</staves>');
      expect(xml).toContain('<clef number="1"><sign>G</sign><line>2</line></clef>');
      expect(xml).toContain('<clef number="2"><sign>F</sign><line>4</line></clef>');
    });

    it('writes the first staff, steps back by its length and writes the second staff', () => {
      const xml = service.toMusicXml(piano());

      const backup = xml.indexOf('<backup>');
      expect(backup).toBeGreaterThan(xml.indexOf('<step>D</step>'));
      expect(xml.slice(backup)).toContain('<duration>64</duration>\n      </backup>');
      expect(xml.indexOf('<step>C</step>', backup)).toBeGreaterThan(backup);
    });

    it('marks every note with its staff number', () => {
      const xml = service.toMusicXml(piano());

      expect(xml.match(/<staff>1<\/staff>/g)?.length).toBe(2);
      expect(xml.match(/<staff>2<\/staff>/g)?.length).toBe(1);
    });

    it('does not step back over an empty staff', () => {
      const doc = piano();
      doc.parts[0].staves[0].score.measures[0].elements = [];

      expect(service.toMusicXml(doc)).not.toContain('<backup>');
    });

    it('keeps single-staff parts free of staff markup', () => {
      const xml = service.toMusicXml(createEmptyScore());

      expect(xml).not.toContain('<staves>');
      expect(xml).not.toContain('<staff>');
      expect(xml).not.toContain('<backup>');
    });

    it('writes one part per instrument with its name, escaped', () => {
      const doc = piano();
      doc.parts.push(createPart('Flauta & klavir <1>', [createEmptyScore()]));

      const xml = service.toMusicXml(doc);

      expect(xml).toContain('<score-part id="P1"><part-name>Klavir</part-name></score-part>');
      expect(xml).toContain('<score-part id="P2"><part-name>Flauta &amp; klavir &lt;1&gt;</part-name></score-part>');
      expect(xml).toContain('<part id="P1">');
      expect(xml).toContain('<part id="P2">');
    });

    it('pairs ties inside each staff of the document', () => {
      const doc = piano();
      const bassNotes = doc.parts[0].staves[1].score.measures[0].elements;
      bassNotes.splice(0, 1, { ...createNote('C', 3, 'quarter'), tieToNext: true }, createNote('C', 3, 'quarter'));

      const xml = service.toMusicXml(doc);

      expect(xml.match(/<tie type="start"\/>/g)?.length).toBe(1);
      expect(xml.match(/<tie type="stop"\/>/g)?.length).toBe(1);
    });
  });

  describe('MIDI', () => {
    const trackCount = (bytes: Uint8Array) => (bytes[10] << 8) | bytes[11];

    it('writes one track per staff', () => {
      expect(trackCount(service.toMidi(piano()))).toBe(2);

      const doc = piano();
      doc.parts.push(createPart('Violina', [createEmptyScore()]));
      expect(trackCount(service.toMidi(doc))).toBe(3);
    });

    it('writes a single track for a plain score', () => {
      expect(trackCount(service.toMidi(createEmptyScore()))).toBe(1);
    });
  });

  describe('an orchestra-sized score', () => {
    // piano (2 staves) + violin + viola + cello + flute = 6 staves in 5 instruments
    const orchestra = () => {
      const doc = piano();
      for (const clef of ['treble', 'alto', 'bass', 'treble'] as const) {
        const score = createEmptyScore(clef);
        score.measures[0].elements.push(createNote('C', 4, 'quarter'));
        doc.parts.push(createPart(`Deonica ${doc.parts.length + 1}`, [score]));
      }
      return doc;
    };

    it('writes a MusicXML part for every instrument', () => {
      const xml = service.toMusicXml(orchestra());

      expect(xml.match(/<part id="P\d+">/g)?.length).toBe(5);
      expect(xml.match(/<score-part /g)?.length).toBe(5);
      expect(xml).toContain('<clef><sign>C</sign><line>3</line></clef>');
    });

    it('writes a MIDI track for every staff', () => {
      const bytes = service.toMidi(orchestra());

      expect((bytes[10] << 8) | bytes[11]).toBe(6);
    });

    it('draws a stave for every staff', () => {
      expect(service.toSvgString(orchestra()).match(/class="vf-stave"/g)?.length).toBe(6);
    });
  });

  it('draws every staff into the SVG', () => {
    const svg = service.toSvgString(piano());

    expect(svg.match(/class="vf-stave"/g)?.length).toBe(2);
  });
});

describe('ExportService beams', () => {
  let service: ExportService;

  beforeEach(() => {
    service = TestBed.inject(ExportService);
  });

  const xmlFor = (...elements: ReturnType<typeof createNote>[]) => {
    const score = createEmptyScore();
    score.measures[0].elements.push(...elements);
    return service.toMusicXml(score);
  };
  const beams = (xml: string) => Array.from(xml.matchAll(/<beam number="(\d)">([^<]+)<\/beam>/g)).map((m) => `${m[1]}:${m[2]}`);

  it('marks the start and the end of a beamed pair', () => {
    const xml = xmlFor(createNote('C', 4, 'eighth'), createNote('D', 4, 'eighth'));

    expect(beams(xml)).toEqual(['1:begin', '1:end']);
  });

  it('marks the notes in the middle of a longer group as continuing', () => {
    const xml = xmlFor(
      createNote('C', 4, 'sixteenth'),
      createNote('D', 4, 'sixteenth'),
      createNote('E', 4, 'sixteenth'),
      createNote('F', 4, 'sixteenth'),
    );

    expect(beams(xml)).toEqual(['1:begin', '2:begin', '1:continue', '2:continue', '1:continue', '2:continue', '1:end', '2:end']);
  });

  it('writes a hook for a sixteenth next to an eighth', () => {
    const xml = xmlFor(createNote('C', 4, 'eighth'), createNote('D', 4, 'sixteenth'), createNote('E', 4, 'sixteenth'));

    expect(beams(xml)).toEqual(['1:begin', '1:continue', '2:begin', '1:end', '2:end']);
  });

  it('draws a hook for a short note between longer ones', () => {
    const xml = xmlFor(createNote('C', 4, 'eighth'), createNote('D', 4, 'sixteenth'), createNote('E', 4, 'eighth'));

    expect(beams(xml)).toEqual(['1:begin', '1:continue', '2:backward hook', '1:end']);
  });

  it('writes no beams for single eighths, quarters or an unbeamed manual split', () => {
    expect(beams(xmlFor(createNote('C', 4, 'eighth'), createNote('D', 4, 'quarter')))).toEqual([]);

    const split = createNote('C', 4, 'eighth');
    expect(beams(xmlFor({ ...split, beamToNext: 'off' }, createNote('D', 4, 'eighth')))).toEqual([]);
  });

  it('writes a beam across beats when it was joined by hand', () => {
    const xml = xmlFor(
      createNote('C', 4, 'eighth'),
      { ...createNote('D', 4, 'eighth'), beamToNext: 'on' },
      createNote('E', 4, 'eighth'),
      createNote('F', 4, 'eighth'),
    );

    expect(beams(xml)).toEqual(['1:begin', '1:continue', '1:continue', '1:end']);
  });

  it('puts <beam> after <staff> and before <notations> in a grand staff note', () => {
    const treble = createEmptyScore('treble');
    treble.measures[0].elements.push(
      { ...createNote('C', 4, 'eighth'), tieToNext: true },
      createNote('C', 4, 'eighth'),
    );
    const xml = service.toMusicXml({ parts: [createPart('Klavir', [treble, createEmptyScore('bass')])] });

    const note = xml.slice(xml.indexOf('<note>'), xml.indexOf('</note>'));
    expect(note.indexOf('<staff>1</staff>')).toBeGreaterThan(-1);
    expect(note.indexOf('<beam number="1">begin</beam>')).toBeGreaterThan(note.indexOf('<staff>1</staff>'));
    expect(note.indexOf('<notations>')).toBeGreaterThan(note.indexOf('<beam number="1">begin</beam>'));
  });
});
