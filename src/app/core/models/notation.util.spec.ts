import { createEmptyScore, createNote, createRest } from './score.model';
import { createPart } from './score-document';
import { buildDocumentSchedule, buildPlaybackSchedule, durationToBeats, pitchFromClickY, stepDiatonic, toToneNoteName } from './notation.util';

describe('stepDiatonic', () => {
  it('moves up within the same octave', () => {
    expect(stepDiatonic('C', 4, 1)).toEqual({ step: 'D', octave: 4 });
  });

  it('wraps to the next octave going up past B', () => {
    expect(stepDiatonic('B', 4, 1)).toEqual({ step: 'C', octave: 5 });
  });

  it('wraps to the previous octave going down past C', () => {
    expect(stepDiatonic('C', 4, -1)).toEqual({ step: 'B', octave: 3 });
  });
});

describe('durationToBeats', () => {
  const fourFour = { numerator: 4, denominator: 4 };

  it('computes beats for 4/4', () => {
    expect(durationToBeats('quarter', fourFour)).toBe(1);
    expect(durationToBeats('half', fourFour)).toBe(2);
    expect(durationToBeats('whole', fourFour)).toBe(4);
    expect(durationToBeats('eighth', fourFour)).toBe(0.5);
  });

  it('computes beats for 32nd and 64th notes', () => {
    expect(durationToBeats('thirtysecond', fourFour)).toBe(0.125);
    expect(durationToBeats('sixtyfourth', fourFour)).toBe(0.0625);
  });

  it('adds half the length for dotted durations', () => {
    expect(durationToBeats('quarter', fourFour, true)).toBe(1.5);
    expect(durationToBeats('half', fourFour, true)).toBe(3);
  });

  it('measures beats in the denominator note value', () => {
    expect(durationToBeats('eighth', { numerator: 6, denominator: 8 })).toBe(1);
    expect(durationToBeats('quarter', { numerator: 6, denominator: 8 }, true)).toBe(3);
  });
});

describe('pitchFromClickY', () => {
  // topLineY=80, halfStepPx=5 su stvarne VexFlow vrednosti za Stave(x,40,width)
  const topLineY = 80;
  const halfStepPx = 5;

  it('maps the top line to F5 for treble clef', () => {
    expect(pitchFromClickY('treble', 80, topLineY, halfStepPx)).toEqual({ step: 'F', octave: 5 });
  });

  it('maps the bottom line to E4 for treble clef', () => {
    // bottom line je na y=120 (4 linije * spacing 10 od vrha)
    expect(pitchFromClickY('treble', 120, topLineY, halfStepPx)).toEqual({ step: 'E', octave: 4 });
  });

  it('maps the top line to A3 for bass clef', () => {
    expect(pitchFromClickY('bass', 80, topLineY, halfStepPx)).toEqual({ step: 'A', octave: 3 });
  });

  it('puts middle C on the middle line for alto clef', () => {
    // middle line is 4 half steps below the top line
    expect(pitchFromClickY('alto', 100, topLineY, halfStepPx)).toEqual({ step: 'C', octave: 4 });
  });

  it('puts middle C on the fourth line for tenor clef', () => {
    // the fourth line from the bottom is the second from the top, one line (10px) below it
    expect(pitchFromClickY('tenor', 90, topLineY, halfStepPx)).toEqual({ step: 'C', octave: 4 });
  });

  it('snaps to the nearest diatonic step', () => {
    // 81 je 0.2 koraka ispod vrha -> zaokružuje na 0 (F5)
    expect(pitchFromClickY('treble', 81, topLineY, halfStepPx)).toEqual({ step: 'F', octave: 5 });
    // 83 je 0.6 koraka ispod vrha -> zaokružuje na 1 (E5)
    expect(pitchFromClickY('treble', 83, topLineY, halfStepPx)).toEqual({ step: 'E', octave: 5 });
  });
});

describe('toToneNoteName', () => {
  it('formats natural, sharp and flat pitches', () => {
    expect(toToneNoteName({ step: 'C', octave: 4, accidental: null })).toBe('C4');
    expect(toToneNoteName({ step: 'C', octave: 4, accidental: 'sharp' })).toBe('C#4');
    expect(toToneNoteName({ step: 'C', octave: 4, accidental: 'flat' })).toBe('Cb4');
  });
});

describe('toToneNoteName with a key signature', () => {
  it('applies the key signature to notes without an accidental', () => {
    expect(toToneNoteName({ step: 'F', octave: 4, accidental: null }, 'G')).toBe('F#4');
    expect(toToneNoteName({ step: 'B', octave: 3, accidental: null }, 'F')).toBe('Bb3');
  });

  it('leaves notes outside the key alone', () => {
    expect(toToneNoteName({ step: 'C', octave: 4, accidental: null }, 'G')).toBe('C4');
  });

  it('lets explicit accidentals override the key', () => {
    expect(toToneNoteName({ step: 'F', octave: 4, accidental: 'natural' }, 'G')).toBe('F4');
    expect(toToneNoteName({ step: 'F', octave: 4, accidental: 'flat' }, 'G')).toBe('Fb4');
  });
});

