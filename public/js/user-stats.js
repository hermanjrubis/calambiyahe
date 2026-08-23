/**
 * Calzada User Exploration Stats & Establishment Focus Manager
 * REAL LIVE FIRESTORE SYNC:
 * - users/{uid}/visits: Document per visited/navigated establishment
 * - users/{uid}/savedPlaces: Document per bookmarked place
 * - users/{uid}/badges: Document per unlocked badge
 * 100% SVG Icons (Zero Raw Emojis)
 */

import { 
    auth, 
    db, 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    addDoc, 
    deleteDoc,
    query, 
    orderBy, 
    serverTimestamp,
    onAuthStateChanged,
    signOut,
    updateProfile,
    sendPasswordResetEmail
} from "./firebase-init.js";

// Badge criteria definitions with pure SVGs
export const BADGE_DEFINITIONS = [
    {
        id: "foodie",
        name: "Foodie Explorer",
        description: "Visited at least 3 Eateries or Cafes in Calamba",
        reqCategory: "Eateries",
        reqCount: 3,
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EA580C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`,
        badgeColor: "#FFF7ED",
        checkUnlocked: (visits) => visits.filter(v => (v.category || '').toLowerCase().includes('eatery') || (v.category || '').toLowerCase().includes('food') || (v.category || '').toLowerCase().includes('coffee') || (v.category || '').toLowerCase().includes('cafe')).length >= 3
    },
    {
        id: "historian",
        name: "Heritage Historian",
        description: "Visited at least 2 Landmarks or Cultural Heritage Sites",
        reqCategory: "Landmarks",
        reqCount: 2,
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7 12 2"></polygon></svg>`,
        badgeColor: "#F5F3FF",
        checkUnlocked: (visits) => visits.filter(v => (v.category || '').toLowerCase().includes('landmark') || (v.category || '').toLowerCase().includes('heritage') || (v.placeName || '').toLowerCase().includes('rizal') || (v.placeName || '').toLowerCase().includes('shrine') || (v.placeName || '').toLowerCase().includes('plaza')).length >= 2
    },
    {
        id: "shopper",
        name: "City Shopper",
        description: "Visited at least 2 Malls or Commercial Establishments",
        reqCategory: "Malls",
        reqCount: 2,
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
        badgeColor: "#EFF6FF",
        checkUnlocked: (visits) => visits.filter(v => (v.category || '').toLowerCase().includes('mall') || (v.category || '').toLowerCase().includes('shopping') || (v.placeName || '').toLowerCase().includes('sm') || (v.placeName || '').toLowerCase().includes('waltermart') || (v.placeName || '').toLowerCase().includes('mall')).length >= 2
    },
    {
        id: "explorer",
        name: "Calamba Explorer",
        description: "Visited at least 1 place across Malls, Eateries, Schools & Terminals",
        reqCategory: "All Categories",
        reqCount: 4,
        icon: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`,
        badgeColor: "#F0FDF4",
        checkUnlocked: (visits) => {
            const hasMall = visits.some(v => (v.category || '').toLowerCase().includes('mall'));
            const hasEatery = visits.some(v => (v.category || '').toLowerCase().includes('eatery') || (v.category || '').toLowerCase().includes('food') || (v.category || '').toLowerCase().includes('coffee'));
            const hasSchool = visits.some(v => (v.category || '').toLowerCase().includes('school') || (v.category || '').toLowerCase().includes('college') || (v.category || '').toLowerCase().includes('university'));
            const hasTerminal = visits.some(v => (v.category || '').toLowerCase().includes('terminal') || (v.category || '').toLowerCase().includes('transport') || (v.placeName || '').toLowerCase().includes('crossing'));
            return hasMall && hasEatery && hasSchool && hasTerminal;
        }
    }
];

// Active State
let currentVisits = [];
let currentSaved = [];
let currentBadges = [];
let activeUser = null;

// ─── Activity Feed Engine ────────────────────────────────────────────────────
let activityFeed = JSON.parse(localStorage.getItem('calzada_activity_feed') || '[]');
let unreadCount = activityFeed.filter(a => !a.read).length;

const ACTIVITY_ICONS = {
    visit:  `<svg width="15" height="15" fill="none" stroke="#2563EB" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`,
    save:   `<svg width="15" height="15" fill="none" stroke="#DC2626" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>`,
    unsave: `<svg width="15" height="15" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    badge:  `<svg width="15" height="15" fill="none" stroke="#D97706" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>`,
};

function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function addActivity(type, message) {
    const item = { id: Date.now(), type, message, timestamp: Date.now(), read: false };
    activityFeed.unshift(item);
    if (activityFeed.length > 30) activityFeed = activityFeed.slice(0, 30);
    localStorage.setItem('calzada_activity_feed', JSON.stringify(activityFeed));
    unreadCount++;
    updateBellBadge();
    renderActivityFeed();
}

function updateBellBadge() {
    const badge = document.getElementById('bellBadge');
    if (!badge) return;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderActivityFeed() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;
    if (!activityFeed.length) {
        list.innerHTML = `<div class="activity-empty-state">
            <svg width="28" height="28" fill="none" stroke="#CBD5E1" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <p>No activity yet.<br>Log visits or save places to see updates here.</p>
        </div>`;
        return;
    }
    list.innerHTML = activityFeed.map(item => `
        <div class="activity-feed-item${item.read ? '' : ' unread'}" data-actid="${item.id}">
            <span class="activity-feed-icon">${ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.visit}</span>
            <div class="activity-feed-body">
                <p class="activity-feed-msg">${escapeHtml(item.message)}</p>
                <span class="activity-feed-time">${timeAgo(item.timestamp)}</span>
            </div>
            <button type="button" class="activity-item-del-btn" data-actid="${item.id}" title="Remove notification">&times;</button>
        </div>
    `).join('');
}

// Mark all notifications as read (clears badge count)
window._calzadaMarkActivityAsRead = function () {
    activityFeed = activityFeed.map(a => ({ ...a, read: true }));
    unreadCount = 0;
    localStorage.setItem('calzada_activity_feed', JSON.stringify(activityFeed));
    updateBellBadge();
    renderActivityFeed();
};

// Completely wipe / clear the activity feed list
window._calzadaClearActivity = function () {
    activityFeed = [];
    unreadCount = 0;
    localStorage.removeItem('calzada_activity_feed');
    updateBellBadge();
    renderActivityFeed();
};

// Delete single activity item
window._calzadaDeleteActivityItem = function (id) {
    activityFeed = activityFeed.filter(a => String(a.id) !== String(id));
    unreadCount = activityFeed.filter(a => !a.read).length;
    localStorage.setItem('calzada_activity_feed', JSON.stringify(activityFeed));
    updateBellBadge();
    renderActivityFeed();
};

// Kick off on page load
setTimeout(() => { updateBellBadge(); renderActivityFeed(); }, 200);
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Fetch 100% Real Live User Stats from Firestore
 */
export async function fetchUserStats(user) {
    if (!user) {
        currentVisits = [];
        currentSaved = [];
        currentBadges = [];
        return { visits: 0, saves: 0, badges: 0 };
    }

    activeUser = user;

    if (user.isAnonymous) {
        const localSaved = JSON.parse(localStorage.getItem('calzadaSavedPlaces') || '[]');
        currentSaved = localSaved.map((s, idx) => ({ id: `local_${idx}`, placeName: s.name || s.placeName || 'Saved Spot', category: s.category || 'Establishment' }));
        currentVisits = JSON.parse(localStorage.getItem('calzadaLocalVisits') || '[]');
        currentBadges = BADGE_DEFINITIONS.filter(b => b.checkUnlocked(currentVisits));

        return {
            isAnonymous: true,
            visits: currentVisits.length,
            saves: currentSaved.length,
            badges: currentBadges.length
        };
    }

    try {
        const uid = user.uid;

        // 1. Read Real Visits from Firestore: users/{uid}/visits with local persistent cache fallback
        try {
            const visitsRef = collection(db, `users/${uid}/visits`);
            const visitsSnap = await getDocs(visitsRef);
            if (!visitsSnap.empty) {
                currentVisits = visitsSnap.docs.map(d => {
                    const data = d.data();
                    let dateStr = 'Recently';
                    if (data.timestamp && data.timestamp.toDate) {
                        dateStr = data.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }
                    return { id: d.id, ...data, date: dateStr };
                });
                localStorage.setItem(`calzada_visits_${uid}`, JSON.stringify(currentVisits));
            } else {
                const cachedVisits = JSON.parse(localStorage.getItem(`calzada_visits_${uid}`) || '[]');
                currentVisits = cachedVisits;
            }
        } catch (e) {
            console.warn("Firestore visits fetch failed (using local persistent store):", e);
            currentVisits = JSON.parse(localStorage.getItem(`calzada_visits_${uid}`) || '[]');
        }

        // 2. Read Real Saved Places from Firestore: users/{uid}/savedPlaces with local cache fallback
        try {
            const savedRef = collection(db, `users/${uid}/savedPlaces`);
            const savedSnap = await getDocs(savedRef);
            if (!savedSnap.empty) {
                currentSaved = savedSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                localStorage.setItem(`calzada_saved_${uid}`, JSON.stringify(currentSaved));
            } else {
                const cachedSaved = JSON.parse(localStorage.getItem(`calzada_saved_${uid}`) || localStorage.getItem('calzadaSavedPlaces') || '[]');
                currentSaved = cachedSaved.map((s, idx) => ({ id: s.id || `saved_${idx}`, placeName: s.name || s.placeName || 'Saved Spot', category: s.category || 'Establishment' }));
            }
        } catch (e) {
            console.warn("Firestore savedPlaces fetch failed (using local persistent store):", e);
            const cachedSaved = JSON.parse(localStorage.getItem(`calzada_saved_${uid}`) || localStorage.getItem('calzadaSavedPlaces') || '[]');
            currentSaved = cachedSaved.map((s, idx) => ({ id: s.id || `saved_${idx}`, placeName: s.name || s.placeName || 'Saved Spot', category: s.category || 'Establishment' }));
        }

        // 3. Dynamically evaluate and sync Badges: users/{uid}/badges
        const earnedBadges = BADGE_DEFINITIONS.filter(b => b.checkUnlocked(currentVisits));
        currentBadges = earnedBadges;

        // Try syncing earned badges to Firestore
        try {
            for (const b of earnedBadges) {
                const badgeDocRef = doc(db, `users/${uid}/badges`, b.id);
                setDoc(badgeDocRef, {
                    badgeName: b.name,
                    unlockedAt: serverTimestamp()
                }, { merge: true }).catch(() => {});
            }
        } catch (e) {}

        updateUINumbers();

        return {
            isAnonymous: false,
            visits: currentVisits.length,
            saves: currentSaved.length,
            badges: currentBadges.length
        };
    } catch (err) {
        console.error("Error reading live stats:", err);
        const cachedVisits = JSON.parse(localStorage.getItem(`calzada_visits_${user.uid}`) || '[]');
        const cachedSaved = JSON.parse(localStorage.getItem(`calzada_saved_${user.uid}`) || localStorage.getItem('calzadaSavedPlaces') || '[]');
        currentVisits = cachedVisits;
        currentSaved = cachedSaved.map((s, idx) => ({ id: s.id || `saved_${idx}`, placeName: s.name || s.placeName || 'Saved Spot', category: s.category || 'Establishment' }));
        currentBadges = BADGE_DEFINITIONS.filter(b => b.checkUnlocked(currentVisits));

        updateUINumbers();
        return {
            isAnonymous: false,
            visits: currentVisits.length,
            saves: currentSaved.length,
            badges: currentBadges.length
        };
    }
}

/**
 * Record a real visit when user navigates or selects a place
 */
export async function recordVisit(placeName, category) {
    if (!placeName) return;
    const user = auth.currentUser;
    const item = {
        id: `visit_${Date.now()}`,
        placeName,
        category: category || "Establishment",
        date: "Just now"
    };

    const prevBadgeIds = currentBadges.map(b => b.id);
    currentVisits.unshift(item);
    currentBadges = BADGE_DEFINITIONS.filter(b => b.checkUnlocked(currentVisits));

    // Notify: visit logged
    addActivity('visit', `Visited ${placeName} (${category || 'Establishment'})`);

    // Notify: new badge(s) unlocked
    currentBadges.forEach(b => {
        if (!prevBadgeIds.includes(b.id)) {
            addActivity('badge', `Badge unlocked: ${b.name}`);
        }
    });

    if (user && !user.isAnonymous) {
        localStorage.setItem(`calzada_visits_${user.uid}`, JSON.stringify(currentVisits));
        try {
            const docRef = await addDoc(collection(db, `users/${user.uid}/visits`), {
                placeName,
                category: category || "Establishment",
                timestamp: serverTimestamp()
            });
            item.id = docRef.id;
        } catch (e) {
            console.warn("Firestore visit write error (saved locally):", e);
        }
    } else {
        localStorage.setItem('calzadaLocalVisits', JSON.stringify(currentVisits));
    }

    updateUINumbers();
    renderVisitsList();
}

/**
 * Real Live Save / Bookmark Toggle
 */
export async function toggleSavePlace(placeName, category) {
    if (!placeName) return;
    const user = auth.currentUser;
    const existingIndex = currentSaved.findIndex(s => s.placeName?.toLowerCase() === placeName.toLowerCase());

    if (existingIndex > -1) {
        // Remove save
        const removed = currentSaved.splice(existingIndex, 1)[0];
        addActivity('unsave', `Removed "${placeName}" from Saved Places`);
        if (user && !user.isAnonymous) {
            localStorage.setItem(`calzada_saved_${user.uid}`, JSON.stringify(currentSaved));
            if (removed.id && !removed.id.startsWith('saved_') && !removed.id.startsWith('local_')) {
                try {
                    await deleteDoc(doc(db, `users/${user.uid}/savedPlaces`, removed.id));
                } catch (e) {
                    console.warn("Firestore delete save error:", e);
                }
            }
        }
    } else {
        // Add save
        const newSave = { id: `save_${Date.now()}`, placeName, category: category || "Establishment" };
        currentSaved.unshift(newSave);
        addActivity('save', `Saved "${placeName}" (${category || 'Establishment'})`);

        if (user && !user.isAnonymous) {
            localStorage.setItem(`calzada_saved_${user.uid}`, JSON.stringify(currentSaved));
            try {
                const docRef = await addDoc(collection(db, `users/${user.uid}/savedPlaces`), {
                    placeName,
                    category: category || "Establishment",
                    savedAt: serverTimestamp()
                });
                newSave.id = docRef.id;
            } catch (e) {
                console.warn("Firestore save write error (saved locally):", e);
            }
        }
    }

    // Keep global localStorage in sync
    localStorage.setItem('calzadaSavedPlaces', JSON.stringify(currentSaved.map(s => ({ name: s.placeName, category: s.category }))));
    updateUINumbers();
    renderSavedList();
}

/**
 * Update UI Counter numbers
 */
function updateUINumbers() {
    const visitsCountEl = document.getElementById('statVisitsCount');
    const savesCountEl = document.getElementById('statSavesCount');
    const badgesCountEl = document.getElementById('statBadgesCount');
    const menuSavedCountEl = document.getElementById('menuSavedCount');
    const userBadgeCounter = document.getElementById('userBadgeCounter');

    if (visitsCountEl) visitsCountEl.textContent = currentVisits.length;
    if (savesCountEl) savesCountEl.textContent = currentSaved.length;
    if (badgesCountEl) badgesCountEl.textContent = currentBadges.length;
    if (menuSavedCountEl) menuSavedCountEl.textContent = `(${currentSaved.length})`;
    if (userBadgeCounter) {
        userBadgeCounter.textContent = currentBadges.length;
        userBadgeCounter.style.display = currentBadges.length > 0 ? 'flex' : 'none';
    }
}

/**
 * Modal Renderers & UI Handlers
 */
export function setupProfileUI() {
    createProfileModals();

    const avatarBtn = document.getElementById('userAvatarPill');
    const authNavBtn = document.getElementById('authNavBtn');
    const dropdownMenu = document.getElementById('userProfileMenu');

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. GLOBAL FIREBASE AUTH STATE SYNC (Profile Pill vs Sign In Button)
    // ─────────────────────────────────────────────────────────────────────────────
    // Instant local storage check to prevent UI flash
    const wasLoggedIn = localStorage.getItem('calzada_logged_in') === 'true';
    if (wasLoggedIn && userAvatarPill && authNavBtn) {
        userAvatarPill.style.display = 'flex';
        authNavBtn.style.display = 'none';
        const cachedName = localStorage.getItem('calzada_pref_name') || localStorage.getItem('calzada_user_name');
        if (cachedName) {
            const nameEl = document.getElementById('userDisplayName');
            const initialsEl = document.getElementById('userAvatarInitials');
            const profNameEl = document.getElementById('profileDisplayName');
            if (nameEl) nameEl.textContent = cachedName;
            if (profNameEl) profNameEl.textContent = cachedName;
            if (initialsEl) initialsEl.textContent = cachedName.charAt(0).toUpperCase();
        }
    }

    onAuthStateChanged(auth, async (user) => {
        const userAvatarInitials = document.getElementById('userAvatarInitials');
        const userAvatarImg = document.getElementById('userAvatarImg');
        const userDisplayName = document.getElementById('userDisplayName');
        const userBadgeCounter = document.getElementById('userBadgeCounter');
        const profileHeaderImg = document.getElementById('profileHeaderImg');
        const profileHeaderInitials = document.getElementById('profileHeaderInitials');
        const profileDisplayName = document.getElementById('profileDisplayName');
        const profileEmail = document.getElementById('profileEmail');
        const statVisitsCount = document.getElementById('statVisitsCount');
        const statSavesCount = document.getElementById('statSavesCount');
        const statBadgesCount = document.getElementById('statBadgesCount');
        const menuSavedCount = document.getElementById('menuSavedCount');
        const anonProfileBanner = document.getElementById('anonProfileBanner');
        const explorationStatsSection = document.getElementById('explorationStatsSection');

        // Mobile icon elements
        const mobileSignInBtn = document.getElementById('mobileSignInBtn');
        const mobileAvatarBtn = document.getElementById('mobileAvatarBtn');
        const mobileAvatarInitials = document.getElementById('mobileAvatarInitials');
        const mobileAvatarImg = document.getElementById('mobileAvatarImg');

        if (user) {
            localStorage.setItem('calzada_logged_in', 'true');
            if (user.email) localStorage.setItem('calzada_user_email', user.email);
            if (authNavBtn) authNavBtn.style.display = 'none';
            if (avatarBtn) avatarBtn.style.display = 'flex';
            if (mobileSignInBtn) mobileSignInBtn.style.display = 'none';
            if (mobileAvatarBtn) mobileAvatarBtn.style.display = 'flex';

            const customName = localStorage.getItem('calzada_pref_name');
            const name = customName || user.displayName || (user.email ? user.email.split('@')[0] : 'Commuter');
            const email = user.email || (user.isAnonymous ? 'guest@calzada.ph' : 'herman@gmail.com');
            const initial = name.charAt(0).toUpperCase();
            localStorage.setItem('calzada_user_name', name);

            // 1. Navbar avatar pill
            if (userDisplayName) userDisplayName.textContent = name;
            const customPhoto = localStorage.getItem('calzada_pref_photo') || user.photoURL;
            if (customPhoto && userAvatarImg) {
                userAvatarImg.src = customPhoto;
                userAvatarImg.style.display = 'block';
                if (userAvatarInitials) userAvatarInitials.style.display = 'none';
            } else if (userAvatarInitials) {
                userAvatarInitials.textContent = initial;
                userAvatarInitials.style.display = 'block';
                if (userAvatarImg) userAvatarImg.style.display = 'none';
            }

            // 1b. Mobile avatar button
            if (customPhoto && mobileAvatarImg) {
                mobileAvatarImg.src = customPhoto;
                mobileAvatarImg.style.display = 'block';
                if (mobileAvatarInitials) mobileAvatarInitials.style.display = 'none';
            } else if (mobileAvatarInitials) {
                mobileAvatarInitials.textContent = initial;
                mobileAvatarInitials.style.display = 'block';
                if (mobileAvatarImg) mobileAvatarImg.style.display = 'none';
            }

            // 2. Dropdown Header
            if (profileDisplayName) profileDisplayName.textContent = name;
            if (profileEmail) profileEmail.textContent = email;
            if (profileHeaderInitials) profileHeaderInitials.textContent = initial;
            if (customPhoto && profileHeaderImg) {
                profileHeaderImg.src = customPhoto;
                profileHeaderImg.style.display = 'block';
                if (profileHeaderInitials) profileHeaderInitials.style.display = 'none';
            }

            // 3. Settings modal previews & inputs
            renderSettingsModal();

            // 4. Fetch dynamic stats (Visits, Saves, Badges)
            try {
                const stats = await fetchUserStats(user);
                if (statVisitsCount) statVisitsCount.textContent = stats.visits;
                if (statSavesCount) statSavesCount.textContent = stats.saves;
                if (statBadgesCount) statBadgesCount.textContent = stats.badges;
                if (menuSavedCount) menuSavedCount.textContent = `(${stats.saves})`;
                if (userBadgeCounter) {
                    userBadgeCounter.textContent = stats.badges;
                    userBadgeCounter.style.display = stats.badges > 0 ? 'flex' : 'none';
                }
            } catch (err) {
                console.warn("Could not fetch user stats:", err);
            }

            // Anonymous/Guest Mode vs Full Account
            if (user.isAnonymous) {
                if (anonProfileBanner) anonProfileBanner.style.display = 'flex';
                if (explorationStatsSection) explorationStatsSection.style.opacity = '0.7';
            } else {
                if (anonProfileBanner) anonProfileBanner.style.display = 'none';
                if (explorationStatsSection) explorationStatsSection.style.opacity = '1';
            }
        } else {
            localStorage.removeItem('calzada_logged_in');
            localStorage.removeItem('calzada_user_email');
            localStorage.removeItem('calzada_user_name');
            if (authNavBtn) authNavBtn.style.display = 'inline-flex';
            if (avatarBtn) avatarBtn.style.display = 'none';
            if (mobileSignInBtn) mobileSignInBtn.style.display = 'flex';
            if (mobileAvatarBtn) mobileAvatarBtn.style.display = 'none';
            if (dropdownMenu) dropdownMenu.classList.remove('open');
        }
    });

    // Handle Log Out Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                localStorage.removeItem('calzada_logged_in');
                localStorage.removeItem('calzada_user_email');
                localStorage.removeItem('calzada_user_name');
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Logout Error:", error);
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. DROPDOWN TOGGLES & EVENT DELEGATION (Desktop + Mobile)
    // ─────────────────────────────────────────────────────────────────────────────
    window._calzadaRenderActivityFeed = renderActivityFeed;

    document.addEventListener('click', (e) => {
        // A. Bell Icon Click (Desktop or Mobile)
        const bellBtn = e.target.closest('#bellAlertsBtn') || e.target.closest('#mobileBellBtn');
        if (bellBtn) {
            e.preventDefault();
            e.stopPropagation();
            const alertsMenu = document.getElementById('alertsDropdownMenu');
            if (!alertsMenu) return;
            const isOpen = alertsMenu.classList.contains('open');

            // Close other dropdowns
            const userMenu = document.getElementById('userProfileMenu');
            const pill = document.getElementById('userAvatarPill');
            const exploreMenu = document.getElementById('exploreDropdown');
            if (userMenu) userMenu.classList.remove('open');
            if (pill) pill.classList.remove('open');
            if (exploreMenu) exploreMenu.classList.remove('open');

            if (!isOpen) {
                alertsMenu.classList.add('open');
                renderActivityFeed();
                if (typeof window._calzadaMarkActivityAsRead === 'function') {
                    window._calzadaMarkActivityAsRead();
                }
            } else {
                alertsMenu.classList.remove('open');
            }
            return;
        }

        // B. Profile Avatar Click (Desktop or Mobile)
        const avatarClickBtn = e.target.closest('#userAvatarPill') || e.target.closest('#mobileAvatarBtn');
        if (avatarClickBtn) {
            e.preventDefault();
            e.stopPropagation();
            const userMenu = document.getElementById('userProfileMenu');
            if (!userMenu) return;
            const isOpen = userMenu.classList.contains('open');

            // Close other dropdowns
            const alertsMenu = document.getElementById('alertsDropdownMenu');
            const exploreMenu = document.getElementById('exploreDropdown');
            if (alertsMenu) alertsMenu.classList.remove('open');
            if (exploreMenu) exploreMenu.classList.remove('open');

            if (!isOpen) {
                userMenu.classList.add('open');
                const pill = document.getElementById('userAvatarPill');
                if (pill) pill.classList.add('open');
            } else {
                userMenu.classList.remove('open');
                const pill = document.getElementById('userAvatarPill');
                if (pill) pill.classList.remove('open');
            }
            return;
        }

        // C. Bell Clear Button Click
        const clearBtn = e.target.closest('#bellClearBtn');
        if (clearBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window._calzadaClearActivity === 'function') {
                window._calzadaClearActivity();
            }
            return;
        }

        // D. Click outside closes profile & bell dropdowns
        if (!e.target.closest('#alertsDropdownMenu') &&
            !e.target.closest('#userProfileMenu') &&
            !e.target.closest('#userProfileNav') &&
            !e.target.closest('#mobileAvatarBtn') &&
            !e.target.closest('#mobileBellBtn') &&
            !e.target.closest('#bellAlertsBtn') &&
            !e.target.closest('.profile-modal-overlay') &&
            !e.target.closest('.profile-modal-container')) {
            const alertsMenu = document.getElementById('alertsDropdownMenu');
            const userMenu = document.getElementById('userProfileMenu');
            const pill = document.getElementById('userAvatarPill');
            if (alertsMenu) alertsMenu.classList.remove('open');
            if (userMenu) userMenu.classList.remove('open');
            if (pill) pill.classList.remove('open');
        }
    });

    // Ensure activity feed is rendered initially
    renderActivityFeed();

    // Modal Triggers
    document.addEventListener('click', (e) => {
        const itemVisits = e.target.closest('#menuMyVisits') || e.target.closest('#statVisitsBtn');
        if (itemVisits) {
            e.preventDefault();
            closeDropdown();
            openModal('modalMyVisits');
            renderVisitsList();
            return;
        }

        const itemSaved = e.target.closest('#menuSavedPlaces') || e.target.closest('#statSavesBtn');
        if (itemSaved) {
            e.preventDefault();
            closeDropdown();
            openModal('modalSavedPlaces');
            renderSavedList();
            return;
        }

        const itemAchievements = e.target.closest('#menuMyAchievements') || e.target.closest('#statBadgesBtn');
        if (itemAchievements) {
            e.preventDefault();
            closeDropdown();
            openModal('modalMyAchievements');
            renderAchievementsList();
            return;
        }

        const itemSettings = e.target.closest('#menuAccountSettings');
        if (itemSettings) {
            e.preventDefault();
            closeDropdown();
            renderSettingsModal();
            openModal('modalAccountSettings');
            return;
        }

        // Change Photo button triggers hidden file input
        const changePhotoBtn = e.target.closest('#btnChangePhotoText');
        if (changePhotoBtn) {
            e.preventDefault();
            const fileInput = document.getElementById('avatarFileInput');
            if (fileInput) fileInput.click();
            return;
        }

        // Change Password button
        const changePasswordBtn = e.target.closest('#btnChangePassword');
        if (changePasswordBtn) {
            e.preventDefault();
            handlePasswordReset();
            return;
        }

        // Save account settings button
        const saveSettingsBtn = e.target.closest('#btnSaveUserSettings');
        if (saveSettingsBtn) {
            e.preventDefault();
            saveUserSettings();
            return;
        }

        // Cancel account settings button
        const cancelSettingsBtn = e.target.closest('#btnCancelUserSettings');
        if (cancelSettingsBtn) {
            e.preventDefault();
            closeModal('modalAccountSettings');
            return;
        }

        // Delete single activity item button
        const delActBtn = e.target.closest('.activity-item-del-btn');
        if (delActBtn) {
            e.stopPropagation();
            const actId = delActBtn.dataset.actid;
            if (actId && typeof window._calzadaDeleteActivityItem === 'function') {
                window._calzadaDeleteActivityItem(actId);
            }
            return;
        }

        // Quick log visit button in modal
        const logVisitBtn = e.target.closest('#btnLogNewVisit');
        if (logVisitBtn) {
            const input = document.getElementById('quickVisitInput');
            const catSelect = document.getElementById('quickVisitCat');
            if (input && input.value.trim()) {
                recordVisit(input.value.trim(), catSelect ? catSelect.value : 'Mall');
                input.value = '';
                renderVisitsList();
            }
            return;
        }

        // Quick bookmark button in modal
        const logSaveBtn = e.target.closest('#btnLogNewSave');
        if (logSaveBtn) {
            const input = document.getElementById('quickSaveInput');
            const catSelect = document.getElementById('quickSaveCat');
            if (input && input.value.trim()) {
                toggleSavePlace(input.value.trim(), catSelect ? catSelect.value : 'Establishment');
                input.value = '';
            }
            return;
        }

        // Remove bookmark button inside saved list
        const removeSaveBtn = e.target.closest('.remove-save-action-btn');
        if (removeSaveBtn) {
            const name = removeSaveBtn.dataset.placename;
            if (name) {
                // Animate the card out before removing from data
                const card = removeSaveBtn.closest('.visit-item-card');
                if (card) {
                    card.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.92)';
                    setTimeout(() => toggleSavePlace(name), 230);
                } else {
                    toggleSavePlace(name);
                }
            }
            return;
        }

        // Close modal when clicking close button or backdrop
        const closeBtn = e.target.closest('.modal-close-btn');
        if (closeBtn) {
            const overlay = closeBtn.closest('.profile-modal-overlay');
            if (overlay) overlay.classList.remove('active');
            return;
        }

        if (e.target.classList.contains('profile-modal-overlay')) {
            e.target.classList.remove('active');
        }
    });

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.profile-modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
    });
}

