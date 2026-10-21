import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  ALLOWED_DENOMINATORS,
  isPresetTimeSignature,
  PRESET_TIME_SIGNATURES,
  timeSignatureLabel,
  validateTimeSignature,
} from '../../core/models/time-signature.util';
import { ScoreModelService } from '../../core/state/score-model.service';

const CUSTOM_VALUE = 'custom';

/** Toolbar control: preset dropdown plus a custom numerator/denominator editor with validation. */
@Component({
  selector: 'app-time-signature-control',
  templateUrl: './time-signature-control.html',
  styleUrl: './time-signature-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimeSignatureControl {
  private readonly scoreModel = inject(ScoreModelService);

  protected readonly presets = PRESET_TIME_SIGNATURES.map((preset) => ({
    value: timeSignatureLabel(preset),
    preset,
  }));
  protected readonly denominators = ALLOWED_DENOMINATORS;
  protected readonly customValue = CUSTOM_VALUE;

  protected readonly editingCustom = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly selectedValue = computed(() => {
    const current = this.scoreModel.score().timeSignature;
    return this.editingCustom() || !isPresetTimeSignature(current) ? CUSTOM_VALUE : timeSignatureLabel(current);
  });
  protected readonly currentNumerator = computed(() => this.scoreModel.score().timeSignature.numerator);
  protected readonly currentDenominator = computed(() => this.scoreModel.score().timeSignature.denominator);

  protected onSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const value = select.value;
    select.blur();

    if (value === CUSTOM_VALUE) {
      this.error.set(null);
      this.editingCustom.set(true);
      return;
    }

    const match = this.presets.find((option) => option.value === value);
    if (match) {
      this.editingCustom.set(false);
      this.error.set(null);
      this.scoreModel.setTimeSignature(match.preset);
    }
  }

  protected onApplyCustom(numeratorInput: HTMLInputElement, denominatorSelect: HTMLSelectElement): void {
    const numerator = numeratorInput.valueAsNumber;
    const denominator = Number(denominatorSelect.value);

    const message = validateTimeSignature(numerator, denominator);
    this.error.set(message);
    if (message) {
      return;
    }

    this.scoreModel.setTimeSignature({ numerator, denominator });
    this.editingCustom.set(false);
  }

  protected onCancelCustom(): void {
    this.editingCustom.set(false);
    this.error.set(null);
  }
}
