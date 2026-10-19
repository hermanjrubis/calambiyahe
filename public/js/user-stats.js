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
    updateDoc,
    query, 
    where,
    orderBy, 
    limit,
    startAfter,
    serverTimestamp,
    Timestamp,
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
    visit:  `<svg width="15" height="15" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" /></svg>`,
    save:   `<svg width="15" height="15" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z" /></svg>`,
    unsave: `<svg width="15" height="15" fill="none" stroke="#94A3B8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 6l-12 12" /><path d="M6 6l12 12" /></svg>`,
    badge:  `<svg width="15" height="15" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 9m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0" /><path d="M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889" /><path d="M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889" /></svg>`,
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

// Header avatars: the initial on the brand fill by default. The photo replaces it only once it has
// actually loaded (real pixels), so a missing, broken or empty photo never leaves a blank or black circle.
function showAvatar(imgEl, initialsEl, photo, initial) {
    if (initialsEl) {
        initialsEl.textContent = initial || 'U';
        initialsEl.style.display = 'block';
    }
    if (!imgEl) return;
    imgEl.onload = null;
    imgEl.onerror = null;
    imgEl.style.display = 'none';
    if (!photo) { imgEl.removeAttribute('src'); return; }
    const reveal = () => {
        if (imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0) {
            imgEl.style.display = 'block';
            if (initialsEl) initialsEl.style.display = 'none';
        }
    };
    imgEl.onload = reveal;
    imgEl.onerror = () => {
        imgEl.style.display = 'none';
        if (initialsEl) initialsEl.style.display = 'block';
    };
    imgEl.src = photo;
    if (imgEl.complete) reveal();
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
        mobileBadge.textContent = ''; // 8px dot: no number inside
        mobileBadge.style.display = 'block';
    }
}

