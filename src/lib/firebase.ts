import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator, enableIndexedDbPersistence } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

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
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

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

if (typeof window !== "undefined") {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn("Firestore persistence failed: multiple tabs open");
    } else if (err.code === "unimplemented") {
      console.warn("Firestore persistence not available in this browser");
    }
  });
}

export { app, db, analytics };
