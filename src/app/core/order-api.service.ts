import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
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

/** POST /api/orders/:id/retry-payment — new ToyyibPay bill for unpaid order */
export interface RetryPaymentResponse {
  billCode: string;
  paymentUrl: string;
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

/** GET /api/orders — newest 20 orders max, paginated */
export interface OrdersListResponse {
  items: Order[];
  /** Orders in this history window (≤ 20) */
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** In Transit count within that same newest-20 window */
  activeShipmentsInSet: number;
}

/** Same cap as server `ORDERS_HISTORY_CAP` — legacy array responses are trimmed here. */
const ORDERS_HISTORY_CAP = 20;

function clampRequestedPageSize(n: number): number {
  return n === 1 || n === 5 || n === 10 ? n : 10;
}

/**
 * Legacy APIs return `Order[]` (newest first) and ignore `page` / `pageSize`.
 * Slice client-side so `pageSize=1` does not show every row.
 */
function normalizeOrdersList(
  body: unknown,
  requested: { page: number; pageSize: number },
): OrdersListResponse {
  if (Array.isArray(body)) {
    const all = body as Order[];
    const capped = all.slice(0, ORDERS_HISTORY_CAP);
    const page = requested.page >= 1 ? requested.page : 1;
    const ps = clampRequestedPageSize(requested.pageSize);
    const offset = (page - 1) * ps;
    const items = capped.slice(offset, offset + ps);
    const total = Math.min(all.length, ORDERS_HISTORY_CAP);
    const totalPages = Math.max(1, Math.ceil(total / ps));
    const activeShipmentsInSet = capped.filter(
      (o) => o.status === 'In Transit',
    ).length;
    return {
      items,
      total,
      page,
      pageSize: ps,
      totalPages,
      activeShipmentsInSet,
    };
  }

  const o = body as Partial<OrdersListResponse>;
  let items = Array.isArray(o.items) ? [...o.items] : [];
  const total = typeof o.total === 'number' ? o.total : items.length;
  const pageSize =
    typeof o.pageSize === 'number' &&
    (o.pageSize === 1 || o.pageSize === 5 || o.pageSize === 10)
      ? o.pageSize
      : 10;
  const respPage = typeof o.page === 'number' && o.page >= 1 ? o.page : 1;
  /** Mismatch: server said this page size but sent too many rows (mis-deploy / proxy). */
  const reqPs = clampRequestedPageSize(requested.pageSize);
  if (
    items.length > reqPs &&
    respPage === requested.page &&
    pageSize === reqPs
  ) {
    items = items.slice(0, reqPs);
  }
  const totalPages =
    typeof o.totalPages === 'number' && o.totalPages >= 1
      ? o.totalPages
      : Math.max(1, Math.ceil(total / pageSize));
  const activeShipmentsInSet =
    typeof o.activeShipmentsInSet === 'number'
      ? o.activeShipmentsInSet
      : items.filter((x) => x.status === 'In Transit').length;

  return {
    items,
    total,
    page: respPage,
    pageSize,
    totalPages,
    activeShipmentsInSet,
  };
}

@Injectable({ providedIn: 'root' })
export class OrderApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/orders`;

  list(opts?: { page?: number; pageSize?: number }): Observable<OrdersListResponse> {
    const page = opts?.page != null && opts.page >= 1 ? opts.page : 1;
    const pageSize = clampRequestedPageSize(
      opts?.pageSize != null ? opts.pageSize : 10,
    );
    const params = new HttpParams()
      .set('page', String(page))
      .set('pageSize', String(pageSize));
    const requested = { page, pageSize };
    return this.http
      .get<OrdersListResponse | Order[]>(this.base, { params })
      .pipe(map((body) => normalizeOrdersList(body, requested)));
  }

  create(payload: CreateOrderPayload): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(this.base, payload);
  }

  /** New FPX link for an order stuck in Failed (pending/failed payment). */
  retryPayment(orderId: string): Observable<RetryPaymentResponse> {
    const id = encodeURIComponent(orderId);
    return this.http.post<RetryPaymentResponse>(
      `${this.base}/${id}/retry-payment`,
      {},
    );
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
