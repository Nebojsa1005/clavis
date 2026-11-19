import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input } from '@angular/core';
import { animate, stagger } from 'animejs';

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fades a section in the first time it scrolls into view. Children marked `data-reveal` come in one
 * after another; without any, the element itself is revealed. Skipped entirely with reduced motion.
 */
@Directive({ selector: '[appReveal]' })
export class Reveal {
  /** Distance in px the content rises while fading in. */
  readonly appReveal = input<number | ''>(20);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
        return;
      }
      const marked = this.host.querySelectorAll<HTMLElement>('[data-reveal]');
      const targets = marked.length > 0 ? [...marked] : [this.host];
      // Anything already on screen at load stays put; only content below the fold animates.
      if (this.host.getBoundingClientRect().top < window.innerHeight) {
        return;
      }
      const rise = this.appReveal() === '' ? 20 : Number(this.appReveal());
      targets.forEach((el) => (el.style.opacity = '0'));

      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }
          observer.disconnect();
          animate(targets, {
            opacity: [0, 1],
            y: [rise, 0],
            duration: 700,
            delay: stagger(70),
            ease: 'outExpo',
          });
        },
        { rootMargin: '0px 0px -12% 0px' },
      );
      observer.observe(this.host);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }
}
