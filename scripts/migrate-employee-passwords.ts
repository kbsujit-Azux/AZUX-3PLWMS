import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { hashPassword } from "../src/lib/password-utils.js";

function loadEnv() {
  const content = readFileSync(new URL("../.env", import.meta.url), "utf-8");
  const env: Record<string, string> = {};
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...valueParts] = trimmed.split("=");
    if (key && valueParts.length) {
      env[key.trim()] = valueParts.join("=").trim().replace(/^["']|["']$/g, "");
    }
  });
  return env;
}

const env = loadEnv();

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

async function migrate() {
  const { doc, collection, getDocs, updateDoc } = await import("firebase/firestore");
  
  const defaultPasswords: Record<string, string> = {
    "WH-1001": "admin123",
    "WH-1002": "ops123",
    "WH-1003": "lead123",
    "WH-1004": "lead123",
    "WH-1005": "recv123",
    "WH-1006": "pick123",
    "WH-1007": "bill123",
  };

  const defaultRoles: Record<string, { role: string; team: string; shift: string }> = {
    "WH-1001": { role: "Admin", team: "All", shift: "A" },
    "WH-1002": { role: "Operations Manager", team: "Operations", shift: "A" },
    "WH-1003": { role: "Warehouse Lead", team: "Putaway", shift: "A" },
    "WH-1004": { role: "Warehouse Lead", team: "Move", shift: "B" },
    "WH-1005": { role: "Receiver", team: "Receiving", shift: "A" },
    "WH-1006": { role: "Picker", team: "Picking", shift: "B" },
    "WH-1007": { role: "Billing", team: "Admin", shift: "A" },
  };

  const snap = await getDocs(collection(db, "employees"));
  console.log(`Found ${snap.docs.length} employees. Migrating passwords and roles...`);

  let updated = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const badgeId = data.badgeId as string;
    
    const updates: Record<string, unknown> = {};
    let hasUpdates = false;
    
    // Skip if already has passwordHash
    if (!data.passwordHash) {
      const defaultPassword = defaultPasswords[badgeId] || "changeme123";
      const passwordHash = await hashPassword(defaultPassword);
      updates.passwordHash = passwordHash;
      hasUpdates = true;
    }

    // Add role/team/shift if missing
    if (!data.role) {
      const defaults = defaultRoles[badgeId] || { role: "Picker", team: "Picking", shift: "A" };
      updates.role = defaults.role;
      updates.team = defaults.team;
      updates.shift = defaults.shift;
      hasUpdates = true;
    }

    if (hasUpdates) {
      await updateDoc(doc(db, "employees", docSnap.id), updates);
      console.log(`  ${badgeId}: updated with defaults`);
      updated++;
    } else {
      console.log(`  ${badgeId}: already up to date`);
    }
  }

  console.log(`\nMigration complete! Updated ${updated} employees.`);
  console.log("\nDefault passwords:");
  for (const [badgeId, password] of Object.entries(defaultPasswords)) {
    console.log(`  ${badgeId}: ${password}`);
  }
  process.exit(0);
}

migrate().catch((err) => {
  console.error("Error migrating employees:", err);
  process.exit(1);
});
