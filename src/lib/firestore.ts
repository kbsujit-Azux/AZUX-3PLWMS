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
import { initializeFirestore, persistentLocalCache, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const getEnv = (key: string) => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== "undefined" && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnv("VITE_FIREBASE_API_KEY") || "mock-api-key-value-for-dev",
  authDomain: getEnv("VITE_FIREBASE_AUTH_DOMAIN") || "mock-project.firebaseapp.com",
  projectId: getEnv("VITE_FIREBASE_PROJECT_ID") || "mock-project",
  storageBucket: getEnv("VITE_FIREBASE_STORAGE_BUCKET") || "mock-project.appspot.com",
  messagingSenderId: getEnv("VITE_FIREBASE_MESSAGING_SENDER_ID") || "1234567890",
  appId: getEnv("VITE_FIREBASE_APP_ID") || "1:1234567890:web:mockappid",
  measurementId: getEnv("VITE_FIREBASE_MEASUREMENT_ID") || "G-036287P2PB",
  databaseURL: `https://${getEnv("VITE_FIREBASE_PROJECT_ID") || "mock-project"}.firebaseio.com`,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
export const auth = getAuth(app);
export const rtdb = getDatabase(app);
export { app };

const useEmulator = getEnv("VITE_USE_EMULATOR") === "true";

if (useEmulator) {
  try {
    connectFirestoreEmulator(db, "localhost", 8080);
    console.log("WMS connected to local Firestore emulator (localhost:8080)");
  } catch (err: any) {
    if (!err.message?.includes("already has been started")) {
      console.warn("Firestore Emulator connection error:", err);
    }
  }
}


