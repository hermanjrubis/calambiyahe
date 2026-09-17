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
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>`,
        checkUnlocked: (visits) => visits.filter(v => (v.category || '').toLowerCase().includes('eatery') || (v.category || '').toLowerCase().includes('food') || (v.category || '').toLowerCase().includes('coffee') || (v.category || '').toLowerCase().includes('cafe')).length >= 3
    },
    {
        id: "historian",
        name: "Heritage Historian",
        description: "Visited at least 2 Landmarks or Cultural Heritage Sites",
        reqCategory: "Landmarks",
        reqCount: 2,
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="22" x2="21" y2="22"></line><line x1="6" y1="18" x2="6" y2="11"></line><line x1="10" y1="18" x2="10" y2="11"></line><line x1="14" y1="18" x2="14" y2="11"></line><line x1="18" y1="18" x2="18" y2="11"></line><polygon points="12 2 20 7 4 7 12 2"></polygon></svg>`,
        checkUnlocked: (visits) => visits.filter(v => (v.category || '').toLowerCase().includes('landmark') || (v.category || '').toLowerCase().includes('heritage') || (v.placeName || '').toLowerCase().includes('rizal') || (v.placeName || '').toLowerCase().includes('shrine') || (v.placeName || '').toLowerCase().includes('plaza')).length >= 2
    },
    {
        id: "shopper",
        name: "City Shopper",
        description: "Visited at least 2 Malls or Commercial Establishments",
        reqCategory: "Malls",
        reqCount: 2,
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`,
        checkUnlocked: (visits) => visits.filter(v => (v.category || '').toLowerCase().includes('mall') || (v.category || '').toLowerCase().includes('shopping') || (v.placeName || '').toLowerCase().includes('sm') || (v.placeName || '').toLowerCase().includes('waltermart') || (v.placeName || '').toLowerCase().includes('mall')).length >= 2
    },
    {
        id: "explorer",
        name: "Calamba Explorer",
        description: "Visited at least 1 place across Malls, Eateries, Schools & Terminals",
        reqCategory: "All Categories",
        reqCount: 4,
        icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg>`,
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
let activityFeed = [];
let unreadCount = 0;

const ACTIVITY_ICONS = {
    visit:  `<svg width="15" height="15" fill="none" stroke="#378ADD" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>`,
    save:   `<svg width="15" height="15" fill="none" stroke="#378ADD" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>`,
    unsave: `<svg width="15" height="15" fill="none" stroke="#94A3B8" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`,
    badge:  `<svg width="15" height="15" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
};

function timeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

function addActivity(type, message) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return; // Skip recording activity for guest/unauthenticated users

    const item = { id: Date.now(), type, message, timestamp: Date.now(), read: false };
    activityFeed.unshift(item);
    if (activityFeed.length > 30) activityFeed = activityFeed.slice(0, 30);
    
    try {
        localStorage.setItem(`calzada_activity_feed_${user.uid}`, JSON.stringify(activityFeed));
    } catch (_) {}

    unreadCount++;
    updateBellBadge();
    renderActivityFeed();
}

function updateBellBadge() {
    const badge = document.getElementById('bellBadge');
    const mobileBadge = document.getElementById('mobileBellBadge');
    const user = auth.currentUser;

    if (!user || unreadCount <= 0) {
        if (badge) badge.style.display = 'none';
        if (mobileBadge) mobileBadge.style.display = 'none';
        return;
    }

    const text = unreadCount > 9 ? '9+' : String(unreadCount);
    if (badge) {
        badge.textContent = text;
        badge.style.display = 'flex';
    }
    if (mobileBadge) {
        mobileBadge.textContent = text;
        mobileBadge.style.display = 'flex';
    }
}

function renderActivityFeed() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;

    const user = auth.currentUser;

    if (!user) {
        list.innerHTML = `<div class="activity-empty-state">
            <svg width="28" height="28" fill="none" stroke="#CBD5E1" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <p>No activity yet.<br><a href="login.html" style="color: #378ADD; font-weight: 600; text-decoration: underline;">Sign in</a> to see your activity updates.</p>
        </div>`;
        return;
    }

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
    const user = auth.currentUser;
    activityFeed = activityFeed.map(a => ({ ...a, read: true }));
    unreadCount = 0;
    if (user && !user.isAnonymous) {
        try {
            localStorage.setItem(`calzada_activity_feed_${user.uid}`, JSON.stringify(activityFeed));
        } catch (_) {}
    }
    localStorage.removeItem('calzada_activity_feed');
    updateBellBadge();
    renderActivityFeed();
};

// Completely wipe / clear the activity feed list
window._calzadaClearActivity = function () {
    const user = auth.currentUser;
    activityFeed = [];
    unreadCount = 0;
    if (user && !user.isAnonymous) {
        try {
            localStorage.removeItem(`calzada_activity_feed_${user.uid}`);
        } catch (_) {}
    }
    localStorage.removeItem('calzada_activity_feed');
    updateBellBadge();
    renderActivityFeed();
};

// Delete single activity item
window._calzadaDeleteActivityItem = function (id) {
    const user = auth.currentUser;
    activityFeed = activityFeed.filter(a => String(a.id) !== String(id));
    unreadCount = activityFeed.filter(a => !a.read).length;
    if (user && !user.isAnonymous) {
        try {
            localStorage.setItem(`calzada_activity_feed_${user.uid}`, JSON.stringify(activityFeed));
        } catch (_) {}
    }
    updateBellBadge();
    renderActivityFeed();
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reset all user-specific state, cached data, DOM displays, and modal contents on logout/guest state.
 */
export function clearUserState() {
    activeUser = null;
    currentVisits = [];
    currentSaved = [];
    currentBadges = [];
    activityFeed = [];
    unreadCount = 0;

    // 1. Thoroughly wipe all localStorage & sessionStorage user data
    try {
        localStorage.removeItem('calzada_logged_in');
        localStorage.removeItem('calzada_user_email');
        localStorage.removeItem('calzada_user_name');
        localStorage.removeItem('calzada_activity_feed');
        localStorage.removeItem('calzadaSavedPlaces');
        localStorage.removeItem('calzadaLocalVisits');
        localStorage.removeItem('calzada_pref_name');
        localStorage.removeItem('calzada_pref_photo');
        sessionStorage.removeItem('calzadaChatHistory');
        
        // Remove any orphan user-scoped keys
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('calzada_activity_feed_') || k.startsWith('calzada_visits_') || k.startsWith('calzada_saved_')) {
                localStorage.removeItem(k);
            }
        });
    } catch (_) {}

    // 2. Reset Notification Bell & Activity Feed UI
    updateBellBadge();
    renderActivityFeed();

    // 3. Reset Navbar & Avatar elements back to guest / "Sign in"
    const authNavBtn = document.getElementById('authNavBtn');
    const avatarBtn = document.getElementById('userAvatarPill');
    const mobileSignInBtn = document.getElementById('mobileSignInBtn');
    const mobileAvatarBtn = document.getElementById('mobileAvatarBtn');
    const userDisplayName = document.getElementById('userDisplayName');
    const userAvatarInitials = document.getElementById('userAvatarInitials');
    const userAvatarImg = document.getElementById('userAvatarImg');
    const mobileAvatarInitials = document.getElementById('mobileAvatarInitials');
    const mobileAvatarImg = document.getElementById('mobileAvatarImg');
    const profileDisplayName = document.getElementById('profileDisplayName');
    const profileEmail = document.getElementById('profileEmail');
    const profileHeaderInitials = document.getElementById('profileHeaderInitials');
    const profileHeaderImg = document.getElementById('profileHeaderImg');
    const userBadgeCounter = document.getElementById('userBadgeCounter');
    const statVisitsCount = document.getElementById('statVisitsCount');
    const statSavesCount = document.getElementById('statSavesCount');
    const statBadgesCount = document.getElementById('statBadgesCount');
    const menuSavedCount = document.getElementById('menuSavedCount');
    const anonProfileBanner = document.getElementById('anonProfileBanner');
    const dropdownMenu = document.getElementById('userProfileMenu');
    const alertsMenu = document.getElementById('alertsDropdownMenu');

    if (authNavBtn) authNavBtn.style.display = 'inline-flex';
    if (avatarBtn) avatarBtn.style.display = 'none';
    if (mobileSignInBtn) mobileSignInBtn.style.display = 'flex';
    if (mobileAvatarBtn) mobileAvatarBtn.style.display = 'none';

    if (userDisplayName) userDisplayName.textContent = '';
    if (userAvatarInitials) {
        userAvatarInitials.textContent = '';
        userAvatarInitials.style.display = 'none';
    }
    if (userAvatarImg) {
        userAvatarImg.src = '';
        userAvatarImg.style.display = 'none';
    }
    if (mobileAvatarInitials) {
        mobileAvatarInitials.textContent = '';
        mobileAvatarInitials.style.display = 'none';
    }
    if (mobileAvatarImg) {
        mobileAvatarImg.src = '';
        mobileAvatarImg.style.display = 'none';
    }

    if (profileDisplayName) profileDisplayName.textContent = '';
    if (profileEmail) profileEmail.textContent = '';
    if (profileHeaderInitials) {
        profileHeaderInitials.textContent = '';
        profileHeaderInitials.style.display = 'none';
    }
    if (profileHeaderImg) {
        profileHeaderImg.src = '';
        profileHeaderImg.style.display = 'none';
    }

    if (userBadgeCounter) {
        userBadgeCounter.textContent = '0';
        userBadgeCounter.style.display = 'none';
    }
    if (statVisitsCount) statVisitsCount.textContent = '0';
    if (statSavesCount) statSavesCount.textContent = '0';
    if (statBadgesCount) statBadgesCount.textContent = '0';
    if (menuSavedCount) menuSavedCount.textContent = '(0)';
    if (anonProfileBanner) anonProfileBanner.style.display = 'none';

    if (dropdownMenu) dropdownMenu.classList.remove('open');
    if (alertsMenu) alertsMenu.classList.remove('open');

    // 4. Re-render empty lists in modals so stale places/visits/badges are wiped
    renderSavedList();
    renderVisitsList();
    renderAchievementsList();

    // 5. Close any open modal overlays
    document.querySelectorAll('.profile-modal-overlay.active').forEach(m => m.classList.remove('active'));

    // 6. Ensure Admin link is removed
    renderAdminMenuLink(false);
}

window._calzadaClearUserState = clearUserState;

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
 * Document ID in users/{userId}/savedPlaces/{placeId} is placeId
 */
export async function toggleSavePlace(placeName, category, placeId = null) {
    if (!placeName && !placeId) return;
    const user = auth.currentUser;
    const cleanPlaceName = placeName || placeId;
    const cleanPlaceId = String(placeId || cleanPlaceName.toLowerCase().replace(/\s+/g, '-')).trim();

    const existingIndex = currentSaved.findIndex(s => 
        (s.id && String(s.id) === cleanPlaceId) || 
        (s.placeName && s.placeName.toLowerCase() === cleanPlaceName.toLowerCase())
    );

    if (existingIndex > -1) {
        // Remove save
        const removed = currentSaved.splice(existingIndex, 1)[0];
        addActivity('unsave', `Removed "${cleanPlaceName}" from Saved Places`);
        if (user && !user.isAnonymous) {
            localStorage.setItem(`calzada_saved_${user.uid}`, JSON.stringify(currentSaved));
            const targetId = removed.id || cleanPlaceId;
            if (targetId && !targetId.startsWith('saved_') && !targetId.startsWith('local_')) {
                try {
                    await deleteDoc(doc(db, `users/${user.uid}/savedPlaces`, targetId));
                } catch (_) {}
            }
        }
    } else {
        // Add save
        const newSave = { id: cleanPlaceId, placeName: cleanPlaceName, category: category || "Establishment" };
        currentSaved.unshift(newSave);
        addActivity('save', `Saved "${cleanPlaceName}" (${category || 'Establishment'})`);

        if (user && !user.isAnonymous) {
            localStorage.setItem(`calzada_saved_${user.uid}`, JSON.stringify(currentSaved));
            try {
                await setDoc(doc(db, `users/${user.uid}/savedPlaces`, cleanPlaceId), {
                    placeName: cleanPlaceName,
                    category: category || "Establishment",
                    savedAt: serverTimestamp()
                }, { merge: true });
            } catch (_) {}
        }
    }

    // Keep global localStorage in sync
    localStorage.setItem('calzadaSavedPlaces', JSON.stringify(currentSaved.map(s => ({ name: s.placeName, category: s.category, id: s.id }))));
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
    if (wasLoggedIn && avatarBtn && authNavBtn) {
        avatarBtn.style.display = 'flex';
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
        if (user) {
            activeUser = user;
            localStorage.setItem('calzada_logged_in', 'true');
            if (user.email) localStorage.setItem('calzada_user_email', user.email);

            // Load user-specific activity feed
            try {
                const userFeedKey = `calzada_activity_feed_${user.uid}`;
                activityFeed = JSON.parse(localStorage.getItem(userFeedKey) || localStorage.getItem('calzada_activity_feed') || '[]');
                unreadCount = activityFeed.filter(a => !a.read).length;
            } catch (_) {
                activityFeed = [];
                unreadCount = 0;
            }
            updateBellBadge();
            renderActivityFeed();

            const authNavBtn = document.getElementById('authNavBtn');
            const avatarBtn = document.getElementById('userAvatarPill');
            const mobileSignInBtn = document.getElementById('mobileSignInBtn');
            const mobileAvatarBtn = document.getElementById('mobileAvatarBtn');
            const userDisplayName = document.getElementById('userDisplayName');
            const userAvatarInitials = document.getElementById('userAvatarInitials');
            const userAvatarImg = document.getElementById('userAvatarImg');
            const mobileAvatarInitials = document.getElementById('mobileAvatarInitials');
            const mobileAvatarImg = document.getElementById('mobileAvatarImg');
            const profileDisplayName = document.getElementById('profileDisplayName');
            const profileEmail = document.getElementById('profileEmail');
            const profileHeaderInitials = document.getElementById('profileHeaderInitials');
            const profileHeaderImg = document.getElementById('profileHeaderImg');
            const userBadgeCounter = document.getElementById('userBadgeCounter');
            const statVisitsCount = document.getElementById('statVisitsCount');
            const statSavesCount = document.getElementById('statSavesCount');
            const statBadgesCount = document.getElementById('statBadgesCount');
            const menuSavedCount = document.getElementById('menuSavedCount');
            const anonProfileBanner = document.getElementById('anonProfileBanner');
            const explorationStatsSection = document.getElementById('explorationStatsSection');

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

            // 5. Check Admin Custom Claim & Conditionally Render Link
            let isAdmin = false;
            if (!user.isAnonymous) {
                try {
                    const idTokenResult = await user.getIdTokenResult();
                    isAdmin = Boolean(idTokenResult && idTokenResult.claims && idTokenResult.claims.admin === true);
                } catch (claimErr) {
                    console.warn('Could not verify admin claims:', claimErr);
                }
            }
            renderAdminMenuLink(isAdmin);
        } else {
            clearUserState();
        }
    });

    // Handle Log Out Button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                clearUserState();
                await signOut(auth);
                window.location.href = 'login.html';
            } catch (error) {
                console.error("Logout Error:", error);
                clearUserState();
                window.location.href = 'login.html';
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

        const adminItem = e.target.closest('#menuAdminPanel');
        if (adminItem) {
            closeDropdown();
            return;
        }

        // Change Photo button triggers hidden file input
        const changePhotoBtn = e.target.closest('#btnChangePhotoText') || e.target.closest('#lblChangePhoto');
        if (changePhotoBtn) {
            e.preventDefault();
            const fileInput = document.getElementById('settingsPhotoUploadInput') || document.getElementById('avatarFileInput');
            if (fileInput) fileInput.click();
            return;
        }

        // Remove Photo link click -> show inline confirmation
        const removePhotoBtn = e.target.closest('#btnRemovePhoto');
        if (removePhotoBtn) {
            e.preventDefault();
            const actionsRow = document.getElementById('settingsAvatarActions');
            const confirmRow = document.getElementById('settingsRemoveConfirm');
            if (actionsRow && confirmRow) {
                actionsRow.style.display = 'none';
                confirmRow.style.display = 'flex';
            }
            return;
        }

        // Cancel Remove Photo
        const cancelRemoveBtn = e.target.closest('#btnConfirmRemoveCancel');
        if (cancelRemoveBtn) {
            e.preventDefault();
            const actionsRow = document.getElementById('settingsAvatarActions');
            const confirmRow = document.getElementById('settingsRemoveConfirm');
            if (actionsRow && confirmRow) {
                confirmRow.style.display = 'none';
                actionsRow.style.display = 'flex';
            }
            return;
        }

        // Confirm Remove Photo
        const confirmRemoveBtn = e.target.closest('#btnConfirmRemoveYes');
        if (confirmRemoveBtn) {
            e.preventDefault();
            handleRemovePhoto();
            return;
        }

        // Change Password / Password Reset button
        const changePasswordBtn = e.target.closest('#btnSendPasswordReset') || e.target.closest('#btnChangePassword');
        if (changePasswordBtn) {
            e.preventDefault();
            handlePasswordReset();
            return;
        }

        // Save account settings button
        const saveSettingsBtn = e.target.closest('#btnSaveProfileSettings') || e.target.closest('#btnSaveUserSettings');
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

        // Remove bookmark button inside saved list (micro-interaction with smooth fade + height-collapse)
        const removeSaveBtn = e.target.closest('.saved-remove-btn') || e.target.closest('.remove-save-action-btn');
        if (removeSaveBtn) {
            const name = removeSaveBtn.dataset.placename;
            if (name) {
                const card = removeSaveBtn.closest('.saved-stop-row') || removeSaveBtn.closest('.saved-place-card') || removeSaveBtn.closest('.visit-item-card');
                if (card) {
                    card.classList.add('removing');
                    setTimeout(() => toggleSavePlace(name), 200);
                } else {
                    toggleSavePlace(name);
                }
            }
            return;
        }

        // Empty state explore places button
        const exploreEmptyBtn = e.target.closest('#emptyStateExploreBtn') || e.target.closest('.saved-empty-explore-btn');
        if (exploreEmptyBtn) {
            closeModal('modalSavedPlaces');
            if (window.location.pathname.includes('places.html')) {
                e.preventDefault();
                const grid = document.getElementById('placesGrid') || document.querySelector('.places-page');
                if (grid) grid.scrollIntoView({ behavior: 'smooth' });
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

    // Form submit listener for Account Settings
    document.addEventListener('submit', (e) => {
        if (e.target && e.target.id === 'settingsProfileForm') {
            e.preventDefault();
            saveUserSettings();
        }
    });
}

/**
 * Conditionally render "Admin Panel" link in the account dropdown menu
 * Only rendered if idTokenResult.claims.admin === true.
 * Positioned between "My Business" and "Log Out".
 */
export function renderAdminMenuLink(isAdmin) {
    const existing = document.getElementById('menuAdminPanel');
    if (!isAdmin) {
        if (existing) existing.remove();
        return;
    }

    if (existing) return; // Already present in DOM

    const navList = document.querySelector('.profile-nav-list');
    const myBusinessBtn = document.getElementById('menuMyBusiness');
    const logoutBtn = document.getElementById('logoutBtn');

    const adminLink = document.createElement('a');
    adminLink.id = 'menuAdminPanel';
    adminLink.className = 'profile-nav-btn';
    const isPagesDir = window.location.pathname.includes('/pages/');
    adminLink.href = isPagesDir ? 'admin.html' : '/pages/admin.html';
    adminLink.style.textDecoration = 'none';
    adminLink.innerHTML = `
        <span class="nav-btn-icon" style="color: #378ADD;">
            <svg class="w-5 h-5" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
        </span>
        <span class="nav-btn-title">Admin Panel</span>
    `;

    if (myBusinessBtn && myBusinessBtn.parentNode) {
        myBusinessBtn.insertAdjacentElement('afterend', adminLink);
    } else if (navList) {
        navList.appendChild(adminLink);
    } else if (logoutBtn && logoutBtn.parentNode) {
        logoutBtn.parentNode.insertBefore(adminLink, logoutBtn);
    }
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
            <div class="saved-empty-state">
                <div class="saved-empty-icon-box">
                    <svg width="34" height="34" fill="none" stroke="#378ADD" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                </div>
                <h4 class="saved-empty-title">No visits recorded yet</h4>
                <p class="saved-empty-desc">When you search or navigate to malls, eateries, and spots in Calamba, they will appear here automatically.</p>
                <a href="places.html" class="saved-empty-explore-btn" id="emptyStateVisitsBtn">
                    <span>Explore Places</span>
                    <svg class="calzada-route-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="18" x2="18" y2="6"></line><polyline points="9 6 18 6 18 15"></polyline></svg>
                </a>
            </div>
        `;
        return;
    }

    container.innerHTML = currentVisits.map(v => {
        const vUrl = (v.lat != null && v.lng != null)
            ? `planner.html?destLat=${v.lat}&destLng=${v.lng}&destName=${encodeURIComponent(v.placeName)}&dlat=${v.lat}&dlng=${v.lng}&dest=${encodeURIComponent(v.placeName)}`
            : `planner.html?destName=${encodeURIComponent(v.placeName)}&dest=${encodeURIComponent(v.placeName)}`;
        return `
        <div class="visit-item-card">
            <div class="visit-item-info">
                <h4 class="visit-item-name" title="${escapeHtml(v.placeName)}">${escapeHtml(v.placeName)}</h4>
                <span class="visit-item-subtitle">${escapeHtml(v.category || 'Establishment')}${v.date ? ' • ' + escapeHtml(v.date) : ''}</span>
            </div>
            <div class="visit-item-actions">
                <a href="${vUrl}" class="saved-route-pill-btn" title="Plan route to ${escapeHtml(v.placeName)}">
                    <span>Route</span>
                    <svg class="calzada-route-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="18" x2="18" y2="6"></line><polyline points="9 6 18 6 18 15"></polyline></svg>
                </a>
            </div>
        </div>
    `;}).join('');
}

