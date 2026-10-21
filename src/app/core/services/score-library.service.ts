import { Injectable, InjectionToken, inject } from '@angular/core';
import { isScore, Score } from '../models/score.model';

/** Name of the IndexedDB database; tests provide a unique one per test so they never share data. */
export const LIBRARY_DB_NAME = new InjectionToken<string>('LIBRARY_DB_NAME', {
  providedIn: 'root',
  factory: () => 'clavis',
});

const DB_VERSION = 2;
const LIBRARY_STORE = 'library';
/** The single-slot store of database version 1; kept untouched, its score is copied into the library. */
const LEGACY_STORE = 'scores';
const LEGACY_KEY = 'current';
/** Version of the record layout, for future migrations of what is stored under `data`. */
const RECORD_FORMAT = 1;

export const DEFAULT_SCORE_NAME = 'Moja partitura';

/** What the library lists for each saved score (no score data, so listing stays cheap). */
export interface SavedScoreMeta {
  id: string;
  name: string;
  /** Epoch milliseconds of the last save. */
  modified: number;
}

export interface SavedScore extends SavedScoreMeta {
  score: Score;
}

interface StoredRecord extends SavedScoreMeta {
  format: number;
  data: unknown;
}

function cleanName(name: string): string {
  return name.trim() || DEFAULT_SCORE_NAME;
}

/**
 * Many scores in IndexedDB (id, name, modification date). The only place that knows about the
 * storage, so a backend could later sit behind the same methods.
 */
@Injectable({ providedIn: 'root' })
export class ScoreLibraryService {
  private readonly dbName = inject(LIBRARY_DB_NAME);
  private dbPromise: Promise<IDBDatabase> | null = null;

  /** All saved scores, most recently saved first. */
  async list(): Promise<SavedScoreMeta[]> {
    const records = await this.request<StoredRecord[]>('readonly', (store) => store.getAll());
    return records
      .map(({ id, name, modified }) => ({ id, name, modified }))
      .sort((a, b) => b.modified - a.modified);
  }

  async get(id: string): Promise<SavedScore | null> {
    const record = await this.request<StoredRecord | undefined>('readonly', (store) => store.get(id));
    if (!record || !isScore(record.data)) {
      return null;
    }
    return { id: record.id, name: record.name, modified: record.modified, score: record.data };
  }

  /** Creates a new entry when `id` is omitted, otherwise overwrites that entry. */
  async save(input: { id?: string; name: string; score: Score }): Promise<SavedScoreMeta> {
    const meta: SavedScoreMeta = {
      id: input.id ?? crypto.randomUUID(),
      name: cleanName(input.name),
      modified: Date.now(),
    };
    const record: StoredRecord = { ...meta, format: RECORD_FORMAT, data: input.score };
    await this.request('readwrite', (store) => store.put(record));
    return meta;
  }

  async rename(id: string, name: string): Promise<void> {
    const record = await this.request<StoredRecord | undefined>('readonly', (store) => store.get(id));
    if (record) {
      await this.request('readwrite', (store) => store.put({ ...record, name: cleanName(name) }));
    }
  }

  async remove(id: string): Promise<void> {
    await this.request('readwrite', (store) => store.delete(id));
  }

  private async request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.openDb();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, mode);
      const request = run(tx.objectStore(LIBRARY_STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.dbName, DB_VERSION);
        request.onupgradeneeded = (event) => {
          const db = request.result;
          db.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
          if (event.oldVersion >= 1 && request.transaction) {
            this.migrateLegacyScore(request.transaction);
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }

  /** Copies the score of the old single-slot store into the library so existing users lose nothing. */
  private migrateLegacyScore(tx: IDBTransaction): void {
    const legacy = tx.objectStore(LEGACY_STORE).get(LEGACY_KEY);
    legacy.onsuccess = () => {
      if (isScore(legacy.result)) {
        const record: StoredRecord = {
          id: crypto.randomUUID(),
          name: DEFAULT_SCORE_NAME,
          modified: Date.now(),
          format: RECORD_FORMAT,
          data: legacy.result,
        };
        tx.objectStore(LIBRARY_STORE).put(record);
      }
    };
  }
}
