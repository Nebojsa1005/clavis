import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, Score } from '../models/score.model';
import { LIBRARY_DB_NAME } from '../services/score-library.service';
import { ScoreModelService } from './score-model.service';
import { ScoreSessionService, UNTITLED_SCORE_NAME } from './score-session.service';

describe('ScoreSessionService', () => {
  let session: ScoreSessionService;
  let scoreModel: ScoreModelService;

  const scoreWith = (step: 'C' | 'D' | 'E'): Score => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote(step, 4, 'quarter'));
    return score;
  };
  const firstStep = () => {
    const el = scoreModel.score().measures[0].elements[0];
    return el.kind === 'note' ? el.pitch.step : null;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LIBRARY_DB_NAME, useValue: `clavis-test-${crypto.randomUUID()}` }],
    });
    session = TestBed.inject(ScoreSessionService);
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceScore(createEmptyScore());
  });

  it('starts untitled, unsaved and clean', () => {
    // the service captures the score that was loaded when it was created
    session.newScore();

    expect(session.currentId()).toBeNull();
    expect(session.currentName()).toBe(UNTITLED_SCORE_NAME);
    expect(session.dirty()).toBeFalse();
  });

  it('becomes dirty after an edit and clean again after undoing it', () => {
    session.newScore();

    scoreModel.appendElement(createNote('C', 4, 'quarter'));
    expect(session.dirty()).toBeTrue();

    scoreModel.undo();
    expect(session.dirty()).toBeFalse();
  });

  describe('save as / save', () => {
    it('stores a new entry, makes it current and clears the dirty flag', async () => {
      session.newScore();
      scoreModel.appendElement(createNote('C', 4, 'quarter'));

      await session.saveAs('Etida');

      expect(session.currentId()).toBeTruthy();
      expect(session.currentName()).toBe('Etida');
      expect(session.dirty()).toBeFalse();
      expect(session.scores().map((s) => s.name)).toEqual(['Etida']);
    });

    it('save overwrites the current entry instead of creating another one', async () => {
      session.newScore();
      await session.saveAs('Etida');
      const id = session.currentId();

      scoreModel.appendElement(createNote('D', 4, 'quarter'));
      expect(session.dirty()).toBeTrue();
      await session.save();

      expect(session.currentId()).toBe(id);
      expect(session.scores().length).toBe(1);
      expect(session.dirty()).toBeFalse();
    });

    it('save on a never-saved score creates an entry named after the current name', async () => {
      session.newScore();

      await session.save();

      expect(session.scores().map((s) => s.name)).toEqual([UNTITLED_SCORE_NAME]);
      expect(session.currentId()).toBeTruthy();
    });

    it('save as creates a second entry and leaves the first one alone', async () => {
      session.newScore();
      scoreModel.appendElement(createNote('C', 4, 'quarter'));
      await session.saveAs('Prva');
      const firstId = session.currentId();

      await session.saveAs('Kopija');

      expect(session.currentId()).not.toBe(firstId);
      expect(session.scores().map((s) => s.name).sort()).toEqual(['Kopija', 'Prva']);
    });
  });

  describe('open', () => {
    it('loads another saved score and makes it current', async () => {
      scoreModel.replaceScore(scoreWith('C'));
      await session.saveAs('C-dur');
      const cId = session.currentId()!;
      scoreModel.replaceScore(scoreWith('D'));
      await session.saveAs('D-dur');

      const opened = await session.open(cId);

      expect(opened).toBeTrue();
      expect(firstStep()).toBe('C');
      expect(session.currentName()).toBe('C-dur');
      expect(session.dirty()).toBeFalse();
    });

    it('gives a fresh undo history for the opened score', async () => {
      scoreModel.replaceScore(scoreWith('C'));
      await session.saveAs('A');
      const id = session.currentId()!;
      scoreModel.appendElement(createNote('E', 4, 'quarter'));

      await session.open(id);

      expect(scoreModel.canUndo()).toBeFalse();
    });

    it('returns false for an unknown id and keeps the current score', async () => {
      scoreModel.replaceScore(scoreWith('E'));

      expect(await session.open('nope')).toBeFalse();

      expect(firstStep()).toBe('E');
    });
  });

  describe('restoreLast', () => {
    it('opens the most recently saved score', async () => {
      scoreModel.replaceScore(scoreWith('C'));
      await session.saveAs('Starija');
      await new Promise((resolve) => setTimeout(resolve, 5));
      scoreModel.replaceScore(scoreWith('D'));
      await session.saveAs('Novija');
      scoreModel.replaceScore(createEmptyScore());

      await session.restoreLast();

      expect(session.currentName()).toBe('Novija');
      expect(firstStep()).toBe('D');
    });

    it('leaves the current score alone when the library is empty', async () => {
      const before = scoreModel.score();

      await session.restoreLast();

      expect(scoreModel.score()).toBe(before);
      expect(session.currentId()).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes an entry from the list', async () => {
      session.newScore();
      await session.saveAs('Jedna');
      const keepId = session.currentId()!;
      await session.saveAs('Druga');
      const dropId = session.currentId()!;

      await session.remove(dropId);

      expect(session.scores().map((s) => s.id)).toEqual([keepId]);
    });

    it('turns the open score into an unsaved copy when its own entry is deleted', async () => {
      session.newScore();
      scoreModel.appendElement(createNote('C', 4, 'quarter'));
      await session.saveAs('Brišem');

      await session.remove(session.currentId()!);

      expect(session.currentId()).toBeNull();
      expect(session.dirty()).toBeTrue();
      expect(scoreModel.score().measures[0].elements.length).toBe(1);
    });

    it('leaves the open score alone when another entry is deleted', async () => {
      session.newScore();
      await session.saveAs('Druga');
      const otherId = session.currentId()!;
      await session.saveAs('Otvorena');
      const openId = session.currentId()!;

      await session.remove(otherId);

      expect(session.currentId()).toBe(openId);
      expect(session.dirty()).toBeFalse();
    });
  });

  it('adoptUnsaved shows an imported score as unsaved and dirty', () => {
    session.newScore();

    session.adoptUnsaved(scoreWith('E'), 'uvezena');

    expect(firstStep()).toBe('E');
    expect(session.currentId()).toBeNull();
    expect(session.currentName()).toBe('uvezena');
    expect(session.dirty()).toBeTrue();
  });
});
