import { TestBed } from '@angular/core/testing';
import { MAX_ZOOM, MIN_ZOOM, ViewZoomService } from './view-zoom.service';

describe('ViewZoomService', () => {
  let service: ViewZoomService;

  beforeEach(() => {
    service = TestBed.inject(ViewZoomService);
  });

  it('starts at 100 %', () => {
    expect(service.zoom()).toBe(1);
    expect(service.percent()).toBe(100);
  });

  it('zooms in and out in steps and back to 100 % on reset', () => {
    service.zoomIn();
    expect(service.percent()).toBe(125);
    service.zoomOut();
    service.zoomOut();
    expect(service.percent()).toBe(80);
    service.reset();
    expect(service.zoom()).toBe(1);
  });

  it('keeps the zoom within its limits and says when a direction is used up', () => {
    expect(service.set(10)).toBe(MAX_ZOOM);
    expect(service.canZoomIn()).toBeFalse();
    expect(service.set(0.01)).toBe(MIN_ZOOM);
    expect(service.canZoomOut()).toBeFalse();
    expect(service.canZoomIn()).toBeTrue();
  });
});
