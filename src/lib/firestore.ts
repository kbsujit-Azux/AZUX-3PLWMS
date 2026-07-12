/**
 * ============================================================
 *  MODULE INDEX — Firebase Initialization
 * ============================================================
 *
 *  Purpose: Single initialization point for Firebase services.
 *           Creates the Firebase app (idempotent), then exports
 *           the Firestore, Auth, and Realtime Database instances.
 *
 *  Exports:
 *    • app      — Firebase app instance
 *    • db       — Firestore database (used by firestore-data.ts)
 *    • auth     — Firebase Auth (used by auth.tsx)
 *    • rtdb     — Realtime Database (available for live yard ops)
 *
 *  Configuration:
 *    All values come from Vite env vars (VITE_FIREBASE_*).
 *    See .env.example or vite.config for required variables.
 *
 *  Extension points:
 *    - Add Firebase Storage initialization for document/image storage
 *    - Add Firebase Functions reference for server-side operations
 *    - Add Firestore emulator setup for local development
 * ============================================================
 */

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  databaseURL: `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}.firebaseio.com`,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);
export const auth = getAuth(app);
export const rtdb = getDatabase(app);

export default app;
