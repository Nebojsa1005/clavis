import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote } from '../models/score.model';
import { PersistenceService } from './persistence.service';

describe('PersistenceService', () => {
  let service: PersistenceService;

  beforeEach(() => {
    service = TestBed.inject(PersistenceService);
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
