import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "node:fs";

const content = readFileSync(".env", "utf-8");
const env: Record<string, string> = {};
content.split("\n").forEach((l) => {
  const t = l.trim();
  if (!t || t.startsWith("#")) return;
  const [k, ...v] = t.split("=");
  if (k && v.length) env[k.trim()] = v.join("=").trim().replace(/^["']|["']$/g, "");
});

const app = getApps().length === 0 ? initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}) : getApp();
const db = getFirestore(app);

(async () => {
  const snap = await getDocs(collection(db, "inboundShipments"));
  console.log("Total inbound shipments:", snap.size);
  snap.docs.forEach((d) => {
    const data = d.data();
    const palletCount = (data.lines || []).reduce((a: number, l: any) => a + (l.palletIds?.length || 0), 0);
    console.log(d.id, "| status:", data.status, "| lines:", (data.lines || []).length, "| pallets:", palletCount);
  });
})();