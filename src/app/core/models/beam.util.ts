import { elementTicks, TICKS_PER_WHOLE } from './caret.util';
import { Measure, MeasureElement, Note, NoteDuration, Score, TimeSignature } from './score.model';

/** How a note is joined to the note after it: forced on, forced off, or (undefined) automatic. */
export type BeamMode = 'on' | 'off';

/** Number of beams a note carries: 1 for an eighth, 2 for a sixteenth, and so on. */
const BEAM_LEVELS: Partial<Record<NoteDuration, number>> = {
  eighth: 1,
  sixteenth: 2,
  thirtysecond: 3,
  sixtyfourth: 4,
};

/** Only notes of an eighth or shorter have a flag to replace by a beam; rests are never beamed. */
export function isBeamable(element: MeasureElement | undefined): element is Note {
  return element?.kind === 'note' && element.duration in BEAM_LEVELS;
}

export function beamLevels(element: Note): number {
  return BEAM_LEVELS[element.duration] ?? 0;
}

/**
 * Length of the beat that automatic beaming groups by. Usually the denominator note (a quarter in
 * 4/4, a half in 2/2); in compound meters (3/8, 6/8, 9/8, 12/8) a beat is three eighths.
 */
export function beatTicks(timeSignature: TimeSignature): number {
  const unit = TICKS_PER_WHOLE / timeSignature.denominator;
  const compound = timeSignature.denominator >= 8 && timeSignature.numerator % 3 === 0;
  return compound ? unit * 3 : unit;
}

/**
 * The runs of notes that share a beam in one measure, each with at least two notes. Neighbouring
 * beamable notes are joined when they start in the same beat; a note's own setting ('on'/'off')
 * overrides that for the gap after it. A rest or a note longer than an eighth always ends a run,
 * and nothing is joined across the barline.
 */
export function beamGroups(measure: Measure, timeSignature: TimeSignature): Note[][] {
  const beat = beatTicks(timeSignature);
  const groups: Note[][] = [];
  let current: Note[] = [];
  let previousStart = 0;
  let tick = 0;

  const finish = () => {
    if (current.length >= 2) {
      groups.push(current);
    }
    current = [];
  };

  for (const element of measure.elements) {
    const start = tick;
    tick += elementTicks(element);

    if (!isBeamable(element)) {
      finish();
      continue;
    }

    const previous = current[current.length - 1];
    if (previous) {
      const joined =
        previous.beamToNext === 'on'
          ? true
          : previous.beamToNext === 'off'
            ? false
            : Math.floor(previousStart / beat) === Math.floor(start / beat);
      if (!joined) {
        finish();
      }
    }
    current.push(element);
    previousStart = start;
  }
  finish();

  return groups;
}

/** Ids of the notes that are beamed to the note after them, as the score is drawn. */
export function beamedToNextIds(score: Score): Set<string> {
  const ids = new Set<string>();
  for (const measure of score.measures) {
    for (const group of beamGroups(measure, score.timeSignature)) {
      group.slice(0, -1).forEach((note) => ids.add(note.id));
    }
  }
  return ids;
}

function withoutBeam(note: Note): Note {
  const { beamToNext: _removed, ...rest } = note;
  return rest;
}

/**
 * Drops manual beam settings that no longer sit between two neighbouring beamable notes of one
 * measure (after a delete, an insert, a duration change, ...). Returns the same score object when
 * nothing had to change.
 */
export function sanitizeBeams(score: Score): Score {
  const stale = new Set<string>();
  for (const measure of score.measures) {
    measure.elements.forEach((element, index) => {
      if (element.kind === 'note' && element.beamToNext && !(isBeamable(element) && isBeamable(measure.elements[index + 1]))) {
        stale.add(element.id);
      }
    });
  }
  if (stale.size === 0) {
    return score;
  }
  return mapNotes(score, (note) => (stale.has(note.id) ? withoutBeam(note) : note));
}

/** Sets a manual beam mode on the given notes, or hands them back to automatic with `null`. */
export function setBeamMode(score: Score, ids: ReadonlySet<string>, mode: BeamMode | null): Score {
  return mapNotes(score, (note) => {
    if (!ids.has(note.id)) {
      return note;
    }
    return mode === null ? withoutBeam(note) : { ...note, beamToNext: mode };
  });
}

function mapNotes(score: Score, change: (note: Note) => Note): Score {
  return {
    ...score,
    measures: score.measures.map((measure) => ({
      ...measure,
      elements: measure.elements.map((element) => (element.kind === 'note' ? change(element) : element)),
    })),
  };
}
