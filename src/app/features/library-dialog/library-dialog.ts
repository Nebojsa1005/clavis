import { DatePipe } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { fromMusicXml, MusicXmlImport, readMusicXmlFile } from '../../core/models/musicxml-import';
import { OmrProgress, OmrService } from '../../core/services/omr.service';
import { allStaves } from '../../core/models/score-document';
import { ScoreSessionService } from '../../core/state/score-session.service';

export type LibraryDialogMode = 'open' | 'saveAs' | 'import';

/** What the chosen file turned into, before it replaces the score in the editor. */
interface ImportPreview {
  name: string;
  result: MusicXmlImport;
  summary: string;
  /** Recognised from a PDF (OMR), so it may contain recognition mistakes. */
  recognised: boolean;
}

/**
 * Modal for opening a saved score (with delete), saving the current one under a new name, or
 * importing a MusicXML file or a PDF, whose notes the OMR service recognises.
 */
@Component({
  selector: 'app-library-dialog',
  imports: [DatePipe],
  templateUrl: './library-dialog.html',
  styleUrl: './library-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LibraryDialog implements AfterViewInit {
  protected readonly session = inject(ScoreSessionService);
  private readonly omr = inject(OmrService);
  /** Stops polling the OMR service when the dialog goes away mid-recognition. */
  private readonly aborter = new AbortController();

  readonly mode = input.required<LibraryDialogMode>();
  readonly closed = output<void>();

  /** Entry whose delete button was pressed once; a second press confirms. */
  protected readonly pendingDeleteId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly preview = signal<ImportPreview | null>(null);
  /** Set while a PDF is being recognised: its name and how far the service got. */
  protected readonly recognising = signal<{ name: string; progress: OmrProgress } | null>(null);

  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>('nameInput');
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    inject(DestroyRef).onDestroy(() => this.aborter.abort());
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

  protected async onFileChosen(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.error.set(null);
    this.preview.set(null);
    if (!file || this.recognising()) {
      return;
    }
    const isPdf = /\.pdf$/i.test(file.name);
    try {
      let result: MusicXmlImport;
      if (isPdf) {
        this.recognising.set({ name: file.name, progress: { page: 0, pages: 0 } });
        const xml = await this.omr.recognize(file, (progress) => this.recognising.set({ name: file.name, progress }), this.aborter.signal);
        result = fromMusicXml(xml);
      } else {
        result = await readMusicXmlFile(file);
      }
      const staves = allStaves(result.document);
      const measures = staves[0].staff.score.measures.length;
      const notes = staves.reduce((sum, ref) => sum + ref.staff.score.measures.reduce((n, m) => n + m.elements.filter((e) => e.kind === 'note').length, 0), 0);
      const parts = result.document.parts.map((part) => part.name).join(', ');
      this.preview.set({
        name: file.name.replace(/\.(musicxml|xml|mxl|pdf)$/i, ''),
        result,
        summary: `${parts} · ${measures} takt(ova) · ${notes} nota`,
        recognised: isPdf,
      });
    } catch (error) {
      if (!this.aborter.signal.aborted) {
        this.error.set(`Uvoz nije uspeo: ${error instanceof Error ? error.message : String(error)}`);
      }
    } finally {
      this.recognising.set(null);
    }
  }

  protected onImport(): void {
    const preview = this.preview();
    if (!preview || (this.session.dirty() && !window.confirm('Otvoriti uvezenu partituru? Nesačuvane izmene biće izgubljene.'))) {
      return;
    }
    this.session.adoptUnsaved(preview.result.document, preview.name);
    this.close();
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
