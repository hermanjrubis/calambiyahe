import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Ensure window.FIREBASE_CONFIG is defined in HTML before this script loads
if (!window.FIREBASE_CONFIG) {
    console.error("FIREBASE_CONFIG is not defined! Please set window.FIREBASE_CONFIG.");
}

const app = initializeApp(window.FIREBASE_CONFIG || {});
const auth = getAuth(app);
const db = getFirestore(app);

export { 
    auth, 
    db, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    collection, 
    doc, 
    setDoc, 
    serverTimestamp,
    signOut
};
