import { Injectable, computed, signal } from '@angular/core';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 3;
/** Zoom factor of one press of the + / − buttons. */
const ZOOM_STEP = 1.25;

/**
 * How big the score is shown in the editor (1 = 100 %). Only the view changes: the drawing, the
 * model and the exports stay the same. The staff view zooms around the pointer on a pinch; the
 * toolbar buttons zoom in steps.
 */
@Injectable({ providedIn: 'root' })
export class ViewZoomService {
  private readonly zoomState = signal(1);

  readonly zoom = this.zoomState.asReadonly();
  readonly percent = computed(() => Math.round(this.zoomState() * 100));
  readonly canZoomIn = computed(() => this.zoomState() < MAX_ZOOM);
  readonly canZoomOut = computed(() => this.zoomState() > MIN_ZOOM);

  /** Sets the zoom, kept between MIN_ZOOM and MAX_ZOOM. Returns the zoom actually set. */
  set(zoom: number): number {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    this.zoomState.set(next);
    return next;
  }

  zoomIn(): void {
    this.set(this.zoomState() * ZOOM_STEP);
  }

  zoomOut(): void {
    this.set(this.zoomState() / ZOOM_STEP);
  }

  reset(): void {
    this.set(1);
  }
}
