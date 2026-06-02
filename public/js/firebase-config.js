// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDR8iJZ7Cor9oQZkcHLWFCrHdxu2ibPtdQ",
  authDomain: "pirate-hall-pass.firebaseapp.com",
  projectId: "pirate-hall-pass",
  storageBucket: "pirate-hall-pass.firebasestorage.app",
  messagingSenderId: "994060813377",
  appId: "1:994060813377:web:4fbe64e656abb35858f2c0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);