import { Injectable, computed, inject, signal } from '@angular/core';
import { createEmptyScore, Score } from '../models/score.model';
import { asDocument, documentFromScore, ScoreDocument } from '../models/score-document';
import { DEFAULT_SCORE_NAME, SavedScoreMeta, ScoreLibraryService } from '../services/score-library.service';
import { ScoreModelService } from './score-model.service';

export const UNTITLED_SCORE_NAME = 'Bez naslova';

/**
 * Which saved score is being edited: new / open / save / save as / delete on top of the library,
 * plus a "has unsaved changes" flag. The score itself lives in ScoreModelService.
 */
@Injectable({ providedIn: 'root' })
export class ScoreSessionService {
  private readonly library = inject(ScoreLibraryService);
  private readonly scoreModel = inject(ScoreModelService);

  /** Id of the library entry being edited, or null for a score that was never saved. */
  readonly currentId = signal<string | null>(null);
  readonly currentName = signal(UNTITLED_SCORE_NAME);
  /** Saved scores for the Open dialog, newest first. */
  readonly scores = signal<SavedScoreMeta[]>([]);

  /** The document as it was when last opened or saved; any edit produces a different object. */
  private readonly baseline = signal<ScoreDocument>(this.scoreModel.document());
  readonly dirty = computed(() => this.scoreModel.document() !== this.baseline());

  async refreshList(): Promise<void> {
    this.scores.set(await this.library.list());
  }

  /** Opens the most recently saved score, if there is one. Used once at startup. */
  async restoreLast(): Promise<void> {
    await this.refreshList();
    const latest = this.scores()[0];
    if (latest) {
      await this.open(latest.id);
    }
  }

  newScore(): void {
    this.scoreModel.replaceScore(createEmptyScore());
    this.currentId.set(null);
    this.currentName.set(UNTITLED_SCORE_NAME);
    this.baseline.set(this.scoreModel.document());
  }

  /** Shows a score that came from outside the library (an imported file) as an unsaved one. */
  adoptUnsaved(input: Score | ScoreDocument, name = UNTITLED_SCORE_NAME): void {
    this.scoreModel.replaceDocument(asDocument(input));
    this.currentId.set(null);
    this.currentName.set(name);
    // Nothing is saved yet, so the score counts as changed until it is stored.
    this.baseline.set(documentFromScore(createEmptyScore()));
  }

  /** Returns false when the entry no longer exists or holds unreadable data. */
  async open(id: string): Promise<boolean> {
    const saved = await this.library.get(id);
    if (!saved) {
      return false;
    }
    this.scoreModel.replaceDocument(saved.document);
    this.currentId.set(saved.id);
    this.currentName.set(saved.name);
    this.baseline.set(this.scoreModel.document());
    return true;
  }

  /** Saves into the current entry; a score that was never saved gets a new entry. */
  async save(): Promise<void> {
    await this.persist(this.currentId() ?? undefined, this.currentName());
  }

  /** Saves under a new name as a new entry, which then becomes the current one. */
  async saveAs(name: string): Promise<void> {
    await this.persist(undefined, name);
  }

  async remove(id: string): Promise<void> {
    await this.library.remove(id);
    if (this.currentId() === id) {
      // The score on screen is now an unsaved copy.
      this.currentId.set(null);
      this.baseline.set(documentFromScore(createEmptyScore()));
    }
    await this.refreshList();
  }

  private async persist(id: string | undefined, name: string): Promise<void> {
    const document = this.scoreModel.document();
    const meta = await this.library.save({ id, name: name || DEFAULT_SCORE_NAME, document });
    this.currentId.set(meta.id);
    this.currentName.set(meta.name);
    this.baseline.set(document);
    await this.refreshList();
  }
}
