import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { glyphViewBox, SmuflGlyph } from './smufl-glyphs';

/** A single SMuFL glyph as an inline, currentColor icon. Size it with CSS height on the host. */
@Component({
  selector: 'app-glyph',
  template: `<svg [attr.viewBox]="viewBox()" aria-hidden="true" focusable="false"><path [attr.d]="glyph().path" transform="scale(1 -1)" /></svg>`,
  styles: `
    :host {
      display: inline-block;
      height: 1em;
      line-height: 0;
    }
    svg {
      height: 100%;
      width: auto;
      overflow: visible;
      fill: currentColor;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Glyph {
  readonly glyph = input.required<SmuflGlyph>();
  readonly pad = input(40);

  protected readonly viewBox = computed(() => glyphViewBox(this.glyph(), this.pad()));
}
