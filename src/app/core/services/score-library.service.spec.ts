import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, Score } from '../models/score.model';
import { DEFAULT_SCORE_NAME, LIBRARY_DB_NAME, ScoreLibraryService } from './score-library.service';

function uniqueDbName(): string {
  return `clavis-test-${crypto.randomUUID()}`;
}

function scoreWithNote(step: 'C' | 'D' | 'E' = 'C'): Score {
  const score = createEmptyScore();
  score.measures[0].elements.push(createNote(step, 4, 'quarter'));
  return score;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function stepOf(saved: { score: Score } | null): string | null {
  const element = saved?.score.measures[0].elements[0];
  return element?.kind === 'note' ? element.pitch.step : null;
}

describe('ScoreLibraryService', () => {
  let library: ScoreLibraryService;
  let dbName: string;

  beforeEach(() => {
    dbName = uniqueDbName();
    TestBed.configureTestingModule({ providers: [{ provide: LIBRARY_DB_NAME, useValue: dbName }] });
    library = TestBed.inject(ScoreLibraryService);
  });

  it('starts empty', async () => {
    expect(await library.list()).toEqual([]);
  });

  it('saves a new score and gives it an id, name and modification time', async () => {
    const before = Date.now();

    const meta = await library.save({ name: 'Etida', score: scoreWithNote() });

    expect(meta.id).toBeTruthy();
    expect(meta.name).toBe('Etida');
    expect(meta.modified).toBeGreaterThanOrEqual(before);
    expect(await library.list()).toEqual([meta]);
  });

  it('round-trips the score data', async () => {
    const score = scoreWithNote('E');

    const { id } = await library.save({ name: 'A', score });
    const loaded = await library.get(id);

    expect(loaded?.score).toEqual(score);
    expect(loaded?.name).toBe('A');
  });

  it('keeps several scores apart', async () => {
    const first = await library.save({ name: 'Prva', score: scoreWithNote('C') });
    const second = await library.save({ name: 'Druga', score: scoreWithNote('D') });

    expect(first.id).not.toBe(second.id);
    expect(stepOf(await library.get(first.id))).toBe('C');
    expect(stepOf(await library.get(second.id))).toBe('D');
    expect((await library.list()).length).toBe(2);
  });

  it('overwrites an entry when saving with its id and bumps the modification time', async () => {
    const created = await library.save({ name: 'Naziv', score: scoreWithNote('C') });
    await wait(5);

    const updated = await library.save({ id: created.id, name: 'Naziv', score: scoreWithNote('D') });

    expect(updated.id).toBe(created.id);
    expect(updated.modified).toBeGreaterThan(created.modified);
    expect((await library.list()).length).toBe(1);
    expect(stepOf(await library.get(created.id))).toBe('D');
  });

  it('lists the most recently saved score first', async () => {
    const older = await library.save({ name: 'Starija', score: scoreWithNote() });
    await wait(5);
    const newer = await library.save({ name: 'Novija', score: scoreWithNote() });

    expect((await library.list()).map((m) => m.id)).toEqual([newer.id, older.id]);
  });

  it('does not put score data into the list', async () => {
    await library.save({ name: 'X', score: scoreWithNote() });

    const [entry] = await library.list();

    expect(Object.keys(entry).sort()).toEqual(['id', 'modified', 'name']);
  });

  it('falls back to a default name for a blank one and trims names', async () => {
    const blank = await library.save({ name: '   ', score: scoreWithNote() });
    const padded = await library.save({ name: '  Sonata  ', score: scoreWithNote() });

    expect(blank.name).toBe(DEFAULT_SCORE_NAME);
    expect(padded.name).toBe('Sonata');
  });

  it('renames an entry without touching its data', async () => {
    const score = scoreWithNote('E');
    const { id } = await library.save({ name: 'Staro', score });

    await library.rename(id, 'Novo ime');

    const loaded = await library.get(id);
    expect(loaded?.name).toBe('Novo ime');
    expect(loaded?.score).toEqual(score);
  });

  it('removes an entry', async () => {
    const keep = await library.save({ name: 'Ostaje', score: scoreWithNote() });
    const drop = await library.save({ name: 'Briše se', score: scoreWithNote() });

    await library.remove(drop.id);

    expect((await library.list()).map((m) => m.id)).toEqual([keep.id]);
    expect(await library.get(drop.id)).toBeNull();
  });

  it('returns null for an unknown id and ignores removing one', async () => {
    expect(await library.get('nope')).toBeNull();
    await expectAsync(library.remove('nope')).toBeResolved();
  });

  it('returns null for an entry whose data is not a valid score', async () => {
    const { id } = await library.save({ name: 'Kvar', score: scoreWithNote() });
    await corruptRecord(dbName, id);

    expect(await library.get(id)).toBeNull();
    expect((await library.list()).length).toBe(1);
  });

  describe('migration from the single-slot database', () => {
    it('copies the old current score into the library on first open', async () => {
      const legacyScore = scoreWithNote('E');
      await createLegacyDb(dbName, legacyScore);

      const entries = await library.list();

      expect(entries.length).toBe(1);
      expect(entries[0].name).toBe(DEFAULT_SCORE_NAME);
      const migrated = await library.get(entries[0].id);
      expect(migrated?.score).toEqual(legacyScore);
    });

    it('migrates nothing when the old database held no score', async () => {
      await createLegacyDb(dbName, null);

      expect(await library.list()).toEqual([]);
    });

    it('does not migrate an old record that is not a valid score', async () => {
      await createLegacyDb(dbName, { hello: 'world' });

      expect(await library.list()).toEqual([]);
    });

    it('migrates only once, not on every open', async () => {
      await createLegacyDb(dbName, scoreWithNote());
      await library.list();

      const second = TestBed.runInInjectionContext(() => new ScoreLibraryService());

      expect((await second.list()).length).toBe(1);
    });
  });
});

/** Builds a version-1 database the way the previous app version stored its single score. */
function createLegacyDb(name: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('scores');
      if (value !== null) {
        store.put(value, 'current');
      }
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

function corruptRecord(name: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('library', 'readwrite');
      const store = tx.objectStore('library');
      const get = store.get(id);
      get.onsuccess = () => store.put({ ...get.result, data: { not: 'a score' } });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}
