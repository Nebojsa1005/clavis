import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createMeasure, createNote } from '../../core/models/score.model';
import { createPart } from '../../core/models/score-document';
import { NotationRendererService } from '../../core/services/notation-renderer.service';
import { CaretService } from '../../core/state/caret.service';
import { NoteInputService } from '../../core/state/note-input.service';
import { ScoreModelService } from '../../core/state/score-model.service';
import { SelectionService } from '../../core/state/selection.service';
import { ViewZoomService } from '../../core/state/view-zoom.service';
import { StaffView } from './staff-view';

describe('StaffView', () => {
  let scoreModel: ScoreModelService;
  let selection: SelectionService;
  let noteInput: NoteInputService;
  let caret: CaretService;
  let renderSpy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StaffView] }).compileComponents();

    scoreModel = TestBed.inject(ScoreModelService);
    selection = TestBed.inject(SelectionService);
    noteInput = TestBed.inject(NoteInputService);
    caret = TestBed.inject(CaretService);
    renderSpy = spyOn(TestBed.inject(NotationRendererService), 'render');

    scoreModel.replaceScore(createEmptyScore());
    selection.clear();
    noteInput.setActive(false);
  });

  it('renders once on init with the current score and selection', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy.calls.mostRecent().args[1]).toBe(scoreModel.document());
    expect(renderSpy.calls.mostRecent().args[2]).toEqual(new Set());
  });

  it('re-renders when the score signal changes', () => {
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    scoreModel.appendElement(createNote('G', 4, 'eighth'));
    fixture.detectChanges();

    expect(renderSpy).toHaveBeenCalledTimes(2);
  });

  it('re-renders when the selection changes', () => {
    const note = createNote('C', 4, 'quarter');
    scoreModel.replaceScore({ ...createEmptyScore(), measures: [createMeasure([note])] });
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    selection.select(note.id);
    fixture.detectChanges();

    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy.calls.mostRecent().args[2]).toEqual(new Set([note.id]));
  });

  it('selects an existing element when clicking its rendered node', () => {
    const note = createNote('C', 4, 'quarter');
    scoreModel.replaceScore({ ...createEmptyScore(), measures: [createMeasure([note])] });
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    const fakeNoteNode = document.createElement('g');
    fakeNoteNode.setAttribute('data-score-element-id', note.id);
    host.appendChild(fakeNoteNode);

    fakeNoteNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(selection.selectedId()).toBe(note.id);
  });

  it('adds a note from a staff click when note-input mode is active and nothing was hit', () => {
    noteInput.setActive(true);
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    spyOn(host, 'getBoundingClientRect').and.returnValue({ top: 0, left: 0 } as DOMRect);

    host.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 80 }));

    const elements = scoreModel.score().measures[0].elements;
    expect(elements.length).toBe(1);
    expect(elements[0].kind).toBe('note');
  });

  it('maps a click through the zoom, so a zoomed-in click enters the pitch under the pointer', () => {
    renderSpy.and.callThrough();
    noteInput.setActive(true);
    TestBed.inject(ViewZoomService).set(2);
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    spyOn(host, 'getBoundingClientRect').and.returnValue({ top: 0, left: 0 } as DOMRect);
    const { topLineY } = TestBed.inject(NotationRendererService).getStaffGeometry();
    // On screen everything is twice as far from the top: this is the top line (F5 in treble clef).
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 200, clientY: topLineY * 2 }));

    const note = scoreModel.score().measures[0].elements[0];
    expect(note.kind === 'note' && `${note.pitch.step}${note.pitch.octave}`).toBe('F5');
  });

  it('previews the note a click would enter while the pointer moves over the staff in note input', () => {
    renderSpy.and.callThrough();
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();
    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    spyOn(host, 'getBoundingClientRect').and.returnValue({ top: 0, left: 0 } as DOMRect);
    const { topLineY, halfStepPx } = TestBed.inject(NotationRendererService).getStaffGeometry();
    const move = () =>
      host.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 200, clientY: topLineY + halfStepPx * 2 + 1 }));

    move();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.note-ghost')).toBeNull();

    noteInput.setActive(true);
    move();
    fixture.detectChanges();
    const ghost = fixture.nativeElement.querySelector('.note-ghost') as HTMLElement;
    expect(ghost.textContent?.trim()).toBe('D5');
    // Snapped onto the line, not left where the pointer happened to be.
    expect(parseFloat(ghost.style.top)).toBeCloseTo(topLineY + halfStepPx * 2, 5);

    host.dispatchEvent(new MouseEvent('mouseleave'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.note-ghost')).toBeNull();
  });

  it('zooms on a pinch (Ctrl + wheel) but leaves plain scrolling alone', () => {
    const zoom = TestBed.inject(ViewZoomService);
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const plain = new WheelEvent('wheel', { deltaY: -50, cancelable: true });
    element.dispatchEvent(plain);
    expect(zoom.zoom()).toBe(1);
    expect(plain.defaultPrevented).toBeFalse();

    const pinch = new WheelEvent('wheel', { deltaY: -50, ctrlKey: true, cancelable: true });
    element.dispatchEvent(pinch);
    expect(zoom.zoom()).toBeGreaterThan(1);
    expect(pinch.defaultPrevented).toBeTrue();
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

  it('inserts the note at the clicked position and leaves the caret after it', () => {
    noteInput.setActive(true);
    scoreModel.replaceScore({
      ...createEmptyScore(),
      measures: [
        createMeasure([createNote('C', 4, 'quarter'), createNote('D', 4, 'quarter')]),
        createMeasure([createNote('E', 4, 'quarter')]),
      ],
    });
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();

    const host = fixture.nativeElement.querySelector('.staff-canvas') as HTMLDivElement;
    spyOn(host, 'getBoundingClientRect').and.returnValue({ top: 0, left: 0 } as DOMRect);
    spyOn(TestBed.inject(NotationRendererService), 'caretFromX').and.returnValue({
      measureIndex: 1,
      voice: 0,
      tick: 0,
    });

    host.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 300, clientY: 80 }));

    const measures = scoreModel.score().measures;
    expect(measures[0].elements.length).toBe(2);
    expect(measures[1].elements.length).toBe(2);
    expect(measures[1].elements[0].kind).toBe('note');
    expect(caret.position()).toEqual({ measureIndex: 1, voice: 0, tick: 64 });
  });

  it('shows a text field under every staff and stores what is typed into it', () => {
    renderSpy.and.callThrough();
    scoreModel.replaceDocument({ parts: [createPart('Klavir', [createEmptyScore(), createEmptyScore('bass')])] });
    const fixture = TestBed.createComponent(StaffView);
    fixture.detectChanges();
    fixture.detectChanges();

    const fields = Array.from(fixture.nativeElement.querySelectorAll('textarea.staff-text')) as HTMLTextAreaElement[];
    expect(fields.length).toBe(2);
    expect(parseFloat(fields[1].style.top)).toBeGreaterThan(parseFloat(fields[0].style.top));

    fields[1].value = 'Ky - ri - e';
    fields[1].dispatchEvent(new Event('input'));

    const bottomStaff = scoreModel.document().parts[0].staves[1];
    expect(bottomStaff.text).toBe('Ky - ri - e');
  });
});
