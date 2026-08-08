import { getAnalytics } from "firebase/analytics";
import { app, db } from "./firestore";

let analytics;
if (typeof window !== "undefined") {
  analytics = getAnalytics(app);
}

export { app, db, analytics };
