import { Injectable, signal } from '@angular/core';
import * as Tone from 'tone';
import { buildPlaybackSchedule } from '../models/notation.util';
import { Score } from '../models/score.model';

const MIN_BPM = 20;
const MAX_BPM = 300;

/** Wrapper oko Tone.js: zakazuje `buildPlaybackSchedule(score, bpm)` na Tone.Transport-u. */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  readonly isPlaying = signal(false);
  readonly bpm = signal(120);
  readonly metronomeEnabled = signal(false);

  private synth: InstanceType<typeof Tone.PolySynth> | null = null;
  private metronomeSynth: InstanceType<typeof Tone.MembraneSynth> | null = null;

  setBpm(value: number): void {
    this.bpm.set(Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value))));
  }

  toggleMetronome(): void {
    this.metronomeEnabled.update((value) => !value);
  }

  async play(score: Score): Promise<void> {
    if (this.isPlaying()) {
      return;
    }

    const schedule = buildPlaybackSchedule(score, this.bpm());
    if (schedule.totalSeconds === 0) {
      return;
    }

    await Tone.start();
    this.synth ??= new Tone.PolySynth(Tone.Synth).toDestination();

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.position = 0;
    transport.bpm.value = this.bpm();

    for (const note of schedule.notes) {
      transport.scheduleOnce((time) => {
        this.synth!.triggerAttackRelease(note.noteName, note.durationSeconds * 0.95, time);
      }, note.offsetSeconds);
    }

    if (this.metronomeEnabled()) {
      this.metronomeSynth ??= new Tone.MembraneSynth().toDestination();
      transport.scheduleRepeat(
        (time) => this.metronomeSynth!.triggerAttackRelease('C2', '32n', time),
        '4n',
        0,
        schedule.totalSeconds,
      );
    }

    transport.scheduleOnce(() => this.stop(), schedule.totalSeconds);

    this.isPlaying.set(true);
    transport.start();
  }

  stop(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    this.isPlaying.set(false);
  }
}
