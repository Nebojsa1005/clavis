import { Injectable, inject, signal } from '@angular/core';
import { buildDocumentSchedule } from '../models/notation.util';
import { Score } from '../models/score.model';
import { ScoreDocument } from '../models/score-document';
import { PLAYBACK_ENGINE } from './playback-engine';

const MIN_BPM = 20;
const MAX_BPM = 300;
/** Notes sound for this share of their written length, so repeated notes are heard as separate. */
const ARTICULATION = 0.95;

/**
 * Plays a score: turns it into a schedule (`buildDocumentSchedule`) and hands it to the audio
 * engine in ticks. Because nothing is scheduled in seconds, changing the tempo while playing
 * simply speeds up or slows down the rest of the piece.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  private readonly engine = inject(PLAYBACK_ENGINE);

  readonly isPlaying = signal(false);
  readonly bpm = signal(120);
  readonly metronomeEnabled = signal(false);

  /** True while waiting for the audio context, so a second click cannot start a second playback. */
  private starting = false;

  /** Beats per minute, where a beat is the note value of the time signature's denominator. */
  setBpm(value: number): void {
    this.bpm.set(Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value))));
    if (this.isPlaying()) {
      this.engine.setTempo(this.bpm());
    }
  }

  /** Takes effect immediately, also during playback. */
  toggleMetronome(): void {
    this.metronomeEnabled.update((value) => !value);
  }

  async play(score: Score | ScoreDocument): Promise<void> {
    if (this.isPlaying() || this.starting) {
      return;
    }

    const schedule = buildDocumentSchedule(score, this.bpm());
    if (schedule.totalBeats === 0) {
      return;
    }

    this.starting = true;
    try {
      await this.engine.start();

      this.engine.reset();
      this.engine.setTempo(this.bpm());

      const ticksPerBeat = this.engine.ticksPerBeat;
      for (const note of schedule.notes) {
        this.engine.scheduleNote(
          note.noteName,
          Math.round(note.offsetBeats * ticksPerBeat),
          Math.max(1, Math.round(note.durationBeats * ticksPerBeat * ARTICULATION)),
        );
      }

      const endTicks = Math.round(schedule.totalBeats * ticksPerBeat);
      this.engine.scheduleMetronome(endTicks, () => this.metronomeEnabled());
      this.engine.scheduleEnd(endTicks, () => this.stop());

      this.isPlaying.set(true);
      this.engine.begin();
    } finally {
      this.starting = false;
    }
  }

  stop(): void {
    this.engine.halt();
    this.isPlaying.set(false);
  }
}
