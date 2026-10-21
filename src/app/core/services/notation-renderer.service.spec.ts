import { TestBed } from '@angular/core/testing';
import { KEY_SIGNATURE_OPTIONS } from '../models/key-signature.util';
import { CLEFS, createEmptyScore, createMeasure, createNote } from '../models/score.model';
import { NotationRendererService, CARET_CLASS, SCORE_ELEMENT_ID_ATTR } from './notation-renderer.service';

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

    service.render(container, score, note.id);

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
      service.render(container, scoreWithQuarters(2), null, { measureIndex: 0, voice: 0, tick: 64 });

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
      service.render(container, createEmptyScore(), null, { measureIndex: 0, voice: 0, tick: 0 });

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
});
