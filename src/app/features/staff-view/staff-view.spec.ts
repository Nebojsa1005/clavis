import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote } from '../../core/models/score.model';
import { NotationRendererService } from '../../core/services/notation-renderer.service';
import { NoteInputService } from '../../core/state/note-input.service';
import { ScoreModelService } from '../../core/state/score-model.service';
import { SelectionService } from '../../core/state/selection.service';
import { StaffView } from './staff-view';

describe('StaffView', () => {
  let scoreModel: ScoreModelService;
  let selection: SelectionService;
  let noteInput: NoteInputService;
  let renderSpy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StaffView] }).compileComponents();

    scoreModel = TestBed.inject(ScoreModelService);
    selection = TestBed.inject(SelectionService);
    noteInput = TestBed.inject(NoteInputService);
    renderSpy = spyOn(TestBed.inject(NotationRendererService), 'render');

    scoreModel.replaceScore(createEmptyScore());
    selection.clear();
    noteInput.setActive(false);
  });

  it('renders once on init with the current score and selection', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy.calls.mostRecent().args[1]).toBe(scoreModel.score());
    expect(renderSpy.calls.mostRecent().args[2]).toBeNull();
  });

  it('re-renders when the score signal changes', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    scoreModel.appendElement(createNote('G', 4, 'eighth'));
    fixture.detectChanges();

    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it('re-renders when the selection changes', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    selection.select('some-id');
    fixture.detectChanges();

    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy.calls.mostRecent().args[2]).toBe('some-id');
  });

  it('selects an existing element when clicking its rendered node', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    const fakeNoteNode = document.createElement('g');
    fakeNoteNode.setAttribute('data-score-element-id', 'abc-123');
    host.appendChild(fakeNoteNode);

    fakeNoteNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(selection.selectedId()).toBe('abc-123');
  });

  it('adds a note from a staff click when note-input mode is active and nothing was hit', () => {
    noteInput.setActive(true);
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    spyOn(host, 'getBoundingClientRect').and.returnValue({ top: 0 } as DOMRect);

    host.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 80 }));

    const elements = scoreModel.score().measures[0].elements;
    expect(elements.length).toBe(1);
    expect(elements[0].kind).toBe('note');
  });

  it('passes no caret to the renderer while note input is off', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    expect(renderSpy.calls.mostRecent().args[3]).toBeNull();
  });

  it('passes the caret position to the renderer once note input is on', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    noteInput.setActive(true);
    fixture.detectChanges();

    expect(renderSpy.calls.mostRecent().args[3]).toEqual({ measureIndex: 0, voice: 0, tick: 0 });
  });
});
