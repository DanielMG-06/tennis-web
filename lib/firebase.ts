import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {

 apiKey: "AIzaSyAFRi0TDaxRd_9knK3FsqNxl6PjR4BMyV4",
  authDomain: "tennis-app-7efdd.firebaseapp.com",
  projectId: "tennis-app-7efdd",
  storageBucket: "tennis-app-7efdd.firebasestorage.app",
  messagingSenderId: "865137570853",
  appId: "1:865137570853:web:58dbe880b95c78fd537bcc",
  measurementId: "G-LMCR26KENS"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); // <-- NUEVO