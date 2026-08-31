import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, updateProfile, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, addDoc, deleteDoc, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// Default Firebase configuration fallback for pages that do not define window.FIREBASE_CONFIG in HTML
if (!window.FIREBASE_CONFIG) {
    window.FIREBASE_CONFIG = {
        apiKey: "AIzaSyAKI7xRjkfajArFjWknW4IkvWwlkep5wj4",
        authDomain: "calzada-web.firebaseapp.com",
        projectId: "calzada-web",
        storageBucket: "calzada-web.firebasestorage.app",
        messagingSenderId: "772241459557",
        appId: "1:772241459557:web:992e794b2936faa25db98c",
        measurementId: "G-D6QBPVQVZM"
    };
}

const app = initializeApp(window.FIREBASE_CONFIG);
const auth = getAuth(app);
const db = getFirestore(app);

/**
 * Get current Firebase Auth user
 */
function getCurrentUser() {
    return auth.currentUser;
}

/**
 * Get a fresh Firebase ID Token for API requests
 * @param {boolean} forceRefresh
 * @returns {Promise<string|null>}
 */
async function getFirebaseIdToken(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return null;
    try {
        return await user.getIdToken(forceRefresh);
    } catch (err) {
        console.error("Failed to get Firebase ID token:", err);
        return null;
    }
}

// Expose on window for easy access across all page scripts
window.CalzadaAuth = {
    auth,
    db,
    getCurrentUser,
    getFirebaseIdToken,
    onAuthStateChanged: (cb) => onAuthStateChanged(auth, cb),
    signOut: () => signOut(auth)
};

export { 
    auth, 
    db, 
    getCurrentUser,
    getFirebaseIdToken,
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    getDocs,
    addDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    signOut,
    updateProfile,
    sendPasswordResetEmail
};