function getCategoryIconSvg(category = '') {
    const c = (category || '').toLowerCase();
    if (c.includes('mall') || c.includes('shopping')) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`;
    } else if (c.includes('coffee') || c.includes('cafe')) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`;
    } else if (c.includes('eat') || c.includes('food') || c.includes('restaurant') || c.includes('eatery')) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`;
    } else if (c.includes('school') || c.includes('univ') || c.includes('college')) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`;
    } else if (c.includes('term') || c.includes('station') || c.includes('transit')) {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 17h10"/><path d="M7 7h10"/><path d="M7 12h10"/></svg>`;
    } else {
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 7v14M21 7v14M6 21V7l6-4 6 4v14M9 9h1m4 0h1m-6 4h1m4 0h1m-6 4h1m4 0h1"/></svg>`;
    }
}

function renderSavedList() {
    const container = document.getElementById('savedListContainer');
    if (!container) return;

    if (!currentSaved.length) {
        container.innerHTML = `
            <div class="saved-empty-state">
                <div class="saved-empty-icon-box">
                    <svg width="34" height="34" fill="none" stroke="#378ADD" stroke-width="2" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                    </svg>
                </div>
                <h4 class="saved-empty-title">No saved spots yet</h4>
                <p class="saved-empty-desc">No saved spots yet — start exploring and save your favorites!</p>
                <a href="places.html" class="saved-empty-explore-btn" id="emptyStateExploreBtn">
                    <span>Explore Places</span>
                    <svg class="calzada-route-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="18" x2="18" y2="6"></line><polyline points="9 6 18 6 18 15"></polyline></svg>
                </a>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="saved-timeline-track-wrap">
            <div class="saved-timeline-track" aria-hidden="true"></div>
            <div class="saved-timeline-items">
                ${currentSaved.map(s => {
                    const sUrl = (s.lat != null && s.lng != null)
                        ? `planner.html?destLat=${s.lat}&destLng=${s.lng}&destName=${encodeURIComponent(s.placeName)}&dlat=${s.lat}&dlng=${s.lng}&dest=${encodeURIComponent(s.placeName)}`
                        : `planner.html?destName=${encodeURIComponent(s.placeName)}&dest=${encodeURIComponent(s.placeName)}`;
                    return `
                    <div class="saved-stop-row" data-placename="${escapeHtml(s.placeName)}">
                        <div class="saved-stop-node-wrap">
                            <div class="saved-stop-node" title="Route stop"></div>
                        </div>
                        <div class="saved-stop-card">
                            <div class="saved-stop-info">
                                <h4 class="saved-stop-name" title="${escapeHtml(s.placeName)}">${escapeHtml(s.placeName)}</h4>
                                <span class="saved-stop-subtitle">${escapeHtml(s.category || 'Establishment')}</span>
                            </div>
                            <div class="saved-stop-actions">
                                <a href="${sUrl}" class="saved-route-pill-btn" title="Plan route to ${escapeHtml(s.placeName)}">
                                    <span>Route</span>
                                    <svg class="calzada-route-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="18" x2="18" y2="6"></line><polyline points="9 6 18 6 18 15"></polyline></svg>
                                </a>
                                <button type="button" class="saved-remove-btn" data-placename="${escapeHtml(s.placeName)}" aria-label="Remove ${escapeHtml(s.placeName)} from saved spots" title="Remove Bookmark">
                                    <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;}).join('')}
            </div>
        </div>
    `;
}

function renderAchievementsList() {
    const container = document.getElementById('achievementsListContainer');
    if (!container) return;

    container.innerHTML = BADGE_DEFINITIONS.map(b => {
        const isUnlocked = currentBadges.some(cb => cb.id === b.id);
        return `
            <div class="achievement-card ${isUnlocked ? 'unlocked' : 'locked'}">
                <div class="achievement-icon-wrap ${isUnlocked ? 'unlocked' : 'locked'}">
                    ${b.icon}
                </div>
                <div class="achievement-info">
                    <h4 class="achievement-title">${escapeHtml(b.name)}</h4>
                    <p class="achievement-subtitle">${escapeHtml(b.description)}</p>
                </div>
                <div class="achievement-status-wrap">
                    <span class="achievement-status ${isUnlocked ? 'unlocked' : 'locked'}">
                        ${isUnlocked ? 'Unlocked' : 'In Progress'}
                    </span>
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
let pendingAvatarRemoved = false;
let initialLoadedDisplayName = '';
let initialHadCustomPhoto = false;
let isSavingSettings = false;
let isRemovingPhoto = false;
let passwordResetCooldownTimer = null;

