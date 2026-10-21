import { TestBed } from '@angular/core/testing';
import { CARET_START } from './core/models/caret.util';
import { createEmptyScore, createNote } from './core/models/score.model';
import { CaretService } from './core/state/caret.service';
import { NoteInputService } from './core/state/note-input.service';
import { ScoreModelService } from './core/state/score-model.service';
import { ScoreSessionService } from './core/state/score-session.service';
import { LIBRARY_DB_NAME } from './core/services/score-library.service';
import { waitUntil } from './testing/wait-until';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{ provide: LIBRARY_DB_NAME, useValue: `clavis-test-${crypto.randomUUID()}` }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render app name', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Clavis');
  });

  describe('arrow key navigation', () => {
    let caret: CaretService;
    let noteInput: NoteInputService;

    beforeEach(() => {
      caret = TestBed.inject(CaretService);
      noteInput = TestBed.inject(NoteInputService);
      const scoreModel = TestBed.inject(ScoreModelService);
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter'), createNote('D', 4, 'quarter'));
      scoreModel.replaceScore(score);
      TestBed.createComponent(App).detectChanges();
    });

    const press = (key: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key }));

    it('moves the caret with ArrowRight / ArrowLeft in note input mode', () => {
      noteInput.setActive(true);

      press('ArrowRight');
      expect(caret.position().tick).toBe(64);
      press('ArrowRight');
      expect(caret.position().tick).toBe(128);
      press('ArrowLeft');
      expect(caret.position().tick).toBe(64);
    });

    it('selects 32nd and 64th durations with keys 6 and 7', () => {
      noteInput.setActive(true);

      press('6');
      expect(noteInput.currentDuration()).toBe('thirtysecond');
      press('7');
      expect(noteInput.currentDuration()).toBe('sixtyfourth');
    });

    it('toggles the dot with the period key', () => {
      noteInput.setActive(true);

      press('.');
      expect(noteInput.dotted()).toBeTrue();
      press('.');
      expect(noteInput.dotted()).toBeFalse();
    });

    it('ignores arrow keys while note input mode is off', () => {
      noteInput.setActive(false);

      press('ArrowRight');

      expect(caret.position()).toEqual(CARET_START);
    });
  });

  describe('clef selector', () => {
    it('shows the current clef and changes it from the dropdown', () => {
      const scoreModel = TestBed.inject(ScoreModelService);
      scoreModel.replaceScore(createEmptyScore());
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select[aria-label="Ključ"]') as HTMLSelectElement;
      expect(select.value).toBe('treble');

      select.value = 'bass';
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(scoreModel.score().clef).toBe('bass');
      expect(select.value).toBe('bass');
    });
  });

  describe('file toolbar', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<App>>;
    let session: ScoreSessionService;

    const root = () => fixture.nativeElement as HTMLElement;
    const button = (title: string) => root().querySelector(`button[title^="${title}"]`) as HTMLButtonElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };

    beforeEach(async () => {
      session = TestBed.inject(ScoreSessionService);
      TestBed.inject(ScoreModelService).replaceScore(createEmptyScore());
      session.newScore();
      fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      await settle();
    });

    it('shows the score name and an unsaved marker after an edit', async () => {
      expect(root().querySelector('.score-title')?.textContent).toContain('Bez naslova');
      expect(root().querySelector('.score-title__dirty')).toBeNull();

      TestBed.inject(ScoreModelService).appendElement(createNote('C', 4, 'quarter'));
      await settle();

      expect(root().querySelector('.score-title__dirty')).not.toBeNull();
    });

    it('asks for a name when saving a score that was never saved', async () => {
      button('Sačuvaj (')!.click();
      await settle();

      expect(root().querySelector('app-library-dialog')).not.toBeNull();
      expect(root().querySelector('.dialog h2')?.textContent).toContain('Sačuvaj kao');
    });

    it('saves straight into the open score without a dialog', async () => {
      await session.saveAs('Otvorena');
      TestBed.inject(ScoreModelService).appendElement(createNote('C', 4, 'quarter'));
      await settle();

      button('Sačuvaj (')!.click();
      await waitUntil(() => !session.dirty());
      await settle();

      expect(root().querySelector('app-library-dialog')).toBeNull();
      expect(root().querySelector('.score-title__dirty')).toBeNull();
    });

    it('saves with Ctrl+S', async () => {
      await session.saveAs('Otvorena');
      TestBed.inject(ScoreModelService).appendElement(createNote('C', 4, 'quarter'));

      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
      document.dispatchEvent(event);
      await waitUntil(() => !session.dirty());

      expect(event.defaultPrevented).toBeTrue();
    });

    it('opens the Open dialog and the Save as dialog from their buttons', async () => {
      button('Otvori')!.click();
      await settle();
      expect(root().querySelector('.dialog h2')?.textContent).toContain('Otvori partituru');

      (root().querySelector('.actions button') as HTMLButtonElement).click();
      await settle();
      expect(root().querySelector('app-library-dialog')).toBeNull();

      button('Sačuvaj kao')!.click();
      await settle();
      expect(root().querySelector('.dialog h2')?.textContent).toContain('Sačuvaj kao');
    });

    it('does not run editor shortcuts while a dialog is open', async () => {
      button('Otvori')!.click();
      await settle();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));

      expect(TestBed.inject(NoteInputService).active()).toBeFalse();
    });

    it('starts a new score without asking when nothing changed', async () => {
      spyOn(window, 'confirm');

      button('Nova')!.click();
      await settle();

      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('asks before discarding unsaved changes on New and keeps them when declined', async () => {
      TestBed.inject(ScoreModelService).appendElement(createNote('C', 4, 'quarter'));
      spyOn(window, 'confirm').and.returnValue(false);

      button('Nova')!.click();
      await settle();

      expect(window.confirm).toHaveBeenCalled();
      expect(TestBed.inject(ScoreModelService).score().measures[0].elements.length).toBe(1);
    });

    it('discards the changes on New when confirmed', async () => {
      TestBed.inject(ScoreModelService).appendElement(createNote('C', 4, 'quarter'));
      spyOn(window, 'confirm').and.returnValue(true);

      button('Nova')!.click();
      await settle();

      expect(TestBed.inject(ScoreModelService).score().measures[0].elements.length).toBe(0);
      expect(session.dirty()).toBeFalse();
    });
  });
});
