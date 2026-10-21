import { createEmptyScore, createNote, createRest } from './score.model';
import { buildPlaybackSchedule, durationToBeats, pitchFromClickY, stepDiatonic, toToneNoteName } from './notation.util';

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
