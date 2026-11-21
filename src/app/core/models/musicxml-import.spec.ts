import { TestBed } from '@angular/core/testing';
import { ExportService } from '../services/export.service';
import { fromMusicXml, readMusicXmlFile, unzipMxl } from './musicxml-import';
import { createEmptyScore, createNote, createRest, Score } from './score.model';
import { createPart, ScoreDocument } from './score-document';

/** Structure without ids, so a document can be compared after a round trip. */
function shape(doc: ScoreDocument): unknown {
  return JSON.parse(JSON.stringify(doc, (key, value) => (key === 'id' || key === 'instrument' ? undefined : value)));
}

const wrap = (measures: string, attributes = '<divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>') =>
  `<?xml version="1.0"?><score-partwise><part-list><score-part id="P1"><part-name>Flauta</part-name></score-part></part-list>` +
  `<part id="P1"><measure number="1"><attributes>${attributes}</attributes>${measures}</measure></part></score-partwise>`;
const note = (step: string, octave: number, type: string, extra = '') =>
  `<note><pitch><step>${step}</step>${extra}<octave>${octave}</octave></pitch><duration>1</duration><type>${type}</type></note>`;

describe('fromMusicXml', () => {
  it('reads back what the exporter writes, grand staff, ties, dots and accidentals included', () => {
    const treble: Score = { ...createEmptyScore('treble'), keySignature: 'D', timeSignature: { numerator: 3, denominator: 4 } };
    const tied = { ...createNote('A', 4, 'quarter'), tieToNext: true };
    treble.measures[0].elements.push(createNote('F', 4, 'quarter', 'natural', true), createNote('G', 4, 'eighth', 'sharp'), tied);
    treble.measures.push({ id: 'm2', elements: [createNote('A', 4, 'half'), createRest('quarter')] });
    const bass: Score = { ...treble, clef: 'bass', measures: [{ id: 'b1', elements: [createNote('D', 3, 'half', null, true)] }, { id: 'b2', elements: [createRest('half', true)] }] };
    const source: ScoreDocument = { parts: [createPart('Klavir', [treble, bass]), createPart('Violina', [{ ...treble, measures: treble.measures }])] };

    const xml = TestBed.inject(ExportService).toMusicXml(source);
    const { document, warnings } = fromMusicXml(xml);

    expect(warnings).toEqual([]);
    expect(shape(document)).toEqual(shape(source));
  });

  it('writes out accidentals that the measure carried over, since the model has no carry-over', () => {
    const { document } = fromMusicXml(wrap(note('F', 4, 'quarter', '<alter>1</alter>') + note('F', 4, 'quarter', '<alter>1</alter>')));

    const [first, second] = document.parts[0].staves[0].score.measures[0].elements;
    expect(first.kind === 'note' && first.pitch.accidental).toBe('sharp');
    expect(second.kind === 'note' && second.pitch.accidental).toBe('sharp');
  });

  it('keeps one voice and the first note of a chord, and says what it dropped', () => {
    const chordNote = note('E', 4, 'half').replace('<pitch>', '<chord/><pitch>');
    const voice2 = note('C', 4, 'whole').replace('</type>', '</type><voice>2</voice>');
    const { document, warnings } = fromMusicXml(wrap(note('C', 5, 'half') + chordNote + note('D', 5, 'half') + '<backup><duration>4</duration></backup>' + voice2));

    const elements = document.parts[0].staves[0].score.measures[0].elements;
    expect(elements.map((e) => e.kind === 'note' && `${e.pitch.step}${e.pitch.octave}`)).toEqual(['C5', 'D5']);
    expect(warnings).toEqual(['Akord sveden na jednu notu', 'Drugi glas na istom štapu izostavljen']);
  });

  it('keeps the voice with the most notes, even when another voice comes first in the measure', () => {
    const v = (voice: string, step: string) => note(step, 4, 'quarter').replace('</type>', `</type><voice>${voice}</voice>`);
    const voice2Rest = '<note><rest/><duration>4</duration><type>whole</type><voice>2</voice></note><backup><duration>4</duration></backup>';
    const { document } = fromMusicXml(wrap(voice2Rest + v('1', 'C') + v('1', 'D') + v('1', 'E') + v('1', 'F')));

    const elements = document.parts[0].staves[0].score.measures[0].elements;
    expect(elements.map((e) => (e.kind === 'note' ? e.pitch.step : 'rest'))).toEqual(['C', 'D', 'E', 'F']);
  });

  it('turns a whole-measure rest without a type into a rest of the measure length', () => {
    const { document } = fromMusicXml(wrap('<note><rest measure="yes"/><duration>4</duration></note>'));

    expect(document.parts[0].staves[0].score.measures[0].elements[0]).toEqual(jasmine.objectContaining({ kind: 'rest', duration: 'whole' }));
  });

  it('guesses a missing time signature from the measure length, and says so', () => {
    const measure = (n: number) => `<measure number="${n}">${note('C', 4, 'half').replace('<duration>1', '<duration>2')}${note('D', 4, 'quarter')}</measure>`;
    const xml = wrap(measure(0).slice(18, -10), '<divisions>1</divisions><clef><sign>G</sign><line>2</line></clef>').replace('</part>', measure(2) + measure(3) + '</part>');

    const { document, warnings } = fromMusicXml(xml);

    expect(document.parts[0].staves[0].score.timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(warnings).toContain('Mera nije zapisana u fajlu, izračunata iz dužine taktova (3/4)');
  });

  it('takes the part name, and rejects what is not partwise MusicXML', () => {
    expect(fromMusicXml(wrap(note('C', 4, 'whole'))).document.parts[0].name).toBe('Flauta');
    expect(() => fromMusicXml('<score-timewise/>')).toThrowError(/score-partwise/);
    expect(() => fromMusicXml('nije xml')).toThrowError(/XML/);
  });
});

/** Minimal zip writer (CRCs left at 0, which the reader does not check), stored or deflated. */
async function zip(files: Record<string, string>, deflate: boolean): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(files);
  for (const [name, content] of entries) {
    const raw = encoder.encode(content);
    const data = deflate
      ? new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())
      : raw;
    const nameBytes = encoder.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(10, deflate ? 8 : 0, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, raw.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const size = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  all.reduce((at, c) => (out.set(c, at), at + c.length), 0);
  return out;
}

describe('unzipMxl', () => {
  const container = '<container><rootfiles><rootfile full-path="score/main.musicxml"/></rootfiles></container>';

  it('reads the root file named in META-INF/container.xml, deflated or stored', async () => {
    for (const deflate of [true, false]) {
      const bytes = await zip({ 'META-INF/container.xml': container, 'score/other.xml': '<x/>', 'score/main.musicxml': '<score-partwise/>' }, deflate);
      expect(await unzipMxl(bytes)).withContext(`deflate=${deflate}`).toBe('<score-partwise/>');
    }
  });

  it('falls back to the first .xml without a container, and rejects what is not a zip', async () => {
    expect(await unzipMxl(await zip({ 'a.xml': '<score-partwise/>' }, true))).toBe('<score-partwise/>');
    await expectAsync(unzipMxl(new TextEncoder().encode('nije zip'))).toBeRejectedWithError(/zip/);
  });

  it('lets readMusicXmlFile open .mxl and plain files alike', async () => {
    const xml = wrap(note('C', 4, 'whole'));
    const mxl = new File([(await zip({ 'x.musicxml': xml }, true)).slice()], 'pesma.mxl');
    const plain = new File([xml], 'pesma.musicxml');

    expect((await readMusicXmlFile(mxl)).document.parts[0].name).toBe('Flauta');
    expect((await readMusicXmlFile(plain)).document.parts[0].name).toBe('Flauta');
  });
});
