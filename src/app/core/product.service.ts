import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Product } from '../shared/catalog';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/products`;

  readonly products = signal<Product[]>([]);
  readonly loaded = signal(false);

  constructor() {
    this.refresh().subscribe({
      next: (list) => {
        this.products.set(list);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true),
    });
  }

  refresh(): Observable<Product[]> {
    return this.http.get<Product[]>(this.base).pipe(
      tap((list) => {
        this.products.set(list);
        this.loaded.set(true);
      }),
    );
  }

  getById(id: string): Observable<Product> {
    return this.http.get<Product>(`${this.base}/${id}`);
  }
}
