import { InjectionToken } from '@angular/core';
import * as Tone from 'tone';
import { instrumentSampleNotes } from '../models/instruments';

/**
 * What PlaybackService needs from an audio library. Everything is expressed in ticks of the
 * transport, so the tempo can change while playing without rescheduling anything; one beat is
 * `ticksPerBeat` ticks. Keeping this behind an interface lets the playback logic be tested without
 * making any sound (browsers refuse to start audio without a user gesture, so real audio cannot run
 * in automated tests).
 */
export interface PlaybackEngine {
  readonly ticksPerBeat: number;
  /**
   * Starts the audio context and loads the sounds of the given instrument presets; has to be called
   * from a user gesture. An instrument whose sounds fail to load plays with a generic synth.
   */
  start(instruments: readonly string[]): Promise<void>;
  /** Forgets everything scheduled so far and rewinds to the beginning. */
  reset(): void;
  setTempo(beatsPerMinute: number): void;
  scheduleNote(noteName: string, startTicks: number, durationTicks: number, instrument?: string): void;
  /** One click per beat until `endTicks`; a click is only played while `enabled()` says so. */
  scheduleMetronome(endTicks: number, enabled: () => boolean): void;
  scheduleEnd(endTicks: number, onEnd: () => void): void;
  begin(): void;
  /** Stops the transport, drops what is scheduled and silences notes that are still sounding. */
  halt(): void;
}

/**
 * Tone.js implementation. The synths are created on first use, after the audio context started;
 * every instrument gets a sampler fed from `public/samples/<id>/`, loaded once when first played.
 */
export class ToneEngine implements PlaybackEngine {
  private synth: InstanceType<typeof Tone.PolySynth> | null = null;
  private metronomeSynth: InstanceType<typeof Tone.MembraneSynth> | null = null;
  private readonly samplers = new Map<string, Promise<Tone.Sampler | null>>();
  private readonly loaded = new Map<string, Tone.Sampler>();

  get ticksPerBeat(): number {
    return Tone.getTransport().PPQ;
  }

  async start(instruments: readonly string[]): Promise<void> {
    await Tone.start();
    this.synth ??= new Tone.PolySynth(Tone.Synth).toDestination();
    this.metronomeSynth ??= new Tone.MembraneSynth().toDestination();
    await Promise.all(instruments.map((id) => this.sampler(id)));
  }

  private sampler(id: string): Promise<Tone.Sampler | null> {
    let pending = this.samplers.get(id);
    if (!pending) {
      const notes = instrumentSampleNotes(id);
      pending = notes.length === 0 ? Promise.resolve(null) : this.loadSampler(id, notes);
      this.samplers.set(id, pending);
    }
    return pending;
  }

  private loadSampler(id: string, notes: readonly string[]): Promise<Tone.Sampler | null> {
    return new Promise((resolve) => {
      const sampler = new Tone.Sampler({
        urls: Object.fromEntries(notes.map((note) => [note, `${note}.mp3`])),
        // Relative, so it follows the document's <base href>.
        baseUrl: `samples/${id}/`,
        release: 0.3,
        onload: () => {
          this.loaded.set(id, sampler);
          resolve(sampler);
        },
        onerror: () => {
          sampler.dispose();
          this.samplers.delete(id); // try again on the next play, e.g. after the network is back
          resolve(null);
        },
      }).toDestination();
    });
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

  scheduleNote(noteName: string, startTicks: number, durationTicks: number, instrument?: string): void {
    const voice = (instrument && this.loaded.get(instrument)) || this.synth;
    Tone.getTransport().scheduleOnce((time) => {
      voice?.triggerAttackRelease(noteName, `${durationTicks}i`, time);
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
    this.loaded.forEach((sampler) => sampler.releaseAll());
  }
}

export const PLAYBACK_ENGINE = new InjectionToken<PlaybackEngine>('PLAYBACK_ENGINE', {
  providedIn: 'root',
  factory: () => new ToneEngine(),
});
