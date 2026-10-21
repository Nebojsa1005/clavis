import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, createRest } from '../models/score.model';
import { ScoreModelService } from './score-model.service';

describe('ScoreModelService', () => {
  let service: ScoreModelService;

  beforeEach(() => {
    service = TestBed.inject(ScoreModelService);
  });

  it('starts with a non-empty test score', () => {
    expect(service.score().measures.length).toBeGreaterThan(0);
  });

  it('updates the score signal on replaceScore', () => {
    const empty = createEmptyScore('bass');
    service.replaceScore(empty);

    expect(service.score()).toBe(empty);
    expect(service.score().clef).toBe('bass');
  });

  describe('appendElement', () => {
    it('fills the last measure while there is room (4/4)', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('D', 4, 'quarter'));

      expect(service.score().measures.length).toBe(1);
      expect(service.score().measures[0].elements.length).toBe(2);
    });

    it('opens a new measure once the current one is full', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('D', 4, 'quarter'));
      service.appendElement(createNote('E', 4, 'quarter'));
      service.appendElement(createNote('F', 4, 'quarter'));
      service.appendElement(createNote('G', 4, 'quarter'));

      const measures = service.score().measures;
      expect(measures.length).toBe(2);
      expect(measures[0].elements.length).toBe(4);
      expect(measures[1].elements.length).toBe(1);
    });

    it('counts the dot when deciding whether an element still fits', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'half', null, true));

      service.appendElement(createNote('D', 4, 'quarter'));
      service.appendElement(createNote('E', 4, 'half'));

      const lengths = service.score().measures.map((m) => m.elements.length);
      expect(lengths).toEqual([2, 1]);
    });

    it('appends rests too', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createRest('quarter'));

      expect(service.score().measures[0].elements[0].kind).toBe('rest');
    });
  });

  describe('setClef', () => {
    it('changes the clef and keeps the notes untouched', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.setClef('bass');

      expect(service.score().clef).toBe('bass');
      const note = service.score().measures[0].elements[0];
      expect(note.kind === 'note' && note.pitch).toEqual({ step: 'C', octave: 4, accidental: null });
    });

    it('is undoable', () => {
      service.replaceScore(createEmptyScore());

      service.setClef('alto');
      service.undo();

      expect(service.score().clef).toBe('treble');
    });

    it('does not create an undo step when the clef is unchanged', () => {
      service.replaceScore(createEmptyScore());

      service.setClef('treble');

      expect(service.canUndo()).toBe(false);
    });
  });

  describe('setTimeSignature', () => {
    const fourQuarters = () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'D', 'E', 'F'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }
    };

    it('applies a valid time signature and reflows the measures', () => {
      fourQuarters();

      expect(service.setTimeSignature({ numerator: 3, denominator: 4 })).toBeTrue();

      expect(service.score().timeSignature).toEqual({ numerator: 3, denominator: 4 });
      expect(service.score().measures.map((m) => m.elements.length)).toEqual([3, 1]);
    });

    it('rejects an invalid time signature without touching the score', () => {
      fourQuarters();
      const before = service.score();

      expect(service.setTimeSignature({ numerator: 0, denominator: 4 })).toBeFalse();
      expect(service.setTimeSignature({ numerator: 4, denominator: 5 })).toBeFalse();

      expect(service.score()).toBe(before);
    });

    it('is undone in one step', () => {
      fourQuarters();

      service.setTimeSignature({ numerator: 3, denominator: 4 });
      service.undo();

      expect(service.score().timeSignature).toEqual({ numerator: 4, denominator: 4 });
      expect(service.score().measures.length).toBe(1);
    });

    it('does not add an undo step when nothing changes', () => {
      service.replaceScore(createEmptyScore());

      expect(service.setTimeSignature({ numerator: 4, denominator: 4 })).toBeTrue();

      expect(service.canUndo()).toBeFalse();
    });
  });

  describe('insertElement', () => {
    it('inserts in the middle of a measure and shifts the rest', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('E', 4, 'quarter'));

      service.insertElement(0, 1, createNote('D', 4, 'quarter'));

      const steps = service.score().measures[0].elements.map((el) => el.kind === 'note' && el.pitch.step);
      expect(steps).toEqual(['C', 'D', 'E']);
    });

    it('spills overflow into the next measure', () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'D', 'E', 'F'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }

      service.insertElement(0, 0, createNote('G', 4, 'quarter'));

      expect(service.score().measures.length).toBe(2);
      expect(service.score().measures[0].elements.length).toBe(4);
      expect(service.score().measures[1].elements.length).toBe(1);
    });

    it('can be undone in one step', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.insertElement(0, 0, createNote('D', 4, 'quarter'));
      service.undo();

      expect(service.score().measures[0].elements.length).toBe(1);
    });
  });

  describe('adjustNotePitchBefore', () => {
    it('moves the note right before the position up a diatonic step', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('E', 4, 'quarter'));

      service.adjustNotePitchBefore(0, 1, 1);

      const [first, second] = service.score().measures[0].elements;
      expect(first.kind === 'note' && first.pitch.step).toBe('D');
      expect(second.kind === 'note' && second.pitch.step).toBe('E');
    });

    it('skips rests and adjusts the nearest note before the position', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createRest('quarter'));

      service.adjustNotePitchBefore(0, 2, -1);

      const elements = service.score().measures[0].elements;
      expect(elements[0].kind === 'note' && elements[0].pitch.step).toBe('B');
      expect(elements[0].kind === 'note' && elements[0].pitch.octave).toBe(3);
    });

    it('looks back into the previous measure when the position is at the start of one', () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'D', 'E', 'F', 'G'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }

      service.adjustNotePitchBefore(1, 0, 1);

      const fourth = service.score().measures[0].elements[3];
      expect(fourth.kind === 'note' && fourth.pitch.step).toBe('G');
    });

    it('is a no-op when the score has only rests', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createRest('quarter'));

      expect(() => service.adjustNotePitchBefore(0, 1, 1)).not.toThrow();
      expect(service.score().measures[0].elements[0].kind).toBe('rest');
    });
  });

  describe('deleteElement', () => {
    it('removes the element by id', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      const id = service.score().measures[0].elements[0].id;

      service.deleteElement(id);

      expect(service.score().measures[0].elements.length).toBe(0);
    });

    it('is a no-op for an unknown id', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.deleteElement('does-not-exist');

      expect(service.score().measures[0].elements.length).toBe(1);
    });
  });

  describe('undo/redo', () => {
    it('reverts the last mutation on undo', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      expect(service.canUndo()).toBe(true);
      service.undo();

      expect(service.score().measures[0].elements.length).toBe(0);
      expect(service.canUndo()).toBe(false);
    });

    it('re-applies an undone mutation on redo', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.undo();

      expect(service.canRedo()).toBe(true);
      service.redo();

      expect(service.score().measures[0].elements.length).toBe(1);
      expect(service.canRedo()).toBe(false);
    });

    it('clears the redo stack once a new mutation happens after undo', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.undo();

      service.appendElement(createNote('D', 4, 'quarter'));

      expect(service.canRedo()).toBe(false);
    });

    it('keeps at most 20 steps of history', () => {
      service.replaceScore(createEmptyScore());
      for (let i = 0; i < 25; i++) {
        service.appendElement(createRest('sixteenth'));
      }

      let undoCount = 0;
      while (service.canUndo()) {
        service.undo();
        undoCount++;
      }

      expect(undoCount).toBe(20);
    });

    it('replaceScore resets the history', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.replaceScore(createEmptyScore());

      expect(service.canUndo()).toBe(false);
      expect(service.canRedo()).toBe(false);
    });

    it('undo/redo are no-ops when their stacks are empty', () => {
      const empty = createEmptyScore();
      service.replaceScore(empty);

      expect(() => service.undo()).not.toThrow();
      expect(() => service.redo()).not.toThrow();
      expect(service.score()).toBe(empty);
    });
  });
});
