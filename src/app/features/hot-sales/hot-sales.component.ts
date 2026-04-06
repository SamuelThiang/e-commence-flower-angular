import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PRODUCTS, Product } from '../../shared/catalog';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'app-hot-sales',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './hot-sales.component.html',
})
export class HotSalesComponent {
  readonly cartService = inject(CartService);
  readonly maxPrice = signal(500);
  readonly searchQuery = signal('');
  readonly gridCols = signal(3);
  readonly isFilterOpen = signal(false);

  readonly hotProducts = computed(() =>
    [...PRODUCTS]
      .sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0))
      .filter(
        (p) =>
          p.price <= this.maxPrice() &&
          (p.name.toLowerCase().includes(this.searchQuery().toLowerCase()) ||
            p.description
              .toLowerCase()
              .includes(this.searchQuery().toLowerCase())),
      )
      .slice(0, 20),
  );

  addToCart(p: Product): void {
    this.cartService.addToCart(p);
  }
}
