import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Glyph } from './glyph';
import { G_CLEF } from './smufl-glyphs';

/** Wordmark: "clavis" is Latin for key — and a clef is literally a key. */
@Component({
  selector: 'app-logo',
  imports: [Glyph],
  template: `<app-glyph class="logo__clef" [glyph]="clef" [pad]="0" /><span>Clavis</span>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.3em;
      font-family: var(--font-display);
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .logo__clef {
      height: 1.45em;
      margin-block: -0.2em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Logo {
  protected readonly clef = G_CLEF;
}
