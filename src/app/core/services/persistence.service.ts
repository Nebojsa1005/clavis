import { Injectable } from '@angular/core';
import { isScore, Score } from '../models/score.model';
import { triggerDownload } from '../utils/download.util';

const DB_NAME = 'clavis';
const DB_VERSION = 1;
const STORE_NAME = 'scores';
const CURRENT_SCORE_KEY = 'current';

/**
 * Lokalna persistencija: autosave/load trenutne partiture u IndexedDB, plus export/import
 * internog JSON formata kao fajl. Arhitektura namerno izolovana ovde — kasniji backend (REST
 * sync) bi zamenio/dodao implementaciju iza istog `saveScore`/`loadScore` interfejsa.
 */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  async saveScore(score: Score): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(score, CURRENT_SCORE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async loadScore(): Promise<Score | null> {
    const db = await this.openDb();
    return new Promise<Score | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(CURRENT_SCORE_KEY);
      request.onsuccess = () => {
        const result = request.result;
        resolve(isScore(result) ? result : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  exportJsonFile(score: Score, filename = 'partitura.json'): void {
    triggerDownload(new Blob([JSON.stringify(score, null, 2)], { type: 'application/json' }), filename);
  }

  async importJsonFile(file: File): Promise<Score> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Fajl nije valjan JSON.');
    }
    if (!isScore(parsed)) {
      throw new Error('Fajl ne sadrži validnu Clavis partituru.');
    }
    return parsed;
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return this.dbPromise;
  }
}
