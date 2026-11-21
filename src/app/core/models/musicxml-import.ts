import { KEY_SIGNATURE_OPTIONS, keyAccidentalForStep } from './key-signature.util';
import {
  AccidentalValue,
  Clef,
  createId,
  createMeasure,
  Measure,
  MeasureElement,
  NoteDuration,
  Score,
  Step,
  TimeSignature,
} from './score.model';
import { normalizeDocument, Part, ScoreDocument } from './score-document';

/**
 * SPIKE: MusicXML (score-partwise) → ScoreDocument. Every PDF route (OMR or reading a digital PDF)
 * ends in MusicXML, so this is the shared last step. The model is one voice per staff without chords
 * or tuplets, so the import is lossy; everything dropped is reported in `warnings`.
 */
export interface MusicXmlImport {
  document: ScoreDocument;
  /** Human readable (Serbian), one entry per kind of loss, with how often it happened. */
  warnings: string[];
}

const TYPE_TO_DURATION: Record<string, NoteDuration> = {
  whole: 'whole',
  half: 'half',
  quarter: 'quarter',
  eighth: 'eighth',
  '16th': 'sixteenth',
  '32nd': 'thirtysecond',
  '64th': 'sixtyfourth',
};

/** Quarter notes per duration, to recover a type from <duration> when <type> is missing. */
const QUARTERS: ReadonlyArray<[NoteDuration, number]> = [
  ['whole', 4],
  ['half', 2],
  ['quarter', 1],
  ['eighth', 0.5],
  ['sixteenth', 0.25],
  ['thirtysecond', 0.125],
  ['sixtyfourth', 0.0625],
];

