import { TestBed } from '@angular/core/testing';
import { createEmptyScore, createNote } from '../models/score.model';
import { NotationRendererService, SCORE_ELEMENT_ID_ATTR } from './notation-renderer.service';

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
});
