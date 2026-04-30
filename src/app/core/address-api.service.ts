import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type { UserAddress } from '../shared/catalog';

@Injectable({ providedIn: 'root' })
export class AddressApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/addresses`;

  list(): Observable<UserAddress[]> {
    return this.http.get<UserAddress[]>(this.base);
  }

  getDefault(): Observable<UserAddress | null> {
    return this.http.get<UserAddress | null>(`${this.base}?defaultOnly=true`);
  }

  create(body: { id?: string; address: string; label: string }): Observable<UserAddress> {
    return this.http.post<UserAddress>(this.base, body);
  }

  setDefault(id: string): Observable<UserAddress[]> {
    return this.http.patch<UserAddress[]>(`${this.base}/${id}/default`, {});
  }
}