function closeDropdown() {
    const avatarBtn = document.getElementById('userAvatarPill');
    const dropdownMenu = document.getElementById('userProfileMenu');
    if (avatarBtn) avatarBtn.classList.remove('open');
    if (dropdownMenu) dropdownMenu.classList.remove('open');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function renderVisitsList() {
    const container = document.getElementById('visitsListContainer');
    if (!container) return;

    if (!currentVisits.length) {
        container.innerHTML = `
            <div class="empty-state-card">
                <div class="empty-state-icon">
                    <svg width="32" height="32" fill="none" stroke="#94A3B8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                </div>
                <h4 class="empty-state-title">No visits recorded yet</h4>
                <p class="empty-state-desc">When you search or navigate to malls, eateries, and spots in Calamba, they will appear here automatically.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentVisits.map(v => `
        <div class="visit-item-card">
            <div class="visit-icon-wrap">
                ${getCategoryIcon(v.category)}
            </div>
            <div class="visit-item-info">
                <h4 class="visit-item-name">${escapeHtml(v.placeName)}</h4>
                <span class="visit-item-meta">${escapeHtml(v.category)} • ${v.date || 'Visited'}</span>
            </div>
            <a href="planner.html?destName=${encodeURIComponent(v.placeName)}" class="visit-go-btn" title="Plan route again">
                <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                <span>Route</span>
            </a>
        </div>
    `).join('');
}

function renderSavedList() {
    const container = document.getElementById('savedListContainer');
    if (!container) return;

    if (!currentSaved.length) {
        container.innerHTML = `
            <div class="empty-state-card">
                <div class="empty-state-icon">
                    <svg width="32" height="32" fill="none" stroke="#94A3B8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                </div>
                <h4 class="empty-state-title">No saved establishments yet</h4>
                <p class="empty-state-desc">Bookmark your favorite hangout places, schools, or cafes in Calamba for quick route planning.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = currentSaved.map(s => `
        <div class="visit-item-card">
            <div class="visit-icon-wrap saved">
                <svg width="18" height="18" fill="none" stroke="#DC2626" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
            </div>
            <div class="visit-item-info">
                <h4 class="visit-item-name">${escapeHtml(s.placeName)}</h4>
                <span class="visit-item-meta">${escapeHtml(s.category || 'Saved Place')}</span>
            </div>
            <div class="saved-item-actions">
                <a href="planner.html?destName=${encodeURIComponent(s.placeName)}" class="visit-go-btn">
                    <span>Route</span>
                </a>
                <button type="button" class="remove-save-action-btn" data-placename="${escapeHtml(s.placeName)}" title="Remove Bookmark">
                    <svg width="14" height="14" fill="none" stroke="#94A3B8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>
        </div>
    `).join('');
}

function renderAchievementsList() {
    const container = document.getElementById('achievementsListContainer');
    if (!container) return;

    container.innerHTML = BADGE_DEFINITIONS.map(b => {
        const isUnlocked = currentBadges.some(cb => cb.id === b.id);
        return `
            <div class="badge-item-card ${isUnlocked ? 'unlocked' : 'locked'}">
                <div class="badge-icon-box" style="background: ${isUnlocked ? b.badgeColor : '#F1F5F9'}">
                    ${b.icon}
                </div>
                <div class="badge-info">
                    <div class="badge-name-row">
                        <h4 class="badge-title">${escapeHtml(b.name)}</h4>
                        <span class="badge-status-tag ${isUnlocked ? 'earned' : ''}">
                            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${isUnlocked ? 'M5 13l4 4L19 7' : 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'}"/></svg>
                            ${isUnlocked ? 'Unlocked' : 'In Progress'}
                        </span>
                    </div>
                    <p class="badge-desc">${escapeHtml(b.description)}</p>
                </div>
            </div>
        `;
    }).join('');
}

function getCategoryIcon(category = '') {
    const c = category.toLowerCase();
    if (c.includes('mall') || c.includes('shopping')) {
        return `<svg width="16" height="16" fill="none" stroke="#2563EB" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>`;
    }
    if (c.includes('eatery') || c.includes('food') || c.includes('coffee') || c.includes('cafe')) {
        return `<svg width="16" height="16" fill="none" stroke="#EA580C" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`;
    }
    if (c.includes('school') || c.includes('college') || c.includes('university')) {
        return `<svg width="16" height="16" fill="none" stroke="#16A34A" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>`;
    }
    if (c.includes('hospital') || c.includes('medical') || c.includes('clinic')) {
        return `<svg width="16" height="16" fill="none" stroke="#DC2626" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4" stroke-width="2"></rect><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v8M8 12h8"></path></svg>`;
    }
    return `<svg width="16" height="16" fill="none" stroke="#7C3AED" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`;
}

function escapeHtml(str = '') {
    return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

let pendingAvatarDataUrl = null;

export function renderSettingsModal() {
    const user = auth.currentUser || activeUser;
    const nameEl = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const avatarLargeEl = document.getElementById('settingsAvatarLarge');
    const avatarImgEl = document.getElementById('settingsAvatarImg');
    const nameInput = document.getElementById('prefDisplayNameInput');
    const feedbackEl = document.getElementById('settingsFeedbackBanner');
    const fileInput = document.getElementById('avatarFileInput');

    if (feedbackEl) feedbackEl.style.display = 'none';
    if (fileInput) fileInput.value = '';
    pendingAvatarDataUrl = null;

    // Retrieve saved custom display name and photo
    const savedName = localStorage.getItem('calzada_pref_name');
    const savedPhoto = localStorage.getItem('calzada_pref_photo') || user?.photoURL;

    const displayName = savedName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Commuter');
    const email = user?.email || (user?.isAnonymous ? 'guest@calzada.ph' : 'hermanjohnph@gmail.com');
    const initial = (displayName || 'U').charAt(0).toUpperCase();

    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = email;

    if (savedPhoto && avatarImgEl && avatarLargeEl) {
        avatarImgEl.src = savedPhoto;
        avatarImgEl.style.display = 'block';
        avatarLargeEl.style.display = 'none';
    } else if (avatarLargeEl) {
        avatarLargeEl.textContent = initial;
        avatarLargeEl.style.display = 'flex';
        if (avatarImgEl) avatarImgEl.style.display = 'none';
    }

    if (nameInput) nameInput.value = displayName;

    // Wire file input listener once
    if (fileInput && !fileInput._wired) {
        fileInput._wired = true;
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
                if (file.size > 3 * 1024 * 1024) {
                    alert('Please select an image smaller than 3MB.');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (event) => {
                    pendingAvatarDataUrl = event.target.result;
                    if (avatarImgEl && avatarLargeEl) {
                        avatarImgEl.src = pendingAvatarDataUrl;
                        avatarImgEl.style.display = 'block';
                        avatarLargeEl.style.display = 'none';
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }
}

async function handlePasswordReset() {
    const user = auth.currentUser || activeUser;
    const email = user?.email || localStorage.getItem('calzada_user_email');
    const feedbackEl = document.getElementById('settingsFeedbackBanner');
    const feedbackText = document.getElementById('settingsFeedbackText');

    if (!email || user?.isAnonymous) {
        if (feedbackEl && feedbackText) {
            feedbackEl.style.display = 'flex';
            feedbackEl.style.background = '#FEF2F2';
            feedbackEl.style.borderColor = '#FECACA';
            feedbackEl.style.color = '#DC2626';
            feedbackText.textContent = 'Please sign in with a registered email account to reset password.';
        }
        return;
    }

    try {
        await sendPasswordResetEmail(auth, email);
        if (feedbackEl && feedbackText) {
            feedbackEl.style.display = 'flex';
            feedbackEl.style.background = '#F0FDF4';
            feedbackEl.style.borderColor = '#BBF7D0';
            feedbackEl.style.color = '#16A34A';
            feedbackText.textContent = `Password reset link sent to ${email}! Check your inbox.`;
        }
    } catch (err) {
        console.warn('Password reset error:', err);
        if (feedbackEl && feedbackText) {
            feedbackEl.style.display = 'flex';
            feedbackEl.style.background = '#FEF2F2';
            feedbackEl.style.borderColor = '#FECACA';
            feedbackEl.style.color = '#DC2626';
            feedbackText.textContent = err.message || 'Could not send reset link. Please try again.';
        }
    }
}

function saveUserSettings() {
    const nameInput = document.getElementById('prefDisplayNameInput');
    const feedbackEl = document.getElementById('settingsFeedbackBanner');
    const feedbackText = document.getElementById('settingsFeedbackText');

    const newName = nameInput ? nameInput.value.trim() : '';

    if (newName) {
        localStorage.setItem('calzada_pref_name', newName);
        const navDisplayName = document.getElementById('userDisplayName');
        const profileDisplayName = document.getElementById('profileDisplayName');
        const settingsDisplayName = document.getElementById('settingsDisplayName');
        if (navDisplayName) navDisplayName.textContent = newName;
        if (profileDisplayName) profileDisplayName.textContent = newName;
        if (settingsDisplayName) settingsDisplayName.textContent = newName;
    }

    if (pendingAvatarDataUrl) {
        localStorage.setItem('calzada_pref_photo', pendingAvatarDataUrl);
        // Update all avatars across the interface
        const userAvatarImg = document.getElementById('userAvatarImg');
        const userAvatarInitials = document.getElementById('userAvatarInitials');
        const profileHeaderImg = document.getElementById('profileHeaderImg');
        const profileHeaderInitials = document.getElementById('profileHeaderInitials');

        if (userAvatarImg) {
            userAvatarImg.src = pendingAvatarDataUrl;
            userAvatarImg.style.display = 'block';
        }
        if (userAvatarInitials) userAvatarInitials.style.display = 'none';
        if (profileHeaderImg) {
            profileHeaderImg.src = pendingAvatarDataUrl;
            profileHeaderImg.style.display = 'block';
        }
        if (profileHeaderInitials) profileHeaderInitials.style.display = 'none';
    }

    // Try persisting to Firebase Auth profile and Firestore if logged in
    const user = auth.currentUser || activeUser;
    if (user && !user.isAnonymous) {
        try {
            const updates = {};
            if (newName) updates.displayName = newName;
            if (pendingAvatarDataUrl) updates.photoURL = pendingAvatarDataUrl;
            if (Object.keys(updates).length > 0) {
                updateProfile(user, updates).catch(() => {});
            }
            setDoc(doc(db, `users/${user.uid}/preferences`, 'commute'), {
                displayName: newName || user.displayName || '',
                photoURL: pendingAvatarDataUrl || user.photoURL || '',
                updatedAt: serverTimestamp()
            }, { merge: true }).catch(() => {});
        } catch (e) {}
    }

    addActivity('save', `Updated account preferences`);

    if (feedbackEl) {
        if (feedbackText) feedbackText.textContent = 'Preferences saved successfully!';
        feedbackEl.style.display = 'flex';
    }

    setTimeout(() => {
        closeModal('modalAccountSettings');
        if (feedbackEl) feedbackEl.style.display = 'none';
    }, 1200);
}

function createProfileModals() {
    if (document.getElementById('calzadaModalsRoot')) return;

    const modalRoot = document.createElement('div');
    modalRoot.id = 'calzadaModalsRoot';
    modalRoot.innerHTML = `
        <!-- Modal: My Visits -->
        <div class="profile-modal-overlay" id="modalMyVisits">
            <div class="profile-modal-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <svg width="22" height="22" fill="none" stroke="#2563EB" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <h3>My Establishment Visits</h3>
                    </div>
                    <button class="modal-close-btn" type="button">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <!-- Quick Log Bar to easily test & record visits -->
                    <div class="modal-quick-bar">
                        <input type="text" id="quickVisitInput" placeholder="Log a place you visited (e.g. SM Calamba)..." class="modal-quick-input" />
                        <select id="quickVisitCat" class="modal-quick-select">
                            <option value="Mall">Mall</option>
                            <option value="Eatery">Eatery</option>
                            <option value="School">School</option>
                            <option value="Terminal">Terminal</option>
                        </select>
                        <button type="button" class="modal-quick-btn" id="btnLogNewVisit">+ Log Visit</button>
                    </div>

                    <p class="modal-subtitle">Places you have searched, navigated to, and visited in Calamba City.</p>
                    <div class="visits-list-wrap" id="visitsListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: Saved Places -->
        <div class="profile-modal-overlay" id="modalSavedPlaces">
            <div class="profile-modal-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <svg width="22" height="22" fill="none" stroke="#DC2626" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                        <h3>Saved Establishments</h3>
                    </div>
                    <button class="modal-close-btn" type="button">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <!-- Quick Bookmark Bar -->
                    <div class="modal-quick-bar">
                        <input type="text" id="quickSaveInput" placeholder="Bookmark a spot..." class="modal-quick-input" />
                        <select id="quickSaveCat" class="modal-quick-select">
                            <option value="Mall">Mall</option>
                            <option value="Eatery">Eatery</option>
                            <option value="School">School</option>
                            <option value="Terminal">Terminal</option>
                        </select>
                        <button type="button" class="modal-quick-btn save" id="btnLogNewSave">+ Save Spot</button>
                    </div>

                    <p class="modal-subtitle">Your bookmarked spots for quick commute planning and discovery.</p>
                    <div class="visits-list-wrap" id="savedListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: My Achievements -->
        <div class="profile-modal-overlay" id="modalMyAchievements">
            <div class="profile-modal-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <svg width="22" height="22" fill="none" stroke="#D97706" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"/></svg>
                        <h3>Exploration Achievements</h3>
                    </div>
                    <button class="modal-close-btn" type="button">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <p class="modal-subtitle">Earn badges by visiting local malls, eateries, schools, and historic landmarks.</p>
                    <div class="achievements-list-wrap" id="achievementsListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: Account Settings -->
        <div class="profile-modal-overlay" id="modalAccountSettings">
            <div class="profile-modal-box settings-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <svg width="22" height="22" fill="none" stroke="#2563EB" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                        <h3>Account Settings</h3>
                    </div>
                    <button class="modal-close-btn" type="button">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <!-- Success Banner -->
                    <div class="settings-feedback-banner" id="settingsFeedbackBanner">
                        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                        <span id="settingsFeedbackText">Settings saved successfully!</span>
                    </div>

                    <!-- User Identity & Photo Control -->
                    <div class="settings-profile-preview">
                        <div class="settings-avatar-wrapper">
                            <div class="settings-avatar-large" id="settingsAvatarLarge">U</div>
                            <img src="" alt="Profile Photo" class="settings-avatar-img" id="settingsAvatarImg" style="display:none;">
                            <label for="avatarFileInput" class="settings-avatar-edit-badge" title="Change Photo">
                                <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                            </label>
                            <input type="file" id="avatarFileInput" accept="image/*" style="display:none;">
                        </div>
                        <div class="settings-user-info-text">
                            <h4 id="settingsDisplayName">User</h4>
                            <p id="settingsEmail">user@example.com</p>
                            <button type="button" class="btn-change-photo-text" id="btnChangePhotoText">Change Photo</button>
                        </div>
                    </div>

                    <!-- Display Name Field -->
                    <div class="settings-form-group">
                        <label for="prefDisplayNameInput">Display Name / Alias</label>
                        <input type="text" id="prefDisplayNameInput" placeholder="Your name or nickname" class="settings-input" />
                    </div>

                    <!-- Security & Password Card -->
                    <div class="settings-card-group">
                        <div class="settings-card-label">Security & Password</div>
                        <div class="settings-security-card">
                            <div class="security-card-left">
                                <div class="security-card-icon">
                                    <svg width="18" height="18" fill="none" stroke="#2563EB" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                                </div>
                                <div>
                                    <div class="security-card-title">Change Password</div>
                                    <div class="security-card-desc">Send a secure password reset link to your email</div>
                                </div>
                            </div>
                            <button type="button" class="btn-change-password" id="btnChangePassword">Send Reset Link</button>
                        </div>
                    </div>

                    <!-- Modal Actions -->
                    <div class="settings-actions">
                        <button type="button" class="settings-cancel-btn" id="btnCancelUserSettings">Cancel</button>
                        <button type="button" class="settings-save-btn" id="btnSaveUserSettings">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modalRoot);
}
