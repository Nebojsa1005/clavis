import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAJOR_KEY_OPTIONS, MINOR_KEY_OPTIONS } from '../../core/models/key-signature.util';
import { ScoreModelService } from '../../core/state/score-model.service';
import { HlmTooltipImports } from '@spartan-ng/helm/tooltip';

/** Toolbar dropdown for the key signature, grouped into major and minor keys. */
@Component({
  selector: 'app-key-signature-control',
  imports: [HlmTooltipImports],
  templateUrl: './key-signature-control.html',
  styleUrl: './key-signature-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeySignatureControl {
  protected readonly scoreModel = inject(ScoreModelService);
  protected readonly majorKeys = MAJOR_KEY_OPTIONS;
  protected readonly minorKeys = MINOR_KEY_OPTIONS;

  protected onChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.scoreModel.setKeySignature(select.value);
    // Hand focus back so arrow keys keep driving the caret instead of the dropdown.
    select.blur();
  }
}