function updateAvatarActionState() {
    const user = auth.currentUser || activeUser;
    const savedPhoto = localStorage.getItem('calzada_pref_photo') || user?.photoURL;
    const hasPhoto = Boolean(!pendingAvatarRemoved && (pendingAvatarDataUrl || savedPhoto));

    const sep = document.getElementById('settingsPhotoSep');
    const removeBtn = document.getElementById('btnRemovePhoto');
    const actionsRow = document.getElementById('settingsAvatarActions');
    const confirmRow = document.getElementById('settingsRemoveConfirm');

    if (confirmRow) confirmRow.style.display = 'none';
    if (actionsRow) actionsRow.style.display = 'flex';

    if (sep) sep.style.display = hasPhoto ? 'inline' : 'none';
    if (removeBtn) {
        removeBtn.style.display = hasPhoto ? 'inline' : 'none';
        removeBtn.disabled = false;
        removeBtn.textContent = 'Remove';
    }
}

function updateSaveButtonState() {
    const saveBtn = document.getElementById('btnSaveProfileSettings') || document.getElementById('btnSaveUserSettings');
    const nameInput = document.getElementById('prefDisplayNameInput');
    if (!saveBtn) return;
    if (isSavingSettings || isRemovingPhoto) return;

    const currentName = nameInput ? nameInput.value.trim() : '';
    const nameChanged = currentName !== initialLoadedDisplayName && currentName.length > 0;
    const avatarChanged = Boolean(pendingAvatarDataUrl) || (pendingAvatarRemoved && initialHadCustomPhoto);

    const hasChanges = nameChanged || avatarChanged;
    saveBtn.disabled = !hasChanges;
}

