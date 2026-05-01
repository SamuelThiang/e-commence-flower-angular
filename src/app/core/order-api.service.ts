import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Order, OrderSubmitLine } from '../shared/catalog';

/** Present when ToyyibPay is enabled on the server (`TOYYIBPAY_ENABLED`). */
export type CreateOrderPayment =
  | { billCode: string; paymentUrl: string }
  | { error: string }
  | null;

export interface CreateOrderResponse extends Order {
  payment?: CreateOrderPayment;
}

export interface CreateOrderPayload {
  id: string;
  date: string;
  status: Order['status'];
  items: OrderSubmitLine[];
  total: number;
  preferredDeliveryDate?: string;
  deliveryOption?: 'delivery' | 'pickup';
}

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/orders`;

  list(): Observable<Order[]> {
    return this.http.get<Order[]>(this.base);
  }

  create(payload: CreateOrderPayload): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(this.base, payload);
  }

  /** Admin: advance workflow (courier, pickup ready, completed). */
  patchStatus(
    orderId: string,
    status: Order['status'],
  ): Observable<Order> {
    const id = encodeURIComponent(orderId);
    return this.http.patch<Order>(`${this.base}/${id}/status`, { status });
  }
}
