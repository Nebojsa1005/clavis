import { RenderMode, ServerRoute } from '@angular/ssr';

// Only the landing page is prerendered for crawlers; the editor needs the browser (VexFlow, Tone.js).
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