async function handleRemovePhoto() {
    if (isRemovingPhoto) return;
    isRemovingPhoto = true;

    const confirmRow = document.getElementById('settingsRemoveConfirm');
    const actionsRow = document.getElementById('settingsAvatarActions');
    const avatarImgEl = document.getElementById('settingsAvatarImg');
    const avatarLargeEl = document.getElementById('settingsAvatarLarge');
    const nameInput = document.getElementById('prefDisplayNameInput');
    const avatarErr = document.getElementById('settingsAvatarError');
    const fileInput = document.getElementById('settingsPhotoUploadInput') || document.getElementById('avatarFileInput');

    if (avatarErr) {
        avatarErr.style.display = 'none';
        avatarErr.textContent = '';
    }

    if (confirmRow) {
        confirmRow.innerHTML = '<span style="color:#64748B;">Removing...</span>';
    }

    const user = auth.currentUser || activeUser;
    const currentPhoto = pendingAvatarDataUrl || localStorage.getItem('calzada_pref_photo') || user?.photoURL;

    try {
        // 1. Delete photo from Node.js/Express local disk storage
        const token = user && typeof user.getIdToken === 'function' ? await user.getIdToken().catch(() => null) : null;
        await fetch('/api/user/photo', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': 'Bearer ' + token } : {})
            },
            body: JSON.stringify({
                photoUrl: currentPhoto,
                uid: user?.uid
            })
        }).catch(err => console.warn('Backend avatar delete warning:', err));

        // 2. Clear/null photoURL field on Firebase Auth profile & Firestore
        if (user && !user.isAnonymous) {
            try {
                if (typeof updateProfile === 'function') {
                    await updateProfile(user, { photoURL: '' });
                }
            } catch (authErr) {
                console.warn('updateProfile clear photo error:', authErr);
            }

            try {
                if (typeof setDoc === 'function' && typeof doc === 'function' && db) {
                    const prefDoc = doc(db, 'users/' + user.uid + '/preferences', 'commute');
                    await setDoc(prefDoc, {
                        photoURL: null,
                        updatedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : new Date()
                    }, { merge: true });
                }
            } catch (dbErr) {
                console.warn('Firestore clear photo error:', dbErr);
            }
        }

        // 3. Clear local storage & pending states
        localStorage.removeItem('calzada_pref_photo');
        pendingAvatarDataUrl = null;
        pendingAvatarRemoved = true;
        if (fileInput) fileInput.value = '';

        // 4. Revert avatar to default colored circle + initial letter
        const currentName = nameInput ? nameInput.value.trim() : '';
        const initial = (currentName || initialLoadedDisplayName || 'U').charAt(0).toUpperCase();

        if (avatarImgEl) {
            avatarImgEl.src = '';
            avatarImgEl.style.display = 'none';
        }
        if (avatarLargeEl) {
            avatarLargeEl.textContent = initial;
            avatarLargeEl.style.display = 'flex';
        }

        // Sync avatars across the UI
        const userAvatarImg = document.getElementById('userAvatarImg');
        const userAvatarInitials = document.getElementById('userAvatarInitials');
        const profileHeaderImg = document.getElementById('profileHeaderImg');
        const profileHeaderInitials = document.getElementById('profileHeaderInitials');
        const mobileAvatarImg = document.getElementById('mobileAvatarImg');
        const mobileAvatarInitials = document.getElementById('mobileAvatarInitials');

        if (userAvatarImg) userAvatarImg.style.display = 'none';
        if (userAvatarInitials) {
            userAvatarInitials.textContent = initial;
            userAvatarInitials.style.display = 'block';
        }
        if (profileHeaderImg) profileHeaderImg.style.display = 'none';
        if (profileHeaderInitials) {
            profileHeaderInitials.textContent = initial;
            profileHeaderInitials.style.display = 'block';
        }
        if (mobileAvatarImg) mobileAvatarImg.style.display = 'none';
        if (mobileAvatarInitials) {
            mobileAvatarInitials.textContent = initial;
            mobileAvatarInitials.style.display = 'block';
        }

        addActivity('save', 'Removed profile photo');

    } catch (err) {
        console.error('Failed to remove photo:', err);
        if (avatarErr) {
            avatarErr.textContent = 'Could not remove photo. Please try again.';
            avatarErr.style.display = 'block';
        }
    } finally {
        isRemovingPhoto = false;
        if (confirmRow) {
            confirmRow.innerHTML = '<span>Remove photo?</span><button type="button" class="settings-confirm-btn" id="btnConfirmRemoveYes">Yes</button><span class="settings-photo-sep">·</span><button type="button" class="settings-confirm-btn" id="btnConfirmRemoveCancel">Cancel</button>';
            confirmRow.style.display = 'none';
        }
        if (actionsRow) actionsRow.style.display = 'flex';

        updateAvatarActionState();
        updateSaveButtonState();
    }
}

