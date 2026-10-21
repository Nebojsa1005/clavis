import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote } from '../../core/models/score.model';
import { ScoreModelService } from '../../core/state/score-model.service';
import { TimeSignatureControl } from './time-signature-control';

describe('TimeSignatureControl', () => {
  let fixture: ComponentFixture<TimeSignatureControl>;
  let scoreModel: ScoreModelService;

  const root = () => fixture.nativeElement as HTMLElement;
  const presetSelect = () => root().querySelector('.time-select') as HTMLSelectElement;

  function choose(value: string): void {
    presetSelect().value = value;
    presetSelect().dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function applyCustom(numerator: string, denominator: string): void {
    const numeratorInput = root().querySelector('.custom__numerator') as HTMLInputElement;
    const denominatorSelect = root().querySelector('.custom__denominator') as HTMLSelectElement;
    numeratorInput.value = numerator;
    denominatorSelect.value = denominator;
    (root().querySelector('.custom button') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TimeSignatureControl] }).compileComponents();
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceScore(createEmptyScore());
    fixture = TestBed.createComponent(TimeSignatureControl);
    fixture.detectChanges();
  });

  it('shows the current time signature as the selected preset', () => {
    expect(presetSelect().value).toBe('4/4');
  });

  it('applies a preset and reflows measures that no longer fit', () => {
    for (const step of ['C', 'D', 'E', 'F'] as const) {
      scoreModel.appendElement(createNote(step, 4, 'quarter'));
    }
    fixture.detectChanges();

    choose('3/4');

    expect(scoreModel.score().timeSignature).toEqual({ numerator: 3, denominator: 4 });
    expect(scoreModel.score().measures.map((m) => m.elements.length)).toEqual([3, 1]);
  });

  it('reveals the custom editor for "Drugi…" without changing the score', () => {
    choose('custom');

    expect(root().querySelector('.custom')).not.toBeNull();
    expect(scoreModel.score().timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });

  it('applies a valid custom time signature and closes the editor', () => {
    choose('custom');

    applyCustom('11', '16');

    expect(scoreModel.score().timeSignature).toEqual({ numerator: 11, denominator: 16 });
    expect(root().querySelector('.custom')).toBeNull();
    expect(presetSelect().value).toBe('custom');
  });

  it('shows an error and keeps the editor open for an invalid numerator', () => {
    choose('custom');

    applyCustom('0', '4');

    expect(root().querySelector('[role="alert"]')?.textContent).toContain('Brojilac');
    expect(root().querySelector('.custom')).not.toBeNull();
    expect(scoreModel.score().timeSignature).toEqual({ numerator: 4, denominator: 4 });
  });

  it('clears the error after a successful apply', () => {
    choose('custom');
    applyCustom('99', '4');
    expect(root().querySelector('[role="alert"]')).not.toBeNull();

    applyCustom('5', '8');

    expect(root().querySelector('[role="alert"]')).toBeNull();
  });

  it('cancels the custom editor', () => {
    choose('custom');

    const buttons = root().querySelectorAll('.custom button');
    (buttons[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(root().querySelector('.custom')).toBeNull();
    expect(presetSelect().value).toBe('4/4');
  });

  it('selects "Drugi…" when the score has a non-preset time signature', () => {
    scoreModel.replaceScore({ ...createEmptyScore(), timeSignature: { numerator: 13, denominator: 16 } });
    fixture.detectChanges();

    expect(presetSelect().value).toBe('custom');
  });
});