function renderActivityFeed() {
    const list = document.getElementById('activityFeedList');
    if (!list) return;

    const user = auth.currentUser;

    if (!user) {
        list.innerHTML = `<div class="activity-empty-state">
            <svg width="28" height="28" fill="none" stroke="#CBD5E1" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
            <p>No activity yet.<br><a href="/login" style="color: #378ADD; font-weight: 600; text-decoration: underline;">Sign in</a> to see your activity updates.</p>
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
    const signedOutUid = activeUser && activeUser.uid;
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
        // Saved-journey guard list of the account that signed out
        if (signedOutUid) localStorage.removeItem(`calzada_trips_saved_${signedOutUid}`);
        
        // Remove any orphan user-scoped keys
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('calzada_activity_feed_') || k.startsWith('calzada_visits_') || k.startsWith('calzada_saved_') || k.startsWith('calzada_trips_saved_')) {
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
        userAvatarImg.removeAttribute('src');
        userAvatarImg.style.display = 'none';
    }
    if (mobileAvatarInitials) {
        mobileAvatarInitials.textContent = '';
        mobileAvatarInitials.style.display = 'none';
    }
    if (mobileAvatarImg) {
        mobileAvatarImg.removeAttribute('src');
        mobileAvatarImg.style.display = 'none';
    }

    if (profileDisplayName) profileDisplayName.textContent = '';
    if (profileEmail) profileEmail.textContent = '';
    if (profileHeaderInitials) {
        profileHeaderInitials.textContent = '';
        profileHeaderInitials.style.display = 'none';
    }
    if (profileHeaderImg) {
        profileHeaderImg.removeAttribute('src');
        profileHeaderImg.style.display = 'none';
    }

    if (userBadgeCounter) {
        userBadgeCounter.textContent = '0';
        userBadgeCounter.style.display = 'none';
    }
    if (statVisitsCount) statVisitsCount.textContent = '0';
    if (statSavesCount) statSavesCount.textContent = '0';
    if (statBadgesCount) statBadgesCount.textContent = '0';
    if (menuSavedCount) {
        menuSavedCount.textContent = '0';
        menuSavedCount.style.display = 'none';
    }

    if (dropdownMenu) dropdownMenu.classList.remove('open');
    if (alertsMenu) alertsMenu.classList.remove('open');

    // 4. Re-render empty lists in modals so stale places/visits/badges are wiped
    renderSavedList();
    renderVisitsList();
    renderAchievementsList();

    // 5. Close any open modal overlays (and forget the signed-out user's trips)
    document.querySelectorAll('.profile-modal-overlay.active').forEach(m => m.classList.remove('active'));
    resetTrips();

    // 6. Ensure Admin link is removed
    renderAdminMenuLink(false);

    // 7. Reset Business menu link to default registration link
    let myBusinessBtn = document.getElementById('menuMyBusiness');
    if (!myBusinessBtn) {
        syncBusinessMenuLink(null);
    } else {
        myBusinessBtn.href = '/submit';
        const titleEl = myBusinessBtn.querySelector('.nav-btn-title');
        if (titleEl) {
            titleEl.setAttribute('data-i18n', 'nav.user.register_business');
            titleEl.textContent = (window.t ? window.t('nav.user.register_business') : 'Register your business');
        }
    }
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

    // Store newly unlocked badges now rather than on the next page load
    if (user && !user.isAnonymous) {
        currentBadges.filter(b => !prevBadgeIds.includes(b.id)).forEach(b => {
            setDoc(doc(db, `users/${user.uid}/badges`, b.id), {
                badgeName: b.name,
                unlockedAt: serverTimestamp()
            }, { merge: true }).catch(() => {});
        });
    }

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

// ─────────────────────────────────────────────────────────────────────────────
// TRIPS: users/{uid}/trips/{journeyId}
// One document per finished journey, written on arrival by signed-in (non-anonymous)
// accounts only. Guests and anonymous users get nothing stored, in Firestore or locally.
// My Trips follows the My Visits pattern: a profile modal built in createProfileModals().
// The confirm dialog and the shared formatters come from js/trip-ticket.js (loaded on demand).
// ─────────────────────────────────────────────────────────────────────────────
const TRIP_TICKET_SRC = '/js/trip-ticket.js?v=1.1.3';
const TRIPS_PAGE_SIZE = 20;
const SAVED_JOURNEYS_KEEP = 50; // journey ids remembered per account
const savedJourneysMemory = new Set();
let trips = {
    uid: null,       // whose trips are loaded
    items: [],       // newest first
    cursor: null,    // last document snapshot, for "Load more"
    hasMore: false,
    loaded: false,
    loading: false,
    error: false
};
const resetTrips = (uid = null) => {
    trips = { uid, items: [], cursor: null, hasMore: false, loaded: false, loading: false, error: false };
};

const canSaveTrips = () => {
    const user = auth.currentUser;
    return !!(user && !user.isAnonymous);
};

// Remember which journeys were saved (signed-in accounts only, latest 50, removed on sign-out)
// so a reload or a second arrival trigger neither writes the trip again nor logs a second visit. The document id is
// the journeyId and the rules forbid updates, so the server refuses a repeat write as well.
function claimJourney(uid, journeyId) {
    const key = `calzada_trips_saved_${uid}`;
    if (savedJourneysMemory.has(`${uid}/${journeyId}`)) return false;
    try {
        const list = JSON.parse(localStorage.getItem(key) || '[]');
        if (list.includes(journeyId)) return false;
        list.push(journeyId);
        localStorage.setItem(key, JSON.stringify(list.slice(-SAVED_JOURNEYS_KEEP)));
    } catch (_) { /* storage unavailable: the in-memory set still guards this page */ }
    savedJourneysMemory.add(`${uid}/${journeyId}`);
    return true;
}

/**
 * Save a finished trip (the values the ticket shows) and record the visit, once per journey.
 * Never awaited by the planner, so the ticket is not delayed: offline, the SDK queues the
 * write and sends it when the connection returns; a refused write only logs a warning.
 * @param trip  ticket trip: { destName, originLabel, startedAt, arrivedAt, durationMin, estimatedMin, distanceKm, fare, mode, legs }
 * @param journeyId  20-character id created at START JOURNEY; also the document id
 * @param dest  { lat, lng, category|null }
 */
export function saveTrip(trip, journeyId, dest = {}) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous || !trip) return false;
    if (typeof journeyId !== 'string' || !/^[A-Za-z0-9]{20}$/.test(journeyId)) return false;
    if (!claimJourney(user.uid, journeyId)) return false;

    const category = dest.category ? String(dest.category).slice(0, 40) : null;
    const data = {
        destName: String(trip.destName || '').slice(0, 120),
        destLat: Number(dest.lat),
        destLng: Number(dest.lng),
        destCategory: category,
        originLabel: String(trip.originLabel || 'My Location').slice(0, 120),
        mode: trip.mode === 'jeepney' ? 'jeepney' : 'walk',
        legs: (trip.legs || []).slice(0, 10).map(l => ({
            type: l.type === 'jeepney' ? 'jeepney' : 'walk',
            minutes: Number(l.durationMin) || 0,
            km: Number(l.distanceKm) || 0,
            fare: Number(l.fare) || 0
        })),
        startedAt: trip.startedAt != null ? new Date(trip.startedAt) : null,
        arrivedAt: new Date(trip.arrivedAt),
        actualMinutes: trip.durationMin != null ? trip.durationMin : null,
        estimatedMinutes: Number(trip.estimatedMin) || 0,
        distanceKm: Number(trip.distanceKm) || 0,
        fare: Number(trip.fare) || 0,
        createdAt: serverTimestamp()
    };

    setDoc(doc(db, `users/${user.uid}/trips`, journeyId), data)
        .catch((e) => console.warn('Trip not saved to your account:', (e && e.code) || e));
    // The list is stale now; reload it next time My Trips opens
    if (trips.uid === user.uid) resetTrips(user.uid);

    recordVisit(data.destName, category || undefined);
    return true;
}

const tsToMs = (ts) => {
    if (!ts) return null;
    if (typeof ts.toMillis === 'function') return ts.toMillis();
    if (ts instanceof Date) return ts.getTime();
    return null;
};

// Next page of trips, newest first. Fetches one extra to know whether there is more.
async function loadTripsPage() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous || trips.loading) return;
    if (trips.uid !== user.uid) resetTrips(user.uid);
    trips.loading = true;
    trips.error = false;
    try {
        const parts = [collection(db, `users/${user.uid}/trips`), orderBy('arrivedAt', 'desc')];
        if (trips.cursor) parts.push(startAfter(trips.cursor));
        parts.push(limit(TRIPS_PAGE_SIZE + 1));
        const snap = await getDocs(query(...parts));
        const docs = snap.docs.slice(0, TRIPS_PAGE_SIZE);
        trips.items.push(...docs.map(d => {
            const data = d.data();
            return { ...data, id: d.id, startedAt: tsToMs(data.startedAt), arrivedAt: tsToMs(data.arrivedAt) || Date.now() };
        }));
        trips.cursor = docs.length ? docs[docs.length - 1] : trips.cursor;
        trips.hasMore = snap.docs.length > TRIPS_PAGE_SIZE;
        trips.loaded = true;
    } catch (e) {
        console.warn('Trips could not be loaded:', (e && e.code) || e);
        trips.error = true;
    } finally {
        trips.loading = false;
    }
}

let ticketLibPromise = null;
function loadTicketLib() {
    if (window.CalzadaTicket) return window.CalzadaTicket.ensureStyles().then(() => window.CalzadaTicket);
    if (!ticketLibPromise) {
        ticketLibPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = TRIP_TICKET_SRC;
            s.onload = () => window.CalzadaTicket
                ? window.CalzadaTicket.ensureStyles().then(() => resolve(window.CalzadaTicket))
                : reject(new Error('trip-ticket missing'));
            s.onerror = () => { ticketLibPromise = null; reject(new Error('trip-ticket failed to load')); };
            document.head.appendChild(s);
        });
    }
    return ticketLibPromise;
}

const TRIPS_EN = {
    'trips.title': 'My Trips',
    'trips.subtitle': 'Journeys you finished with the planner, newest first.',
    'trips.loading': 'Loading your trips...',
    'trips.load_more': 'Load more',
    'trips.load_failed': "Couldn't load your trips. Try again.",
    'trips.empty_title': 'No trips yet',
    'trips.empty_desc': 'Finished journeys will show up here.',
    'trips.signed_out_title': 'Sign in to see your trips',
    'trips.signed_out_desc': 'Trips you finish while signed in are kept in your account.',
    'trips.sign_in': 'Sign in',
    'trips.mode_walk': 'Walk',
    'trips.mode_jeepney': 'Jeepney',
    'trips.delete_label': 'Delete trip to {dest}',
    'trips.delete_confirm_title': 'Delete this trip?',
    'trips.delete_confirm_msg': 'Your visit and badges from this trip stay.',
    'trips.delete': 'Delete',
    'trips.cancel': 'Cancel',
    'trips.delete_failed': "Couldn't delete the trip. Try again.",
    'trips.close': 'Close',
    'ticket.est': 'Est. {min}',
    'planner.free': 'Free'
};
const ttr = (key, params) => {
    let s = window.t ? window.t(key, params) : null;
    if (!s || s === key) {
        s = TRIPS_EN[key] || key;
        if (params) Object.entries(params).forEach(([k, v]) => { s = s.split(`{${k}}`).join(v); });
    }
    return s;
};

const ICON_TRIPS_ROUTE = '<svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" /><path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z" /><path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5" /></svg>';
// Tabler walk / bus / trash (outline, stroke 2)
const ICON_TRIP_WALK = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M7 21l3 -4" /><path d="M16 21l-2 -4l-3 -3l1 -6" /><path d="M6 12l2 -3l4 -1l3 3l3 1" /></svg>';
const ICON_TRIP_JEEP = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M18 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 7 0 0 1 5 7v5h-2m-4 0h-8" /><path d="M16 5l1.5 7l4.5 0" /><path d="M2 10l15 0" /><path d="M7 5l0 5" /><path d="M12 5l0 5" /></svg>';
const ICON_TRIP_TRASH = '<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7l16 0" /><path d="M10 11l0 6" /><path d="M14 11l0 6" /><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" /><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" /></svg>';

// Same formatting as the ticket (js/trip-ticket.js), with fallbacks if it has not loaded
const tripFmt = () => (window.CalzadaTicket && window.CalzadaTicket.format) || {
    minutes: (m) => `${Math.max(1, Math.round(m))} min`,
    time: (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; },
    km: (km) => (km < 1 ? `${Math.round(km * 100) * 10} m` : `${Number(km).toFixed(1)} km`),
    fare: (mode, fare) => {
        if (!(mode === 'jeepney' && fare > 0)) return ttr('planner.free');
        const value = Math.round(Number(fare) * 100) / 100;
        return Number.isInteger(value) ? `₱${value}` : `₱${value.toFixed(2)}`;
    }
};

function renderTripsModalText() {
    const modal = document.getElementById('modalMyTrips');
    if (!modal) return;
    modal.querySelector('.modal-header-heading').textContent = ttr('trips.title');
    modal.querySelector('.modal-subtitle').textContent = ttr('trips.subtitle');
    modal.querySelector('.modal-close-btn').setAttribute('aria-label', ttr('trips.close'));
}

function renderTripsList() {
    const container = document.getElementById('tripsListContainer');
    if (!container) return;
    renderTripsModalText();

    const emptyState = (title, desc, action = '') => `
        <div class="saved-empty-state">
            <div class="saved-empty-icon-box">${ICON_TRIPS_ROUTE.replace('width="22" height="22"', 'width="34" height="34"')}</div>
            <h4 class="saved-empty-title">${escapeHtml(title)}</h4>
            <p class="saved-empty-desc">${escapeHtml(desc)}</p>
            ${action}
        </div>`;

    if (!canSaveTrips()) {
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        container.innerHTML = emptyState(ttr('trips.signed_out_title'), ttr('trips.signed_out_desc'),
            `<a href="/login?redirect=${back}" class="saved-empty-explore-btn"><span>${escapeHtml(ttr('trips.sign_in'))}</span></a>`);
        return;
    }
    if (!trips.loaded) {
        container.innerHTML = trips.error
            ? `<p class="trips-status" role="alert">${escapeHtml(ttr('trips.load_failed'))}</p>`
            : `<p class="trips-status" aria-busy="true">${escapeHtml(ttr('trips.loading'))}</p>`;
        return;
    }
    if (!trips.items.length) {
        container.innerHTML = emptyState(ttr('trips.empty_title'), ttr('trips.empty_desc'));
        return;
    }

    const fmt = tripFmt();
    const locale = localStorage.getItem('calzada_lang') === 'tl' ? 'fil-PH' : 'en-US';
    const thisYear = new Date().getFullYear();
    const rows = trips.items.map(trip => {
        const arrived = new Date(trip.arrivedAt);
        const dateOpts = { weekday: 'short', month: 'short', day: 'numeric' };
        if (arrived.getFullYear() !== thisYear) dateOpts.year = 'numeric';
        const when = `${arrived.toLocaleDateString(locale, dateOpts)} · ${fmt.time(trip.arrivedAt)}`;
        const duration = trip.actualMinutes != null
            ? fmt.minutes(trip.actualMinutes)
            : ttr('ticket.est', { min: fmt.minutes(trip.estimatedMinutes || 1) });
        const isJeep = trip.mode === 'jeepney';
        const dest = trip.destName || '';
        return `
            <div class="visit-item-card trip-item" data-trip-id="${escapeHtml(trip.id)}">
                <span class="trip-item-mode" title="${escapeHtml(ttr(isJeep ? 'trips.mode_jeepney' : 'trips.mode_walk'))}">${isJeep ? ICON_TRIP_JEEP : ICON_TRIP_WALK}</span>
                <div class="visit-item-info">
                    <h4 class="visit-item-name" title="${escapeHtml(dest)}">${escapeHtml(dest)}</h4>
                    <span class="visit-item-subtitle">${escapeHtml(when)}</span>
                    <span class="visit-item-subtitle">${escapeHtml(duration)} · ${escapeHtml(fmt.km(trip.distanceKm))} · <span class="trip-item-fare">${escapeHtml(fmt.fare(trip.mode, trip.fare))}</span></span>
                </div>
                <button type="button" class="trip-item-delete" data-trip-del="${escapeHtml(trip.id)}"
                    aria-label="${escapeHtml(ttr('trips.delete_label', { dest }))}">${ICON_TRIP_TRASH}</button>
            </div>`;
    }).join('');

    const more = trips.hasMore
        ? `<button type="button" class="trips-load-more" id="tripsLoadMore" ${trips.loading ? 'disabled' : ''}>${escapeHtml(ttr(trips.loading ? 'trips.loading' : 'trips.load_more'))}</button>`
        : '';
    const err = trips.error ? `<p class="trips-status" role="alert">${escapeHtml(ttr('trips.load_failed'))}</p>` : '';
    container.innerHTML = rows + more + err;
}

async function deleteTripFromList(tripId, btn) {
    const user = auth.currentUser;
    const trip = trips.items.find(t => t.id === tripId);
    if (!user || user.isAnonymous || !trip) return;
    const T = await loadTicketLib();
    const ok = await T.confirm({
        title: ttr('trips.delete_confirm_title'),
        message: ttr('trips.delete_confirm_msg'),
        confirmLabel: ttr('trips.delete'),
        cancelLabel: ttr('trips.cancel')
    });
    if (!ok) return;
    if (btn) btn.disabled = true;
    try {
        // Only the trip document: the visit and badges it earned stay.
        await deleteDoc(doc(db, `users/${user.uid}/trips`, tripId));
        trips.items = trips.items.filter(t => t.id !== tripId);
        renderTripsList();
    } catch (e) {
        console.warn('Trip delete failed:', (e && e.code) || e);
        if (btn) btn.disabled = false;
        T.notify(ttr('trips.delete_failed'));
    }
}

export async function openTripsModal() {
    // Confirm dialog + styles (also the planner fallback for this modal)
    try { await loadTicketLib(); } catch (e) { console.warn(e); }
    openModal('modalMyTrips');
    const user = auth.currentUser;
    if (user && !user.isAnonymous && trips.uid !== user.uid) resetTrips(user.uid);
    renderTripsList();
    requestAnimationFrame(() => document.querySelector('#modalMyTrips .modal-close-btn')?.focus({ preventScroll: true }));
    if (canSaveTrips() && !trips.loaded) {
        await loadTripsPage();
        renderTripsList();
    }
}

// Load more / delete inside the My Trips modal
document.addEventListener('click', async (e) => {
    const moreBtn = e.target.closest('#tripsLoadMore');
    if (moreBtn) {
        e.preventDefault();
        const p = loadTripsPage();
        renderTripsList();
        await p;
        renderTripsList();
        return;
    }
    const delBtn = e.target.closest('#modalMyTrips .trip-item-delete');
    if (delBtn) {
        e.preventDefault();
        deleteTripFromList(delBtn.dataset.tripDel, delBtn);
    }
});

window.addEventListener('calzada_lang_changed', () => {
    const modal = document.getElementById('modalMyTrips');
    if (modal && modal.classList.contains('active')) renderTripsList();
});

window.CalzadaTrips = { canSave: canSaveTrips, saveTrip, open: openTripsModal };

// ─────────────────────────────────────────────────────────────────────────────
// TRAVEL REMINDERS: users/{uid}/reminders/{reminderId}
// ─────────────────────────────────────────────────────────────────────────────
let remindersState = {
    uid: null,
    items: [],
    loaded: false,
    loading: false,
    error: false
};
const resetReminders = (uid = null) => {
    remindersState = { uid, items: [], loaded: false, loading: false, error: false };
};

const ICON_REMINDER_BELL = '<svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6" /><path d="M9 17v1a3 3 0 0 0 6 0v-1" /></svg>';

function renderRemindersModalText() {
    const modal = document.getElementById('modalMyReminders');
    if (!modal) return;
    modal.querySelector('.modal-header-heading').textContent = ttr('reminders.my_title');
    modal.querySelector('.modal-subtitle').textContent = ttr('reminders.my_subtitle');
    modal.querySelector('.modal-close-btn').setAttribute('aria-label', ttr('trips.close'));
}

async function loadReminders() {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        resetReminders();
        return;
    }
    remindersState.loading = true;
    remindersState.error = false;
    remindersState.uid = user.uid;

    try {
        const q = query(
            collection(db, `users/${user.uid}/reminders`),
            orderBy('createdAt', 'desc')
        );
        const snap = await getDocs(q);
        const now = Date.now();
        const cutoff24h = now - 24 * 60 * 60 * 1000;

        remindersState.items = snap.docs.map(d => {
            const data = d.data();
            return {
                id: d.id,
                ...data,
                leaveAtMs: tsToMs(data.leaveAt),
                remindAtMs: tsToMs(data.remindAt),
                createdAtMs: tsToMs(data.createdAt)
            };
        }).filter(item => {
            // Past ones hidden after 24h:
            if (item.leaveAtMs && item.leaveAtMs < cutoff24h) {
                return false;
            }
            return true;
        });

        remindersState.loaded = true;
    } catch (e) {
        console.warn('Failed to load reminders:', e);
        remindersState.error = true;
    } finally {
        remindersState.loading = false;
    }
}

export function renderRemindersList() {
    const container = document.getElementById('remindersListContainer');
    if (!container) return;
    renderRemindersModalText();

    const emptyState = (title, desc, action = '') => `
        <div class="saved-empty-state">
            <div class="saved-empty-icon-box">${ICON_REMINDER_BELL.replace('width="22" height="22"', 'width="34" height="34"')}</div>
            <h4 class="saved-empty-title">${escapeHtml(title)}</h4>
            <p class="saved-empty-desc">${escapeHtml(desc)}</p>
            ${action}
        </div>`;

    if (!canSaveTrips()) {
        const back = encodeURIComponent(window.location.pathname + window.location.search);
        container.innerHTML = emptyState(ttr('reminders.signed_out_title'), ttr('reminders.signed_out_desc'),
            `<a href="/login?redirect=${back}" class="saved-empty-explore-btn"><span>${escapeHtml(ttr('reminders.sign_in'))}</span></a>`);
        return;
    }
    if (!remindersState.loaded) {
        container.innerHTML = remindersState.error
            ? `<p class="trips-status" role="alert">${escapeHtml(ttr('reminders.error_save'))}</p>`
            : `<p class="trips-status" aria-busy="true">${escapeHtml(ttr('trips.loading'))}</p>`;
        return;
    }
    if (!remindersState.items.length) {
        container.innerHTML = emptyState(ttr('reminders.empty_title'), ttr('reminders.empty_desc'));
        return;
    }

    const fmtManila = (ms) => {
        if (!ms) return '--:--';
        return new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).format(new Date(ms));
    };

    const rows = remindersState.items.map(rem => {
        const dest = rem.destName || 'Destination';
        const leaveFormatted = fmtManila(rem.leaveAtMs);
        const remindFormatted = fmtManila(rem.remindAtMs);
        const isJeep = rem.mode === 'jeepney';
        const status = rem.status || 'scheduled';
        const statusText = ttr(`reminders.status_${status}`) || status;
        const canCancel = status === 'scheduled';

        return `
            <div class="reminder-item" data-reminder-id="${escapeHtml(rem.id)}">
                <div class="reminder-item-left">
                    <span class="reminder-item-icon" title="${escapeHtml(ttr(isJeep ? 'trips.mode_jeepney' : 'trips.mode_walk'))}">
                        ${isJeep ? ICON_TRIP_JEEP : ICON_TRIP_WALK}
                    </span>
                    <div class="reminder-item-details">
                        <div class="reminder-item-dest" title="${escapeHtml(dest)}">${escapeHtml(dest)}</div>
                        <div class="reminder-item-time">Leave: <strong>${escapeHtml(leaveFormatted)}</strong></div>
                        <div class="reminder-item-meta">Remind at: ${escapeHtml(remindFormatted)}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span class="reminder-badge ${escapeHtml(status)}">${escapeHtml(statusText)}</span>
                    ${canCancel ? `
                        <button type="button" class="reminder-item-cancel" data-reminder-cancel="${escapeHtml(rem.id)}"
                            aria-label="${escapeHtml(ttr('reminders.cancel_label', { dest }))}">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </div>`;
    }).join('');

    container.innerHTML = rows;
}

