import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  it('adds a piano and activates its first staff', () => {
    (root().querySelector('.add-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    const parts = scoreModel.document().parts;
    expect(parts.length).toBe(3);
    expect(parts[2].name).toBe('Klavir');
    expect(scoreModel.activeStaffId()).toBe(parts[2].staves[0].id);
    expect(staffButtons().length).toBe(5);
  });
});
