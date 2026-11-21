import { Routes } from '@angular/router';

// Both pages are lazy so the landing page never pulls in VexFlow and Tone.js.
export const routes: Routes = [
  {
    path: '',
    title: 'Clavis Editor – notni editor u browseru',
    loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'editor',
    title: 'Clavis — editor',
    loadComponent: () => import('./features/editor-page/editor-page').then((m) => m.EditorPage),
  },
  { path: '**', redirectTo: '' },
];
