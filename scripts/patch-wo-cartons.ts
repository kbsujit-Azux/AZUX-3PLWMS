import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { readFileSync } from "node:fs";
function loadEnv(){const c=readFileSync(new URL("../.env",import.meta.url),"utf-8");const e:any={};c.split("\n").forEach(l=>{const t=l.trim();if(!t||t.startsWith("#"))return;const [k,...v]=t.split("=");if(k&&v.length)e[k.trim()]=v.join("=").trim().replace(/^["']|["']$/g,"");});return e;}
const env=loadEnv();
const app=getApps().length?getApp():initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID,measurementId:env.VITE_FIREBASE_MEASUREMENT_ID});
const db=getFirestore(app);
(async()=>{
  const {doc,getDoc,updateDoc}=await import("firebase/firestore");
  const id="INB-SBX-943-1792697106119";
  const ref=doc(db,"workOrders",id);
  const snap=await getDoc(ref);
  if(!snap.exists()){console.log("not found");process.exit(1);}
  const data=snap.data() as any;
  if(Array.isArray(data.lines)){data.lines=data.lines.map((l:any)=>({...l,cartons:Math.ceil((l.qtyExpected||0)/(l.packSize||1))}));}
  // if lines missing cartons, set top-level? WorkOrder may store lines under 'lines'
  await updateDoc(ref,{lines:data.lines});
  console.log("updated",id);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
