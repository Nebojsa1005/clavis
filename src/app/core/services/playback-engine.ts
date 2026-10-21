import { InjectionToken } from '@angular/core';
import * as Tone from 'tone';

/**
 * What PlaybackService needs from an audio library. Everything is expressed in ticks of the
 * transport, so the tempo can change while playing without rescheduling anything; one beat is
 * `ticksPerBeat` ticks. Keeping this behind an interface lets the playback logic be tested without
 * making any sound (browsers refuse to start audio without a user gesture, so real audio cannot run
 * in automated tests).
 */
export interface PlaybackEngine {
  readonly ticksPerBeat: number;
  /** Starts the audio context; has to be called from a user gesture. */
  start(): Promise<void>;
  /** Forgets everything scheduled so far and rewinds to the beginning. */
  reset(): void;
  setTempo(beatsPerMinute: number): void;
  scheduleNote(noteName: string, startTicks: number, durationTicks: number): void;
  /** One click per beat until `endTicks`; a click is only played while `enabled()` says so. */
  scheduleMetronome(endTicks: number, enabled: () => boolean): void;
  scheduleEnd(endTicks: number, onEnd: () => void): void;
  begin(): void;
  /** Stops the transport, drops what is scheduled and silences notes that are still sounding. */
  halt(): void;
}

/** Tone.js implementation. The synths are created on first use, after the audio context started. */
export class ToneEngine implements PlaybackEngine {
  private synth: InstanceType<typeof Tone.PolySynth> | null = null;
  private metronomeSynth: InstanceType<typeof Tone.MembraneSynth> | null = null;

  get ticksPerBeat(): number {
    return Tone.getTransport().PPQ;
  }

  async start(): Promise<void> {
    await Tone.start();
    this.synth ??= new Tone.PolySynth(Tone.Synth).toDestination();
    this.metronomeSynth ??= new Tone.MembraneSynth().toDestination();
  }

  reset(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    transport.position = 0;
  }

  setTempo(beatsPerMinute: number): void {
    Tone.getTransport().bpm.value = beatsPerMinute;
  }

  scheduleNote(noteName: string, startTicks: number, durationTicks: number): void {
    Tone.getTransport().scheduleOnce((time) => {
      this.synth?.triggerAttackRelease(noteName, `${durationTicks}i`, time);
    }, `${startTicks}i`);
  }

  scheduleMetronome(endTicks: number, enabled: () => boolean): void {
    Tone.getTransport().scheduleRepeat(
      (time) => {
        if (enabled()) {
          this.metronomeSynth?.triggerAttackRelease('C2', '32n', time);
        }
      },
      '4n',
      0,
      `${endTicks}i`,
    );
  }

  scheduleEnd(endTicks: number, onEnd: () => void): void {
    Tone.getTransport().scheduleOnce(() => onEnd(), `${endTicks}i`);
  }

  begin(): void {
    Tone.getTransport().start();
  }

  halt(): void {
    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel();
    this.synth?.releaseAll();
  }
}

export const PLAYBACK_ENGINE = new InjectionToken<PlaybackEngine>('PLAYBACK_ENGINE', {
  providedIn: 'root',
  factory: () => new ToneEngine(),
});
