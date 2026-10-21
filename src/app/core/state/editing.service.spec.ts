import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createMeasure, createNote, MeasureElement } from '../models/score.model';
import { CaretService } from './caret.service';
import { ClipboardService } from './clipboard.service';
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
});
