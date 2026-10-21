import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Clef } from '../../core/models/score.model';
import { Part } from '../../core/models/score-document';
import { ScoreModelService } from '../../core/state/score-model.service';

const CLEF_NAMES: Record<Clef, string> = {
  treble: 'violinski ključ',
  bass: 'bas ključ',
  alto: 'alt ključ',
  tenor: 'tenor ključ',
};

/** Side panel listing the instruments and their staves; picking a staff makes it the one being edited. */
@Component({
  selector: 'app-tracks-panel',
  templateUrl: './tracks-panel.html',
  styleUrl: './tracks-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TracksPanel {
  protected readonly scoreModel = inject(ScoreModelService);

  protected staffLabel(part: Part, staffIndex: number): string {
    const clef = CLEF_NAMES[part.staves[staffIndex].score.clef];
    return part.staves.length > 1 ? `${staffIndex + 1}. štap, ${clef}` : clef;
  }

  protected addPiano(): void {
    this.scoreModel.addPart('piano');
  }
}
