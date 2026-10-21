import { Injectable } from '@angular/core';
import { isScore, Score } from '../models/score.model';
import { triggerDownload } from '../utils/download.util';

/** JSON file export/import of the internal score format. Browser storage lives in ScoreLibraryService. */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
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
}
