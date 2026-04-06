import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../core/firebase';
import { AuthService } from '../../core/auth.service';
import {
  handleFirestoreError,
  OperationType,
} from '../../core/firestore-errors';
import type { UserAddress } from '../../shared/catalog';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
})
export class ProfileComponent {
  private readonly destroyRef = inject(DestroyRef);
  readonly authService = inject(AuthService);

  readonly addresses = signal<UserAddress[]>([]);
  readonly newAddress = signal({ address: '', label: '' });
  readonly isAdding = signal(false);
  readonly phone = signal('');
  readonly isUpdatingPhone = signal(false);

  constructor() {
    const user = auth.currentUser;
    if (user) {
      const q = query(
        collection(db, 'addresses'),
        where('uid', '==', user.uid),
      );
      const unsubA = onSnapshot(
        q,
        (snapshot) => {
          const addrs = snapshot.docs.map(
            (d) => ({ id: d.id, ...d.data() } as UserAddress),
          );
          this.addresses.set(addrs);
        },
        (err) =>
          handleFirestoreError(err, OperationType.LIST, 'addresses'),
      );
      const unsubU = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
        if (snapshot.exists()) {
          this.phone.set(snapshot.data()['phone'] || '');
        }
      });
      this.destroyRef.onDestroy(() => {
        unsubA();
        unsubU();
      });
    }
  }

  toggleAdding(): void {
    this.isAdding.update((v) => !v);
  }

  setNewLabel(value: string): void {
    this.newAddress.update((a) => ({ ...a, label: value }));
  }

  setNewAddressLine(value: string): void {
    this.newAddress.update((a) => ({ ...a, address: value }));
  }

  async submitAddress(ev: Event): Promise<void> {
    ev.preventDefault();
    const user = auth.currentUser;
    const na = this.newAddress();
    if (!user || !na.address || !na.label) return;
    try {
      const id = `ADDR-${Date.now()}`;
      const isFirst = this.addresses().length === 0;
      await setDoc(doc(db, 'addresses', id), {
        ...na,
        uid: user.uid,
        isDefault: isFirst,
        id,
      });
      this.newAddress.set({ address: '', label: '' });
      this.isAdding.set(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'addresses');
    }
  }

  async toggleDefault(id: string): Promise<void> {
    if (!auth.currentUser) return;
    try {
      const updates = this.addresses().map((addr) =>
        setDoc(
          doc(db, 'addresses', addr.id),
          { ...addr, isDefault: addr.id === id },
          { merge: true },
        ),
      );
      await Promise.all(updates);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'addresses');
    }
  }

  async updatePhone(ev: Event): Promise<void> {
    ev.preventDefault();
    const user = auth.currentUser;
    const p = this.phone();
    if (!user || !p) return;
    this.isUpdatingPhone.set(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), { phone: p });
      alert('Phone number updated successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    } finally {
      this.isUpdatingPhone.set(false);
    }
  }
}
