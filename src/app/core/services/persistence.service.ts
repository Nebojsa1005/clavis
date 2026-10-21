import { Injectable } from '@angular/core';
import { Score } from '../models/score.model';
import { asDocument, ScoreDocument, toDocument } from '../models/score-document';
import { triggerDownload } from '../utils/download.util';

/** JSON file export/import of the internal format. Browser storage lives in ScoreLibraryService. */
@Injectable({ providedIn: 'root' })
export class PersistenceService {
  exportJsonFile(input: Score | ScoreDocument, filename = 'partitura.json'): void {
    triggerDownload(new Blob([JSON.stringify(asDocument(input), null, 2)], { type: 'application/json' }), filename);
  }

  /** Reads a document, or a score exported by an older version (a single staff). */
  async importJsonFile(file: File): Promise<ScoreDocument> {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('Fajl nije valjan JSON.');
    }
    const document = toDocument(parsed);
    if (!document) {
      throw new Error('Fajl ne sadrži validnu Clavis partituru.');
    }
    return document;
  }
}
