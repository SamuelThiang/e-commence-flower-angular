import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `
    <footer class="w-full bg-zinc-100/50 mt-auto">
      <div
        class="flex flex-col md:flex-row justify-between items-center py-12 px-8 max-w-[1440px] mx-auto w-full gap-6"
      >
        <div class="text-sm font-bold text-zinc-900 tracking-widest uppercase">
          The Ethereal Florist
        </div>
        <div
          class="flex flex-wrap justify-center gap-8 font-sans text-xs uppercase tracking-widest"
        >
          <a
            class="text-zinc-500 hover:text-zinc-900 underline-offset-4 hover:underline transition-all"
            href="#"
            >Sustainability</a
          >
          <a
            class="text-zinc-500 hover:text-zinc-900 underline-offset-4 hover:underline transition-all"
            href="#"
            >Shipping</a
          >
          <a
            class="text-zinc-500 hover:text-zinc-900 underline-offset-4 hover:underline transition-all"
            href="#"
            >Returns</a
          >
          <a
            class="text-zinc-500 hover:text-zinc-900 underline-offset-4 hover:underline transition-all"
            href="#"
            >Privacy</a
          >
          <a
            class="text-zinc-500 hover:text-zinc-900 underline-offset-4 hover:underline transition-all"
            href="#"
            >Terms</a
          >
          <a
            class="text-zinc-500 hover:text-zinc-900 underline-offset-4 hover:underline transition-all"
            href="#"
            >Contact</a
          >
        </div>
        <div
          class="text-zinc-600 font-sans text-[10px] uppercase tracking-widest text-center md:text-right"
        >
          © 2024 The Ethereal Florist. Curated for the modern botanist.
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {}