export async function openRemindersModal() {
    try { await loadTicketLib(); } catch (e) { console.warn(e); }
    openModal('modalMyReminders');
    const user = auth.currentUser;
    if (user && !user.isAnonymous && remindersState.uid !== user.uid) resetReminders(user.uid);
    renderRemindersList();
    requestAnimationFrame(() => document.querySelector('#modalMyReminders .modal-close-btn')?.focus({ preventScroll: true }));
    if (canSaveTrips() && !remindersState.loaded) {
        await loadReminders();
        renderRemindersList();
    }
}

async function cancelReminderAction(reminderId, btn) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    const T = await loadTicketLib();
    const ok = await T.confirm({
        title: ttr('reminders.cancel_confirm_title'),
        message: ttr('reminders.cancel_confirm_msg'),
        confirmLabel: ttr('reminders.cancel_btn'),
        cancelLabel: ttr('reminders.keep_btn')
    });
    if (!ok) return;
    if (btn) btn.disabled = true;

    try {
        await updateDoc(doc(db, `users/${user.uid}/reminders`, reminderId), {
            status: 'cancelled'
        });
        const target = remindersState.items.find(r => r.id === reminderId);
        if (target) target.status = 'cancelled';
        renderRemindersList();
        T.notify(ttr('reminders.toast_cancelled'));
    } catch (e) {
        console.warn('Reminder cancel failed:', (e && e.code) || e);
        if (btn) btn.disabled = false;
        T.notify(ttr('reminders.error_cancel'));
    }
}