const STEPS: readonly Step[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

function clefOf(sign: string, line: number): Clef | null {
  if (sign === 'G' && line === 2) return 'treble';
  if (sign === 'F' && line === 4) return 'bass';
  if (sign === 'C' && line === 3) return 'alto';
  if (sign === 'C' && line === 4) return 'tenor';
  return null;
}

function text(parent: Element, selector: string): string | undefined {
  return parent.querySelector(selector)?.textContent?.trim() ?? undefined;
}

function num(parent: Element, selector: string): number | undefined {
  const value = text(parent, selector);
  return value === undefined ? undefined : Number.parseFloat(value);
}

/** Direct children by tag name (querySelector would also find nested ones). */
function children(parent: Element, tag: string): Element[] {
  return Array.from(parent.children).filter((child) => child.tagName === tag);
}

function durationFromDivisions(divisions: number, perQuarter: number): { duration: NoteDuration; dotted: boolean } | null {
  const quarters = divisions / perQuarter;
  for (const [duration, length] of QUARTERS) {
    if (Math.abs(quarters - length) < 1e-6) return { duration, dotted: false };
    if (Math.abs(quarters - length * 1.5) < 1e-6) return { duration, dotted: true };
  }
  return null;
}

function keyValue(fifths: number, mode: string | undefined): string {
  const wanted = mode === 'minor' ? 'minor' : 'major';
  return KEY_SIGNATURE_OPTIONS.find((key) => key.fifths === fifths && key.mode === wanted)?.value ?? 'C';
}

const ALTER_TO_ACCIDENTAL = (alter: number): AccidentalValue => (alter > 0 ? 'sharp' : alter < 0 ? 'flat' : 'natural');

/** The most common measure length as n/4 (or n/8 when it is not a whole number of quarters); 4/4 if unknown. */
function guessTimeSignature(measureQuarters: readonly number[]): TimeSignature {
  const counts = new Map<number, number>();
  measureQuarters.forEach((q) => counts.set(q, (counts.get(q) ?? 0) + 1));
  const [quarters] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [4];
  return Number.isInteger(quarters) ? { numerator: quarters, denominator: 4 } : { numerator: Math.round(quarters * 2), denominator: 8 };
}

export function fromMusicXml(xml: string): MusicXmlImport {
  const dom = new DOMParser().parseFromString(xml, 'application/xml');
  if (dom.querySelector('parsererror')) {
    throw new Error('Fajl nije ispravan XML.');
  }
  const root = dom.documentElement;
  if (root.tagName !== 'score-partwise') {
    throw new Error(`Podržan je samo score-partwise MusicXML (dobijen ${root.tagName}).`);
  }

  const lost = new Map<string, number>();
  const warn = (message: string) => lost.set(message, (lost.get(message) ?? 0) + 1);

  const names = new Map(
    Array.from(root.querySelectorAll('part-list > score-part')).map((sp) => [sp.getAttribute('id') ?? '', text(sp, 'part-name') ?? '']),
  );

  // The model has one time and key signature for the whole document: the first ones found win.
  let timeSignature: TimeSignature | null = null;
  let keySignature: string | null = null;
  /** Length of every measure in quarter notes (first staff, kept voice), to guess a missing time signature. */
  const measureQuarters: number[] = [];

  const parts: Part[] = children(root, 'part').map((partEl, partIndex) => {
    let divisions = 1;
    let staffCount = 1;
    const clefs: Clef[] = [];
    const staves: Measure[][] = [];
    /**
     * Voice kept per staff, since the model has only one: the one with the most notes there (usually
     * the melody). "First seen" is not enough: homr starts measures with a rest of voice 2.
     */
    const voiceCounts = new Map<string, Map<string, number>>();
    for (const noteEl of Array.from(partEl.querySelectorAll('note'))) {
      if (noteEl.querySelector('rest, chord, grace, cue')) continue;
      const counts = voiceCounts.get(text(noteEl, 'staff') ?? '1') ?? new Map<string, number>();
      const voice = text(noteEl, 'voice') ?? '1';
      voiceCounts.set(text(noteEl, 'staff') ?? '1', counts.set(voice, (counts.get(voice) ?? 0) + 1));
    }
    const keptVoice: (string | undefined)[] = [];
    voiceCounts.forEach((counts, staff) => {
      keptVoice[Number(staff) - 1] = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    });

    for (const measureEl of children(partEl, 'measure')) {
      const elements: MeasureElement[][] = Array.from({ length: staffCount }, () => []);
      let quarters = 0;

      for (const child of Array.from(measureEl.children)) {
        if (child.tagName === 'attributes') {
          divisions = num(child, 'divisions') ?? divisions;
          const stavesValue = num(child, 'staves');
          if (stavesValue && stavesValue > staffCount) {
            staffCount = stavesValue;
            while (elements.length < staffCount) elements.push([]);
          }
          for (const clefEl of children(child, 'clef')) {
            const index = Number(clefEl.getAttribute('number') ?? '1') - 1;
            const clef = clefOf(text(clefEl, 'sign') ?? '', num(clefEl, 'line') ?? 0);
            if (!clef) warn('Nepodržan ključ zamenjen violinskim');
            if (clefEl.querySelector('clef-octave-change')) warn('Oktavna oznaka na ključu (npr. gitara) zanemarena');
            if (clefs[index] && clefs[index] !== (clef ?? 'treble')) warn('Promena ključa u toku komada zanemarena');
            clefs[index] ??= clef ?? 'treble';
          }
          const keyEl = child.querySelector('key');
          if (keyEl) {
            const value = keyValue(num(keyEl, 'fifths') ?? 0, text(keyEl, 'mode'));
            if (keySignature !== null && keySignature !== value) warn('Promena predznaka u toku komada zanemarena');
            keySignature ??= value;
          }
          const timeEl = child.querySelector('time');
          if (timeEl) {
            const beats = Number.parseInt(text(timeEl, 'beats') ?? '', 10);
            const beatType = Number.parseInt(text(timeEl, 'beat-type') ?? '', 10);
            const value = beats > 0 && beatType > 0 ? { numerator: beats, denominator: beatType } : null;
            if (!value) warn('Nepoznata mera zamenjena sa 4/4');
            const next = value ?? { numerator: 4, denominator: 4 };
            if (timeSignature && (timeSignature.numerator !== next.numerator || timeSignature.denominator !== next.denominator)) {
              warn('Promena takta u toku komada zanemarena');
            }
            timeSignature ??= next;
          }
          continue;
        }
        if (child.tagName !== 'note') {
          continue; // <backup>/<forward> only matter for other voices, which are dropped
        }

        const staffIndex = Math.min(Number(text(child, 'staff') ?? '1'), staffCount) - 1;
        const voice = text(child, 'voice') ?? '1';
        if (child.querySelector('grace') || child.querySelector('cue')) {
          warn('Ukrasne (grace) note izostavljene');
          continue;
        }
        keptVoice[staffIndex] ??= voice;
        if (voice !== keptVoice[staffIndex]) {
          warn('Drugi glas na istom štapu izostavljen');
          continue;
        }
        if (child.querySelector('chord')) {
          warn('Akord sveden na jednu notu');
          continue;
        }
        if (child.querySelector('time-modification')) warn('Triola (ili drugi tuplet) uvezena kao obične note');
        if (staffIndex === 0 && partIndex === 0) quarters += (num(child, 'duration') ?? 0) / divisions;

        const type = text(child, 'type');
        const dots = children(child, 'dot').length;
        if (dots > 1) warn('Dvostruka tačka svedena na jednu');
        const length = type
          ? TYPE_TO_DURATION[type]
            ? { duration: TYPE_TO_DURATION[type], dotted: dots > 0 }
            : null
          : durationFromDivisions(num(child, 'duration') ?? 0, divisions);
        if (!length) {
          warn('Nota nepodržanog trajanja izostavljena');
          continue;
        }

        if (child.querySelector('rest')) {
          // A whole-measure rest without <type> is written as the measure's full length.
          elements[staffIndex].push({ id: createId(), kind: 'rest', duration: length.duration, ...(length.dotted && { dotted: true }) });
          continue;
        }

        const step = text(child, 'pitch > step') as Step | undefined;
        if (!step || !STEPS.includes(step)) {
          warn('Nota bez visine (npr. perkusije) izostavljena');
          continue;
        }
        const octave = num(child, 'pitch > octave') ?? 4;
        const alter = Math.round(num(child, 'pitch > alter') ?? 0);
        if (Math.abs(alter) > 1) warn('Dvostruki predznak sveden na jednostruki');
        const written = text(child, 'accidental');
        const fromKey = keyAccidentalForStep(keySignature ?? 'C', step);
        const keyAlter = fromKey === 'sharp' ? 1 : fromKey === 'flat' ? -1 : 0;
        // The model has no carry-over of accidentals inside a measure, so any note that sounds
        // different from the key signature gets its accidental written out.
        const accidental: AccidentalValue =
          Math.sign(alter) !== keyAlter
            ? ALTER_TO_ACCIDENTAL(alter)
            : written === 'sharp' || written === 'flat' || written === 'natural'
              ? written
              : null;

        const tieStart = children(child, 'tie').some((tie) => tie.getAttribute('type') === 'start');
        elements[staffIndex].push({
          id: createId(),
          kind: 'note',
          pitch: { step, octave, accidental },
          duration: length.duration,
          ...(length.dotted && { dotted: true }),
          ...(tieStart && { tieToNext: true }),
        });
      }

      elements.forEach((staffElements, index) => (staves[index] ??= []).push(createMeasure(staffElements)));
      if (partIndex === 0 && quarters > 0) measureQuarters.push(quarters);
    }

    const name = names.get(partEl.getAttribute('id') ?? '') || `Instrument ${partIndex + 1}`;
    const measureCount = Math.max(1, ...staves.map((measures) => measures.length));
    return {
      id: createId(),
      name,
      staves: Array.from({ length: staffCount }, (_, index) => ({
        id: createId(),
        score: {
          clef: clefs[index] ?? 'treble',
          timeSignature: { numerator: 4, denominator: 4 },
          keySignature: 'C',
          measures: staves[index]?.length ? staves[index] : Array.from({ length: measureCount }, () => createMeasure([])),
        } satisfies Score,
      })),
    };
  });

  if (parts.length === 0) {
    throw new Error('MusicXML nema nijedan part.');
  }

  const time = timeSignature ?? guessTimeSignature(measureQuarters);
  if (!timeSignature) warn(`Mera nije zapisana u fajlu, izračunata iz dužine taktova (${time.numerator}/${time.denominator})`);
  const key = keySignature ?? 'C';
  for (const part of parts) {
    for (const staff of part.staves) {
      staff.score.timeSignature = { ...time };
      staff.score.keySignature = key;
    }
  }

  return {
    document: normalizeDocument({ parts }),
    warnings: Array.from(lost, ([message, count]) => (count > 1 ? `${message} (${count}×)` : message)),
  };
}

/** Bytes of one file in a zip archive (stored or deflated), found through the central directory. */
async function unzipEntry(bytes: Uint8Array, wanted: (name: string) => boolean): Promise<{ name: string; data: Uint8Array } | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Fajl nije ispravan .mxl (zip) arhiv.');
  let offset = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let i = 0, count = view.getUint16(end + 10, true); i < count; i++) {
    const method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const skip = nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    const local = view.getUint32(offset + 42, true);
    offset += 46 + skip;
    if (!wanted(name)) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) return { name, data: raw };
    if (method !== 8) throw new Error(`Nepodržana kompresija u .mxl fajlu (${method}).`);
    const stream = new Blob([raw.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return { name, data: new Uint8Array(await new Response(stream).arrayBuffer()) };
  }
  return null;
}

/** The MusicXML text of a .mxl archive: the root file named in META-INF/container.xml, else the first .xml in it. */
export async function unzipMxl(bytes: Uint8Array): Promise<string> {
  const decoder = new TextDecoder();
  const container = await unzipEntry(bytes, (name) => name === 'META-INF/container.xml');
  const rootPath = container && new DOMParser().parseFromString(decoder.decode(container.data), 'application/xml').querySelector('rootfile')?.getAttribute('full-path');
  const entry = await unzipEntry(bytes, (name) => (rootPath ? name === rootPath : !name.startsWith('META-INF/') && /\.(xml|musicxml)$/i.test(name)));
  if (!entry) throw new Error('U .mxl arhivi nema MusicXML fajla.');
  return decoder.decode(entry.data);
}

/** Reads a .musicxml / .xml / .mxl file chosen by the user. */
export async function readMusicXmlFile(file: Blob & { name: string }): Promise<MusicXmlImport> {
  const xml = /\.mxl$/i.test(file.name) ? await unzipMxl(new Uint8Array(await file.arrayBuffer())) : await file.text();
  return fromMusicXml(xml);
}
