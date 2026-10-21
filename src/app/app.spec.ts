import { TestBed } from '@angular/core/testing';
import { CARET_START } from './core/models/caret.util';
import { createEmptyScore, createNote } from './core/models/score.model';
import { CaretService } from './core/state/caret.service';
import { NoteInputService } from './core/state/note-input.service';
import { ScoreModelService } from './core/state/score-model.service';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
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

    it('ignores arrow keys while note input mode is off', () => {
      noteInput.setActive(false);

      press('ArrowRight');

      expect(caret.position()).toEqual(CARET_START);
    });
  });
});
