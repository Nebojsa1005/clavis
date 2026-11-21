import { INSTRUMENT_PRESETS, instrumentSampleNotes, partInstrument } from './instruments';

describe('partInstrument', () => {
  it('uses the stored preset id', () => {
    expect(partInstrument({ name: 'Prva violina', instrument: 'violin' })).toBe('violin');
  });

  it('guesses from the preset name for parts saved before instruments were stored', () => {
    expect(partInstrument({ name: 'Flauta' })).toBe('flute');
  });

  it('falls back to piano for a renamed old part or an unknown id', () => {
    expect(partInstrument({ name: 'Solo' })).toBe('piano');
    expect(partInstrument({ name: 'Flauta', instrument: 'theremin' })).toBe('flute');
  });
});

describe('instrumentSampleNotes', () => {
  it('has samples for every preset', () => {
    for (const preset of INSTRUMENT_PRESETS) {
      expect(instrumentSampleNotes(preset.id).length).withContext(preset.id).toBeGreaterThan(0);
    }
  });

  it('has none for an unknown instrument', () => {
    expect(instrumentSampleNotes('theremin')).toEqual([]);
  });
});
