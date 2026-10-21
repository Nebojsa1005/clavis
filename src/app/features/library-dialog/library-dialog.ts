import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ScoreSessionService } from '../../core/state/score-session.service';

export type LibraryDialogMode = 'open' | 'saveAs';

/** Modal for opening a saved score (with delete) or saving the current one under a new name. */
@Component({
  selector: 'app-library-dialog',
  imports: [DatePipe],
  templateUrl: './library-dialog.html',
  styleUrl: './library-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryDialog implements AfterViewInit {
  protected readonly session = inject(ScoreSessionService);

  readonly mode = input.required<LibraryDialogMode>();
  readonly closed = output<void>();

  /** Entry whose delete button was pressed once; a second press confirms. */
  protected readonly pendingDeleteId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    void this.session.refreshList();
  }

  ngAfterViewInit(): void {
    const input = this.nameInput()?.nativeElement;
    if (input) {
      input.focus();
      input.select();
    } else {
      this.dialog()?.nativeElement.focus();
    }
  }

  protected close(): void {
    this.closed.emit();
  }

  protected async onOpen(id: string): Promise<void> {
    if (this.session.dirty() && !window.confirm('Otvoriti drugu partituru? Nesačuvane izmene biće izgubljene.')) {
      return;
    }
    this.error.set(null);
    if (await this.session.open(id)) {
      this.close();
    } else {
      this.error.set('Partitura se ne može otvoriti (obrisana je ili je oštećena).');
      await this.session.refreshList();
    }
  }

  protected async onDelete(id: string): Promise<void> {
    if (this.pendingDeleteId() !== id) {
      this.pendingDeleteId.set(id);
      return;
    }
    this.pendingDeleteId.set(null);
    await this.session.remove(id);
  }

  protected async onSaveAs(event: Event, name: string): Promise<void> {
    event.preventDefault();
    try {
      await this.session.saveAs(name);
      this.close();
    } catch (error) {
      this.error.set(`Čuvanje nije uspelo: ${String(error)}`);
    }
  }
}
