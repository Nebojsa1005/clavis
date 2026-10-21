import { ComponentFixture, TestBed } from '@angular/core/testing';
import { INSTRUMENT_PRESETS } from '../../core/models/instruments';
import { createEmptyScore } from '../../core/models/score.model';
import { createPart } from '../../core/models/score-document';
import { ScoreModelService } from '../../core/state/score-model.service';
import { TracksPanel } from './tracks-panel';

describe('TracksPanel', () => {
  let fixture: ComponentFixture<TracksPanel>;
  let scoreModel: ScoreModelService;

  const root = () => fixture.nativeElement as HTMLElement;
  const staffButtons = () => Array.from(root().querySelectorAll('.staff-btn')) as HTMLButtonElement[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TracksPanel] }).compileComponents();
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceDocument({
      parts: [createPart('Klavir', [createEmptyScore('treble'), createEmptyScore('bass')]), createPart('Violina', [createEmptyScore()])],
    });
    fixture = TestBed.createComponent(TracksPanel);
    fixture.detectChanges();
  });

  it('lists every instrument by name', () => {
    expect(Array.from(root().querySelectorAll('.part__name')).map((e) => e.textContent?.trim())).toEqual(['Klavir', 'Violina']);
  });

  it('lists the staves of each instrument, numbering those of a grand staff', () => {
    expect(staffButtons().map((b) => b.textContent?.trim())).toEqual([
      '1. štap, violinski ključ',
      '2. štap, bas ključ',
      'violinski ključ',
    ]);
  });

  it('marks the active staff', () => {
    expect(staffButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
  });

  it('makes the clicked staff the active one', () => {
    staffButtons()[1].click();
    fixture.detectChanges();

    expect(scoreModel.activeStaffId()).toBe(scoreModel.document().parts[0].staves[1].id);
    expect(staffButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
  });

  describe('adding instruments', () => {
    const presetSelect = () => root().querySelector('.add__select') as HTMLSelectElement;

    it('offers every instrument preset, piano first', () => {
      const names = Array.from(presetSelect().options).map((o) => o.textContent?.trim());

      expect(names.length).toBe(INSTRUMENT_PRESETS.length);
      expect(names[0]).toBe('Klavir');
    });

    it('adds the chosen instrument and activates its first staff', () => {
      presetSelect().value = 'cello';
      (root().querySelector('.add-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      const parts = scoreModel.document().parts;
      expect(parts.length).toBe(3);
      expect(parts[2].name).toBe('Violončelo');
      expect(parts[2].staves[0].score.clef).toBe('bass');
      expect(scoreModel.activeStaffId()).toBe(parts[2].staves[0].id);
      expect(staffButtons().length).toBe(4);
    });

    it('adds a piano with two staves', () => {
      presetSelect().value = 'piano';
      (root().querySelector('.add-btn') as HTMLButtonElement).click();
      fixture.detectChanges();

      expect(scoreModel.document().parts[2].staves.length).toBe(2);
      expect(staffButtons().length).toBe(5);
    });
  });

  describe('removing instruments', () => {
    const removeButtons = () => Array.from(root().querySelectorAll('button[title="Ukloni instrument"]')) as HTMLButtonElement[];

    it('removes the instrument of the pressed button', () => {
      removeButtons()[1].click();
      fixture.detectChanges();

      expect(scoreModel.document().parts.map((p) => p.name)).toEqual(['Klavir']);
    });

    it('can be undone', () => {
      removeButtons()[1].click();

      scoreModel.undo();
      fixture.detectChanges();

      expect(scoreModel.document().parts.length).toBe(2);
    });

    it('disables removing the last remaining instrument', () => {
      removeButtons()[1].click();
      fixture.detectChanges();

      expect(removeButtons().length).toBe(1);
      expect(removeButtons()[0].disabled).toBeTrue();
    });
  });

  describe('reordering instruments', () => {
    const moveButtons = (title: string) => Array.from(root().querySelectorAll(`button[title="${title}"]`)) as HTMLButtonElement[];
    const names = () => Array.from(root().querySelectorAll('.part__name')).map((e) => e.textContent?.trim());

    it('moves an instrument down and up', () => {
      moveButtons('Pomeri dole')[0].click();
      fixture.detectChanges();
      expect(names()).toEqual(['Violina', 'Klavir']);

      moveButtons('Pomeri gore')[1].click();
      fixture.detectChanges();
      expect(names()).toEqual(['Klavir', 'Violina']);
    });

    it('disables moving the first one up and the last one down', () => {
      expect(moveButtons('Pomeri gore')[0].disabled).toBeTrue();
      expect(moveButtons('Pomeri gore')[1].disabled).toBeFalse();
      expect(moveButtons('Pomeri dole')[0].disabled).toBeFalse();
      expect(moveButtons('Pomeri dole')[1].disabled).toBeTrue();
    });
  });

  describe('renaming instruments', () => {
    const startRename = (index = 0) =>
      (root().querySelectorAll('button[title="Preimenuj"]')[index] as HTMLButtonElement).click();
    const input = () => root().querySelector('.part__rename') as HTMLInputElement | null;
    const names = () => Array.from(root().querySelectorAll('.part__name')).map((e) => e.textContent?.trim());

    it('shows an input with the current name, focused and selected', () => {
      startRename();
      fixture.detectChanges();

      expect(input()!.value).toBe('Klavir');
      expect(document.activeElement).toBe(input());
    });

    it('also starts on a double click of the name', () => {
      root().querySelector('.part__name')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fixture.detectChanges();

      expect(input()).not.toBeNull();
    });

    it('saves the new name on Enter', () => {
      startRename();
      fixture.detectChanges();
      input()!.value = 'Veliki klavir';

      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();

      expect(input()).toBeNull();
      expect(names()).toEqual(['Veliki klavir', 'Violina']);
    });

    it('saves the new name when the field loses focus', () => {
      startRename(1);
      fixture.detectChanges();
      input()!.value = 'Solo violina';

      input()!.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(names()).toEqual(['Klavir', 'Solo violina']);
    });

    it('drops the change on Escape, even though the field then loses focus', () => {
      startRename();
      fixture.detectChanges();
      input()!.value = 'Nešto drugo';

      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      input()?.dispatchEvent(new Event('blur'));
      fixture.detectChanges();

      expect(names()).toEqual(['Klavir', 'Violina']);
    });

    it('keeps the old name when the new one is blank', () => {
      startRename();
      fixture.detectChanges();
      input()!.value = '   ';

      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();

      expect(names()).toEqual(['Klavir', 'Violina']);
    });

    it('can be undone', () => {
      startRename();
      fixture.detectChanges();
      input()!.value = 'Drugi naziv';
      input()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      scoreModel.undo();
      fixture.detectChanges();

      expect(names()).toEqual(['Klavir', 'Violina']);
    });
  });
});
