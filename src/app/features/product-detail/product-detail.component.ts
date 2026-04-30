import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
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

  readonly extraImages = [
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCXAC3AQBAqim9ew0EVNDihBdR_NuRcydjBZjygB9w1oVqECPfi-mVEE0JebHIgX27bYgb6BJOv3lKt5ngTM4TpYhLmnM97MBLvdM6XXrA8sjQr1xCfGBmR2c2HzXJlUu_inNCNQdfkDKI0xwRLr8uBe41J2_gI8cCl48X6BJpwhx19JKqFlAGsHP6J3D1ubJ8EH59iTkYPq-HePbTrCopStJU23CVTR87rfkhf8WHErXHUCW-B4AErYhI6d9sgzA-Cbud7G4oDR3Vh',
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDBvqAhh3X4vyBMw5JqXdrZYw2Z9yzmJxrSLEV17ZkszLRti8MAHxjNSkNKwxL40pirXgbSka2LbH4oDdHRnlGLO71S_JYdZOX7u8V6YmXnLXE6OAl797RkV0flwvpOgjhcUGfui-EJSWB_t1geBVci_8YvnzPN0m83ltVWFBG0r5Sq78qr-biAfblvpWDCwC2H7xmUwyqlza03nO9gp5OVg9HtZ0dFuW2KSZu8OSZJDQ6tx6c35mN6dHrDKFRhfZN61hPpnj7gbau',
  ];

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.productService.getById(id).subscribe({
      next: (p) => this.product.set(p),
      error: () => void this.router.navigate(['/shop']),
    });
  }

  imagesFor(p: Product): string[] {
    return [resolveProductImageUrl(p.image), ...this.extraImages];
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
