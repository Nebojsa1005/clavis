import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FAQ, HomePage } from './home-page';

describe('HomePage', () => {
  let root: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomePage],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(HomePage);
    fixture.detectChanges();
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it('leads with a single headline naming Clavis Editor', () => {
    expect(root.querySelectorAll('h1').length).toBe(1);
    expect(root.querySelector('h1')?.textContent).toContain('Clavis Editor');
    expect(root.querySelector('h1')?.textContent).toContain('Piši note u browseru.');
  });

  it('shows every FAQ answer open, so it reads without JavaScript', () => {
    const regions = [...root.querySelectorAll('#pitanja [role="region"]')];
    expect(regions.length).toBe(FAQ.length);
    regions.forEach((r, i) => {
      expect(r.getAttribute('data-state')).toBe('open');
      expect(r.textContent?.trim()).toBe(FAQ[i].answer);
    });
  });

  it('writes one JSON-LD graph whose FAQ matches the page', () => {
    const scripts = document.head.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    const graph = JSON.parse(scripts[0].textContent ?? '')['@graph'];
    expect(graph.map((n: { '@type': string }) => n['@type'])).toEqual(['WebSite', 'WebApplication', 'FAQPage']);
    const shown = [...root.querySelectorAll('#pitanja hlm-accordion-trigger')].map((t) => t.textContent?.trim());
    expect(graph[2].mainEntity.map((q: { name: string }) => q.name)).toEqual(shown);
  });

  it('links every "Otvori editor" button to the editor', () => {
    const ctas = [...root.querySelectorAll<HTMLAnchorElement>('a')].filter((a) => a.textContent?.trim() === 'Otvori editor');
    expect(ctas.length).toBeGreaterThanOrEqual(3);
    ctas.forEach((a) => expect(a.getAttribute('href')).toBe('/editor'));
  });

  it('lists six features and four numbered steps', () => {
    expect(root.querySelectorAll('#funkcije .feature').length).toBe(6);
    const numbers = [...root.querySelectorAll('#kako-radi .step__number')].map((el) => el.textContent?.trim());
    expect(numbers).toEqual(['1', '2', '3', '4']);
  });

  it('draws the hero staff', () => {
    expect(root.querySelectorAll('app-hero-staff .hs-line').length).toBe(5);
    expect(root.querySelector('app-hero-staff .hs-clef')).not.toBeNull();
  });
});
