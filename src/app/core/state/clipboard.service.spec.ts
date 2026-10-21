import { TestBed } from '@angular/core/testing';
import { createNote, createRest } from '../models/score.model';
import { ClipboardService } from './clipboard.service';

describe('ClipboardService', () => {
  let clipboard: ClipboardService;

  beforeEach(() => {
    clipboard = TestBed.inject(ClipboardService);
  });

  it('starts empty', () => {
    expect(clipboard.hasContent()).toBeFalse();
    expect(clipboard.paste()).toEqual([]);
  });

  it('pastes copies of what was copied, in order', () => {
    clipboard.copy([createNote('C', 4, 'quarter'), createRest('half', true)]);

    const pasted = clipboard.paste();

    expect(clipboard.hasContent()).toBeTrue();
    expect(pasted.map((el) => el.kind)).toEqual(['note', 'rest']);
    expect(pasted[1].duration).toBe('half');
    expect(pasted[1].dotted).toBeTrue();
  });

  it('gives every paste fresh ids', () => {
    const original = createNote('C', 4, 'quarter');
    clipboard.copy([original]);

    const first = clipboard.paste()[0];
    const second = clipboard.paste()[0];

    expect(first.id).not.toBe(original.id);
    expect(second.id).not.toBe(first.id);
  });

  it('is isolated from later changes to the copied element', () => {
    const original = createNote('C', 4, 'quarter');
    clipboard.copy([original]);

    original.pitch.step = 'G';

    const pasted = clipboard.paste()[0];
    expect(pasted.kind === 'note' && pasted.pitch.step).toBe('C');
  });

  it('is isolated from changes to a pasted copy', () => {
    clipboard.copy([createNote('C', 4, 'quarter')]);

    const pasted = clipboard.paste()[0];
    if (pasted.kind === 'note') {
      pasted.pitch.step = 'G';
    }

    const again = clipboard.paste()[0];
    expect(again.kind === 'note' && again.pitch.step).toBe('C');
  });
});
