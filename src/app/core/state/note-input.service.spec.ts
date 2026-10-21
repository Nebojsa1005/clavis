import { TestBed } from '@angular/core/testing';
import { createEmptyScore } from '../models/score.model';
import { ScoreModelService } from './score-model.service';
import { NoteInputService } from './note-input.service';

describe('NoteInputService', () => {
  let service: NoteInputService;
  let scoreModel: ScoreModelService;

  beforeEach(() => {
    service = TestBed.inject(NoteInputService);
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceScore(createEmptyScore());
  });

  it('starts inactive with quarter as default duration', () => {
    expect(service.active()).toBe(false);
    expect(service.currentDuration()).toBe('quarter');
  });

  it('toggle flips the active state', () => {
    service.toggle();
    expect(service.active()).toBe(true);
    service.toggle();
    expect(service.active()).toBe(false);
  });

  it('ignores clicks, rests and pitch nudges while inactive', () => {
    service.enterPitchFromClick('treble', 80, 80, 5);
    service.enterRest();
    service.nudgeLastPitch(1);

    expect(scoreModel.score().measures[0].elements.length).toBe(0);
  });

  it('maps a click on the top line to F5 for treble clef once active', () => {
    service.setActive(true);
    service.enterPitchFromClick('treble', 80, 80, 5);

    const note = scoreModel.score().measures[0].elements[0];
    expect(note.kind).toBe('note');
    expect(note.kind === 'note' && note.pitch).toEqual({ step: 'F', octave: 5, accidental: null });
  });

  it('enters a rest with the current duration once active', () => {
    service.setActive(true);
    service.setDuration('eighth');
    service.enterRest();

    const el = scoreModel.score().measures[0].elements[0];
    expect(el.kind).toBe('rest');
    expect(el.duration).toBe('eighth');
  });

  it('nudges the pitch of the last entered note', () => {
    service.setActive(true);
    service.enterPitchFromClick('treble', 80, 80, 5); // F5
    service.nudgeLastPitch(-1);

    const note = scoreModel.score().measures[0].elements[0];
    expect(note.kind === 'note' && note.pitch.step).toBe('E');
  });

  describe('dotted notes and short durations', () => {
    it('is not dotted by default and toggles', () => {
      expect(service.dotted()).toBeFalse();
      service.toggleDotted();
      expect(service.dotted()).toBeTrue();
      service.toggleDotted();
      expect(service.dotted()).toBeFalse();
    });

    it('enters dotted notes and rests while the dot is on', () => {
      service.setActive(true);
      service.toggleDotted();

      service.enterPitchFromClick('treble', 80, 80, 5);
      service.enterRest();

      const [note, rest] = scoreModel.score().measures[0].elements;
      expect(note.dotted).toBeTrue();
      expect(rest.dotted).toBeTrue();
    });

    it('enters 32nd and 64th notes', () => {
      service.setActive(true);
      service.setDuration('thirtysecond');
      service.enterPitchFromClick('treble', 80, 80, 5);
      service.setDuration('sixtyfourth');
      service.enterPitchFromClick('treble', 80, 80, 5);

      const durations = scoreModel.score().measures[0].elements.map((el) => el.duration);
      expect(durations).toEqual(['thirtysecond', 'sixtyfourth']);
    });
  });

  describe('armed tie', () => {
    const flags = () =>
      scoreModel.score().measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' && el.tieToNext ? 'T' : '-')));

    it('ties the next entered note to the previous one of the same pitch', () => {
      service.setActive(true);
      service.enterPitchFromClick('treble', 80, 80, 5);

      service.toggleTieArmed();
      service.enterPitchFromClick('treble', 80, 80, 5);

      expect(flags()).toEqual(['T', '-']);
    });

    it('disarms after one note, so the following note is not tied', () => {
      service.setActive(true);
      service.enterPitchFromClick('treble', 80, 80, 5);
      service.toggleTieArmed();
      service.enterPitchFromClick('treble', 80, 80, 5);

      service.enterPitchFromClick('treble', 80, 80, 5);

      expect(flags()).toEqual(['T', '-', '-']);
      expect(service.tieArmed()).toBeFalse();
    });

    it('does not tie to a different pitch but still disarms', () => {
      service.setActive(true);
      service.enterPitchFromClick('treble', 80, 80, 5);
      service.toggleTieArmed();

      service.enterPitchFromClick('treble', 85, 80, 5);

      expect(flags()).toEqual(['-', '-']);
      expect(service.tieArmed()).toBeFalse();
    });

    it('disarms when a rest is entered', () => {
      service.setActive(true);
      service.toggleTieArmed();

      service.enterRest();

      expect(service.tieArmed()).toBeFalse();
    });

    it('disarms when note input mode is left', () => {
      service.setActive(true);
      service.toggleTieArmed();

      service.setActive(false);

      expect(service.tieArmed()).toBeFalse();
    });
  });
});
