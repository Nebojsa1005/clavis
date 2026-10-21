import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, createRest, Score } from '../models/score.model';
import { createPart } from '../models/score-document';
import { PLAYBACK_ENGINE, PlaybackEngine } from './playback-engine';
import { PlaybackService } from './playback.service';

/** Records what PlaybackService asks of the audio engine; makes no sound. */
class FakeEngine implements PlaybackEngine {
  readonly ticksPerBeat = 192;
  readonly calls: string[] = [];
  notes: { name: string; start: number; duration: number }[] = [];
  tempos: number[] = [];
  metronome: { endTicks: number; enabled: () => boolean } | null = null;
  end: { endTicks: number; onEnd: () => void } | null = null;
  /** When set, `start()` waits for it, like a browser waiting for a user gesture. */
  startGate: Promise<void> | null = null;
  startError: Error | null = null;

  async start(): Promise<void> {
    this.calls.push('start');
    if (this.startError) {
      throw this.startError;
    }
    await this.startGate;
  }
  reset(): void {
    this.calls.push('reset');
    this.notes = [];
    this.metronome = null;
    this.end = null;
  }
  setTempo(bpm: number): void {
    this.calls.push('tempo');
    this.tempos.push(bpm);
  }
  scheduleNote(name: string, start: number, duration: number): void {
    this.calls.push('note');
    this.notes.push({ name, start, duration });
  }
  scheduleMetronome(endTicks: number, enabled: () => boolean): void {
    this.calls.push('metronome');
    this.metronome = { endTicks, enabled };
  }
  scheduleEnd(endTicks: number, onEnd: () => void): void {
    this.calls.push('end');
    this.end = { endTicks, onEnd };
  }
  begin(): void {
    this.calls.push('begin');
  }
  halt(): void {
    this.calls.push('halt');
  }
}

