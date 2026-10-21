import { TestBed } from '@angular/core/testing';
import { KEY_SIGNATURE_OPTIONS } from '../models/key-signature.util';
import { CLEFS, createEmptyScore, createMeasure, createNote, createRest } from '../models/score.model';
import { createPart } from '../models/score-document';
import { NotationRendererService, CARET_CLASS, SCORE_ELEMENT_ID_ATTR, SCORE_STAFF_ID_ATTR } from './notation-renderer.service';

describe('NotationRendererService', () => {
  let service: NotationRendererService;
  let container: HTMLDivElement;

  beforeEach(() => {
    service = TestBed.inject(NotationRendererService);
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders an SVG stave for a score with notes', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'quarter'));

    service.render(container, score);

    const svg = container.querySelector('svg');
    expect(svg).withContext('VexFlow treba da ubaci <svg> u kontejner').not.toBeNull();
    expect(container.querySelectorAll('.vf-stavenote').length).toBeGreaterThan(0);
  });

  it('renders notes for every supported clef', () => {
    for (const clef of CLEFS) {
      const score = { ...createEmptyScore(clef) };
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      service.render(container, score);

      expect(container.querySelectorAll('.vf-stavenote').length).withContext(clef).toBe(1);
    }
  });

  it('draws a key signature for every supported key', () => {
    for (const option of KEY_SIGNATURE_OPTIONS) {
      const score = { ...createEmptyScore(), keySignature: option.value };
      score.measures[0].elements.push(createNote('C', 4, 'quarter'));

      service.render(container, score);

      expect(container.querySelectorAll('.vf-stavenote').length).withContext(option.value).toBe(1);
    }
  });

  it('highlights every element in a multi-selection and nothing else', () => {
    const score = createEmptyScore();
    const [a, b, c] = ['C', 'D', 'E'].map((step) => createNote(step as 'C', 4, 'quarter'));
    score.measures[0].elements.push(a, b, c);

    service.render(container, score, new Set([a.id, c.id]));

    const fillOf = (id: string) =>
      (container.querySelector(`[${SCORE_ELEMENT_ID_ATTR}="${id}"]`) as SVGElement).getAttribute('fill');
    expect(fillOf(a.id)).toBe('#3b5bfd');
    expect(fillOf(c.id)).toBe('#3b5bfd');
    expect(fillOf(b.id)).not.toBe('#3b5bfd');
  });

  describe('ties', () => {
    const tied = (step: 'C' | 'D', duration: 'quarter' | 'half' = 'quarter') => ({
      ...createNote(step, 4, duration),
      tieToNext: true,
    });

    it('draws an arc for a tied pair and none otherwise', () => {
      const plain = createEmptyScore();
      plain.measures[0].elements.push(createNote('C', 4, 'quarter'), createNote('C', 4, 'quarter'));
      service.render(container, plain);
      expect(container.querySelectorAll('.vf-stavetie').length).toBe(0);

      const withTie = createEmptyScore();
      withTie.measures[0].elements.push(tied('C'), createNote('C', 4, 'quarter'));
      service.render(container, withTie);
      expect(container.querySelectorAll('.vf-stavetie').length).toBe(1);
    });

    it('draws one arc per link of a chain', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(tied('C'), tied('C'), createNote('C', 4, 'half'));

      service.render(container, score);

      expect(container.querySelectorAll('.vf-stavetie').length).toBe(2);
    });

    it('draws a tie across a barline', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('D', 4, 'half'), createNote('E', 4, 'quarter'), tied('C'));
      score.measures.push(createMeasure([createNote('C', 4, 'half')]));

      service.render(container, score);

      expect(container.querySelectorAll('.vf-stavetie').length).toBe(1);
    });

    it('draws no arc for a flag that does not join the same pitch', () => {
      const score = createEmptyScore();
      score.measures[0].elements.push(tied('C'), createNote('D', 4, 'quarter'));

      service.render(container, score);

      expect(container.querySelectorAll('.vf-stavetie').length).toBe(0);
    });
  });

  it('draws an extra element (the augmentation dot) for each dotted note and rest', () => {
    // VexFlow gives the dot no class of its own, so compare what is drawn inside the note groups.
    const drawnPerNote = (dotted: boolean) => {
      const score = createEmptyScore();
      score.measures[0].elements.push(createNote('C', 4, 'quarter', null, dotted), createRest('quarter', dotted));
      service.render(container, score);
      return Array.from(container.querySelectorAll('.vf-stavenote')).map((el) => el.querySelectorAll('*').length);
    };

    const plain = drawnPerNote(false);
    const dotted = drawnPerNote(true);

    expect(dotted[0]).toBeGreaterThan(plain[0]);
    expect(dotted[1]).toBeGreaterThan(plain[1]);
  });

  it('renders 32nd and 64th notes', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'thirtysecond'), createNote('D', 4, 'sixtyfourth'));

    service.render(container, score);

    expect(container.querySelectorAll('.vf-stavenote').length).toBe(2);
  });

  it('clears previous render before drawing again', () => {
    const score = createEmptyScore();
    score.measures[0].elements.push(createNote('C', 4, 'quarter'));
    service.render(container, score);

    const score2 = createEmptyScore();
    score2.measures[0].elements.push(createNote('D', 4, 'half'));
    service.render(container, score2);

    expect(container.querySelectorAll('svg').length).toBe(1);
  });

  it('tags each rendered element with its score-element id for hit-testing', () => {
    const score = createEmptyScore();
    const note = createNote('C', 4, 'quarter');
    score.measures[0].elements.push(note);

    service.render(container, score);

    const tagged = container.querySelector(`[${SCORE_ELEMENT_ID_ATTR}="${note.id}"]`);
    expect(tagged).withContext('rendovani element treba data-score-element-id atribut').not.toBeNull();
  });

  it('applies a distinct style to the selected element', () => {
    const score = createEmptyScore();
    const note = createNote('C', 4, 'quarter');
    score.measures[0].elements.push(note);

    service.render(container, score, new Set([note.id]));

    const tagged = container.querySelector(`[${SCORE_ELEMENT_ID_ATTR}="${note.id}"]`) as SVGElement;
    expect(tagged.getAttribute('fill')).toBe('#3b5bfd');
  });

  describe('caret', () => {
    function scoreWithQuarters(count: number) {
      const score = createEmptyScore();
      for (let i = 0; i < count; i++) {
        score.measures[0].elements.push(createNote('C', 4, 'quarter'));
      }
      return score;
    }

    it('draws no caret when none is passed', () => {
      service.render(container, scoreWithQuarters(2));

      expect(container.querySelector(`.${CARET_CLASS}`)).toBeNull();
    });

    it('draws exactly one caret line when a position is passed', () => {
      service.render(container, scoreWithQuarters(2), new Set(), { measureIndex: 0, voice: 0, tick: 64 });

      expect(container.querySelectorAll(`.${CARET_CLASS}`).length).toBe(1);
    });

    it('places the caret further right for later ticks', () => {
      const score = scoreWithQuarters(3);
      service.render(container, score);

      const xs = [0, 64, 128, 192].map((tick) => service.getCaretX({ measureIndex: 0, voice: 0, tick }));

      xs.forEach((x) => expect(x).not.toBeNull());
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]!).toBeGreaterThan(xs[i - 1]!);
      }
    });

    it('puts the caret before the note head it points at', () => {
      const score = scoreWithQuarters(2);
      service.render(container, score);

      const noteHeads = Array.from(container.querySelectorAll('.vf-notehead')).map(
        (el) => el.getBoundingClientRect().left - container.getBoundingClientRect().left,
      );
      const caretX = service.getCaretX({ measureIndex: 0, voice: 0, tick: 64 })!;

      expect(caretX).toBeLessThan(noteHeads[1]);
      expect(caretX).toBeGreaterThan(noteHeads[0]);
    });

    it('supports a caret in an empty measure', () => {
      service.render(container, createEmptyScore(), new Set(), { measureIndex: 0, voice: 0, tick: 0 });

      expect(container.querySelectorAll(`.${CARET_CLASS}`).length).toBe(1);
    });

    it('returns null for positions that were not rendered', () => {
      service.render(container, scoreWithQuarters(1));

      expect(service.getCaretX({ measureIndex: 5, voice: 0, tick: 0 })).toBeNull();
      expect(service.getCaretX({ measureIndex: 0, voice: 0, tick: 17 })).toBeNull();
    });
  });

  describe('caretFromX', () => {
    function twoMeasureScore() {
      const score = createEmptyScore();
      for (let i = 0; i < 4; i++) {
        score.measures[0].elements.push(createNote('C', 4, 'quarter'));
      }
      score.measures.push(createMeasure([createNote('D', 4, 'half')]));
      return score;
    }

    it('returns null before anything was rendered', () => {
      expect(service.caretFromX(100)).toBeNull();
    });

    it('resolves an x on a caret stop to that stop', () => {
      service.render(container, twoMeasureScore());
      const x = service.getCaretX({ measureIndex: 0, voice: 0, tick: 128 })!;

      expect(service.caretFromX(x)).toEqual({ measureIndex: 0, voice: 0, tick: 128 });
    });

    it('resolves an x between two stops to the nearer one', () => {
      service.render(container, twoMeasureScore());
      const a = service.getCaretX({ measureIndex: 0, voice: 0, tick: 64 })!;
      const b = service.getCaretX({ measureIndex: 0, voice: 0, tick: 128 })!;

      expect(service.caretFromX(a + (b - a) * 0.25)!.tick).toBe(64);
      expect(service.caretFromX(a + (b - a) * 0.75)!.tick).toBe(128);
    });

    it('picks the measure under the x coordinate', () => {
      service.render(container, twoMeasureScore());
      const x = service.getCaretX({ measureIndex: 1, voice: 0, tick: 0 })!;

      expect(service.caretFromX(x)!.measureIndex).toBe(1);
    });

    it('clamps clicks outside the score to the first and last measure', () => {
      service.render(container, twoMeasureScore());

      expect(service.caretFromX(-50)!.measureIndex).toBe(0);
      expect(service.caretFromX(99999)).toEqual({ measureIndex: 1, voice: 0, tick: 128 });
    });
  });

  describe('several staves', () => {
    const pianoDoc = () => {
      const treble = createEmptyScore('treble');
      treble.measures[0].elements.push(
        createNote('C', 5, 'quarter'),
        createNote('D', 5, 'quarter'),
        createNote('E', 5, 'quarter'),
        createNote('F', 5, 'quarter'),
      );
      const bass = createEmptyScore('bass');
      bass.measures[0].elements.push(createNote('C', 3, 'quarter'), createNote('G', 3, 'half'));
      return { parts: [createPart('Klavir', [treble, bass])] };
    };
    const staffIds = (doc: ReturnType<typeof pianoDoc>) => doc.parts[0].staves.map((s) => s.id);

    it('draws a stave for every staff in every measure', () => {
      service.render(container, pianoDoc());

      expect(container.querySelectorAll('.vf-stave').length).toBe(2);
    });

    it('connects the staves of a grand staff, more than it joins separate instruments, and a lone staff not at all', () => {
      // VexFlow gives connectors no class of their own: they are the shapes outside any vf-* group.
      const looseShapes = () =>
        Array.from(container.querySelectorAll('svg path, svg rect')).filter((shape) => !shape.closest('[class^="vf-"]')).length;

      const doc = pianoDoc();
      service.render(container, doc);
      const grandStaff = looseShapes();

      const [treble, bass] = doc.parts[0].staves;
      service.render(container, { parts: [createPart('A', [treble.score]), createPart('B', [bass.score])] });
      const separate = looseShapes();

      service.render(container, createEmptyScore());

      expect(grandStaff).toBeGreaterThan(separate);
      expect(separate).toBeGreaterThan(0);
      expect(looseShapes()).toBe(0);
    });

    it('stacks the staves vertically and makes the canvas taller', () => {
      const doc = pianoDoc();
      service.render(container, doc);
      const [trebleId, bassId] = staffIds(doc);

      expect(service.getStaffGeometry(bassId).topLineY).toBeGreaterThan(service.getStaffGeometry(trebleId).topLineY + 40);
      const tall = Number(container.querySelector('svg')!.getAttribute('height'));

      service.render(container, createEmptyScore());
      expect(tall).toBeGreaterThan(Number(container.querySelector('svg')!.getAttribute('height')));
    });

    it('keeps separate instruments further apart than the staves of one instrument', () => {
      const doc = pianoDoc();
      doc.parts.push(createPart('Violina', [createEmptyScore()]));
      service.render(container, doc);
      const [trebleId, bassId] = staffIds(doc);
      const violinId = doc.parts[1].staves[0].id;

      const withinPart = service.getStaffGeometry(bassId).topLineY - service.getStaffGeometry(trebleId).topLineY;
      const betweenParts = service.getStaffGeometry(violinId).topLineY - service.getStaffGeometry(bassId).topLineY;

      expect(betweenParts).toBeGreaterThan(withinPart);
    });

    it('tags each drawn note with its staff', () => {
      const doc = pianoDoc();
      service.render(container, doc);
      const [trebleId, bassId] = staffIds(doc);

      const staffOf = (noteId: string) =>
        container.querySelector(`[${SCORE_ELEMENT_ID_ATTR}="${noteId}"]`)?.getAttribute(SCORE_STAFF_ID_ATTR);
      expect(staffOf(doc.parts[0].staves[0].score.measures[0].elements[0].id)).toBe(trebleId);
      expect(staffOf(doc.parts[0].staves[1].score.measures[0].elements[0].id)).toBe(bassId);
    });

    it('finds the staff nearest to a y coordinate', () => {
      const doc = pianoDoc();
      service.render(container, doc);
      const [trebleId, bassId] = staffIds(doc);

      expect(service.staffIdAtY(service.getStaffGeometry(trebleId).topLineY + 15)).toBe(trebleId);
      expect(service.staffIdAtY(service.getStaffGeometry(bassId).topLineY + 15)).toBe(bassId);
      expect(service.staffIdAtY(-500)).toBe(trebleId);
      expect(service.staffIdAtY(5000)).toBe(bassId);
    });

    it('lines up notes that start at the same time in different staves', () => {
      const doc = pianoDoc();
      service.render(container, doc);
      const [trebleId, bassId] = staffIds(doc);

      for (const tick of [0, 64]) {
        const treble = service.getCaretX({ measureIndex: 0, voice: 0, tick }, trebleId)!;
        const bass = service.getCaretX({ measureIndex: 0, voice: 0, tick }, bassId)!;
        expect(Math.abs(treble - bass)).toBeLessThan(1.5);
      }
    });

    it('keeps caret stops per staff', () => {
      const doc = pianoDoc();
      service.render(container, doc);
      const [trebleId, bassId] = staffIds(doc);

      // treble: quarters at 0, 64, 128, 192; bass: a quarter then a half, so stops at 0, 64, 192
      expect(service.getCaretX({ measureIndex: 0, voice: 0, tick: 128 }, trebleId)).not.toBeNull();
      expect(service.getCaretX({ measureIndex: 0, voice: 0, tick: 128 }, bassId)).toBeNull();
      expect(service.caretFromX(10000, bassId)?.tick).toBe(192);
    });

    it('draws the caret on the active staff', () => {
      const doc = pianoDoc();
      const [trebleId, bassId] = staffIds(doc);

      service.render(container, doc, new Set(), { measureIndex: 0, voice: 0, tick: 0 }, bassId);

      const y1 = Number(container.querySelector(`.${CARET_CLASS}`)!.getAttribute('y1'));
      const bassTop = service.getStaffGeometry(bassId).topLineY;
      const trebleTop = service.getStaffGeometry(trebleId).topLineY;
      expect(y1).toBeGreaterThan(trebleTop + 40);
      expect(y1).toBeLessThan(bassTop);
    });

    it('answers position queries for the active staff by default', () => {
      const doc = pianoDoc();
      const [, bassId] = staffIds(doc);

      service.render(container, doc, new Set(), null, bassId);

      expect(service.getCaretX({ measureIndex: 0, voice: 0, tick: 128 })).toBeNull();
      expect(service.getCaretX({ measureIndex: 0, voice: 0, tick: 128 }, doc.parts[0].staves[0].id)).not.toBeNull();
    });

    it('draws ties inside any staff', () => {
      const doc = pianoDoc();
      const bass = doc.parts[0].staves[1].score.measures[0].elements;
      bass.splice(0, 2, { ...createNote('C', 3, 'quarter'), tieToNext: true }, createNote('C', 3, 'quarter'));

      service.render(container, doc);

      expect(container.querySelectorAll('.vf-stavetie').length).toBe(1);
    });

    it('pads a staff that is shorter than the others with empty measures', () => {
      const doc = pianoDoc();
      doc.parts[0].staves[0].score.measures.push(createMeasure([createNote('C', 5, 'whole')]));

      service.render(container, doc);

      // 2 columns x 2 staves
      expect(container.querySelectorAll('.vf-stave').length).toBe(4);
    });

    it('highlights selected notes in any staff', () => {
      const doc = pianoDoc();
      const bassNote = doc.parts[0].staves[1].score.measures[0].elements[0];

      service.render(container, doc, new Set([bassNote.id]));

      const node = container.querySelector(`[${SCORE_ELEMENT_ID_ATTR}="${bassNote.id}"]`) as SVGElement;
      expect(node.getAttribute('fill')).toBe('#3b5bfd');
    });
  });
});
