import { Pipe, PipeTransform } from '@angular/core';
import { resolveProductImageUrl } from './media-url';

@Pipe({
  name: 'productImageUrl',
  standalone: true,
})
export class ProductImageUrlPipe implements PipeTransform {
  transform(src: string | null | undefined): string {
    return resolveProductImageUrl(src);
  }
}
