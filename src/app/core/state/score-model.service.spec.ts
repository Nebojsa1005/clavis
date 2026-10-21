import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createMeasure, createNote, createRest } from '../models/score.model';
import { allStaves, createPart, findStaff } from '../models/score-document';
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

  describe('deleteElements', () => {
    const fill = () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'D', 'E', 'F', 'G'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }
      const [first, second] = service.score().measures;
      return [...first.elements, ...second.elements].map((el) => el.id);
    };

    it('removes several elements at once, across measures', () => {
      const ids = fill();

      service.deleteElements([ids[1], ids[2], ids[4]]);

      const steps = service.score().measures.flatMap((m) => m.elements.map((el) => el.kind === 'note' && el.pitch.step));
      expect(steps).toEqual(['C', 'F']);
    });

    it('is a single undo step', () => {
      const ids = fill();

      service.deleteElements([ids[0], ids[1], ids[2]]);
      service.undo();

      expect(service.score().measures.flatMap((m) => m.elements).length).toBe(5);
    });

    it('drops trailing empty measures but keeps the first one', () => {
      const ids = fill();

      service.deleteElements([ids[4]]);
      expect(service.score().measures.length).toBe(1);

      service.deleteElements(ids.slice(0, 4));
      expect(service.score().measures.length).toBe(1);
      expect(service.score().measures[0].elements.length).toBe(0);
    });

    it('leaves an empty middle measure in place', () => {
      const ids = fill();
      service.appendElement(createNote('A', 4, 'whole'));
      const secondMeasure = service.score().measures[1].elements.map((el) => el.id);

      service.deleteElements(secondMeasure);

      expect(service.score().measures.length).toBe(3);
      expect(service.score().measures[1].elements.length).toBe(0);
      expect(ids.length).toBe(5);
    });

    it('ignores unknown ids without adding an undo step', () => {
      fill();
      service.replaceScore(service.score());

      service.deleteElements(['nope']);

      expect(service.canUndo()).toBeFalse();
    });
  });

  describe('insertElements', () => {
    it('inserts several elements as one undo step', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('G', 4, 'quarter'));

      service.insertElements(0, 1, [createNote('D', 4, 'quarter'), createNote('E', 4, 'quarter')]);
      const steps = () => service.score().measures.flatMap((m) => m.elements.map((el) => el.kind === 'note' && el.pitch.step));
      expect(steps()).toEqual(['C', 'D', 'E', 'G']);

      service.undo();
      expect(steps()).toEqual(['C', 'G']);
    });

    it('does nothing for an empty list', () => {
      service.replaceScore(createEmptyScore());

      service.insertElements(0, 0, []);

      expect(service.canUndo()).toBeFalse();
    });
  });

  describe('ties', () => {
    const tiedPair = () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('C', 4, 'quarter'));
      const [first, second] = service.score().measures[0].elements;
      service.setTies([first.id], true);
      return { first, second };
    };
    const flags = () =>
      service.score().measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' && el.tieToNext ? 'T' : '-')));

    it('sets a tie on a note that can tie to its neighbour', () => {
      tiedPair();

      expect(flags()).toEqual(['T', '-']);
    });

    it('refuses a tie to a different pitch', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));
      service.appendElement(createNote('D', 4, 'quarter'));

      service.setTies([service.score().measures[0].elements[0].id], true);

      expect(flags()).toEqual(['-', '-']);
    });

    it('clears a tie', () => {
      const { first } = tiedPair();

      service.setTies([first.id], false);

      expect(flags()).toEqual(['-', '-']);
    });

    it('is a single undo step', () => {
      tiedPair();

      service.undo();

      expect(flags()).toEqual(['-', '-']);
    });

    it('is dropped when a note is inserted between the tied notes', () => {
      tiedPair();

      service.insertElement(0, 1, createNote('E', 4, 'quarter'));

      expect(flags()).toEqual(['-', '-', '-']);
    });

    it('survives an insert that keeps the pair adjacent', () => {
      tiedPair();

      service.insertElement(0, 0, createNote('E', 4, 'quarter'));

      expect(flags()).toEqual(['-', 'T', '-']);
    });

    it('is dropped when the pitch of one end changes', () => {
      tiedPair();

      service.adjustNotePitchBefore(0, 2, 1);

      expect(flags()).toEqual(['-', '-']);
    });

    it('is dropped when the tied-to note is deleted and the next one differs', () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'C', 'D'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }
      const [a, b] = service.score().measures[0].elements;
      service.setTies([a.id], true);

      service.deleteElement(b.id);

      expect(flags()).toEqual(['-', '-']);
    });

    it('reconnects over a deleted middle note when the pitches still match', () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'C', 'C'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }
      const [a, b] = service.score().measures[0].elements;
      service.setTies([a.id, b.id], true);

      service.deleteElement(b.id);

      expect(flags()).toEqual(['T', '-']);
    });

    it('stays intact when a tied pair is pushed over a barline by reflow', () => {
      service.replaceScore(createEmptyScore());
      for (const step of ['C', 'D', 'E', 'G'] as const) {
        service.appendElement(createNote(step, 4, 'quarter'));
      }
      service.appendElement(createNote('A', 4, 'quarter'));
      service.appendElement(createNote('A', 4, 'quarter'));
      const second = service.score().measures[1].elements;
      service.setTies([second[0].id], true);

      service.insertElement(0, 0, createNote('B', 4, 'quarter'));

      expect(flags().filter((f) => f === 'T').length).toBe(1);
    });

    it('sanitises scores that are loaded with stale ties', () => {
      const a = { ...createNote('C', 4, 'quarter'), tieToNext: true };
      service.replaceScore({ ...createEmptyScore(), measures: [createMeasure([a, createNote('D', 4, 'quarter')])] });

      expect(flags()).toEqual(['-', '-']);
    });

    it('ties the note before an inserted one when asked to', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.insertElement(0, 1, createNote('C', 4, 'quarter'), true);

      expect(flags()).toEqual(['T', '-']);
    });

    it('does not tie to an inserted note of another pitch', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.insertElement(0, 1, createNote('D', 4, 'quarter'), true);

      expect(flags()).toEqual(['-', '-']);
    });

    it('applies the tie together with the insert as one undo step', () => {
      service.replaceScore(createEmptyScore());
      service.appendElement(createNote('C', 4, 'quarter'));

      service.insertElement(0, 1, createNote('C', 4, 'quarter'), true);
      service.undo();

      expect(flags()).toEqual(['-']);
    });
  });

  describe('document with several staves', () => {
    let bassId: string;
    let trebleId: string;

    const stepsOf = (id: string) =>
      findStaff(service.document(), id)!.score.measures.map((m) => m.elements.map((el) => (el.kind === 'note' ? el.pitch.step : 'r')));

    beforeEach(() => {
      service.replaceScore(createEmptyScore());
      trebleId = service.activeStaffId();
      service.addPart('piano');
      bassId = allStaves(service.document())[2].staff.id;
      service.setActiveStaff(trebleId);
    });

    it('starts as one instrument with one staff', () => {
      service.replaceScore(createEmptyScore());

      expect(service.document().parts.length).toBe(1);
      expect(service.document().parts[0].staves.length).toBe(1);
      expect(service.activeStaffId()).toBe(service.document().parts[0].staves[0].id);
    });

    it('exposes the active staff as the score', () => {
      service.appendElement(createNote('C', 4, 'quarter'));

      service.setActiveStaff(bassId);
      expect(service.score().measures[0].elements.length).toBe(0);

      service.setActiveStaff(trebleId);
      expect(service.score().measures[0].elements.length).toBe(1);
    });

    it('ignores an unknown staff id', () => {
      service.setActiveStaff('nope');

      expect(service.activeStaffId()).toBe(trebleId);
    });

    it('does not create undo steps when only the active staff changes', () => {
      service.replaceScore(createEmptyScore());
      service.addPart('piano');
      service.replaceDocument(service.document());

      service.setActiveStaff(allStaves(service.document())[1].staff.id);

      expect(service.canUndo()).toBeFalse();
    });

    describe('addPart', () => {
      it('adds a grand staff with a treble and a bass staff below the existing ones', () => {
        const parts = service.document().parts;

        expect(parts.length).toBe(2);
        expect(parts[1].name).toBe('Klavir');
        expect(parts[1].staves.map((s) => s.score.clef)).toEqual(['treble', 'bass']);
      });

      it('makes the first staff of the new instrument active', () => {
        service.addPart('violin');

        const last = service.document().parts[2];
        expect(service.activeStaffId()).toBe(last.staves[0].id);
      });

      it('gives the new staves the shared signatures and the same number of measures', () => {
        service.replaceScore({ ...createEmptyScore(), keySignature: 'D', timeSignature: { numerator: 3, denominator: 4 } });
        for (const step of ['C', 'D', 'E', 'F', 'G', 'A'] as const) {
          service.appendElement(createNote(step, 4, 'quarter'));
        }

        service.addPart('cello');

        const cello = service.document().parts[1].staves[0].score;
        expect(cello.keySignature).toBe('D');
        expect(cello.timeSignature).toEqual({ numerator: 3, denominator: 4 });
        expect(cello.measures.length).toBe(2);
        expect(cello.clef).toBe('bass');
      });

      it('rejects an unknown instrument', () => {
        expect(service.addPart('kazoo')).toBeNull();
        expect(service.document().parts.length).toBe(2);
      });

      it('can be undone and redone', () => {
        service.undo();
        expect(service.document().parts.length).toBe(1);
        expect(service.activeStaffId()).toBe(trebleId);

        service.redo();
        expect(service.document().parts.length).toBe(2);
      });
    });

    describe('editing', () => {
      it('only changes the active staff', () => {
        service.setActiveStaff(bassId);

        service.appendElement(createNote('C', 3, 'quarter'));

        expect(stepsOf(bassId)).toEqual([['C']]);
        expect(stepsOf(trebleId)).toEqual([[]]);
      });

      it('keeps all staves the same length when one of them overflows into a new measure', () => {
        for (const step of ['C', 'D', 'E', 'F', 'G'] as const) {
          service.appendElement(createNote(step, 4, 'quarter'));
        }

        expect(stepsOf(trebleId).length).toBe(2);
        expect(stepsOf(bassId).length).toBe(2);
        expect(stepsOf(bassId)[1]).toEqual([]);
      });

      it('keeps a trailing measure while any staff still has notes in it', () => {
        for (const step of ['C', 'D', 'E', 'F', 'G'] as const) {
          service.appendElement(createNote(step, 4, 'quarter'));
        }
        service.setActiveStaff(bassId);
        service.appendElement(createNote('C', 3, 'whole'));

        service.setActiveStaff(trebleId);
        service.deleteElements([service.score().measures[1].elements[0].id]);

        expect(stepsOf(trebleId).length).toBe(2);
        expect(stepsOf(bassId).length).toBe(2);
      });

      it('drops the trailing measure once it is empty in every staff', () => {
        for (const step of ['C', 'D', 'E', 'F', 'G'] as const) {
          service.appendElement(createNote(step, 4, 'quarter'));
        }

        service.deleteElements([service.score().measures[1].elements[0].id]);

        expect(stepsOf(trebleId).length).toBe(1);
        expect(stepsOf(bassId).length).toBe(1);
      });

      it('undoes an edit of a staff that is not active any more', () => {
        service.setActiveStaff(bassId);
        service.appendElement(createNote('C', 3, 'quarter'));
        service.setActiveStaff(trebleId);

        service.undo();

        expect(stepsOf(bassId)).toEqual([[]]);
      });
    });

    describe('shared signatures', () => {
      it('changes the key signature of every staff', () => {
        service.setKeySignature('G');

        expect(allStaves(service.document()).map((r) => r.staff.score.keySignature)).toEqual(['G', 'G', 'G']);
      });

      it('changes the time signature of every staff and reflows each one', () => {
        for (const step of ['C', 'D', 'E', 'F'] as const) {
          service.appendElement(createNote(step, 4, 'quarter'));
        }
        service.setActiveStaff(bassId);
        for (const step of ['C', 'D', 'E', 'F'] as const) {
          service.appendElement(createNote(step, 3, 'quarter'));
        }

        service.setTimeSignature({ numerator: 3, denominator: 4 });

        expect(stepsOf(trebleId)).toEqual([['C', 'D', 'E'], ['F']]);
        expect(stepsOf(bassId)).toEqual([['C', 'D', 'E'], ['F']]);
        expect(allStaves(service.document()).every((r) => r.staff.score.timeSignature.numerator === 3)).toBeTrue();
      });

      it('changes the clef of the active staff only', () => {
        service.setActiveStaff(bassId);

        service.setClef('tenor');

        expect(findStaff(service.document(), bassId)?.score.clef).toBe('tenor');
        expect(findStaff(service.document(), trebleId)?.score.clef).toBe('treble');
      });
    });

    describe('replaceDocument', () => {
      it('loads a whole piece, forgets the history and returns to the first staff', () => {
        service.setActiveStaff(bassId);
        service.appendElement(createNote('C', 3, 'quarter'));
        const doc = { parts: [createPart('Violina', [createEmptyScore()])] };

        service.replaceDocument(doc);

        expect(service.document().parts.length).toBe(1);
        expect(service.canUndo()).toBeFalse();
        expect(service.activeStaffId()).toBe(doc.parts[0].staves[0].id);
      });

      it('normalizes what it loads', () => {
        const uneven = { parts: [createPart('Klavir', [createEmptyScore(), createEmptyScore('bass')])] };
        uneven.parts[0].staves[0].score = {
          ...createEmptyScore(),
          measures: [createMeasure([createNote('C', 4, 'whole')]), createMeasure([createNote('D', 4, 'whole')])],
        };

        service.replaceDocument(uneven);

        expect(service.document().parts[0].staves[1].score.measures.length).toBe(2);
      });
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
