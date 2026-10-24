import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createMeasure, createNote, createRest, MeasureElement } from '../models/score.model';
import { CaretService } from './caret.service';
import { ClipboardService } from './clipboard.service';
import { NoteInputService } from './note-input.service';
import { EditingService } from './editing.service';
import { ScoreModelService } from './score-model.service';
import { SelectionService } from './selection.service';

describe('EditingService', () => {
  let editing: EditingService;
  let scoreModel: ScoreModelService;
  let selection: SelectionService;
  let caret: CaretService;
  let clipboard: ClipboardService;
  let first: MeasureElement[];
  let second: MeasureElement[];

  const steps = () =>
    scoreModel.score().measures.map((m) => m.elements.map((el) => (el.kind === 'note' ? el.pitch.step : 'r')));

  beforeEach(() => {
    editing = TestBed.inject(EditingService);
    scoreModel = TestBed.inject(ScoreModelService);
    selection = TestBed.inject(SelectionService);
    caret = TestBed.inject(CaretService);
    clipboard = TestBed.inject(ClipboardService);

    first = ['C', 'D', 'E', 'F'].map((s) => createNote(s as 'C', 4, 'quarter'));
    second = ['G', 'A'].map((s) => createNote(s as 'G', 4, 'quarter'));
    scoreModel.replaceScore({ ...createEmptyScore(), measures: [createMeasure(first), createMeasure(second)] });
  });

  describe('deleteSelection', () => {
    it('removes the whole selected range and clears the selection', () => {
      selection.select(first[1].id);
      selection.extendTo(second[0].id);

      editing.deleteSelection();

      expect(steps()).toEqual([['C'], ['A']]);
      expect(selection.count()).toBe(0);
    });

    it('puts the caret where the range started', () => {
      selection.select(first[1].id);
      selection.extendTo(first[2].id);

      editing.deleteSelection();

      expect(caret.position()).toEqual({ measureIndex: 0, voice: 0, tick: 64 });
    });

    it('is one undo step', () => {
      selection.selectMeasure(0);

      editing.deleteSelection();
      scoreModel.undo();

      expect(steps()).toEqual([['C', 'D', 'E', 'F'], ['G', 'A']]);
    });

    it('does nothing without a selection', () => {
      editing.deleteSelection();

      expect(scoreModel.canUndo()).toBeFalse();
    });
  });

  describe('toggleTie', () => {
    let noteInput: NoteInputService;
    let run: MeasureElement[];

    beforeEach(() => {
      noteInput = TestBed.inject(NoteInputService);
      noteInput.setActive(false);
      // C C C D | E E  (all quarters, one measure of four plus two in the next)
      run = ['C', 'C', 'C', 'D'].map((s) => createNote(s as 'C', 4, 'quarter'));
      second = ['E', 'E'].map((s) => createNote(s as 'E', 4, 'quarter'));
      scoreModel.replaceScore({ ...createEmptyScore(), measures: [createMeasure(run), createMeasure(second)] });
    });

    const flags = () =>
      scoreModel.score().measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' && el.tieToNext ? 'T' : '-')));

    it('ties a single selected note to the next note of the same pitch', () => {
      selection.select(run[0].id);

      editing.toggleTie();

      expect(flags()).toEqual(['T', '-', '-', '-', '-', '-']);
    });

    it('toggles the tie off again', () => {
      selection.select(run[0].id);

      editing.toggleTie();
      editing.toggleTie();

      expect(flags()).toEqual(['-', '-', '-', '-', '-', '-']);
    });

    it('does nothing for a note whose neighbour has another pitch', () => {
      selection.select(run[2].id);

      editing.toggleTie();

      expect(flags()).toEqual(['-', '-', '-', '-', '-', '-']);
      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('chains a selected run of same-pitch notes into one tied group', () => {
      selection.selectMany([run[0].id, run[1].id, run[2].id]);

      editing.toggleTie();

      expect(flags()).toEqual(['T', 'T', '-', '-', '-', '-']);
    });

    it('chains across a barline', () => {
      selection.selectMany([second[0].id, second[1].id]);

      editing.toggleTie();

      expect(flags()).toEqual(['-', '-', '-', '-', 'T', '-']);
    });

    it('only ties the selected notes to each other, not to what follows the selection', () => {
      selection.selectMany([run[0].id, run[1].id]);

      editing.toggleTie();

      expect(flags()).toEqual(['T', '-', '-', '-', '-', '-']);
    });

    it('skips pairs that cannot be tied inside a mixed selection', () => {
      selection.selectMany([run[1].id, run[2].id, run[3].id]);

      editing.toggleTie();

      expect(flags()).toEqual(['-', 'T', '-', '-', '-', '-']);
    });

    it('removes ties from a selection where all possible ties exist already', () => {
      selection.selectMany([run[0].id, run[1].id, run[2].id]);
      editing.toggleTie();

      editing.toggleTie();

      expect(flags()).toEqual(['-', '-', '-', '-', '-', '-']);
    });

    it('completes a partly tied selection instead of removing it', () => {
      selection.select(run[0].id);
      editing.toggleTie();
      selection.selectMany([run[0].id, run[1].id, run[2].id]);

      editing.toggleTie();

      expect(flags()).toEqual(['T', 'T', '-', '-', '-', '-']);
    });

    it('is one undo step', () => {
      selection.selectMany([run[0].id, run[1].id, run[2].id]);

      editing.toggleTie();
      scoreModel.undo();

      expect(flags()).toEqual(['-', '-', '-', '-', '-', '-']);
    });

    it('ignores rests in the selection', () => {
      scoreModel.replaceScore({ ...createEmptyScore(), measures: [createMeasure([createRest('quarter'), createNote('C', 4, 'quarter')])] });
      selection.selectAll();

      editing.toggleTie();

      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('arms a tie for the next entered note when nothing is selected in note input mode', () => {
      noteInput.setActive(true);

      editing.toggleTie();
      expect(noteInput.tieArmed()).toBeTrue();

      editing.toggleTie();
      expect(noteInput.tieArmed()).toBeFalse();
    });

    it('does nothing without a selection outside note input mode', () => {
      editing.toggleTie();

      expect(noteInput.tieArmed()).toBeFalse();
      expect(scoreModel.canUndo()).toBeFalse();
    });
  });

  describe('copy / cut / paste', () => {
    it('copy leaves the score alone and fills the clipboard', () => {
      selection.selectMany([first[0].id, first[1].id]);

      expect(editing.copySelection()).toBeTrue();

      expect(clipboard.hasContent()).toBeTrue();
      expect(steps()).toEqual([['C', 'D', 'E', 'F'], ['G', 'A']]);
    });

    it('copy reports false and keeps the old clipboard when nothing is selected', () => {
      selection.select(first[0].id);
      editing.copySelection();
      selection.clear();

      expect(editing.copySelection()).toBeFalse();

      expect(clipboard.paste().length).toBe(1);
    });

    it('pastes at the caret and selects what was pasted', () => {
      selection.selectMany([first[0].id, first[1].id]);
      editing.copySelection();
      selection.clear();
      caret.setPosition({ measureIndex: 1, voice: 0, tick: 128 });

      editing.paste();

      expect(steps()).toEqual([['C', 'D', 'E', 'F'], ['G', 'A', 'C', 'D']]);
      expect(selection.selectedElements().map((el) => el.kind === 'note' && el.pitch.step)).toEqual(['C', 'D']);
      expect(caret.position()).toEqual({ measureIndex: 1, voice: 0, tick: 256 });
    });

    it('pastes in front of the selection when something is selected', () => {
      selection.select(first[0].id);
      editing.copySelection();
      selection.select(second[0].id);

      editing.paste();

      expect(steps()).toEqual([['C', 'D', 'E', 'F'], ['C', 'G', 'A']]);
    });

    it('reflows when the pasted elements do not fit', () => {
      selection.selectMany([first[0].id, first[1].id, first[2].id]);
      editing.copySelection();
      selection.clear();
      caret.setPosition({ measureIndex: 0, voice: 0, tick: 0 });

      editing.paste();

      expect(steps()).toEqual([
        ['C', 'D', 'E', 'C'],
        ['D', 'E', 'F', 'G'],
        ['A'],
      ]);
    });

    it('can paste the same copy several times without sharing ids', () => {
      selection.select(first[0].id);
      editing.copySelection();
      caret.setPosition({ measureIndex: 1, voice: 0, tick: 128 });
      selection.clear();

      editing.paste();
      selection.clear();
      editing.paste();

      const ids = scoreModel.score().measures.flatMap((m) => m.elements.map((el) => el.id));
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(8);
    });

    it('paste with an empty clipboard changes nothing', () => {
      editing.paste();

      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('paste is one undo step', () => {
      selection.selectMany([first[0].id, first[1].id]);
      editing.copySelection();
      selection.clear();

      editing.paste();
      scoreModel.undo();

      expect(steps()).toEqual([['C', 'D', 'E', 'F'], ['G', 'A']]);
    });

    it('cut copies then deletes', () => {
      selection.selectMany([first[0].id, first[1].id]);

      editing.cutSelection();

      expect(steps()).toEqual([['E', 'F'], ['G', 'A']]);
      expect(clipboard.paste().length).toBe(2);
    });

    it('cut without a selection does nothing', () => {
      editing.cutSelection();

      expect(scoreModel.canUndo()).toBeFalse();
      expect(clipboard.hasContent()).toBeFalse();
    });

    it('copies non-contiguous selections in score order', () => {
      selection.select(second[1].id);
      selection.toggle(first[0].id);

      editing.copySelection();

      const pasted = clipboard.paste().map((el) => el.kind === 'note' && el.pitch.step);
      expect(pasted).toEqual(['C', 'A']);
    });
  });

  describe('beams', () => {
    let eighths: MeasureElement[];
    let quarters: MeasureElement[];

    beforeEach(() => {
      // measure 1: four eighths (two automatic beams), measure 2: four quarters
      eighths = ['C', 'D', 'E', 'F'].map((s) => createNote(s as 'C', 4, 'eighth'));
      quarters = ['C', 'D', 'E', 'F'].map((s) => createNote(s as 'C', 4, 'quarter'));
      scoreModel.replaceScore({ ...createEmptyScore(), measures: [createMeasure(eighths), createMeasure(quarters)] });
    });

    const flags = () =>
      scoreModel.score().measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' ? (el.beamToNext ?? '-') : 'r')));

    it('separates a pair that is beamed automatically', () => {
      selection.select(eighths[0].id);

      editing.toggleBeam();

      expect(flags().slice(0, 4)).toEqual(['off', '-', '-', '-']);
    });

    it('joins a pair that is not beamed automatically, across the beat', () => {
      selection.select(eighths[1].id);

      editing.toggleBeam();

      expect(flags().slice(0, 4)).toEqual(['-', 'on', '-', '-']);
    });

    it('toggles back and forth', () => {
      selection.select(eighths[1].id);

      editing.toggleBeam();
      editing.toggleBeam();
      expect(flags().slice(0, 4)).toEqual(['-', 'off', '-', '-']);

      editing.toggleBeam();
      expect(flags().slice(0, 4)).toEqual(['-', 'on', '-', '-']);
    });

    it('joins a selected run into one group, and separates all of it the next time', () => {
      selection.selectMany(eighths.map((el) => el.id));

      editing.toggleBeam();
      expect(flags().slice(0, 4)).toEqual(['on', 'on', 'on', '-']);

      editing.toggleBeam();
      expect(flags().slice(0, 4)).toEqual(['off', 'off', 'off', '-']);
    });

    it('only joins the selected notes to each other, not to what follows the selection', () => {
      selection.selectMany([eighths[1].id, eighths[2].id]);

      editing.toggleBeam();

      expect(flags().slice(0, 4)).toEqual(['-', 'on', '-', '-']);
    });

    it('does nothing for notes that cannot be beamed', () => {
      selection.selectMany(quarters.map((el) => el.id));

      editing.toggleBeam();

      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('does nothing for a last note, a rest or without a selection', () => {
      scoreModel.replaceScore({
        ...createEmptyScore(),
        measures: [createMeasure([createNote('C', 4, 'eighth'), createRest('eighth'), createNote('D', 4, 'eighth')])],
      });
      selection.selectAll();

      editing.toggleBeam();
      selection.clear();
      editing.toggleBeam();

      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('does not join the last note of one measure to the first of the next', () => {
      scoreModel.replaceScore({
        ...createEmptyScore(),
        measures: [
          createMeasure([createNote('C', 4, 'quarter'), createNote('D', 4, 'quarter'), createNote('E', 4, 'quarter'), createNote('F', 4, 'eighth')]),
          createMeasure([createNote('G', 4, 'eighth'), createNote('A', 4, 'quarter')]),
        ],
      });
      selection.select(scoreModel.score().measures[0].elements[3].id);

      editing.toggleBeam();

      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('is one undo step', () => {
      selection.selectMany(eighths.map((el) => el.id));

      editing.toggleBeam();
      scoreModel.undo();

      expect(flags().slice(0, 4)).toEqual(['-', '-', '-', '-']);
    });

    it('reports whether the selection is beamed', () => {
      selection.select(eighths[0].id);
      expect(editing.selectionBeamed()).toBeTrue();

      selection.select(eighths[1].id);
      expect(editing.selectionBeamed()).toBeFalse();

      selection.select(quarters[0].id);
      expect(editing.selectionBeamed()).toBeFalse();
    });

    describe('resetBeams', () => {
      it('hands manually set notes back to automatic', () => {
        selection.selectMany(eighths.map((el) => el.id));
        editing.toggleBeam();

        editing.resetBeams();

        expect(flags().slice(0, 4)).toEqual(['-', '-', '-', '-']);
      });

      it('only touches the selected notes', () => {
        scoreModel.setBeams([eighths[0].id, eighths[2].id], 'off');
        selection.select(eighths[0].id);

        editing.resetBeams();

        expect(flags().slice(0, 4)).toEqual(['-', '-', 'off', '-']);
      });

      it('adds no undo step when nothing was set by hand', () => {
        selection.selectMany(eighths.map((el) => el.id));

        editing.resetBeams();

        expect(scoreModel.canUndo()).toBeFalse();
      });
    });
  });
});