export async function createReminder(reminder) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
        throw new Error('AUTH_REQUIRED');
    }

    // Limit check: at most 10 scheduled reminders
    const q = query(
        collection(db, `users/${user.uid}/reminders`),
        where('status', '==', 'scheduled')
    );
    const snap = await getDocs(q);
    if (snap.size >= 10) {
        throw new Error('LIMIT_REACHED');
    }

    const remindAtMs = reminder.remindAt instanceof Date ? reminder.remindAt.getTime() : reminder.remindAt;
    if (remindAtMs <= Date.now()) {
        throw new Error('TIME_IN_PAST');
    }

    const data = {
        destName: String(reminder.destName || '').slice(0, 120),
        destLat: Number(reminder.destLat),
        destLng: Number(reminder.destLng),
        originLabel: String(reminder.originLabel || 'My Location').slice(0, 120),
        mode: reminder.mode === 'walk' ? 'walk' : 'jeepney',
        leaveAt: Timestamp.fromDate(reminder.leaveAt instanceof Date ? reminder.leaveAt : new Date(reminder.leaveAt)),
        arriveBy: reminder.arriveBy ? Timestamp.fromDate(reminder.arriveBy instanceof Date ? reminder.arriveBy : new Date(reminder.arriveBy)) : null,
        remindAt: Timestamp.fromDate(new Date(remindAtMs)),
        channel: 'email',
        lang: reminder.lang === 'tl' ? 'tl' : 'en',
        status: 'scheduled',
        createdAt: serverTimestamp(),
        sentAt: null
    };

    if (typeof reminder.fareRegular === 'number' && !isNaN(reminder.fareRegular)) {
        data.fareRegular = Math.max(0, reminder.fareRegular);
    }
    if (typeof reminder.fareDiscounted === 'number' && !isNaN(reminder.fareDiscounted)) {
        data.fareDiscounted = Math.max(0, reminder.fareDiscounted);
    }

    const docRef = await addDoc(collection(db, `users/${user.uid}/reminders`), data);
    remindersState.loaded = false; // reload next time list opens
    return docRef.id;
}

