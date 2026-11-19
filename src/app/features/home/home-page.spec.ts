import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HomePage, SOURCE_URL } from './home-page';

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

  it('leads with a one-line headline', () => {
    expect(root.querySelector('h1')?.textContent).toContain('Piši note u browseru.');
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

  it('links to the source code in a new tab', () => {
    const link = root.querySelector<HTMLAnchorElement>(`a[href="${SOURCE_URL}"]`);
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');
  });
});