export function renderSettingsModal() {
    const user = auth.currentUser || activeUser;
    const nameEl = document.getElementById('settingsDisplayName');
    const emailEl = document.getElementById('settingsEmail');
    const avatarLargeEl = document.getElementById('settingsAvatarLarge');
    const avatarImgEl = document.getElementById('settingsAvatarImg');
    const nameInput = document.getElementById('prefDisplayNameInput');
    const saveBtn = document.getElementById('btnSaveProfileSettings') || document.getElementById('btnSaveUserSettings');
    const fileInput = document.getElementById('settingsPhotoUploadInput') || document.getElementById('avatarFileInput');

    // Reset errors & pending state
    pendingAvatarDataUrl = null;
    pendingAvatarRemoved = false;
    isSavingSettings = false;
    isRemovingPhoto = false;
    if (fileInput) fileInput.value = '';

    const avatarErrorEl = document.getElementById('settingsAvatarError');
    const nameErrorEl = document.getElementById('settingsDisplayNameError');
    const resetErrorEl = document.getElementById('settingsResetError');
    const saveErrorEl = document.getElementById('settingsSaveError');
    const bannerEl = document.getElementById('settingsFeedbackBanner');

    if (avatarErrorEl) { avatarErrorEl.style.display = 'none'; avatarErrorEl.textContent = ''; }
    if (nameErrorEl) { nameErrorEl.style.display = 'none'; nameErrorEl.textContent = ''; }
    if (resetErrorEl) { resetErrorEl.style.display = 'none'; resetErrorEl.textContent = ''; }
    if (saveErrorEl) { saveErrorEl.style.display = 'none'; saveErrorEl.textContent = ''; }
    if (bannerEl) { bannerEl.style.display = 'none'; }

    // Retrieve saved custom display name and photo
    const savedName = localStorage.getItem('calzada_pref_name');
    const savedPhoto = localStorage.getItem('calzada_pref_photo') || user?.photoURL;

    initialHadCustomPhoto = Boolean(savedPhoto);

    const displayName = savedName || user?.displayName || (user?.email ? user.email.split('@')[0] : 'Commuter');
    const email = user?.email || (user?.isAnonymous ? 'guest@calzada.ph' : 'hermanjohnph@gmail.com');
    const initial = (displayName || 'U').charAt(0).toUpperCase();

    initialLoadedDisplayName = displayName;

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

    if (nameInput) {
        nameInput.value = displayName;
    }

    // Default Save Changes button to visually disabled/muted state on modal open
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = 'Save Changes';
    }

    // Update avatar action links (Change photo · Remove)
    updateAvatarActionState();

    // Wire Display Name input listener once
    if (nameInput && !nameInput._wired) {
        nameInput._wired = true;
        nameInput.addEventListener('input', () => {
            if (nameErrorEl) {
                nameErrorEl.style.display = 'none';
                nameErrorEl.textContent = '';
            }
            if (saveErrorEl) {
                saveErrorEl.style.display = 'none';
                saveErrorEl.textContent = '';
            }
            updateSaveButtonState();
        });
    }

    // Wire file input listener once
    if (fileInput && !fileInput._wired) {
        fileInput._wired = true;
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            const avatarErr = document.getElementById('settingsAvatarError');
            if (avatarErr) {
                avatarErr.style.display = 'none';
                avatarErr.textContent = '';
            }

            if (!file) {
                pendingAvatarDataUrl = null;
                updateAvatarActionState();
                updateSaveButtonState();
                return;
            }

            // Client-side validation: JPG and PNG only
            const validMimeTypes = ['image/jpeg', 'image/png', 'image/jpg'];
            const fileName = (file.name || '').toLowerCase();
            const hasValidExt = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png');

            if (!validMimeTypes.includes(file.type) && !hasValidExt) {
                if (avatarErr) {
                    avatarErr.textContent = 'Please select a JPG or PNG image.';
                    avatarErr.style.display = 'block';
                }
                fileInput.value = '';
                pendingAvatarDataUrl = null;
                updateAvatarActionState();
                updateSaveButtonState();
                return;
            }

            // Client-side validation: Max 2MB
            if (file.size > 2 * 1024 * 1024) {
                if (avatarErr) {
                    avatarErr.textContent = 'Image size must be 2MB or less.';
                    avatarErr.style.display = 'block';
                }
                fileInput.value = '';
                pendingAvatarDataUrl = null;
                updateAvatarActionState();
                updateSaveButtonState();
                return;
            }

            const reader = new FileReader();
            reader.onload = (event) => {
                pendingAvatarDataUrl = event.target.result;
                pendingAvatarRemoved = false;
                if (avatarImgEl && avatarLargeEl) {
                    avatarImgEl.src = pendingAvatarDataUrl;
                    avatarImgEl.style.display = 'block';
                    avatarLargeEl.style.display = 'none';
                }
                updateAvatarActionState();
                updateSaveButtonState();
            };
            reader.readAsDataURL(file);
        });
    }
}

