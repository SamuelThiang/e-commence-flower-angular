import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../core/firebase';
import {
  handleFirestoreError,
  OperationType,
} from '../../core/firestore-errors';
import type { Order } from '../../shared/catalog';

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './orders.component.html',
})
export class OrdersComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly orders = signal<Order[]>([]);
  readonly loading = signal(true);
  readonly needsAuth = signal(!auth.currentUser);

  readonly activeShipments = computed(
    () => this.orders().filter((o) => o.status === 'In Transit').length,
  );

  constructor() {
    const user = auth.currentUser;
    if (!user) {
      this.loading.set(false);
      return;
    }
    const q = query(
      collection(db, 'orders'),
      where('uid', '==', user.uid),
      orderBy('date', 'desc'),
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as Order,
        );
        this.orders.set(data);
        this.loading.set(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'orders');
      },
    );
    this.destroyRef.onDestroy(() => unsub());
  }

  formatOrderDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  firstDeliveryAddress(order: Order): string {
    const addr = order.items[0]?.shippingDetails?.[0]?.address;
    return addr ?? '';
  }
}
