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

    it('appends rests too', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createRest('quarter'));

      expect(service.score().measures[0].elements[0].kind).toBe('rest');
    });
  });

  describe('adjustLastNotePitch', () => {
    it('moves the most recently added note up a diatonic step', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.adjustLastNotePitch(1);

      const note = service.score().measures[0].elements[0];
      expect(note.kind === 'note' && note.pitch.step).toBe('D');
    });

    it('skips trailing rests and adjusts the last actual note', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createRest('quarter'));

      service.adjustLastNotePitch(-1);

      const elements = service.score().measures[0].elements;
      expect(elements[0].kind === 'note' && elements[0].pitch.step).toBe('B');
      expect(elements[0].kind === 'note' && elements[0].pitch.octave).toBe(3);
    });

    it('is a no-op when the score has only rests', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createRest('quarter'));

      expect(() => service.adjustLastNotePitch(1)).not.toThrow();
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
