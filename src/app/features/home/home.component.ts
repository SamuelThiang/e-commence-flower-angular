import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductImageUrlPipe } from '../../shared/product-image-url.pipe';
import { RevealOnScrollDirective } from '../../shared/reveal-on-scroll.directive';
import { ProductService } from '../../core/product.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductImageUrlPipe, RevealOnScrollDirective],
  templateUrl: './home.component.html',
})
export class HomeComponent {
  private readonly productService = inject(ProductService);

  readonly products = computed(() => this.productService.products().slice(0, 4));
}
