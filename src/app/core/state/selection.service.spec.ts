import { TestBed } from '@angular/core/testing';
import { SelectionService } from './selection.service';

describe('SelectionService', () => {
  let service: SelectionService;

  beforeEach(() => {
    service = TestBed.inject(SelectionService);
  });

  it('starts with no selection', () => {
    expect(service.selectedId()).toBeNull();
  });

  it('select sets the id, clear resets it', () => {
    service.select('note-1');
    expect(service.selectedId()).toBe('note-1');

    service.clear();
    expect(service.selectedId()).toBeNull();
  });
});
