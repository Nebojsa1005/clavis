import { Injectable, signal } from '@angular/core';

/** Trenutno selektovan element partiture (nota/pauza), po id-u. */
@Injectable({ providedIn: 'root' })
export class SelectionService {
  readonly selectedId = signal<string | null>(null);

  select(id: string): void {
    this.selectedId.set(id);
  }

  clear(): void {
    this.selectedId.set(null);
  }
}
