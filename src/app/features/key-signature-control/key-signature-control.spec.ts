import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createEmptyScore } from '../../core/models/score.model';
import { ScoreModelService } from '../../core/state/score-model.service';
import { KeySignatureControl } from './key-signature-control';

describe('KeySignatureControl', () => {
  let fixture: ComponentFixture<KeySignatureControl>;
  let scoreModel: ScoreModelService;

  const select = () => fixture.nativeElement.querySelector('select') as HTMLSelectElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [KeySignatureControl] }).compileComponents();
    scoreModel = TestBed.inject(ScoreModelService);
    scoreModel.replaceScore(createEmptyScore());
    fixture = TestBed.createComponent(KeySignatureControl);
    fixture.detectChanges();
  });

  it('lists major and minor keys in two groups', () => {
    const groups = fixture.nativeElement.querySelectorAll('optgroup');

    expect(groups.length).toBe(2);
    expect(groups[0].querySelectorAll('option').length).toBe(15);
    expect(groups[1].querySelectorAll('option').length).toBe(15);
  });

  it('shows the current key', () => {
    expect(select().value).toBe('C');
  });

  it('changes the key signature of the score', () => {
    select().value = 'D';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(scoreModel.score().keySignature).toBe('D');
    expect(select().value).toBe('D');
  });

  it('can switch to a minor key and be undone', () => {
    select().value = 'Cm';
    select().dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(scoreModel.score().keySignature).toBe('Cm');

    scoreModel.undo();
    fixture.detectChanges();

    expect(scoreModel.score().keySignature).toBe('C');
    expect(select().value).toBe('C');
  });
});
