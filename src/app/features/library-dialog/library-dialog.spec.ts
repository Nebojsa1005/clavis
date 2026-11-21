import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote, Score } from '../../core/models/score.model';
import { LIBRARY_DB_NAME } from '../../core/services/score-library.service';
import { ScoreModelService } from '../../core/state/score-model.service';
import { ScoreSessionService } from '../../core/state/score-session.service';
import { waitUntil } from '../../testing/wait-until';
import { OmrService } from '../../core/services/omr.service';
import { LibraryDialog, LibraryDialogMode } from './library-dialog';

describe('LibraryDialog', () => {
  let fixture: ComponentFixture<LibraryDialog>;
  let session: ScoreSessionService;
  let scoreModel: ScoreModelService;
  let closed: jasmine.Spy;

  const scoreWith = (step: 'C' | 'D' | 'E'): Score => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote(step, 4, 'quarter'));
    return score;
  };
  const root = () => fixture.nativeElement as HTMLElement;
  const entries = () => Array.from(root().querySelectorAll('.entry'));
  const buttonIn = (entry: Element, text: string) =>
    Array.from(entry.querySelectorAll('button')).find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  async function create(mode: LibraryDialogMode) {
    fixture = TestBed.createComponent(LibraryDialog);
    fixture.componentRef.setInput('mode', mode);
    closed = jasmine.createSpy('closed');
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    await settle();
  }

  async function seed(name: string, step: 'C' | 'D' | 'E') {
    scoreModel.replaceScore(scoreWith(step));
    await session.saveAs(name);
    await new Promise((resolve) => setTimeout(resolve, 3));
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LibraryDialog],
      providers: [{ provide: LIBRARY_DB_NAME, useValue: `clavis-test-${crypto.randomUUID()}` }],
    });
    session = TestBed.inject(ScoreSessionService);
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceScore(createEmptyScore());
    session.newScore();
  });

  describe('open mode', () => {
    it('says so when there is nothing saved', async () => {
      await create('open');

      expect(entries().length).toBe(0);
      expect(root().querySelector('.empty')?.textContent).toContain('Još nema sačuvanih partitura');
    });

    it('lists saved scores, newest first, with their names', async () => {
      await seed('Starija', 'C');
      await seed('Novija', 'D');

      await create('open');

      expect(entries().map((e) => e.querySelector('.entry__name')?.textContent)).toEqual(['Novija', 'Starija']);
    });

    it('opens the chosen score and closes', async () => {
      await seed('C-dur', 'C');
      const cId = session.currentId()!;
      await seed('D-dur', 'D');
      await create('open');

      buttonIn(entries()[1], 'Otvori').click();
      await waitUntil(() => closed.calls.count() > 0);

      expect(session.currentId()).toBe(cId);
      const first = scoreModel.score().measures[0].elements[0];
      expect(first.kind === 'note' && first.pitch.step).toBe('C');
      expect(closed).toHaveBeenCalled();
    });

    it('asks before throwing away unsaved changes and stays put when declined', async () => {
      await seed('Jedna', 'C');
      const otherId = session.currentId()!;
      await seed('Druga', 'D');
      scoreModel.appendElement(createNote('E', 4, 'quarter'));
      spyOn(window, 'confirm').and.returnValue(false);
      await create('open');

      buttonIn(entries().find((e) => e.textContent?.includes('Jedna'))!, 'Otvori').click();
      await settle();

      expect(window.confirm).toHaveBeenCalled();
      expect(session.currentId()).not.toBe(otherId);
      expect(closed).not.toHaveBeenCalled();
    });

    it('does not ask when there is nothing unsaved', async () => {
      await seed('Jedna', 'C');
      const id = session.currentId()!;
      await seed('Druga', 'D');
      spyOn(window, 'confirm');
      await create('open');

      buttonIn(entries().find((e) => e.textContent?.includes('Jedna'))!, 'Otvori').click();
      await waitUntil(() => session.currentId() === id);

      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('needs two presses to delete an entry', async () => {
      await seed('Brisanje', 'C');
      await create('open');

      buttonIn(entries()[0], 'Obriši').click();
      await settle();
      expect(entries().length).toBe(1);
      expect(buttonIn(entries()[0], 'Potvrdi brisanje')).toBeTruthy();

      buttonIn(entries()[0], 'Potvrdi brisanje').click();
      await waitUntil(() => session.scores().length === 0);
      await settle();
      expect(entries().length).toBe(0);
    });

    it('disarms the delete confirmation when another entry is pressed', async () => {
      await seed('Prva', 'C');
      await seed('Druga', 'D');
      await create('open');

      buttonIn(entries()[0], 'Obriši').click();
      await settle();
      buttonIn(entries()[1], 'Obriši').click();
      await settle();

      expect(entries().length).toBe(2);
      expect(buttonIn(entries()[0], 'Obriši')).toBeTruthy();
    });

    it('marks the score that is currently open', async () => {
      await seed('Otvorena', 'C');
      await create('open');

      expect(entries()[0].classList.contains('entry--current')).toBeTrue();
    });
  });

  describe('save as mode', () => {
    it('offers the current name and selects it for quick overwriting', async () => {
      await create('saveAs');

      const input = root().querySelector('input') as HTMLInputElement;
      expect(input.value).toBe('Bez naslova');
      expect(document.activeElement).toBe(input);
    });

    it('saves under the typed name and closes', async () => {
      scoreModel.appendElement(createNote('C', 4, 'quarter'));
      await create('saveAs');
      const input = root().querySelector('input') as HTMLInputElement;
      input.value = 'Moja etida';

      root().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await waitUntil(() => closed.calls.count() > 0);

      expect(session.currentName()).toBe('Moja etida');
      expect(session.dirty()).toBeFalse();
      expect(session.scores().map((s) => s.name)).toEqual(['Moja etida']);
      expect(closed).toHaveBeenCalled();
    });

    it('uses a default name for an empty field', async () => {
      await create('saveAs');
      (root().querySelector('input') as HTMLInputElement).value = '   ';

      root().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await waitUntil(() => closed.calls.count() > 0);

      expect(session.scores().length).toBe(1);
      expect(session.currentName()).toBe('Moja partitura');
    });
  });

  describe('closing', () => {
    it('closes with the Close button, a backdrop click and Escape', async () => {
      await create('open');

      (root().querySelector('.actions button') as HTMLButtonElement).click();
      expect(closed).toHaveBeenCalledTimes(1);

      (root().querySelector('.backdrop') as HTMLElement).click();
      expect(closed).toHaveBeenCalledTimes(2);

      root().querySelector('.dialog')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(closed).toHaveBeenCalledTimes(3);
    });

    it('stays open when the dialog itself is clicked', async () => {
      await create('open');

      (root().querySelector('.dialog') as HTMLElement).click();

      expect(closed).not.toHaveBeenCalled();
    });
  });

  describe('import', () => {
    const xml =
      '<score-partwise><part-list><score-part id="P1"><part-name>Flauta</part-name></score-part></part-list><part id="P1"><measure number="1">' +
      '<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
      '<note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration><type>half</type></note>' +
      '<note><chord/><pitch><step>E</step><octave>5</octave></pitch><duration>2</duration><type>half</type></note>' +
      '<note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration><type>half</type></note>' +
      '</measure></part></score-partwise>';

    async function choose(file: File) {
      const input = root().querySelector('input[type=file]') as HTMLInputElement;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
      await waitUntil(() => (fixture.detectChanges(), root().querySelector('[role=status], [role=alert]') !== null));
    }

    it('previews a MusicXML file with what gets lost, then opens it as an unsaved score', async () => {
      await create('import');
      await choose(new File([xml], 'Menuet.musicxml'));

      expect(root().textContent).toContain('Flauta · 1 takt(ova) · 2 nota');
      expect(root().textContent).toContain('Akord sveden na jednu notu');

      (Array.from(root().querySelectorAll('button')).find((b) => b.textContent?.includes('Otvori u editoru')) as HTMLButtonElement).click();

      expect(session.currentName()).toBe('Menuet');
      expect(session.currentId()).toBeNull();
      expect(scoreModel.document().parts[0].name).toBe('Flauta');
      expect(closed).toHaveBeenCalled();
    });

    it('recognises a PDF through the OMR service, showing progress, then previews it', async () => {
      let finish!: (xml: string) => void;
      const omr = TestBed.inject(OmrService);
      spyOn(omr, 'recognize').and.callFake((_pdf, onProgress) => {
        onProgress({ page: 1, pages: 3 });
        return new Promise<string>((resolve) => (finish = resolve));
      });
      await create('import');

      await choose(new File(['%PDF-1.4'], 'Menuet.pdf'));
      expect(root().textContent).toContain('Prepoznajem note… strana 2 od 3');

      finish(xml);
      await waitUntil(() => (fixture.detectChanges(), root().textContent!.includes('Otvori u editoru')));
      expect(root().textContent).toContain('prepoznate automatski');
      expect(root().textContent).toContain('Akord sveden na jednu notu');
    });

    it('shows why the import failed: OMR service down, broken file', async () => {
      spyOn(TestBed.inject(OmrService), 'recognize').and.rejectWith(new Error('OMR servis nije dostupan'));
      await create('import');

      await choose(new File(['%PDF-1.4'], 'skenirano.pdf'));
      await waitUntil(() => (fixture.detectChanges(), root().querySelector('[role=alert]') !== null));
      expect(root().querySelector('[role=alert]')?.textContent).toContain('OMR servis nije dostupan');

      await choose(new File(['nije xml'], 'lose.xml'));
      await waitUntil(() => (fixture.detectChanges(), root().querySelector('[role=alert]')?.textContent?.includes('XML') === true));
    });
  });
});