describe('buildPlaybackSchedule', () => {
  it('schedules notes sequentially at 120 BPM (0.5s per quarter)', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'quarter'), createNote('D', 4, 'quarter'));

    const schedule = buildPlaybackSchedule(score, 120);

    expect(schedule.notes).toEqual([
      { offsetSeconds: 0, durationSeconds: 0.5, noteName: 'C4' },
      { offsetSeconds: 0.5, durationSeconds: 0.5, noteName: 'D4' },
    ]);
    expect(schedule.totalSeconds).toBe(1);
  });

  it('advances the clock for rests without scheduling a note', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createRest('quarter'), createNote('E', 4, 'quarter'));

    const schedule = buildPlaybackSchedule(score, 120);

    expect(schedule.notes).toEqual([{ offsetSeconds: 0.5, durationSeconds: 0.5, noteName: 'E4' }]);
    expect(schedule.totalSeconds).toBe(1);
  });

  it('scales durations with tempo', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'quarter'));

    expect(buildPlaybackSchedule(score, 60).totalSeconds).toBe(1);
    expect(buildPlaybackSchedule(score, 240).totalSeconds).toBe(0.25);
  });

  it('returns an empty schedule for an empty score', () => {
    const schedule = buildPlaybackSchedule(createEmptyScore(), 120);
    expect(schedule.notes).toEqual([]);
    expect(schedule.totalSeconds).toBe(0);
  });
});

describe('buildPlaybackSchedule with a key signature', () => {
  it('plays the sharpened pitch in G major', () => {
    const score = { ...createEmptyScore(), keySignature: 'G' };
    score.measures[0].elements.push(createNote('F', 4, 'quarter'), createNote('C', 4, 'quarter'));

    const names = buildPlaybackSchedule(score, 120).notes.map((n) => n.noteName);

    expect(names).toEqual(['F#4', 'C4']);
  });
});

describe('buildPlaybackSchedule with dotted notes', () => {
  it('plays a dotted quarter for 0.75s at 120 BPM and shifts the next note', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'quarter', null, true), createNote('D', 4, 'eighth'));

    const [first, second] = buildPlaybackSchedule(score, 120).notes;

    expect(first.durationSeconds).toBeCloseTo(0.75);
    expect(second.offsetSeconds).toBeCloseTo(0.75);
  });
});

describe('buildPlaybackSchedule with ties', () => {
  const tiedNote = (step: 'C' | 'D', duration: 'quarter' | 'half' | 'eighth' = 'quarter') => ({
    ...createNote(step, 4, duration),
    tieToNext: true,
  });

  it('plays two tied quarters as one half-note-long sound', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(tiedNote('C'), createNote('C', 4, 'quarter'));

    const { notes, totalSeconds } = buildPlaybackSchedule(score, 120);

    expect(notes.length).toBe(1);
    expect(notes[0].durationSeconds).toBeCloseTo(1);
    expect(totalSeconds).toBeCloseTo(1);
  });

  it('sums a whole chain', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(tiedNote('C'), tiedNote('C', 'eighth'), createNote('C', 4, 'half'));

    const { notes } = buildPlaybackSchedule(score, 120);

    expect(notes.length).toBe(1);
    expect(notes[0].durationSeconds).toBeCloseTo(0.5 + 0.25 + 1);
  });

  it('does not strike the tied note again and keeps following notes in time', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(tiedNote('C'), createNote('C', 4, 'quarter'), createNote('D', 4, 'quarter'));

    const { notes } = buildPlaybackSchedule(score, 120);

    expect(notes.map((n) => n.noteName)).toEqual(['C4', 'D4']);
    expect(notes[1].offsetSeconds).toBeCloseTo(1);
  });

  it('ties across a barline', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('D', 4, 'half'), createNote('D', 4, 'quarter'), tiedNote('C'));
    score.measures.push({ id: 'm2', elements: [createNote('C', 4, 'half')] });

    const { notes } = buildPlaybackSchedule(score, 120);

    expect(notes.map((n) => n.noteName)).toEqual(['D4', 'D4', 'C4']);
    expect(notes[2].durationSeconds).toBeCloseTo(0.5 + 1);
  });

  it('plays equal neighbours twice when they are not tied', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'quarter'), createNote('C', 4, 'quarter'));

    expect(buildPlaybackSchedule(score, 120).notes.length).toBe(2);
  });

  it('ignores a tie flag that does not join the same pitch', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(tiedNote('C'), createNote('D', 4, 'quarter'));

    expect(buildPlaybackSchedule(score, 120).notes.length).toBe(2);
  });
});

describe('buildDocumentSchedule', () => {
  const treble = () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 5, 'quarter'), createNote('D', 5, 'quarter'));
    return score;
  };
  const bass = () => {
    const score = createEmptyScore('bass');
    score.measures[0].elements.push(createNote('C', 3, 'half'));
    return score;
  };

  it('plays every staff of every instrument at the same time', () => {
    const doc = { parts: [createPart('Klavir', [treble(), bass()]), createPart('Violina', [treble()])] };

    const { notes, totalSeconds } = buildDocumentSchedule(doc, 120);

    expect(notes.length).toBe(5);
    expect(notes.filter((n) => n.offsetSeconds === 0).length).toBe(3);
    expect(totalSeconds).toBeCloseTo(1);
  });

  it('keeps the notes in time order', () => {
    const doc = { parts: [createPart('Klavir', [treble(), bass()])] };

    const offsets = buildDocumentSchedule(doc, 120).notes.map((n) => n.offsetSeconds);

    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });

  it('ends when the longest staff ends', () => {
    const long = createEmptyScore();
    long.measures[0].elements.push(createNote('C', 4, 'whole'));
    const doc = { parts: [createPart('A', [treble()]), createPart('B', [long])] };

    expect(buildDocumentSchedule(doc, 120).totalSeconds).toBeCloseTo(2);
  });

  it('treats a plain score like a one-staff document', () => {
    const schedule = buildDocumentSchedule(treble(), 120);

    expect(schedule.notes.map((n) => n.noteName)).toEqual(['C5', 'D5']);
    expect(schedule.totalSeconds).toBeCloseTo(1);
  });
});