describe('PlaybackService', () => {
  let service: PlaybackService;
  let engine: FakeEngine;

  const scoreOf = (...elements: Score['measures'][number]['elements']): Score => {
    const score = createEmptyScore();
    score.measures[0].elements.push(...elements);
    return score;
  };
  const quarter = (step: 'C' | 'D' | 'E' = 'C') => createNote(step, 4, 'quarter');

  beforeEach(() => {
    engine = new FakeEngine();
    TestBed.configureTestingModule({ providers: [{ provide: PLAYBACK_ENGINE, useValue: engine }] });
    service = TestBed.inject(PlaybackService);
  });

  it('starts stopped, at 120 BPM, metronome off', () => {
    expect(service.isPlaying()).toBe(false);
    expect(service.bpm()).toBe(120);
    expect(service.metronomeEnabled()).toBe(false);
  });

  it('setBpm clamps to the 20-300 range and rounds', () => {
    service.setBpm(10);
    expect(service.bpm()).toBe(20);

    service.setBpm(999);
    expect(service.bpm()).toBe(300);

    service.setBpm(96.6);
    expect(service.bpm()).toBe(97);
  });

  it('toggleMetronome flips the flag', () => {
    service.toggleMetronome();
    expect(service.metronomeEnabled()).toBe(true);
    service.toggleMetronome();
    expect(service.metronomeEnabled()).toBe(false);
  });

  it('stop() is a no-op for the state when nothing is playing', () => {
    expect(() => service.stop()).not.toThrow();
    expect(service.isPlaying()).toBe(false);
  });

  describe('play', () => {
    it('schedules every note in ticks and begins last', async () => {
      await service.play(scoreOf(quarter('C'), quarter('D')));

      expect(engine.notes).toEqual([
        { name: 'C4', start: 0, duration: 182 },
        { name: 'D4', start: 192, duration: 182 },
      ]);
      expect(engine.calls[0]).toBe('start');
      expect(engine.calls[1]).toBe('reset');
      expect(engine.calls[2]).toBe('tempo');
      expect(engine.calls[engine.calls.length - 1]).toBe('begin');
      expect(service.isPlaying()).toBeTrue();
    });

    it('sets the current tempo before scheduling', async () => {
      service.setBpm(90);

      await service.play(scoreOf(quarter()));

      expect(engine.tempos).toEqual([90]);
    });

    it('schedules the end of the piece after the last note', async () => {
      await service.play(scoreOf(quarter(), quarter()));

      expect(engine.end?.endTicks).toBe(2 * 192);
    });

    it('does not touch the audio engine for an empty score', async () => {
      await service.play(createEmptyScore());

      expect(engine.calls).toEqual([]);
      expect(service.isPlaying()).toBeFalse();
    });

    it('plays a score of only rests as silence of the right length', async () => {
      await service.play(scoreOf(createRest('half')));

      expect(engine.notes).toEqual([]);
      expect(engine.end?.endTicks).toBe(2 * 192);
      expect(service.isPlaying()).toBeTrue();
    });

    it('ignores a second play while already playing', async () => {
      await service.play(scoreOf(quarter()));
      engine.calls.length = 0;

      await service.play(scoreOf(quarter()));

      expect(engine.calls).toEqual([]);
    });

    it('ignores a second play while the first is still waiting for the audio context', async () => {
      let release!: () => void;
      engine.startGate = new Promise<void>((resolve) => (release = resolve));

      const first = service.play(scoreOf(quarter()));
      const second = service.play(scoreOf(quarter()));
      release();
      await Promise.all([first, second]);

      expect(engine.calls.filter((call) => call === 'start').length).toBe(1);
      expect(engine.calls.filter((call) => call === 'begin').length).toBe(1);
      expect(engine.notes.length).toBe(1);
    });

    it('can play again after the audio context failed to start', async () => {
      engine.startError = new Error('blocked');
      await expectAsync(service.play(scoreOf(quarter()))).toBeRejectedWithError('blocked');
      expect(service.isPlaying()).toBeFalse();

      engine.startError = null;
      await service.play(scoreOf(quarter()));

      expect(service.isPlaying()).toBeTrue();
    });
  });

  describe('stop', () => {
    it('halts the engine and clears the playing flag', async () => {
      await service.play(scoreOf(quarter()));

      service.stop();

      expect(engine.calls[engine.calls.length - 1]).toBe('halt');
      expect(service.isPlaying()).toBeFalse();
    });

    it('is what runs when the piece reaches its end', async () => {
      await service.play(scoreOf(quarter()));

      engine.end!.onEnd();

      expect(service.isPlaying()).toBeFalse();
      expect(engine.calls[engine.calls.length - 1]).toBe('halt');
    });

    it('allows playing again afterwards', async () => {
      await service.play(scoreOf(quarter()));
      service.stop();
      engine.calls.length = 0;

      await service.play(scoreOf(quarter()));

      expect(engine.calls).toContain('begin');
      expect(service.isPlaying()).toBeTrue();
    });
  });

  describe('tempo changes', () => {
    it('reach the engine immediately while playing', async () => {
      await service.play(scoreOf(quarter()));

      service.setBpm(60);
      service.setBpm(240);

      expect(engine.tempos).toEqual([120, 60, 240]);
    });

    it('only change the stored value while stopped', () => {
      service.setBpm(80);

      expect(service.bpm()).toBe(80);
      expect(engine.tempos).toEqual([]);
    });

    it('do not change what was scheduled, since ticks do not depend on the tempo', async () => {
      service.setBpm(60);
      await service.play(scoreOf(quarter('C'), quarter('D')));
      const slow = engine.notes;
      service.stop();

      service.setBpm(240);
      await service.play(scoreOf(quarter('C'), quarter('D')));

      expect(engine.notes).toEqual(slow);
    });
  });

  describe('metronome', () => {
    it('is scheduled for the whole piece and follows the toggle live', async () => {
      await service.play(scoreOf(quarter(), quarter()));

      expect(engine.metronome?.endTicks).toBe(2 * 192);
      expect(engine.metronome?.enabled()).toBeFalse();

      service.toggleMetronome();
      expect(engine.metronome?.enabled()).toBeTrue();

      service.toggleMetronome();
      expect(engine.metronome?.enabled()).toBeFalse();
    });
  });

  describe('what is scheduled', () => {
    it('merges tied notes into one longer note', async () => {
      await service.play(scoreOf({ ...quarter(), tieToNext: true }, quarter(), quarter('D')));

      expect(engine.notes).toEqual([
        { name: 'C4', start: 0, duration: Math.round(2 * 192 * 0.95) },
        { name: 'D4', start: 2 * 192, duration: 182 },
      ]);
    });

    it('counts a dot as half the length again', async () => {
      await service.play(scoreOf(createNote('C', 4, 'quarter', null, true), createNote('D', 4, 'eighth')));

      expect(engine.notes.map((n) => n.start)).toEqual([0, 288]);
      expect(engine.notes[0].duration).toBe(Math.round(288 * 0.95));
    });

    it('uses the denominator note as the beat: eighths in 6/8 are one beat each', async () => {
      const score = { ...createEmptyScore(), timeSignature: { numerator: 6, denominator: 8 } };
      score.measures[0].elements.push(createNote('C', 4, 'eighth'), createNote('D', 4, 'eighth'), createNote('E', 4, 'quarter'));

      await service.play(score);

      expect(engine.notes.map((n) => n.start)).toEqual([0, 192, 384]);
      expect(engine.end?.endTicks).toBe(4 * 192);
    });

    it('plays all staves of a document together', async () => {
      const treble = scoreOf(quarter('C'), quarter('D'));
      const bass = { ...createEmptyScore('bass') };
      bass.measures[0].elements.push(createNote('C', 3, 'half'));

      await service.play({ parts: [createPart('Klavir', [treble, bass])] });

      expect(engine.notes.filter((n) => n.start === 0).length).toBe(2);
      expect(engine.notes.length).toBe(3);
    });

    it('applies the key signature to what is played', async () => {
      const score = { ...scoreOf(createNote('F', 4, 'quarter')), keySignature: 'G' };

      await service.play(score);

      expect(engine.notes[0].name).toBe('F#4');
    });
  });
});
