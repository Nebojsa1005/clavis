import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { CARET_CLASS, NotationRendererService } from './core/services/notation-renderer.service';
import { PersistenceService } from './core/services/persistence.service';
import { createEmptyScore, createMeasure, createNote, MeasureElement } from './core/models/score.model';
import { CaretService } from './core/state/caret.service';
import { NoteInputService } from './core/state/note-input.service';
import { ScoreModelService } from './core/state/score-model.service';

/**
 * End-to-end checks of the caret / insert workflow against the real renderer in a real browser:
 * nothing is mocked except the IndexedDB load, which would race with the test fixtures.
 */
describe('Caret editing (integration)', () => {
  let fixture: ComponentFixture<App>;
  let scoreModel: ScoreModelService;
  let caret: CaretService;
  let noteInput: NoteInputService;
  let renderer: NotationRendererService;

  const quarters = (...steps: ('C' | 'D' | 'E' | 'F' | 'G')[]): MeasureElement[] =>
    steps.map((step) => createNote(step, 4, 'quarter'));

  function setup(...measures: MeasureElement[][]): void {
    scoreModel.replaceScore({ ...createEmptyScore(), measures: measures.map((m) => createMeasure(m)) });
    fixture.detectChanges();
  }

  function press(key: string): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
    fixture.detectChanges();
  }

  const host = () => fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
  const caretLine = () => host().querySelector(`.${CARET_CLASS}`);
  const caretX = () => Number(caretLine()!.getAttribute('x1'));
  const labels = (measureIndex: number) =>
    scoreModel.score().measures[measureIndex].elements.map((el) => (el.kind === 'note' ? el.pitch.step : 'r'));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();

    scoreModel = TestBed.inject(ScoreModelService);
    caret = TestBed.inject(CaretService);
    noteInput = TestBed.inject(NoteInputService);
    renderer = TestBed.inject(NotationRendererService);
    spyOn(TestBed.inject(PersistenceService), 'loadScore').and.resolveTo(null);

    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
  });

  describe('caret rendering', () => {
    it('is hidden until note input mode is switched on, then shown', () => {
      setup(quarters('C', 'D'));
      expect(caretLine()).toBeNull();

      press('n');

      expect(noteInput.active()).toBeTrue();
      expect(caretLine()).not.toBeNull();
    });

    it('disappears again when note input mode is switched off with Escape', () => {
      setup(quarters('C', 'D'));
      press('n');

      press('Escape');

      expect(caretLine()).toBeNull();
    });

    it('moves right on screen when the caret moves right', () => {
      setup(quarters('C', 'D', 'E'));
      press('n');
      const startX = caretX();

      press('ArrowRight');
      const afterOne = caretX();
      press('ArrowRight');
      const afterTwo = caretX();

      expect(afterOne).toBeGreaterThan(startX);
      expect(afterTwo).toBeGreaterThan(afterOne);
    });

    it('is drawn exactly once per render', () => {
      setup(quarters('C', 'D'));
      press('n');
      press('ArrowRight');
      press('ArrowRight');

      expect(host().querySelectorAll(`.${CARET_CLASS}`).length).toBe(1);
    });
  });

  describe('keyboard navigation', () => {
    it('walks through notes and rests, across the barline, and stops at both ends', () => {
      setup(quarters('C', 'D', 'E', 'F'), quarters('G'));
      press('n');

      const visited: string[] = [];
      for (let i = 0; i < 8; i++) {
        const { measureIndex, tick } = caret.position();
        visited.push(`${measureIndex}:${tick}`);
        press('ArrowRight');
      }
      expect(visited).toEqual(['0:0', '0:64', '0:128', '0:192', '1:0', '1:64', '1:64', '1:64']);

      for (let i = 0; i < 8; i++) {
        press('ArrowLeft');
      }
      expect(caret.position()).toEqual({ measureIndex: 0, voice: 0, tick: 0 });
    });
  });

  describe('insertion', () => {
    it('inserts a rest in the middle of the score and leaves the caret after it', () => {
      setup(quarters('C', 'D', 'E'));
      press('n');
      press('ArrowRight');

      press(' ');

      expect(labels(0)).toEqual(['C', 'r', 'D', 'E']);
      expect(caret.position()).toEqual({ measureIndex: 0, voice: 0, tick: 128 });
    });

    it('inserts a note at the start without losing the existing ones', () => {
      setup(quarters('D', 'E'));
      press('n');

      const { topLineY } = renderer.getStaffGeometry();
      clickAt(caretX(), topLineY);

      expect(labels(0)).toEqual(['F', 'D', 'E']);
    });

    it('shifts a full measure and spills its last note into the next measure', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      press('n');

      press(' ');

      expect(labels(0)).toEqual(['r', 'C', 'D', 'E']);
      expect(labels(1)).toEqual(['F']);
      expect(host().querySelectorAll('.vf-stavenote').length).toBe(5);
    });

    it('cascades the overflow through several measures', () => {
      setup(quarters('C', 'D', 'E', 'F'), quarters('C', 'D', 'E', 'F'));
      press('n');

      press(' ');

      expect(labels(0)).toEqual(['r', 'C', 'D', 'E']);
      expect(labels(1)).toEqual(['F', 'C', 'D', 'E']);
      expect(labels(2)).toEqual(['F']);
    });

    it('appends at the end when the caret is at the end of the score', () => {
      setup(quarters('C', 'D'));
      press('n');
      caret.moveToEnd();

      press(' ');

      expect(labels(0)).toEqual(['C', 'D', 'r']);
    });

    it('builds a phrase in order when typing several elements in a row', () => {
      setup(quarters('C', 'G'));
      press('n');
      press('ArrowRight');

      press(' ');
      press(' ');

      expect(labels(0)).toEqual(['C', 'r', 'r', 'G']);
      expect(caret.position().tick).toBe(192);
    });

    it('inserts a dotted element and advances the caret by its dotted length', () => {
      setup(quarters('C', 'D'));
      press('n');

      press('.');
      press(' ');

      expect(scoreModel.score().measures[0].elements[0].dotted).toBeTrue();
      expect(caret.position().tick).toBe(96);
    });

    it('inserts a 64th note with key 7', () => {
      setup(quarters('C', 'D'));
      press('n');

      press('7');
      press(' ');

      expect(scoreModel.score().measures[0].elements[0].duration).toBe('sixtyfourth');
      expect(caret.position().tick).toBe(4);
    });

    it('is undone in one step and the caret stays on a valid stop', () => {
      setup(quarters('C', 'D'));
      press('n');
      press('ArrowRight');
      press(' ');

      scoreModel.undo();
      fixture.detectChanges();

      expect(labels(0)).toEqual(['C', 'D']);
      expect(caretLine()).not.toBeNull();
    });

    it('inserts at the position clicked on the staff, not at the end', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      press('n');
      const target = renderer.getCaretX({ measureIndex: 0, voice: 0, tick: 128 })!;
      const { topLineY } = renderer.getStaffGeometry();

      clickAt(target, topLineY);

      expect(labels(0)).toEqual(['C', 'D', 'F', 'E']);
      expect(labels(1)).toEqual(['F']);
    });

    it('keeps the pitch derived from the click height', () => {
      setup(quarters('C', 'D'));
      press('n');
      const { topLineY } = renderer.getStaffGeometry();

      clickAt(renderer.getCaretX({ measureIndex: 0, voice: 0, tick: 64 })!, topLineY);

      const inserted = scoreModel.score().measures[0].elements[1];
      expect(inserted.kind === 'note' && inserted.pitch).toEqual({ step: 'F', octave: 5, accidental: null });
    });

    it('nudges the pitch of the note before the caret with the up/down arrows', () => {
      setup(quarters('C', 'D', 'E'));
      press('n');
      press('ArrowRight');

      press('ArrowUp');

      const first = scoreModel.score().measures[0].elements[0];
      expect(first.kind === 'note' && first.pitch.step).toBe('D');
    });
  });

  /** Dispatches a real click on the staff at the given SVG coordinates. */
  function clickAt(svgX: number, svgY: number): void {
    const rect = host().getBoundingClientRect();
    host().dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + svgX, clientY: rect.top + svgY }),
    );
    fixture.detectChanges();
  }
});
