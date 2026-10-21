import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Clef, CLEFS, createEmptyScore, NoteDuration } from './core/models/score.model';
import { ExportService } from './core/services/export.service';
import { PersistenceService } from './core/services/persistence.service';
import { PlaybackService } from './core/services/playback.service';
import { CaretService } from './core/state/caret.service';
import { NoteInputService } from './core/state/note-input.service';
import { ScoreModelService } from './core/state/score-model.service';
import { SelectionService } from './core/state/selection.service';
import { StaffView } from './features/staff-view/staff-view';
import { TimeSignatureControl } from './features/time-signature-control/time-signature-control';

interface DurationOption {
  value: NoteDuration;
  key: string;
  label: string;
}

interface ClefOption {
  value: Clef;
  label: string;
}

const KEY_DURATION_MAP: Record<string, NoteDuration> = {
  '1': 'whole',
  '2': 'half',
  '3': 'quarter',
  '4': 'eighth',
  '5': 'sixteenth',
};

@Component({
  selector: 'app-root',
  imports: [StaffView, TimeSignatureControl],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly appName = signal('Clavis');
  protected readonly noteInput = inject(NoteInputService);
  protected readonly scoreModel = inject(ScoreModelService);
  protected readonly selection = inject(SelectionService);
  private readonly caret = inject(CaretService);
  protected readonly playback = inject(PlaybackService);
  private readonly exportService = inject(ExportService);
  private readonly persistence = inject(PersistenceService);

  protected readonly durationOptions: DurationOption[] = [
    { value: 'whole', key: '1', label: 'Cela' },
    { value: 'half', key: '2', label: 'Polovina' },
    { value: 'quarter', key: '3', label: 'Četvrtina' },
    { value: 'eighth', key: '4', label: 'Osminka' },
    { value: 'sixteenth', key: '5', label: 'Šesnaestinka' },
  ];

  protected readonly clefOptions: ClefOption[] = [
    { value: 'treble', label: 'Violinski (G)' },
    { value: 'bass', label: 'Bas (F)' },
    { value: 'alto', label: 'Alt (C)' },
    { value: 'tenor', label: 'Tenor (C)' },
  ];

  constructor() {
    this.persistence
      .loadScore()
      .then((score) => {
        if (score) {
          this.scoreModel.replaceScore(score);
        }
      })
      .catch((error: unknown) => console.warn('Učitavanje sačuvane partiture nije uspelo:', error));
  }

  protected onToggleNoteInput(): void {
    this.noteInput.toggle();
  }

  protected onSelectDuration(duration: NoteDuration): void {
    this.noteInput.setDuration(duration);
  }

  protected onClefChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    if (CLEFS.includes(select.value as Clef)) {
      this.scoreModel.setClef(select.value as Clef);
    }
    // Hand focus back so arrow keys keep driving the caret instead of the dropdown.
    select.blur();
  }

  protected onUndo(): void {
    this.scoreModel.undo();
    this.selection.clear();
  }

  protected onRedo(): void {
    this.scoreModel.redo();
    this.selection.clear();
  }

  protected onTogglePlayback(): void {
    if (this.playback.isPlaying()) {
      this.playback.stop();
    } else {
      void this.playback.play(this.scoreModel.score());
    }
  }

  protected onBpmChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.playback.setBpm(value);
  }

  protected onNew(): void {
    if (!window.confirm('Započeti novu, praznu partituru? Nesačuvane izmene biće izgubljene.')) {
      return;
    }
    this.scoreModel.replaceScore(createEmptyScore());
    this.selection.clear();
  }

  protected onSave(): void {
    void this.persistence.saveScore(this.scoreModel.score());
  }

  protected onExportJson(): void {
    this.persistence.exportJsonFile(this.scoreModel.score());
  }

  protected onImportJsonFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }

    this.persistence
      .importJsonFile(file)
      .then((score) => {
        this.scoreModel.replaceScore(score);
        this.selection.clear();
      })
      .catch((error: unknown) => {
        window.alert(error instanceof Error ? error.message : 'Import nije uspeo.');
      });
  }

  protected onExportMusicXml(): void {
    this.exportService.downloadMusicXml(this.scoreModel.score());
  }

  protected onExportMidi(): void {
    this.exportService.downloadMidi(this.scoreModel.score(), this.playback.bpm());
  }

  protected onExportSvg(): void {
    this.exportService.downloadSvg(this.scoreModel.score());
  }

  protected onExportPng(): void {
    void this.exportService.downloadPng(this.scoreModel.score());
  }

  @HostListener('document:keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key.toLowerCase() === 'n') {
      this.noteInput.toggle();
      event.preventDefault();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'z') {
      event.shiftKey ? this.onRedo() : this.onUndo();
      event.preventDefault();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      this.onRedo();
      event.preventDefault();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      const id = this.selection.selectedId();
      if (id) {
        this.scoreModel.deleteElement(id);
        this.selection.clear();
        event.preventDefault();
      }
      return;
    }

    if (!this.noteInput.active()) {
      return;
    }

    const duration = KEY_DURATION_MAP[event.key];
    if (duration) {
      this.noteInput.setDuration(duration);
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
        this.caret.moveLeft();
        event.preventDefault();
        break;
      case 'ArrowRight':
        this.caret.moveRight();
        event.preventDefault();
        break;
      case 'ArrowUp':
        this.noteInput.nudgeLastPitch(1);
        event.preventDefault();
        break;
      case 'ArrowDown':
        this.noteInput.nudgeLastPitch(-1);
        event.preventDefault();
        break;
      case ' ':
        this.noteInput.enterRest();
        event.preventDefault();
        break;
      case 'r':
      case 'R':
        this.noteInput.enterRest();
        break;
      case 'Escape':
        this.noteInput.setActive(false);
        this.selection.clear();
        break;
    }
  }
}
