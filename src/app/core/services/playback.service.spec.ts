import { TestBed } from '@angular/core/testing';
import { PlaybackService } from './playback.service';

describe('PlaybackService', () => {
  let service: PlaybackService;

  beforeEach(() => {
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

  it('stop() is a no-op when nothing is playing', () => {
    expect(() => service.stop()).not.toThrow();
    expect(service.isPlaying()).toBe(false);
  });
});
