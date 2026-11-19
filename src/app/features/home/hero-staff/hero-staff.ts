import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { prefersReducedMotion } from '../motion';
import { HeroStaffScene } from './hero-staff-scene';

/** The landing page's live staff: writes itself, then lets the visitor add notes. */
@Component({
  selector: 'app-hero-staff',
  templateUrl: './hero-staff.html',
  styleUrl: './hero-staff.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HeroStaff {
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private scene: HeroStaffScene | null = null;

  /** Coarse pointers (touch) have no hover, so the hint tells them to tap instead. */
  protected readonly touch = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const host = this.canvas().nativeElement;
      this.touch.set(matchMedia('(hover: none)').matches);
      const scene = new HeroStaffScene(host, { reducedMotion: prefersReducedMotion() });
      this.scene = scene;
      scene.start();

      const resize = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width));
      resize.observe(host);

      let visible = true;
      const visibility = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
      visibility.observe(host);
      const onScroll = (event: Event) => {
        if (visible) {
          scene.scrolled(window.scrollY, event.timeStamp);
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });

      destroyRef.onDestroy(() => {
        resize.disconnect();
        visibility.disconnect();
        window.removeEventListener('scroll', onScroll);
        scene.destroy();
        this.scene = null;
      });
    });
  }

  protected onPointerMove(event: PointerEvent): void {
    if (event.pointerType !== 'touch') {
      this.scene?.hover(event.clientY);
    }
  }

  protected onPointerLeave(): void {
    this.scene?.leave();
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.button === 0) {
      this.scene?.place(event.clientY);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowUp':
        this.scene?.nudge(1);
        break;
      case 'ArrowDown':
        this.scene?.nudge(-1);
        break;
      case 'Enter':
      case ' ':
        this.scene?.place();
        break;
      case 'Backspace':
      case 'Delete':
        this.scene?.removeLast();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  protected onBlur(): void {
    this.scene?.leave();
  }
}
