import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createMeasure, createNote, MeasureElement } from '../models/score.model';
import { ScoreModelService } from './score-model.service';
import { SelectionService } from './selection.service';

describe('SelectionService', () => {
  let service: SelectionService;
  let scoreModel: ScoreModelService;
  let first: MeasureElement[];
  let second: MeasureElement[];

  beforeEach(() => {
    service = TestBed.inject(SelectionService);
    scoreModel = TestBed.inject(ScoreModelService);
    first = ['C', 'D', 'E', 'F'].map((step) => createNote(step as 'C', 4, 'quarter'));
    second = ['G', 'A'].map((step) => createNote(step as 'G', 4, 'quarter'));
    scoreModel.replaceScore({
      ...createEmptyScore(),
      measures: [createMeasure(first), createMeasure(second)],
    });
  });

  const ids = (elements: MeasureElement[]) => elements.map((el) => el.id);

  it('starts with no selection', () => {
    expect(service.selectedId()).toBeNull();
    expect(service.selectedIds()).toEqual([]);
    expect(service.count()).toBe(0);
  });

  it('select sets the id, clear resets it', () => {
    service.select(first[0].id);
    expect(service.selectedId()).toBe(first[0].id);

    service.clear();
    expect(service.selectedId()).toBeNull();
  });

  it('select replaces the previous selection', () => {
    service.select(first[0].id);
    service.select(first[1].id);

    expect(service.selectedIds()).toEqual([first[1].id]);
  });

  describe('extendTo', () => {
    it('selects the range between the anchor and the target in score order', () => {
      service.select(first[1].id);

      service.extendTo(first[3].id);

      expect(service.selectedIds()).toEqual(ids(first.slice(1)));
      expect(service.selectedId()).toBeNull();
    });

    it('works backwards and across measures', () => {
      service.select(second[0].id);

      service.extendTo(first[2].id);

      expect(service.selectedIds()).toEqual([first[2].id, first[3].id, second[0].id]);
    });

    it('keeps the anchor so the range can be re-aimed', () => {
      service.select(first[1].id);
      service.extendTo(first[3].id);

      service.extendTo(first[0].id);

      expect(service.selectedIds()).toEqual(ids(first.slice(0, 2)));
    });

    it('behaves like select when there is no anchor', () => {
      service.extendTo(first[2].id);

      expect(service.selectedIds()).toEqual([first[2].id]);
    });
  });

  describe('toggle', () => {
    it('adds and removes single elements without touching the others', () => {
      service.select(first[0].id);

      service.toggle(first[2].id);
      expect(service.selectedIds()).toEqual([first[0].id, first[2].id]);

      service.toggle(first[0].id);
      expect(service.selectedIds()).toEqual([first[2].id]);
    });

    it('always reports ids in score order', () => {
      service.select(second[1].id);
      service.toggle(first[0].id);

      expect(service.selectedIds()).toEqual([first[0].id, second[1].id]);
    });
  });

  describe('measures', () => {
    it('selects every element of a measure', () => {
      service.selectMeasure(1);

      expect(service.selectedIds()).toEqual(ids(second));
    });

    it('extends the range to the end of a measure', () => {
      service.select(first[2].id);

      service.selectMeasure(1, true);

      expect(service.selectedIds()).toEqual([first[2].id, first[3].id, ...ids(second)]);
    });

    it('selects nothing for an empty or missing measure', () => {
      service.select(first[0].id);

      service.selectMeasure(9);

      expect(service.selectedIds()).toEqual([]);
    });
  });

  it('selectAll selects the whole score', () => {
    service.selectAll();

    expect(service.selectedIds()).toEqual([...ids(first), ...ids(second)]);
  });

  it('drops ids that disappear from the score', () => {
    service.selectMany([first[0].id, first[1].id]);

    scoreModel.deleteElement(first[0].id);

    expect(service.selectedIds()).toEqual([first[1].id]);
    expect(service.selectedId()).toBe(first[1].id);
  });
});
