import { ComponentFixture, TestBed } from '@angular/core/testing';
import { App } from './app';
import { CARET_CLASS, NotationRendererService } from './core/services/notation-renderer.service';
import { PersistenceService } from './core/services/persistence.service';
import { createEmptyScore, createMeasure, createNote, MeasureElement, Step } from './core/models/score.model';
import { CaretService } from './core/state/caret.service';
import { NoteInputService } from './core/state/note-input.service';
import { ScoreModelService } from './core/state/score-model.service';
import { SelectionService } from './core/state/selection.service';

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

  const quarters = (...steps: Step[]): MeasureElement[] =>
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

  describe('selection', () => {
    let selection: SelectionService;

    beforeEach(() => {
      selection = TestBed.inject(SelectionService);
    });

    const noteNode = (index: number) =>
      host().querySelectorAll('[data-score-element-id]')[index] as SVGGElement;
    const idAt = (measureIndex: number, index: number) => scoreModel.score().measures[measureIndex].elements[index].id;
    const centerX = (index: number) => {
      const box = noteNode(index).getBoundingClientRect();
      return box.left + box.width / 2;
    };

    function clickNode(index: number, modifiers: MouseEventInit = {}): void {
      noteNode(index).dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers }));
      fixture.detectChanges();
    }

    function drag(fromX: number, toX: number): void {
      const y = host().getBoundingClientRect().top + 60;
      host().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: fromX, clientY: y }));
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: toX, clientY: y }));
      fixture.detectChanges();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: toX, clientY: y }));
      fixture.detectChanges();
    }

    it('selects one element on click', () => {
      setup(quarters('C', 'D', 'E'));

      clickNode(1);

      expect(selection.selectedIds()).toEqual([idAt(0, 1)]);
    });

    it('selects a contiguous range with shift+click', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      clickNode(0);

      clickNode(2, { shiftKey: true });

      expect(selection.selectedIds()).toEqual([idAt(0, 0), idAt(0, 1), idAt(0, 2)]);
    });

    it('adds and removes single elements with ctrl+click', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      clickNode(0);

      clickNode(2, { ctrlKey: true });
      expect(selection.selectedIds()).toEqual([idAt(0, 0), idAt(0, 2)]);

      clickNode(0, { ctrlKey: true });
      expect(selection.selectedIds()).toEqual([idAt(0, 2)]);
    });

    it('colors every selected element', () => {
      setup(quarters('C', 'D', 'E'));
      clickNode(0);
      clickNode(2, { shiftKey: true });

      const filled = Array.from(host().querySelectorAll('[data-score-element-id]')).filter(
        (node) => node.getAttribute('fill') === '#3b5bfd',
      );
      expect(filled.length).toBe(3);
    });

    it('selects the whole measure when clicking empty staff outside note input', () => {
      setup(quarters('C', 'D', 'E', 'F'), quarters('G', 'C'));
      const second = renderer.getCaretX({ measureIndex: 1, voice: 0, tick: 0 })!;
      const rect = host().getBoundingClientRect();

      host().dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: rect.left + second + 5, clientY: rect.top + 20 }),
      );
      fixture.detectChanges();

      expect(selection.selectedIds()).toEqual([idAt(1, 0), idAt(1, 1)]);
    });

    it('does not select a measure on empty-staff clicks while entering notes', () => {
      setup(quarters('C', 'D'));
      press('n');
      const rect = host().getBoundingClientRect();

      host().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left + 100, clientY: rect.top + 80 }));
      fixture.detectChanges();

      expect(selection.count()).toBe(0);
    });

    it('selects the elements under a drag and shows a rubber band meanwhile', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      const y = host().getBoundingClientRect().top + 60;

      host().dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: centerX(1) - 3, clientY: y }),
      );
      document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: centerX(2) + 3, clientY: y }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.selection-box')).not.toBeNull();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: centerX(2) + 3, clientY: y }));
      fixture.detectChanges();

      expect(selection.selectedIds()).toEqual([idAt(0, 1), idAt(0, 2)]);
      expect(fixture.nativeElement.querySelector('.selection-box')).toBeNull();
    });

    it('treats a tiny pointer move as a click, not a drag', () => {
      setup(quarters('C', 'D', 'E'));

      drag(centerX(1), centerX(1) + 2);
      clickNode(1);

      expect(selection.selectedIds()).toEqual([idAt(0, 1)]);
    });

    it('does not turn the click that ends a drag into a measure selection', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      const y = host().getBoundingClientRect().top + 60;
      const endX = centerX(2) + 3;

      drag(centerX(1) - 3, endX);
      host().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: endX, clientY: y }));
      fixture.detectChanges();

      expect(selection.selectedIds()).toEqual([idAt(0, 1), idAt(0, 2)]);
    });

    it('does not start a drag selection while entering notes', () => {
      setup(quarters('C', 'D', 'E'));
      press('n');

      drag(centerX(0), centerX(2));

      expect(selection.count()).toBe(0);
    });

    it('selects everything with Ctrl+A and clears with Escape outside note input', () => {
      setup(quarters('C', 'D'), quarters('E'));

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
      expect(selection.count()).toBe(3);

      press('Escape');
      expect(selection.count()).toBe(0);
    });

    it('drops selected elements that disappear after undo', () => {
      setup(quarters('C', 'D'));
      press('n');
      press(' ');
      press('Escape');
      selection.selectAll();
      expect(selection.count()).toBe(3);

      scoreModel.undo();

      expect(selection.count()).toBe(2);
    });
  });

  describe('ties', () => {
    const arcs = () => host().querySelectorAll('.vf-stavetie').length;
    const flags = () =>
      scoreModel.score().measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' && el.tieToNext ? 'T' : '-')));
    const clickNode = (index: number, modifiers: MouseEventInit = {}) => {
      host().querySelectorAll('[data-score-element-id]')[index].dispatchEvent(
        new MouseEvent('click', { bubbles: true, ...modifiers }),
      );
      fixture.detectChanges();
    };
    const sameNotes = (count: number) => Array.from({ length: count }, () => createNote('C', 4, 'quarter'));

    it('ties a selected run with the T key and shows one arc per link', () => {
      setup(sameNotes(3));
      clickNode(0);
      clickNode(2, { shiftKey: true });

      press('t');

      expect(flags()).toEqual(['T', 'T', '-']);
      expect(arcs()).toBe(2);
    });

    it('removes the arcs with a second T', () => {
      setup(sameNotes(2));
      clickNode(0);
      clickNode(1, { shiftKey: true });
      press('t');
      expect(arcs()).toBe(1);

      press('t');

      expect(flags()).toEqual(['-', '-']);
      expect(arcs()).toBe(0);
    });

    it('does not tie notes of different pitch', () => {
      setup(quarters('C', 'D'));
      clickNode(0);
      clickNode(1, { shiftKey: true });

      press('t');

      expect(arcs()).toBe(0);
    });

    it('lets T arm a tie in note input mode and ties the next same-pitch note', () => {
      setup([]);
      press('n');
      const { topLineY } = renderer.getStaffGeometry();
      clickAt(caretX(), topLineY);

      press('t');
      expect(noteInput.tieArmed()).toBeTrue();
      clickAt(caretX(), topLineY);

      expect(flags()).toEqual(['T', '-']);
      expect(arcs()).toBe(1);
      expect(noteInput.tieArmed()).toBeFalse();
    });

    it('drops the arc when something is inserted between the tied notes', () => {
      setup(sameNotes(2));
      clickNode(0);
      clickNode(1, { shiftKey: true });
      press('t');
      expect(arcs()).toBe(1);
      selection().clear();
      press('n');
      press('ArrowRight');

      press(' ');

      expect(arcs()).toBe(0);
    });

    it('undoes a tie in one step', () => {
      setup(sameNotes(3));
      clickNode(0);
      clickNode(2, { shiftKey: true });
      press('t');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
      fixture.detectChanges();

      expect(arcs()).toBe(0);
    });

    it('keeps the tie when a tied pair is copied and pasted elsewhere', () => {
      setup(sameNotes(2), []);
      clickNode(0);
      clickNode(1, { shiftKey: true });
      press('t');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }));
      selection().clear();
      caret.setPosition({ measureIndex: 1, voice: 0, tick: 0 });

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true }));
      fixture.detectChanges();

      expect(arcs()).toBe(2);
    });

    it('marks the tie button as pressed while a tied note is selected', () => {
      setup(sameNotes(2));
      clickNode(0);
      clickNode(1, { shiftKey: true });
      press('t');
      selection().clear();
      clickNode(0);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button[title="Luk trajanja (T)"]') as HTMLButtonElement;
      expect(button.getAttribute('aria-pressed')).toBe('true');
    });

    function selection(): SelectionService {
      return TestBed.inject(SelectionService);
    }
  });

  describe('range operations', () => {
    let selection: SelectionService;

    beforeEach(() => {
      selection = TestBed.inject(SelectionService);
    });

    const nodes = () => host().querySelectorAll('[data-score-element-id]');
    const clickNode = (index: number, modifiers: MouseEventInit = {}) => {
      nodes()[index].dispatchEvent(new MouseEvent('click', { bubbles: true, ...modifiers }));
      fixture.detectChanges();
    };
    const ctrl = (key: string) => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true }));
      fixture.detectChanges();
    };
    const all = () => scoreModel.score().measures.flatMap((m) => m.elements.map((el) => (el.kind === 'note' ? el.pitch.step : 'r')));

    it('deletes a shift-selected range with the Delete key', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      clickNode(1);
      clickNode(2, { shiftKey: true });

      press('Delete');

      expect(all()).toEqual(['C', 'F']);
      expect(selection.count()).toBe(0);
      expect(nodes().length).toBe(2);
    });

    it('deletes a whole measure picked by clicking empty staff', () => {
      setup(quarters('C', 'D', 'E', 'F'), quarters('G', 'A'));
      const secondMeasureX = renderer.getCaretX({ measureIndex: 1, voice: 0, tick: 0 })!;
      const rect = host().getBoundingClientRect();
      host().dispatchEvent(
        new MouseEvent('click', { bubbles: true, clientX: rect.left + secondMeasureX + 5, clientY: rect.top + 20 }),
      );
      fixture.detectChanges();

      press('Backspace');

      expect(all()).toEqual(['C', 'D', 'E', 'F']);
      expect(scoreModel.score().measures.length).toBe(1);
    });

    it('copies a selection and pastes it at the caret', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      clickNode(0);
      clickNode(1, { shiftKey: true });
      ctrl('c');
      press('Escape');
      press('n');
      caret.moveToEnd();

      ctrl('v');

      expect(all()).toEqual(['C', 'D', 'E', 'F', 'C', 'D']);
      expect(selection.count()).toBe(2);
    });

    it('cuts and pastes elsewhere', () => {
      setup(quarters('C', 'D', 'E', 'F'));
      clickNode(0);
      ctrl('x');
      expect(all()).toEqual(['D', 'E', 'F']);

      selection.select(scoreModel.score().measures[0].elements[2].id);
      ctrl('v');

      expect(all()).toEqual(['D', 'E', 'C', 'F']);
    });

    it('undoes a paste in a single step', () => {
      setup(quarters('C', 'D'));
      clickNode(0);
      clickNode(1, { shiftKey: true });
      ctrl('c');
      ctrl('v');
      expect(all().length).toBe(4);

      ctrl('z');

      expect(all()).toEqual(['C', 'D']);
    });

    it('ignores editor shortcuts typed into the tempo field', () => {
      setup(quarters('C', 'D', 'E'));
      clickNode(0);
      const bpm = fixture.nativeElement.querySelector('.bpm-input') as HTMLInputElement;

      bpm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      bpm.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));

      expect(all()).toEqual(['C', 'D', 'E']);
      expect(noteInput.active()).toBeFalse();
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