export async function cancelReminder(reminderId) {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error('AUTH_REQUIRED');
    await updateDoc(doc(db, `users/${user.uid}/reminders`, reminderId), {
        status: 'cancelled'
    });
    remindersState.loaded = false;
}

window.CalzadaReminders = { open: openRemindersModal, createReminder, cancelReminder, loadReminders };

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
    if (menuSavedCountEl) {
        menuSavedCountEl.textContent = `${currentSaved.length}`;
        menuSavedCountEl.style.display = currentSaved.length > 0 ? '' : 'none';
    }
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
            const mobileInitialsEl = document.getElementById('mobileAvatarInitials');
            if (mobileInitialsEl) mobileInitialsEl.textContent = cachedName.charAt(0).toUpperCase();
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
            if (avatarBtn) {
                const accTemplate = window.t ? window.t('planner.account_menu') : 'Account menu, {name}';
                avatarBtn.setAttribute('aria-label', accTemplate.replace('{name}', name));
            }
            const customPhoto = localStorage.getItem('calzada_pref_photo') || user.photoURL || '';
            if (userAvatarImg) {
                const isDefault = customPhoto.includes('brand-logo') || customPhoto.includes('default-avatar') || customPhoto.includes('logo');
                userAvatarImg.classList.toggle('is-default', isDefault);
            }
            showAvatar(userAvatarImg, userAvatarInitials, customPhoto, initial);

            // 1b. Mobile avatar button
            showAvatar(mobileAvatarImg, mobileAvatarInitials, customPhoto, initial);

            // 2. Dropdown Header
            if (profileDisplayName) profileDisplayName.textContent = name;
            if (profileEmail) profileEmail.textContent = email;
            showAvatar(profileHeaderImg, profileHeaderInitials, customPhoto, initial);

            // 3. Settings modal previews & inputs
            renderSettingsModal();

            // 4. Fetch dynamic stats (Visits, Saves, Badges)
            try {
                const stats = await fetchUserStats(user);
                if (statVisitsCount) statVisitsCount.textContent = stats.visits;
                if (statSavesCount) statSavesCount.textContent = stats.saves;
                if (statBadgesCount) statBadgesCount.textContent = stats.badges;
                if (menuSavedCount) {
                    menuSavedCount.textContent = `${stats.saves}`;
                    menuSavedCount.style.display = stats.saves > 0 ? '' : 'none';
                }
                if (userBadgeCounter) {
                    userBadgeCounter.textContent = stats.badges;
                    userBadgeCounter.style.display = stats.badges > 0 ? 'flex' : 'none';
                }
            } catch (err) {
                console.warn("Could not fetch user stats:", err);
            }

            // Anonymous/Guest Mode vs Full Account
            if (explorationStatsSection) {
                explorationStatsSection.style.opacity = user.isAnonymous ? '0.7' : '1';
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

            // 6. Dynamic Business Link ("Register your business" -> /submit vs "My Business" -> /my-business)
            await syncBusinessMenuLink(user);
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
                window.location.href = '/login';
            } catch (error) {
                console.error("Logout Error:", error);
                clearUserState();
                window.location.href = '/login';
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

        const itemTrips = e.target.closest('#menuMyTrips');
        if (itemTrips) {
            e.preventDefault();
            closeDropdown();
            openTripsModal();
            return;
        }

        const itemReminders = e.target.closest('#menuMyReminders');
        if (itemReminders) {
            e.preventDefault();
            closeDropdown();
            openRemindersModal();
            return;
        }

        const itemCancelReminder = e.target.closest('#modalMyReminders [data-reminder-cancel]');
        if (itemCancelReminder) {
            e.preventDefault();
            cancelReminderAction(itemCancelReminder.dataset.reminderCancel, itemCancelReminder);
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
            if (window.location.pathname.includes('/places')) {
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
    // Root-absolute now that pages are served on clean URLs, so it no longer has to
    // guess the current depth.
    adminLink.href = '/admin';
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

/**
 * Dynamically configure business link in account menu:
 * - If user has an active business (status 'pending' or 'approved') -> "My Business" -> /my-business
 * - If user has no business (or only rejected) -> "Register your business" -> /submit
 */
export async function syncBusinessMenuLink(user) {
    const navList = document.querySelector('.profile-nav-list');
    if (!navList) return;

    let myBusinessBtn = document.getElementById('menuMyBusiness');
    if (!myBusinessBtn) {
        myBusinessBtn = document.createElement('a');
        myBusinessBtn.id = 'menuMyBusiness';
        myBusinessBtn.className = 'profile-nav-btn';
        myBusinessBtn.style.textDecoration = 'none';
        myBusinessBtn.innerHTML = `
            <span class="nav-btn-icon">
                <svg class="w-5 h-5" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M3 21l18 0" /><path d="M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4" /><path d="M5 21v-10.15" /><path d="M19 21v-10.15" /><path d="M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" /></svg>
            </span>
            <span class="nav-btn-title" data-i18n="nav.user.register_business"></span>
        `;
        const accountSettings = document.getElementById('menuAccountSettings');
        if (accountSettings && accountSettings.parentNode === navList) {
            accountSettings.insertAdjacentElement('afterend', myBusinessBtn);
        } else {
            navList.appendChild(myBusinessBtn);
        }
    }

    const titleEl = myBusinessBtn.querySelector('.nav-btn-title');
    const setMenuLabel = (key, defaultText) => {
        if (!titleEl) return;
        titleEl.setAttribute('data-i18n', key);
        titleEl.textContent = (window.t ? window.t(key) : defaultText);
    };

    if (!user || user.isAnonymous) {
        myBusinessBtn.href = '/submit';
        setMenuLabel('nav.user.register_business', 'Register your business');
        return;
    }

    try {
        const q = query(collection(db, 'businesses'), where('ownerId', '==', user.uid));
        const snap = await getDocs(q);
        const hasActiveBiz = !snap.empty && snap.docs.some(d => {
            const st = d.data().status;
            return st === 'pending' || st === 'approved';
        });

        if (hasActiveBiz) {
            myBusinessBtn.href = '/my-business';
            setMenuLabel('nav.user.my_business', 'My Business');
        } else {
            myBusinessBtn.href = '/submit';
            setMenuLabel('nav.user.register_business', 'Register your business');
        }
    } catch (e) {
        console.warn('Could not determine business ownership for menu:', e);
        myBusinessBtn.href = '/submit';
        setMenuLabel('nav.user.register_business', 'Register your business');
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
                <a href="/places" class="saved-empty-explore-btn" id="emptyStateVisitsBtn">
                    <span>Explore Places</span>
                    <svg class="calzada-route-arrow" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="18" x2="18" y2="6"></line><polyline points="9 6 18 6 18 15"></polyline></svg>
                </a>
            </div>
        `;
        return;
    }

    container.innerHTML = currentVisits.map(v => {
        const vUrl = (v.lat != null && v.lng != null)
            ? `/planner?destLat=${v.lat}&destLng=${v.lng}&destName=${encodeURIComponent(v.placeName)}&dlat=${v.lat}&dlng=${v.lng}&dest=${encodeURIComponent(v.placeName)}`
            : `/planner?destName=${encodeURIComponent(v.placeName)}&dest=${encodeURIComponent(v.placeName)}`;
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
                <a href="/places" class="saved-empty-explore-btn" id="emptyStateExploreBtn">
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
                        ? `/planner?destLat=${s.lat}&destLng=${s.lng}&destName=${encodeURIComponent(s.placeName)}&dlat=${s.lat}&dlng=${s.lng}&dest=${encodeURIComponent(s.placeName)}`
                        : `/planner?destName=${encodeURIComponent(s.placeName)}&dest=${encodeURIComponent(s.placeName)}`;
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
            avatarImgEl.removeAttribute('src');
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

            const savedInitial = ((newName || (user && user.displayName) || (user && user.email) || 'U').charAt(0) || 'U').toUpperCase();
            if (userAvatarImg) userAvatarImg.classList.remove('is-default');
            showAvatar(userAvatarImg, userAvatarInitials, pendingAvatarDataUrl, savedInitial);
            showAvatar(profileHeaderImg, profileHeaderInitials, pendingAvatarDataUrl, savedInitial);
            showAvatar(mobileAvatarImg, mobileAvatarInitials, pendingAvatarDataUrl, savedInitial);
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
                            <svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0z" /></svg>
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

        <!-- Modal: My Trips (same pattern as My Visits; texts set by renderTripsList) -->
        <div class="profile-modal-overlay" id="modalMyTrips">
            <div class="profile-modal-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <div class="modal-header-icon-box">${ICON_TRIPS_ROUTE}</div>
                        <h3 class="modal-header-heading">My Trips</h3>
                    </div>
                    <button class="modal-close-btn" type="button" aria-label="Close modal">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <p class="modal-subtitle"></p>
                    <div class="visits-list-wrap" id="tripsListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: My Reminders -->
        <div class="profile-modal-overlay" id="modalMyReminders">
            <div class="profile-modal-box">
                <div class="profile-modal-header">
                    <div class="modal-header-title">
                        <div class="modal-header-icon-box">${ICON_REMINDER_BELL}</div>
                        <h3 class="modal-header-heading">My Reminders</h3>
                    </div>
                    <button class="modal-close-btn" type="button" aria-label="Close modal">&times;</button>
                </div>
                <div class="profile-modal-body">
                    <p class="modal-subtitle"></p>
                    <div class="visits-list-wrap" id="remindersListContainer"></div>
                </div>
            </div>
        </div>

        <!-- Modal: Saved Places -->
        <div class="profile-modal-overlay" id="modalSavedPlaces">
            <div class="profile-modal-box saved-places-modal-box">
                <div class="profile-modal-header saved-modal-header">
                    <div class="modal-header-title saved-header-title">
                        <div class="modal-header-icon-box saved-header-icon-box">
                            <svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z" /></svg>
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
                            <svg width="22" height="22" fill="none" stroke="#378ADD" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 9m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0" /><path d="M12 15l3.4 5.89l1.598 -3.233l3.598 .232l-3.4 -5.889" /><path d="M6.802 12l-3.4 5.89l3.598 -.233l1.598 3.232l3.4 -5.889" /></svg>
                        </div>
                        <h3 class="modal-header-heading">Exploration Badges</h3>
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
                                <img alt="Profile Photo" id="settingsAvatarImg" class="settings-avatar-img" style="display: none;" />
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

// Re-localize account menu aria-label & dynamic business menu link on language switch
window.addEventListener('calzada_lang_changed', () => {
    const pill = document.getElementById('userAvatarPill');
    if (pill) {
        const name = localStorage.getItem('calzada_user_name') || 'Commuter';
        const accTemplate = (window.t ? window.t('planner.account_menu') : 'Account menu, {name}');
        pill.setAttribute('aria-label', accTemplate.replace('{name}', name));
    }
    const myBusinessBtn = document.getElementById('menuMyBusiness');
    if (myBusinessBtn) {
        const titleEl = myBusinessBtn.querySelector('.nav-btn-title');
        if (titleEl) {
            const key = titleEl.getAttribute('data-i18n');
            if (key && window.t) {
                titleEl.textContent = window.t(key);
            }
        }
    }
});

// Expose helpers on window
window.toggleSavePlace = toggleSavePlace;
window.recordVisit = recordVisit;

// Auto-initialize setupProfileUI when user-stats.js is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setupProfileUI());
} else {
    setupProfileUI();
}

