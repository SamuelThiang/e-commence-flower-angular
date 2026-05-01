import {
  AfterViewInit,
  Directive,
  ElementRef,
  inject,
  input,
  OnDestroy,
} from '@angular/core';

/**
 * Apple-style scroll reveal: fade + gentle lift when the element enters the viewport.
 * Stagger siblings with different `[staggerMs]` values. Respects reduced motion.
 */
@Directive({
  selector: '[appRevealOnScroll]',
  standalone: true,
})
export class RevealOnScrollDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);
  /** Delay before this element’s transition starts (use index * 100 for stagger). */
  readonly staggerMs = input(0);

  private observer?: IntersectionObserver;

  ngAfterViewInit(): void {
    const root = this.el.nativeElement;
    root.style.setProperty('--reveal-delay', `${this.staggerMs()}ms`);
    root.classList.add('reveal-on-scroll');

    if (typeof IntersectionObserver === 'undefined') {
      root.classList.add('reveal-on-scroll--visible');
      return;
    }

    this.observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        root.classList.add('reveal-on-scroll--visible');
        this.observer?.unobserve(root);
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -6% 0px',
      },
    );
    queueMicrotask(() => this.observer?.observe(root));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
