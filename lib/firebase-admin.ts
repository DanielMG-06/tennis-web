import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const projectId = getRequiredEnv("FIREBASE_PROJECT_ID");
const clientEmail = getRequiredEnv("FIREBASE_CLIENT_EMAIL");
const privateKey = getRequiredEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");

const app =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });

const firestore = getFirestore(app);

export const db = firestore;
export const dbAdmin = firestore;
export default firestore;