async function handlePasswordReset() {
    const btn = document.getElementById('btnSendPasswordReset') || document.getElementById('btnChangePassword');
    const errorEl = document.getElementById('settingsResetError');
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }

    if (!btn || btn.disabled) return;

    const user = auth.currentUser || activeUser;
    const email = user?.email || localStorage.getItem('calzada_user_email');

    if (!email || user?.isAnonymous) {
        if (errorEl) {
            errorEl.textContent = 'Please sign in with a registered email account to reset password.';
            errorEl.style.display = 'block';
        }
        return;
    }

    const defaultLabel = 'Send Password Reset Email';
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        await sendPasswordResetEmail(auth, email);
        btn.textContent = 'Email sent — check your inbox';
        btn.disabled = true;

        if (passwordResetCooldownTimer) clearTimeout(passwordResetCooldownTimer);
        passwordResetCooldownTimer = setTimeout(() => {
            const currentBtn = document.getElementById('btnSendPasswordReset') || document.getElementById('btnChangePassword');
            if (currentBtn) {
                currentBtn.disabled = false;
                currentBtn.textContent = defaultLabel;
            }
        }, 30000);
    } catch (err) {
        console.warn('Password reset error:', err);
        btn.disabled = false;
        btn.textContent = defaultLabel;
        if (errorEl) {
            errorEl.textContent = err.message || 'Could not send reset email. Please try again.';
            errorEl.style.display = 'block';
        }
    }
}

