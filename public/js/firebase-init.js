import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut, 
    updateProfile, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { 
    getFirestore, 
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
    limit, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

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
    } catch (_) {
        return null;
    }
}

/**
 * Helper to cleanup collection overflow beyond maxEntries
 */
async function cleanupCollection(colRef, timestampField, maxEntries) {
    try {
        const q = query(colRef, orderBy(timestampField, "desc"));
        const snap = await getDocs(q);
        if (snap.size > maxEntries) {
            const overflow = snap.docs.slice(maxEntries);
            for (const d of overflow) {
                await deleteDoc(d.ref).catch(() => {});
            }
        }
    } catch (_) {
        // Silently skip cleanup failure
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER ACTIVITY TRACKING READ/WRITE FUNCTIONS (FIRESTORE)
// All write functions derive the userId strictly from auth.currentUser.uid.
// If unauthenticated / guest, writes are skipped silently without errors.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a search query to users/{userId}/searchHistory/{entryId}
 * Deduplicates against the most recent search entry and caps collection to latest 20 entries.
 */
export async function addSearchHistory(queryStr) {
    const user = auth.currentUser;
    if (!user || !user.uid) return null;
    const trimmedQuery = (queryStr || '').trim();
    if (!trimmedQuery) return null;

    try {
        const historyRef = collection(db, `users/${user.uid}/searchHistory`);
        
        // Deduplication: check if the most recent query matches (case-insensitive)
        const latestQuery = query(historyRef, orderBy("timestamp", "desc"), limit(1));
        const snap = await getDocs(latestQuery);
        if (!snap.empty) {
            const latestData = snap.docs[0].data();
            if (latestData && latestData.query && latestData.query.trim().toLowerCase() === trimmedQuery.toLowerCase()) {
                return snap.docs[0].id;
            }
        }

        const docRef = await addDoc(historyRef, {
            query: trimmedQuery,
            timestamp: serverTimestamp()
        });

        // Cap to latest 20
        cleanupCollection(historyRef, "timestamp", 20).catch(() => {});
        return docRef.id;
    } catch (_) {
        return null;
    }
}

/**
 * Retrieve user's search history
 */
export async function getSearchHistory(limitCount = 20) {
    const user = auth.currentUser;
    if (!user || !user.uid) return [];

    try {
        const historyRef = collection(db, `users/${user.uid}/searchHistory`);
        const q = query(historyRef, orderBy("timestamp", "desc"), limit(limitCount));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {
        return [];
    }
}

/**
 * Save / Bookmark a place to users/{userId}/savedPlaces/{placeId}
 * Document ID is the place's own ID.
 */
export async function savePlace(placeId, placeName, extraData = {}) {
    const user = auth.currentUser;
    if (!user || !user.uid) return null;
    if (!placeId) return null;

    const cleanId = String(placeId).trim();
    const cleanName = String(placeName || cleanId).trim();

    try {
        const docRef = doc(db, `users/${user.uid}/savedPlaces`, cleanId);
        const data = {
            placeName: cleanName,
            savedAt: serverTimestamp(),
            ...(extraData.category ? { category: extraData.category } : {})
        };
        await setDoc(docRef, data, { merge: true });
        return cleanId;
    } catch (_) {
        return null;
    }
}

/**
 * Remove a saved place from users/{userId}/savedPlaces/{placeId}
 */
export async function unsavePlace(placeId) {
    const user = auth.currentUser;
    if (!user || !user.uid) return false;
    if (!placeId) return false;

    const cleanId = String(placeId).trim();

    try {
        const docRef = doc(db, `users/${user.uid}/savedPlaces`, cleanId);
        await deleteDoc(docRef);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Retrieve user's saved places
 */
export async function getSavedPlaces() {
    const user = auth.currentUser;
    if (!user || !user.uid) return [];

    try {
        const savedRef = collection(db, `users/${user.uid}/savedPlaces`);
        const snap = await getDocs(savedRef);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {
        return [];
    }
}

/**
 * Record recently viewed place to users/{userId}/recentlyViewed/{entryId}
 * Caps collection to latest 20 entries.
 */
export async function addRecentlyViewed(placeId, placeName) {
    const user = auth.currentUser;
    if (!user || !user.uid) return null;
    if (!placeId && !placeName) return null;

    const cleanPlaceId = String(placeId || placeName.toLowerCase().replace(/\s+/g, '-')).trim();
    const cleanPlaceName = String(placeName || cleanPlaceId).trim();

    try {
        const viewedRef = collection(db, `users/${user.uid}/recentlyViewed`);
        const docRef = await addDoc(viewedRef, {
            placeId: cleanPlaceId,
            placeName: cleanPlaceName,
            viewedAt: serverTimestamp()
        });

        // Cap to latest 20
        cleanupCollection(viewedRef, "viewedAt", 20).catch(() => {});
        return docRef.id;
    } catch (_) {
        return null;
    }
}

/**
 * Retrieve user's recently viewed places
 */
export async function getRecentlyViewed(limitCount = 20) {
    const user = auth.currentUser;
    if (!user || !user.uid) return [];

    try {
        const viewedRef = collection(db, `users/${user.uid}/recentlyViewed`);
        const q = query(viewedRef, orderBy("viewedAt", "desc"), limit(limitCount));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {
        return [];
    }
}

/**
 * Record a chat message exchange to users/{userId}/chatHistory/{messageId}
 * Caps collection to latest 50 entries.
 */
export async function addChatMessage(role, message) {
    const user = auth.currentUser;
    if (!user || !user.uid) return null;
    if (!message || typeof message !== 'string' || !message.trim()) return null;

    const validRole = role === 'routie' ? 'routie' : 'user';

    try {
        const chatRef = collection(db, `users/${user.uid}/chatHistory`);
        const docRef = await addDoc(chatRef, {
            role: validRole,
            message: message.trim(),
            timestamp: serverTimestamp()
        });

        // Cap to latest 50
        cleanupCollection(chatRef, "timestamp", 50).catch(() => {});
        return docRef.id;
    } catch (_) {
        return null;
    }
}

/**
 * Retrieve user's chat history
 */
export async function getChatHistory(limitCount = 50) {
    const user = auth.currentUser;
    if (!user || !user.uid) return [];

    try {
        const chatRef = collection(db, `users/${user.uid}/chatHistory`);
        const q = query(chatRef, orderBy("timestamp", "asc"), limit(limitCount));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (_) {
        return [];
    }
}

// Activity bundle for global access across non-module scripts
const CalzadaActivity = {
    addSearchHistory,
    getSearchHistory,
    savePlace,
    unsavePlace,
    getSavedPlaces,
    addRecentlyViewed,
    getRecentlyViewed,
    addChatMessage,
    getChatHistory
};

window.CalzadaActivity = CalzadaActivity;

// Expose on window for easy access across all page scripts
window.CalzadaAuth = {
    auth,
    db,
    getCurrentUser,
    getFirebaseIdToken,
    onAuthStateChanged: (cb) => onAuthStateChanged(auth, cb),
    signOut: () => signOut(auth),
    activity: CalzadaActivity
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
    limit,
    serverTimestamp,
    signOut,
    updateProfile,
    sendPasswordResetEmail,
    CalzadaActivity
};

