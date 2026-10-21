import { Clef } from './score.model';

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