async function saveUserSettings() {
    const saveBtn = document.getElementById('btnSaveProfileSettings') || document.getElementById('btnSaveUserSettings');
    const nameInput = document.getElementById('prefDisplayNameInput');
    const nameErrorEl = document.getElementById('settingsDisplayNameError');
    const saveErrorEl = document.getElementById('settingsSaveError');

    if (isSavingSettings || isRemovingPhoto) return;
    if (saveBtn && saveBtn.disabled) return;

    if (nameErrorEl) { nameErrorEl.style.display = 'none'; nameErrorEl.textContent = ''; }
    if (saveErrorEl) { saveErrorEl.style.display = 'none'; saveErrorEl.textContent = ''; }

    const newName = nameInput ? nameInput.value.trim() : '';

    if (!newName && !pendingAvatarDataUrl && !pendingAvatarRemoved) {
        if (nameErrorEl) {
            nameErrorEl.textContent = 'Display name cannot be empty.';
            nameErrorEl.style.display = 'block';
        }
        return;
    }

    isSavingSettings = true;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="settings-btn-spinner" aria-hidden="true"></span><span>Saving...</span>';
    }

    try {
        const user = auth.currentUser || activeUser;
        const promises = [];

        if (newName) {
            localStorage.setItem('calzada_pref_name', newName);
            const navDisplayName = document.getElementById('userDisplayName');
            const profileDisplayName = document.getElementById('profileDisplayName');
            const settingsDisplayName = document.getElementById('settingsDisplayName');
            if (navDisplayName) navDisplayName.textContent = newName;
            if (profileDisplayName) profileDisplayName.textContent = newName;
            if (settingsDisplayName) settingsDisplayName.textContent = newName;
        }

        if (pendingAvatarRemoved) {
            localStorage.removeItem('calzada_pref_photo');
        } else if (pendingAvatarDataUrl) {
            localStorage.setItem('calzada_pref_photo', pendingAvatarDataUrl);
            const userAvatarImg = document.getElementById('userAvatarImg');
            const userAvatarInitials = document.getElementById('userAvatarInitials');
            const profileHeaderImg = document.getElementById('profileHeaderImg');
            const profileHeaderInitials = document.getElementById('profileHeaderInitials');
            const mobileAvatarImg = document.getElementById('mobileAvatarImg');
            const mobileAvatarInitials = document.getElementById('mobileAvatarInitials');

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
            if (mobileAvatarImg) {
                mobileAvatarImg.src = pendingAvatarDataUrl;
                mobileAvatarImg.style.display = 'block';
            }
            if (mobileAvatarInitials) mobileAvatarInitials.style.display = 'none';
        }

        if (user && !user.isAnonymous) {
            const updates = {};
            if (newName) updates.displayName = newName;
            if (pendingAvatarRemoved) {
                updates.photoURL = '';
            } else if (pendingAvatarDataUrl) {
                updates.photoURL = pendingAvatarDataUrl;
            }

            if (Object.keys(updates).length > 0 && typeof updateProfile === 'function') {
                promises.push(updateProfile(user, updates));
            }
            if (typeof setDoc === 'function' && typeof doc === 'function' && db) {
                promises.push(setDoc(doc(db, 'users/' + user.uid + '/preferences', 'commute'), {
                    displayName: newName || user.displayName || '',
                    photoURL: pendingAvatarRemoved ? null : (pendingAvatarDataUrl || user.photoURL || ''),
                    updatedAt: typeof serverTimestamp === 'function' ? serverTimestamp() : new Date()
                }, { merge: true }));
            }
        }

        if (promises.length > 0) {
            await Promise.all(promises);
        }

        addActivity('save', 'Updated account preferences');

        // Success state: checkmark + "Saved" (~1.5s)
        if (saveBtn) {
            saveBtn.innerHTML = '<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="flex-shrink:0"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg><span>Saved</span>';
        }

        initialLoadedDisplayName = newName || initialLoadedDisplayName;
        initialHadCustomPhoto = !pendingAvatarRemoved && Boolean(pendingAvatarDataUrl || localStorage.getItem('calzada_pref_photo'));
        pendingAvatarDataUrl = null;
        pendingAvatarRemoved = false;
        const fileInput = document.getElementById('settingsPhotoUploadInput') || document.getElementById('avatarFileInput');
        if (fileInput) fileInput.value = '';

        setTimeout(() => {
            closeModal('modalAccountSettings');
            isSavingSettings = false;
            if (saveBtn) {
                saveBtn.innerHTML = 'Save Changes';
                saveBtn.disabled = true;
            }
        }, 1500);

    } catch (err) {
        console.error('Save user settings error:', err);
        isSavingSettings = false;
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Save Changes';
        }
        if (saveErrorEl) {
            saveErrorEl.textContent = err.message || 'Failed to save changes. Please try again.';
            saveErrorEl.style.display = 'block';
        }
    }
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
                        <div class="modal-header-icon-box">
                            <svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        </div>
                        <h3 class="modal-header-heading">My Establishment Visits</h3>
                    </div>
                    <button class="modal-close-btn" type="button" aria-label="Close modal">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <p class="modal-subtitle">Places you have searched, navigated to, and visited in Calamba City.</p>
                    <div class="visits-list-wrap" id="visitsListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: Saved Places -->
        <div class="profile-modal-overlay" id="modalSavedPlaces">
            <div class="profile-modal-box saved-places-modal-box">
                <div class="profile-modal-header saved-modal-header">
                    <div class="modal-header-title saved-header-title">
                        <div class="modal-header-icon-box saved-header-icon-box">
                            <svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                        </div>
                        <h3 class="modal-header-heading saved-modal-heading">Saved Establishments</h3>
                    </div>
                    <button class="modal-close-btn" type="button" aria-label="Close modal">&times;</button>
                </div>
                <div class="profile-modal-body saved-modal-body">
                    <p class="modal-subtitle saved-modal-subtitle">Your bookmarked spots for quick commute planning and discovery across Calamba.</p>
                    <div class="saved-list-wrap" id="savedListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: My Achievements -->
        <div class="profile-modal-overlay" id="modalMyAchievements">
            <div class="profile-modal-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <div class="modal-header-icon-box">
                            <svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1c0 .55.45 1 1 1h8c.55 0 1-.45 1-1v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>
                        </div>
                        <h3 class="modal-header-heading">Exploration Achievements</h3>
                    </div>
                    <button class="modal-close-btn" type="button" aria-label="Close modal">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <p class="modal-subtitle">Milestones earned by discovering local spots, eateries, schools, and landmarks.</p>
                    <div class="achievements-list-wrap" id="achievementsListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: Account Settings -->
        <div class="profile-modal-overlay" id="modalAccountSettings">
            <div class="profile-modal-box settings-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <h3 class="modal-header-heading">Account Settings</h3>
                    </div>
                    <button class="modal-close-btn" type="button" aria-label="Close modal">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <!-- User Identity & Photo Control -->
                    <div class="settings-profile-preview">
                        <div class="settings-avatar-col">
                            <div class="settings-avatar-wrapper">
                                <div class="settings-avatar-large" id="settingsAvatarLarge">U</div>
                                <img src="" alt="Profile Photo" id="settingsAvatarImg" class="settings-avatar-img" style="display: none;" />
                                <label for="settingsPhotoUploadInput" class="settings-camera-badge" title="Change profile photo" aria-label="Change profile photo">
                                    <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                </label>
                            </div>
                            <div class="settings-avatar-actions" id="settingsAvatarActions">
                                <label for="settingsPhotoUploadInput" class="settings-change-photo-btn" id="lblChangePhoto">Change photo</label>
                                <span class="settings-photo-sep" id="settingsPhotoSep" style="display: none;">·</span>
                                <button type="button" class="settings-remove-photo-btn" id="btnRemovePhoto" style="display: none;">Remove</button>
                            </div>
                            <div class="settings-remove-confirm" id="settingsRemoveConfirm" style="display: none;">
                                <span>Remove photo?</span>
                                <button type="button" class="settings-confirm-btn" id="btnConfirmRemoveYes">Yes</button>
                                <span class="settings-photo-sep">·</span>
                                <button type="button" class="settings-confirm-btn" id="btnConfirmRemoveCancel">Cancel</button>
                            </div>
                            <input type="file" id="settingsPhotoUploadInput" accept="image/jpeg,image/png,image/jpg" style="display: none;" />
                        </div>
                        <div class="settings-user-meta">
                            <h4 id="settingsDisplayName" class="settings-name-text">Commuter</h4>
                            <p id="settingsEmail" class="settings-email-text">user@example.com</p>
                        </div>
                    </div>
                    <div id="settingsAvatarError" class="settings-inline-error" style="display: none;"></div>

                    <!-- Profile Edit Form -->
                    <form id="settingsProfileForm" class="settings-form" novalidate>
                        <div class="settings-form-group">
                            <label for="prefDisplayNameInput" class="settings-label">Display Name</label>
                            <input type="text" id="prefDisplayNameInput" class="settings-input" placeholder="Your name or commuter handle" maxlength="40" autocomplete="off" />
                            <div id="settingsDisplayNameError" class="settings-inline-error" style="display: none;"></div>
                        </div>

                        <div class="settings-form-group settings-security-group">
                            <label class="settings-label">Account Security</label>
                            <div class="settings-reset-wrapper">
                                <button type="button" class="settings-text-link" id="btnSendPasswordReset">Send Password Reset Email</button>
                                <div id="settingsResetError" class="settings-inline-error" style="display: none;"></div>
                            </div>
                        </div>

                        <div class="settings-actions">
                            <div id="settingsSaveError" class="settings-inline-error" style="display: none; margin: 0; margin-right: auto;"></div>
                            <button type="submit" class="settings-save-btn" id="btnSaveProfileSettings" disabled>Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modalRoot);
}

// Expose helpers on window
window.toggleSavePlace = toggleSavePlace;
window.recordVisit = recordVisit;

// Auto-initialize setupProfileUI when user-stats.js is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setupProfileUI());
} else {
    setupProfileUI();
}

