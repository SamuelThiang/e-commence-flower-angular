import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseWebConfig } from './firebase.config';

const app = initializeApp({
  apiKey: firebaseWebConfig.apiKey,
  authDomain: firebaseWebConfig.authDomain,
  projectId: firebaseWebConfig.projectId,
  storageBucket: firebaseWebConfig.storageBucket,
  messagingSenderId: firebaseWebConfig.messagingSenderId,
  appId: firebaseWebConfig.appId,
  measurementId: firebaseWebConfig.measurementId || undefined,
});

export const auth = getAuth(app);
export const db = getFirestore(app, firebaseWebConfig.firestoreDatabaseId);
