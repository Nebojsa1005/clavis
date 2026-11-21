import { Clef } from './score.model';
import INSTRUMENT_SOUNDS from './instrument-sounds.json';

/** A kind of instrument that can be added to a score: its name and the clef of each of its staves. */
export interface InstrumentPreset {
  id: string;
  name: string;
  /** One clef per staff; two staves make a grand staff (piano). */
  clefs: readonly Clef[];
}

export const INSTRUMENT_PRESETS: readonly InstrumentPreset[] = [
  { id: 'piano', name: 'Klavir', clefs: ['treble', 'bass'] },
  { id: 'violin', name: 'Violina', clefs: ['treble'] },
  { id: 'viola', name: 'Viola', clefs: ['alto'] },
  { id: 'cello', name: 'Violončelo', clefs: ['bass'] },
  { id: 'double-bass', name: 'Kontrabas', clefs: ['bass'] },
  { id: 'flute', name: 'Flauta', clefs: ['treble'] },
  { id: 'clarinet', name: 'Klarinet', clefs: ['treble'] },
  { id: 'trumpet', name: 'Truba', clefs: ['treble'] },
  { id: 'trombone', name: 'Trombon', clefs: ['bass'] },
  { id: 'guitar', name: 'Gitara', clefs: ['treble'] },
  { id: 'bass-guitar', name: 'Bas gitara', clefs: ['bass'] },
  { id: 'voice', name: 'Glas', clefs: ['treble'] },
];

export function findInstrumentPreset(id: string): InstrumentPreset | undefined {
  return INSTRUMENT_PRESETS.find((preset) => preset.id === id);
}

/** Preset of a part. Older documents have no `instrument`, so it is guessed from the name; piano otherwise. */
export function partInstrument(part: { name: string; instrument?: string }): string {
  if (part.instrument && findInstrumentPreset(part.instrument)) {
    return part.instrument;
  }
  return INSTRUMENT_PRESETS.find((preset) => preset.name === part.name)?.id ?? 'piano';
}

/** Recorded notes of an instrument (served from `public/samples/<id>/`); the sampler pitches between them. */
export function instrumentSampleNotes(id: string): readonly string[] {
  return (INSTRUMENT_SOUNDS as Record<string, { notes: string[] }>)[id]?.notes ?? [];
}
