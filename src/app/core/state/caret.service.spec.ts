import { TestBed } from '@angular/core/testing';
import { CARET_START } from '../models/caret.util';
import { createEmptyScore, createMeasure, createNote } from '../models/score.model';
import { CaretService } from './caret.service';
import { ScoreModelService } from './score-model.service';

describe('CaretService', () => {
  let caret: CaretService;
  let scoreModel: ScoreModelService;

  beforeEach(() => {
    caret = TestBed.inject(CaretService);
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceScore({
      ...createEmptyScore(),
      measures: [
        createMeasure([createNote('C', 4, 'quarter'), createNote('D', 4, 'quarter')]),
        createMeasure([createNote('E', 4, 'half')]),
      ],
    });
  });

  it('starts at the beginning of the score', () => {
    expect(caret.position()).toEqual(CARET_START);
    expect(caret.insertionIndex()).toBe(0);
  });

  it('stores a valid position', () => {
    caret.setPosition({ measureIndex: 0, voice: 0, tick: 64 });

    expect(caret.position()).toEqual({ measureIndex: 0, voice: 0, tick: 64 });
    expect(caret.insertionIndex()).toBe(1);
  });

  it('snaps an invalid position to the nearest boundary', () => {
    caret.setPosition({ measureIndex: 5, voice: 3, tick: 100 });

    expect(caret.position()).toEqual({ measureIndex: 1, voice: 0, tick: 128 });
  });

  it('moves to the end of the score', () => {
    caret.moveToEnd();

    expect(caret.position()).toEqual({ measureIndex: 1, voice: 0, tick: 128 });
    expect(caret.insertionIndex()).toBe(1);
  });

  it('moves back to the start', () => {
    caret.moveToEnd();
    caret.moveToStart();

    expect(caret.position()).toEqual(CARET_START);
  });

  it('stays valid when the score shrinks underneath it', () => {
    caret.moveToEnd();
    scoreModel.replaceScore(createEmptyScore());

    expect(caret.position()).toEqual(CARET_START);
  });

  it('stays valid after undo removes the measure it pointed into', () => {
    scoreModel.appendElement(createNote('F', 4, 'whole'));
    caret.moveToEnd();
    expect(caret.position().measureIndex).toBe(2);

    scoreModel.undo();

    expect(caret.position().measureIndex).toBe(1);
  });

  it('moves right and left across element boundaries and measures', () => {
    // Measure 0 holds two quarters (not full), measure 1 a half note.
    caret.moveRight();
    expect(caret.position()).toEqual({ measureIndex: 0, voice: 0, tick: 64 });
    caret.moveRight();
    caret.moveRight();
    expect(caret.position()).toEqual({ measureIndex: 1, voice: 0, tick: 0 });
    caret.moveLeft();
    expect(caret.position()).toEqual({ measureIndex: 0, voice: 0, tick: 128 });
  });

  it('does not move past either end of the score', () => {
    caret.moveLeft();
    expect(caret.position()).toEqual(CARET_START);

    caret.moveToEnd();
    caret.moveRight();
    expect(caret.position()).toEqual({ measureIndex: 1, voice: 0, tick: 128 });
  });
});
