import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote } from '../models/score.model';
import { PersistenceService } from './persistence.service';

/**
 * Čisti store umesto da briše celu bazu — `deleteDatabase` se blokira dok prethodne test
 * konekcije (koje PersistenceService ne zatvara) ne budu zatvorene, pa se testovi zaglave.
 */
function clearStore(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('clavis', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('scores');
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('scores', 'readwrite');
      tx.objectStore('scores').clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    request.onerror = () => reject(request.error);
  });
}

describe('PersistenceService', () => {
  let service: PersistenceService;

  beforeEach(async () => {
    await clearStore();
    service = TestBed.inject(PersistenceService);
  });

  describe('IndexedDB save/load', () => {
    it('returns null when nothing has been saved yet', async () => {
      const result = await service.loadScore();
      expect(result).toBeNull();
    });

    it('round-trips a saved score', async () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      await service.saveScore(score);
      const loaded = await service.loadScore();

      expect(loaded).toEqual(score);
    });

    it('overwrites the previously saved score', async () => {
      await service.saveScore(createEmptyScore('treble'));
      await service.saveScore(createEmptyScore('bass'));

      const loaded = await service.loadScore();
      expect(loaded?.clef).toBe('bass');
    });
  });

  describe('importJsonFile', () => {
    it('parses a valid exported score', async () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('D', 5, 'eighth'));
      const file = new File([JSON.stringify(score)], 'partitura.json', { type: 'application/json' });

      const imported = await service.importJsonFile(file);

      expect(imported).toEqual(score);
    });

    it('rejects invalid JSON', async () => {
      const file = new File(['not json'], 'bad.json', { type: 'application/json' });
      await expectAsync(service.importJsonFile(file)).toBeRejectedWithError('Fajl nije valjan JSON.');
    });

    it('rejects JSON that is not a Clavis score', async () => {
      const file = new File([JSON.stringify({ hello: 'world' })], 'bad.json', { type: 'application/json' });
      await expectAsync(service.importJsonFile(file)).toBeRejectedWithError(
        'Fajl ne sadrži validnu Clavis partituru.',
      );
    });
  });
});
