import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { App } from './app';
import { routes } from './app.routes';
import { LIBRARY_DB_NAME } from './core/services/score-library.service';

describe('App routing', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: LIBRARY_DB_NAME, useValue: `clavis-test-${crypto.randomUUID()}` },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('shows the home page at the root path', async () => {
    const harness = await RouterTestingHarness.create('/');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-home-page');
  });

  it('opens the editor at /editor', async () => {
    const harness = await RouterTestingHarness.create('/editor');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-editor-page');
  });

  it('sends unknown paths to the home page', async () => {
    const harness = await RouterTestingHarness.create('/nepostojece');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe('app-home-page');
  });
});
