import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { readFileSync } from "node:fs";
function loadEnv(){const c=readFileSync(new URL("../.env",import.meta.url),"utf-8");const e:any={};c.split("\n").forEach(l=>{const t=l.trim();if(!t||t.startsWith("#"))return;const [k,...v]=t.split("=");if(k&&v.length)e[k.trim()]=v.join("=").trim().replace(/^["']|["']$/g,"");});return e;}
const env=loadEnv();
const app=getApps().length?getApp():initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,projectId:env.VITE_FIREBASE_PROJECT_ID,storageBucket:env.VITE_FIREBASE_STORAGE_BUCKET,messagingSenderId:env.VITE_FIREBASE_MESSAGING_SENDER_ID,appId:env.VITE_FIREBASE_APP_ID,measurementId:env.VITE_FIREBASE_MEASUREMENT_ID});
const db=getFirestore(app);
(async()=>{
  const {doc,setDoc}=await import("firebase/firestore");
  const id="INB-SBX-943-1792697106119";
  const now=new Date().toISOString();
  await setDoc(doc(db,"workOrders",id),{
    id,woNumber:id,tenantId:"acme",warehouseId:"atl1",clientName:"Sandbox Partner",
    containerNumber:"—",trailerNumber:"SBX-TRL-001",sealNumber:"SL-SBX",bolNumber:"BOL-SBX-943",
    poNumber:"PO-SBX-943",ediRef:"ASN-SBX-943",carrier:"Sandbox Carrier",vessel:"",voyageNumber:"",port:"",
    origin:"Sandbox Origin",arrivalDate:now,departureDate:null,yardInDate:null,yardLeaveDate:null,
    inboundEntryDate:now,receivedDate:null,status:"scheduled",totalUnits:10,totalCartons:10,lineCount:1,
    lines:[{lineNo:1,sku:"SBX-832-001",upc:"012345678905",description:"Sandbox Item A (EDI 832)",lot:"LOT-SBX",qtyExpected:10,qtyReceived:0,cartons:10,status:"pending"}],
    createdAt:now,updatedAt:now,inboundShipmentId:id
  });
  console.log("patched",id);
  process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
