import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Order } from '../shared/catalog';

export interface CreateOrderPayload {
  id: string;
  date: string;
  status: Order['status'];
  items: Order['items'];
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

  create(payload: CreateOrderPayload): Observable<Order> {
    return this.http.post<Order>(this.base, payload);
  }
}
