import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Product } from '../shared/catalog';

export interface ServerCartLineDto {
  lineId: string;
  productId: string;
  quantity: number;
  preferredDeliveryDate: string;
  needsGiftcard: boolean;
  giftcardMessage: string;
  product: Product;
}

export interface ServerCartDto {
  cartId: string;
  items: ServerCartLineDto[];
}

export interface CartMergeLinePayload {
  productId: string;
  quantity: number;
  preferredDeliveryDate: string;
  needsGiftcard?: boolean;
  giftcardMessage?: string;
}

@Injectable({ providedIn: 'root' })
export class CartApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/cart`;

  getCart(): Observable<ServerCartDto> {
    return this.http.get<ServerCartDto>(this.base);
  }

  addItem(body: {
    productId: string;
    preferredDeliveryDate: string;
    quantityDelta?: number;
    quantity?: number;
    needsGiftcard?: boolean;
    giftcardMessage?: string;
  }): Observable<ServerCartDto> {
    return this.http.post<ServerCartDto>(`${this.base}/items`, body);
  }

  patchLine(
    lineId: string,
    body: {
      quantity?: number;
      preferredDeliveryDate?: string;
      needsGiftcard?: boolean;
      giftcardMessage?: string;
    },
  ): Observable<ServerCartDto> {
    return this.http.patch<ServerCartDto>(
      `${this.base}/items/${lineId}`,
      body,
    );
  }

  removeLine(lineId: string): Observable<ServerCartDto> {
    return this.http.delete<ServerCartDto>(`${this.base}/items/${lineId}`);
  }

  clearAll(): Observable<ServerCartDto> {
    return this.http.delete<ServerCartDto>(`${this.base}/all`);
  }

  mergeGuest(items: CartMergeLinePayload[]): Observable<ServerCartDto> {
    return this.http.post<ServerCartDto>(`${this.base}/merge`, { items });
  }
}
