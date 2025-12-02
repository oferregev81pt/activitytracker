// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { getAnalytics } from "firebase/analytics";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/setup#config-object
const firebaseConfig = {
    apiKey: "AIzaSyDaYoDD5h0Ysg9o6OYidX_BzPeM4vA-k58",
    authDomain: "activity-tracker-1eee6.firebaseapp.com",
    projectId: "activity-tracker-1eee6",
    storageBucket: "activity-tracker-1eee6.firebasestorage.app",
    messagingSenderId: "491021713500",
    appId: "1:491021713500:web:98da172d744eae5ee7a699",
    measurementId: "G-C4WBXZ65TN"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const ai = getAI(app, { backend: new GoogleAIBackend() });
export const analytics = getAnalytics(app);
