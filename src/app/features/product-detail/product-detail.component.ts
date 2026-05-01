import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { EMPTY } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { Product } from '../../shared/catalog';
import { resolveProductImageUrl } from '../../shared/media-url';
import { CartService } from '../../core/cart.service';
import { ProductService } from '../../core/product.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './product-detail.component.html',
})
export class ProductDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly cartService = inject(CartService);
  private readonly productService = inject(ProductService);

  readonly product = signal<Product | undefined>(undefined);
  readonly selectedImage = signal(0);
  readonly preferredDeliveryDate = signal(this.cartService.getTomorrow());

  constructor() {
    this.route.paramMap
      .pipe(
        switchMap((params) => {
          const id = params.get('id') ?? '';
          this.selectedImage.set(0);
          if (!id.trim()) {
            void this.router.navigate(['/shop']);
            return EMPTY;
          }
          return this.productService.getById(id.trim());
        }),
      )
      .subscribe({
        next: (p) => this.product.set(p),
        error: () => void this.router.navigate(['/shop']),
      });
  }

  /**
   * Hero + thumbnails: first slot is always the primary `image`; following slots are admin-uploaded gallery images.
   * With two uploads total (cover + one gallery), UI shows [cover, cover, gallery1] → two distinct thumbnails where the first matches the hero.
   */
  imagesFor(p: Product): string[] {
    const primary = resolveProductImageUrl(p.image);
    const extras = (p.galleryImages ?? []).map((src) =>
      resolveProductImageUrl(src),
    );
    return [primary, ...extras];
  }

  getTomorrow(): string {
    return this.cartService.getTomorrow();
  }

  addToCart(): void {
    const p = this.product();
    if (!p) return;
    this.cartService.addToCart(p, this.preferredDeliveryDate());
  }
}
