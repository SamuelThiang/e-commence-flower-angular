import { Injectable, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly userSignal = signal<User | null>(null);
  private readonly readySignal = signal(false);

  readonly user = this.userSignal.asReadonly();
  readonly isReady = this.readySignal.asReadonly();

  constructor() {
    onAuthStateChanged(auth, (u) => {
      this.userSignal.set(u);
      this.readySignal.set(true);
    });
  }

  async googleLogin(): Promise<void> {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          createdAt: new Date().toISOString(),
          role: 'user',
          phone: '',
        });
        await this.router.navigate(['/profile']);
      } else {
        const userData = userDoc.data();
        if (!userData['phone']) {
          await this.router.navigate(['/profile']);
        } else {
          await this.router.navigate(['/home']);
        }
      }
    } catch (error: unknown) {
      console.error('Google Login error:', error);
      const msg = error instanceof Error ? error.message : 'Failed to sign in with Google.';
      alert(msg);
    }
  }

  async loginEmail(email: string, pass: string): Promise<void> {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
      const userData = userDoc.data();
      if (!userData?.['phone']) {
        await this.router.navigate(['/profile']);
      } else {
        await this.router.navigate(['/home']);
      }
    } catch (error: unknown) {
      console.error('Login error:', error);
      const msg = error instanceof Error ? error.message : 'Failed to sign in.';
      alert(msg);
    }
  }

  async register(
    email: string,
    pass: string,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = cred.user;
      await updateProfile(firebaseUser, {
        displayName: `${firstName} ${lastName}`,
      });
      await setDoc(doc(db, 'users', firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: `${firstName} ${lastName}`,
        createdAt: new Date().toISOString(),
        role: 'user',
        phone: '',
      });
      await this.router.navigate(['/profile']);
    } catch (error: unknown) {
      console.error('Registration error:', error);
      const msg = error instanceof Error ? error.message : 'Failed to create account.';
      alert(msg);
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(auth);
      await this.router.navigate(['/home']);
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}
