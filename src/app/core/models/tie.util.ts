import { effectiveAccidental } from './key-signature.util';
import { MeasureElement, Note, Score } from './score.model';

/** A tie joining two neighbouring notes of the same pitch into one sustained sound. */
export interface TieLink {
  from: Note;
  to: Note;
}

function flatten(score: Score): MeasureElement[] {
  return score.measures.flatMap((measure) => measure.elements);
}

/** The pitch that actually sounds, so a plain F in G major and an explicit F# count as the same. */
function soundingPitch(note: Note, keySignature: string): string {
  const accidental = effectiveAccidental(note.pitch.accidental, keySignature, note.pitch.step);
  return `${note.pitch.step}${accidental ?? ''}${note.pitch.octave}`;
}

/** Two elements can be tied when both are notes of the same sounding pitch. Rests never tie. */
export function canTie(
  from: MeasureElement | undefined,
  to: MeasureElement | undefined,
  keySignature: string,
): boolean {
  return from?.kind === 'note' && to?.kind === 'note' && soundingPitch(from, keySignature) === soundingPitch(to, keySignature);
}

/**
 * Every tie that really connects two notes, in score order. A chain (A~B~C) shows up as several
 * links that share notes: A to B and B to C.
 */
export function tieLinks(score: Score): TieLink[] {
  const flat = flatten(score);
  const links: TieLink[] = [];
  flat.forEach((element, index) => {
    const next = flat[index + 1];
    if (element.kind === 'note' && element.tieToNext && next?.kind === 'note' && canTie(element, next, score.keySignature)) {
      links.push({ from: element, to: next });
    }
  });
  return links;
}

/** Ids of notes that continue the sound of the note before them (the target of a tie). */
export function tiedTargetIds(links: readonly TieLink[]): Set<string> {
  return new Set(links.map((link) => link.to.id));
}

function withoutTie(element: MeasureElement): MeasureElement {
  const { tieToNext: _removed, ...rest } = element as Note;
  return rest;
}

/**
 * Drops tie flags that no longer join two same-pitch neighbours (after an insert between them, a
 * pitch change, a delete, ...). Returns the same score object when nothing had to change.
 */
export function sanitizeTies(score: Score): Score {
  const flat = flatten(score);
  const stale = new Set<string>();
  flat.forEach((element, index) => {
    if (element.kind === 'note' && element.tieToNext && !canTie(element, flat[index + 1], score.keySignature)) {
      stale.add(element.id);
    }
  });
  if (stale.size === 0) {
    return score;
  }
  return {
    ...score,
    measures: score.measures.map((measure) => ({
      ...measure,
      elements: measure.elements.map((element) => (stale.has(element.id) ? withoutTie(element) : element)),
    })),
  };
}

/** Sets or clears the tie flag on the given notes; callers rely on `sanitizeTies` to reject bad ties. */
export function setTieFlag(score: Score, ids: ReadonlySet<string>, tied: boolean): Score {
  return {
    ...score,
    measures: score.measures.map((measure) => ({
      ...measure,
      elements: measure.elements.map((element) => {
        if (element.kind !== 'note' || !ids.has(element.id)) {
          return element;
        }
        return tied ? { ...element, tieToNext: true } : withoutTie(element);
      }),
    })),
  };
}

/** Ties the note right before `elementId` to it when they are the same pitch; otherwise no change. */
export function tieNoteBefore(score: Score, elementId: string): Score {
  const flat = flatten(score);
  const index = flat.findIndex((element) => element.id === elementId);
  const previous = flat[index - 1];
  if (index <= 0 || !canTie(previous, flat[index], score.keySignature)) {
    return score;
  }
  return setTieFlag(score, new Set([previous.id]), true);
}
