import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { PRODUCTS, Product } from '../../shared/catalog';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'app-shop',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './shop.component.html',
})
export class ShopComponent {
  readonly cartService = inject(CartService);

  readonly price = signal(500);
  readonly selectedCategory = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly sortBy = signal('Curation');
  readonly gridCols = signal(3);
  readonly isFilterOpen = signal(false);

  readonly categories = [
    'Birthday',
    "Mother's Day",
    "Father's Day",
    'Graduation',
    'Congratulations-Grand-Opening',
    'Valentines-day-special',
  ];

  readonly products = PRODUCTS;

  readonly filteredProducts = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const cat = this.selectedCategory();
    const maxPrice = this.price();
    const sort = this.sortBy();
    let list = PRODUCTS.filter((product) => {
      const matchesPrice = product.price <= maxPrice;
      const matchesCategory = cat ? product.category === cat : true;
      const matchesSearch =
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q);
      return matchesPrice && matchesCategory && matchesSearch;
    });
    list = [...list].sort((a, b) => {
      if (sort === 'Price Asc') return a.price - b.price;
      if (sort === 'Price Desc') return b.price - a.price;
      return 0;
    });
    return list;
  });

  addToCart(p: Product): void {
    this.cartService.addToCart(p);
  }

  clearFilters(): void {
    this.selectedCategory.set(null);
    this.price.set(500);
    this.searchQuery.set('');
  }

  countInCategory(cat: string): number {
    return PRODUCTS.filter((p) => p.category === cat).length;
  }
}
