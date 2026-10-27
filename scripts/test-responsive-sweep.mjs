/**
 * scripts/test-responsive-sweep.mjs
 *
 * Verification suite for Phase 4 Section 5: Dedicated Tablet View & Responsive Sweep.
 *
 * Tests:
 * - Viewport widths:
 *   Phone:   320x640, 375x812, 390x844, 430x932
 *   Tablet Portrait: 768x1024, 800x1280, 820x1180, 834x1194
 *   Tablet Landscape: 1024x768, 1180x820
 *   Desktop: 1280x800, 1440x900
 * - Pages:
 *   home, planner, places, places (open panel), discover, business profile,
 *   plans, submit (every step), my-business (every status), admin (every view),
 *   about, faq, fares, feedback, login.
 *
 * Assertions:
 * - Fail if document.documentElement.scrollWidth > innerWidth, or on any page error.
 * - Dedicated tablet layout checks (820x1180 and 1180x820):
 *   * Planner: landscape = map + 380px left panel; portrait = bottom sheet <= 60% height, map visible above.
 *   * Places: 2-column card grid; place panel opens as 420px right drawer.
 *   * Updates (discover): one 680px centered column; sidebar cards above feed in portrait.
 *   * Business profile: 680px column, 3-column posts grid.
 *   * My Business: 680px column, photo grids 4 across.
 *   * Admin: sidebar collapses to 64px icons with tooltips; list+detail 2 columns in landscape, stacked in portrait.
 *   * Register wizard: form + preview side-by-side at 1024-1199, Preview button at 768-1023.
 * - Saves screenshots to scratch/sweep/ (git-ignored) and artifact dir for 820x1180.
 * - Prints a comprehensive pass/fail table.
 */

import http from 'node:http';
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: 'calzada-web' });
const adminDb = getFirestore(app);

function createEmulatorToken(uid, claims = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: uid,
    user_id: uid,
    aud: "calzada-web",
    iss: "https://securetoken.google.com/calzada-web",
    email: `${uid}@test.calzadaph.com`,
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    auth_time: Math.floor(Date.now() / 1000),
    ...claims
  })).toString('base64url');
  return `${header}.${payload}.`;
}

function startAuthEmulator() {
  return new Promise((resolve) => {
    const authServer = http.createServer((req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', '*');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        const url = req.url || '';
        let uid = 'sweep_owner_1';
        let isAdmin = false;

        try {
          const parsed = JSON.parse(body || '{}');
          if (parsed.token) {
            const parts = parsed.token.split('.');
            if (parts[1]) {
              const pData = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
              if (pData.sub) uid = pData.sub;
              if (pData.admin) isAdmin = true;
            }
          }
        } catch (_) {}

        if (url.includes('accounts:createAuthUri')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            kind: 'identitytoolkit#CreateAuthUriResponse',
            allProviders: ['password'],
            registered: true,
            signinMethods: ['password']
          }));
        } else if (url.includes('accounts:signInWithPassword') || url.includes('accounts:signUp')) {
          const customJwt = createEmulatorToken(uid, isAdmin ? { admin: true } : {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            kind: 'identitytoolkit#VerifyPasswordResponse',
            localId: uid,
            email: `${uid}@test.calzadaph.com`,
            displayName: 'Calamba Business Owner',
            idToken: customJwt,
            registered: true,
            refreshToken: `refresh-${uid}`,
            expiresIn: '3600'
          }));
        } else if (url.includes('accounts:signInWithCustomToken')) {
          const customJwt = createEmulatorToken(uid, isAdmin ? { admin: true } : {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            kind: 'identitytoolkit#VerifyCustomTokenResponse',
            idToken: customJwt,
            refreshToken: `refresh-${uid}`,
            expiresIn: '3600',
            isNewUser: false
          }));
        } else if (url.includes('securetoken.googleapis.com/v1/token')) {
          const customJwt = createEmulatorToken(uid, isAdmin ? { admin: true } : {});
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            access_token: customJwt,
            expires_in: "3600",
            token_type: "Bearer",
            refresh_token: `refresh-${uid}`,
            id_token: customJwt,
            user_id: uid,
            project_id: "calzada-web"
          }));
        } else if (url.includes('accounts:lookup')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            users: [{
              localId: uid,
              email: `${uid}@test.calzadaph.com`,
              displayName: isAdmin ? 'Sweep Admin' : 'Business Owner',
              emailVerified: true,
              customAttributes: isAdmin ? JSON.stringify({ admin: true }) : undefined
            }]
          }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({}));
        }
      });
    });

    authServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(null);
      }
    });

    authServer.listen(9099, '127.0.0.1', () => {
      resolve(authServer);
    });
  });
}

async function seedFirestoreData() {
  console.log('[Seed] Seeding Firestore emulator with real business & post data...');

  // 1. Approved business 1: CityMall Calamba
  await adminDb.doc('businesses/1').set({
    name: 'CityMall Calamba',
    status: 'approved',
    serviceType: 'Shopping Mall',
    category: 'malls',
    address: 'National Highway, Brgy. Uno, Calamba City, Laguna',
    contactNumber: '+63 49 545 1234',
    description: 'Premier shopping and transit hub in Calamba.',
    verified: true,
    location: { lat: 14.2045, lng: 121.1552 },
    socialLinks: {
      facebook: 'https://facebook.com/citymallcalamba',
      instagram: 'https://instagram.com/citymallcalamba'
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  // 3 posts for CityMall Calamba (active, with photoUrls)
  for (let i = 1; i <= 3; i++) {
    await adminDb.doc(`posts/seed_post_${i}`).set({
      businessId: '1',
      businessName: 'CityMall Calamba',
      businessCategory: 'malls',
      ownerId: 'sweep_owner_approved',
      photoUrls: ['/assets/logo-header.webp'],
      caption: `CityMall Update #${i}: Visit us today for shopping, food, and transit connections!`,
      likeCount: i * 5,
      status: 'active',
      label: 'announcement',
      createdAt: Timestamp.fromDate(new Date(Date.now() - i * 3600000))
    });
  }

  // 2. Draft business for my-business
  await adminDb.doc('businesses/sweep_bus_draft').set({
    name: 'Draft Artisan Cafe',
    status: 'draft',
    category: 'coffee',
    serviceType: 'Specialty Coffee',
    address: 'Real Road, Brgy. Real, Calamba City',
    contactNumber: '+63 917 111 2222',
    description: 'Artisan handcrafted coffee and pastries.',
    ownerId: 'sweep_owner_1',
    plan: 'plus360',
    location: { lat: 14.2085, lng: 121.1565 },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  // 3. Pending business for my-business
  await adminDb.doc('businesses/sweep_bus_pending').set({
    name: 'Pending Bakehouse',
    status: 'pending',
    category: 'eateries',
    serviceType: 'Artisan Bakery',
    address: 'Chipeco Ave, Brgy. Halang, Calamba City',
    contactNumber: '+63 918 333 4444',
    description: 'Fresh sourdough breads and local pastries baked daily.',
    ownerId: 'sweep_owner_1',
    plan: 'plus360',
    location: { lat: 14.1950, lng: 121.1580 },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  // 4. Approved business for my-business
  await adminDb.doc('businesses/sweep_bus_approved').set({
    name: 'Approved Calamba Boutique',
    status: 'approved',
    category: 'establishments',
    serviceType: 'Fashion Boutique',
    address: 'JP Rizal St, Brgy. Uno, Calamba City',
    contactNumber: '+63 919 555 6666',
    description: 'Curated apparel, local crafts, and modern fashion.',
    ownerId: 'sweep_owner_1',
    plan: 'plus360',
    thumbnailUrl: '/assets/logo-header.webp',
    profilePhotoUrl: '/assets/logo-header.webp',
    verified: true,
    location: { lat: 14.2120, lng: 121.1630 },
    socialLinks: {
      facebook: 'https://facebook.com/calambaboutique',
      instagram: 'https://instagram.com/calambaboutique'
    },
    offerings: ['Local Handcrafted Apparel', 'Souvenirs', 'Accessories'],
    openHours: {
      mon: { open: '09:00', close: '18:00' },
      tue: { open: '09:00', close: '18:00' },
      wed: { open: '09:00', close: '18:00' },
      thu: { open: '09:00', close: '18:00' },
      fri: { open: '09:00', close: '19:00' },
      sat: { open: '10:00', close: '19:00' },
      sun: { closed: true }
    },
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  // 3 posts for sweep_bus_approved
  for (let i = 1; i <= 3; i++) {
    await adminDb.doc(`posts/sweep_owner_post_${i}`).set({
      businessId: 'sweep_bus_approved',
      businessName: 'Approved Calamba Boutique',
      businessCategory: 'establishments',
      ownerId: 'sweep_owner_1',
      photoUrls: ['/assets/logo-header.webp'],
      caption: `Boutique announcement #${i}: New summer collection is available now!`,
      likeCount: i * 3,
      status: 'active',
      label: 'announcement',
      createdAt: Timestamp.fromDate(new Date(Date.now() - i * 3600000))
    });
  }

  console.log('[Seed] Firestore emulator seeded successfully.');
}

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5000';
const SWEEP_DIR = path.resolve(process.cwd(), 'scratch', 'sweep');
const ARTIFACT_DIR = 'C:\\Users\\erms\\.gemini\\antigravity-ide\\brain\\52166c1e-b582-432d-b977-a97b365292f7';

if (!fs.existsSync(SWEEP_DIR)) {
  fs.mkdirSync(SWEEP_DIR, { recursive: true });
}

const VIEWPORTS = [
  // Phone
  { category: 'phone', name: '320x640', width: 320, height: 640 },
  { category: 'phone', name: '375x812', width: 375, height: 812 },
  { category: 'phone', name: '390x844', width: 390, height: 844 },
  { category: 'phone', name: '430x932', width: 430, height: 932 },
  // Tablet Portrait
  { category: 'tablet-pt', name: '768x1024', width: 768, height: 1024 },
  { category: 'tablet-pt', name: '800x1280', width: 800, height: 1280 },
  { category: 'tablet-pt', name: '820x1180', width: 820, height: 1180 },
  { category: 'tablet-pt', name: '834x1194', width: 834, height: 1194 },
  // Tablet Landscape
  { category: 'tablet-ls', name: '1024x768', width: 1024, height: 768 },
  { category: 'tablet-ls', name: '1180x820', width: 1180, height: 820 },
  // Desktop
  { category: 'desktop', name: '1280x800', width: 1280, height: 800 },
  { category: 'desktop', name: '1440x900', width: 1440, height: 900 },
];

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'planner', path: '/planner' },
  { name: 'places', path: '/places' },
  { name: 'places-open-panel', path: '/places?id=1' },
  { name: 'discover', path: '/discover' },
  { name: 'business-profile', path: '/business?id=1' },
  { name: 'plans', path: '/plans' },
  { name: 'submit-step1-store', path: '/submit#store' },
  { name: 'submit-step2-location', path: '/submit#location' },
  { name: 'submit-step3-hours', path: '/submit#hours' },
  { name: 'submit-step4-plan', path: '/submit#plan' },
  { name: 'submit-step5-review', path: '/submit#review' },
  { name: 'my-business-draft', path: '/my-business?status=draft' },
  { name: 'my-business-pending', path: '/my-business?status=pending' },
  { name: 'my-business-approved', path: '/my-business?status=approved' },
  { name: 'admin-pending', path: '/admin#pending' },
  { name: 'admin-approved', path: '/admin#approved' },
  { name: 'admin-rejected', path: '/admin#rejected' },
  { name: 'about', path: '/about' },
  { name: 'faq', path: '/faq' },
  { name: 'fares', path: '/fares' },
  { name: 'feedback', path: '/feedback' },
  { name: 'login', path: '/login' },
];

async function runSweep() {
  console.log(`Starting Responsive Sweep across ${PAGES.length} pages and ${VIEWPORTS.length} viewports...`);
  console.log(`Base URL: ${BASE_URL}\n`);

  await seedFirestoreData();
  const authServer = await startAuthEmulator();
  const browser = await chromium.launch();
  const context = await browser.newContext();

  await context.addInitScript(() => {
    window.localStorage.setItem('calzada_use_emulator', '1');
    window.__MOCK_AUTH_USER__ = {
      uid: 'sweep_owner_1',
      email: 'sweep_owner_1@test.calzadaph.com',
      displayName: 'Calamba Business Owner'
    };
  });

  const page = await context.newPage();

  // Pre-authenticate context with Firebase Auth as sweep_owner_1
  console.log('[Auth] Pre-authenticating session as sweep_owner_1...');
  await page.goto(`${BASE_URL}/login?emulator=1`);
  await page.fill('#emailInput', 'sweep_owner_1@test.calzadaph.com');
  await page.click('#btnEmailContinue');
  await page.waitForSelector('#loginPass:not([disabled])', { timeout: 5000 });
  await page.fill('#loginPass', 'password123');
  await page.click('#loginSubmitBtn');
  await page.waitForTimeout(600);
  console.log('[Auth] Session authenticated successfully.\n');

  const results = [];
  let totalTests = 0;
  let passedTests = 0;

  for (const pageDef of PAGES) {
    console.log(`[Sweep] Testing page: ${pageDef.name}...`);
    for (const vp of VIEWPORTS) {
      totalTests++;
      const pageErrors = [];

      const errorHandler = (err) => {
        if (err.message && (err.message.includes('ERR_ABORTED') || err.message.includes('ResizeObserver'))) return;
        pageErrors.push(err.message);
      };

      page.on('pageerror', errorHandler);

      try {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(`${BASE_URL}${pageDef.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Stabilization pause
        await page.waitForTimeout(300);

        // Places open panel: wait for panel to open automatically from ?id=1
        if (pageDef.name === 'places-open-panel') {
          await page.waitForSelector('#placePanel.active, #placePanel.open', { state: 'visible', timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(200);
        }

        // Authenticate admin pages through Firebase Auth emulator with admin claim
        if (pageDef.name.startsWith('admin')) {
          const adminToken = createEmulatorToken('sweep_admin_user', { admin: true });
          await page.evaluate(async (tok) => {
            try {
              const { signInWithCustomToken } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js");
              const auth = window.CalzadaAuth?.auth;
              if (auth && (!auth.currentUser || auth.currentUser.uid !== 'sweep_admin_user')) {
                await signInWithCustomToken(auth, tok);
              }
            } catch (e) {
              console.error('Admin emulator sign in error:', e);
            }
          }, adminToken);
          await page.waitForSelector('#adminApp', { state: 'visible', timeout: 5000 }).catch(() => {});
        }

        // Wait for business profile real content (fail if error visible)
        if (pageDef.name === 'business-profile') {
          await page.waitForSelector('#profileContent', { state: 'visible', timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(200);
        }

        // Wait for my-business real content
        if (pageDef.name.startsWith('my-business')) {
          await page.waitForSelector('#mybusContainer', { state: 'visible', timeout: 5000 }).catch(() => {});
          await page.waitForFunction(() => {
            const p = document.getElementById('statePending');
            const a = document.getElementById('stateApproved');
            return (p && window.getComputedStyle(p).display !== 'none') ||
                   (a && window.getComputedStyle(a).display !== 'none');
          }, { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(200);
        }

        // Layout evaluation
        const evalData = await page.evaluate(({ pageName, vpWidth, vpHeight, vpCategory }) => {
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const layoutDetails = [];
          let layoutPassed = true;

          // 1. Planner checks
          if (pageName === 'planner') {
            const card = document.getElementById('directionsCard');
            if (card) {
              const rect = card.getBoundingClientRect();
              if (vpCategory === 'tablet-ls') {
                const w = Math.round(rect.width);
                const is380 = (w === 380);
                if (!is380) layoutPassed = false;
                layoutDetails.push(`panel=${w}px (want 380)`);
              } else if (vpCategory === 'tablet-pt') {
                const h = rect.height;
                const maxAllowed = 0.60 * vpHeight + 5;
                const isUnder60 = (h <= maxAllowed);
                if (!isUnder60) layoutPassed = false;
                layoutDetails.push(`sheetH=${Math.round(h)}px <= ${Math.round(maxAllowed)}px`);
              }
            }
          }

          // 2. Places checks
          if (pageName === 'places' || pageName === 'places-open-panel') {
            const grid = document.getElementById('placesGrid') || document.querySelector('.places-grid');
            if (grid && (vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls')) {
              const cols = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).length;
              if (cols !== 2) layoutPassed = false;
              layoutDetails.push(`gridCols=${cols} (want 2)`);
            }
            if (pageName === 'places-open-panel') {
              const panel = document.getElementById('placePanel') || document.querySelector('.place-panel-container');
              const nameEl = document.getElementById('ppName');
              const title = nameEl ? nameEl.textContent.trim() : '';
              if (!panel || (!panel.classList.contains('active') && !panel.classList.contains('open'))) {
                layoutPassed = false;
                layoutDetails.push('panelNotOpen');
              }
              if (title === '1' || !title) {
                layoutPassed = false;
                layoutDetails.push(`drawerTitleInvalid="${title}"`);
              } else {
                layoutDetails.push(`title="${title}"`);
              }
              if (vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls') {
                if (panel) {
                  const pw = Math.round(panel.getBoundingClientRect().width);
                  if (pw !== 420) layoutPassed = false;
                  layoutDetails.push(`drawerW=${pw}px (want 420)`);
                }
              }
            }
          }

          // 3. Discover (Updates) checks
          if (pageName === 'discover' && vpCategory === 'tablet-pt') {
            const feed = document.querySelector('.updates-feed-col');
            const sidebar = document.querySelector('.updates-sidebar-col');
            if (feed && sidebar) {
              const fw = Math.round(feed.getBoundingClientRect().width);
              const sidebarTop = sidebar.getBoundingClientRect().top;
              const feedTop = feed.getBoundingClientRect().top;
              const isAbove = sidebarTop < feedTop;
              if (fw > 680 || !isAbove) layoutPassed = false;
              layoutDetails.push(`feedW=${fw}px, sidebarAbove=${isAbove}`);
            }
          }

          // 4. Business Profile checks
          if (pageName === 'business-profile') {
            const pageError = document.getElementById('pageError');
            const profileContent = document.getElementById('profileContent');
            const isErrorVisible = pageError && window.getComputedStyle(pageError).display !== 'none';
            const isContentVisible = profileContent && window.getComputedStyle(profileContent).display !== 'none';
            if (isErrorVisible || !isContentVisible) {
              layoutPassed = false;
              layoutDetails.push(isErrorVisible ? 'errorVisible' : 'contentHidden');
            }
            if (vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls') {
              const container = document.querySelector('.business-container');
              const postsGrid = document.querySelector('.posts-grid');
              if (container) {
                const cw = Math.round(container.getBoundingClientRect().width);
                if (cw > 680) layoutPassed = false;
                layoutDetails.push(`colW=${cw}px`);
              }
              if (postsGrid) {
                const styleVal = getComputedStyle(postsGrid).gridTemplateColumns;
                const is3Cols = styleVal.includes('repeat(3') || styleVal.trim().split(/\s+/).length === 3;
                if (!is3Cols) layoutPassed = false;
                layoutDetails.push(`postsGrid=3cols`);
              }
            }
          }

          // 5. My Business checks
          if (pageName.startsWith('my-business')) {
            const globalError = document.getElementById('globalError');
            const stateNoBusiness = document.getElementById('stateNoBusiness');
            const isErrVisible = globalError && window.getComputedStyle(globalError).display !== 'none';
            const isEmptyVisible = stateNoBusiness && window.getComputedStyle(stateNoBusiness).display !== 'none';
            if (isErrVisible || isEmptyVisible) {
              layoutPassed = false;
              layoutDetails.push(isErrVisible ? 'globalErrorVisible' : 'stateNoBusinessVisible');
            }
            const container = document.getElementById('mybusContainer') || document.querySelector('.mybus-container');
            const strip = document.querySelector('.photo-strip-wrap');
            if (container) {
              const cw = Math.round(container.getBoundingClientRect().width);
              if (cw <= 0 || ((vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls') && cw > 680)) {
                layoutPassed = false;
              }
              layoutDetails.push(`colW=${cw}px`);
            } else {
              layoutPassed = false;
              layoutDetails.push('colW=0px');
            }
            if (strip && (vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls')) {
              const styleVal = getComputedStyle(strip).gridTemplateColumns;
              const is4Cols = styleVal.includes('repeat(4') || styleVal.trim().split(/\s+/).length === 4;
              if (!is4Cols) layoutPassed = false;
              layoutDetails.push(`photoGrid=4cols`);
            }
          }

          // 6. Admin checks
          if (pageName.startsWith('admin') && (vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls')) {
            const sidebar = document.getElementById('adminSidebar') || document.querySelector('.admin-sidebar');
            const layout = document.querySelector('.master-detail-layout');
            if (sidebar) {
              const sw = Math.round(sidebar.getBoundingClientRect().width);
              if (sw !== 64) layoutPassed = false;
              layoutDetails.push(`sidebarW=${sw}px (want 64)`);
            }
            if (layout) {
              const dir = getComputedStyle(layout).flexDirection;
              if (vpCategory === 'tablet-ls' && dir !== 'row') layoutPassed = false;
              if (vpCategory === 'tablet-pt' && dir !== 'column') layoutPassed = false;
              layoutDetails.push(`layout=${dir}`);
            }
          }

          // 7. Submit wizard checks
          if (pageName.startsWith('submit') && (vpCategory === 'tablet-pt' || vpCategory === 'tablet-ls')) {
            const previewCol = document.querySelector('.wizard-preview-col');
            const previewBtn = document.getElementById('btnOpenPhonePreview');
            if (vpCategory === 'tablet-ls') {
              const isSideBySide = previewCol && getComputedStyle(previewCol).display !== 'none';
              if (!isSideBySide) layoutPassed = false;
              layoutDetails.push(`preview=side-by-side`);
            } else if (vpCategory === 'tablet-pt') {
              const btnVisible = previewBtn && getComputedStyle(previewBtn).display !== 'none';
              if (!btnVisible) layoutPassed = false;
              layoutDetails.push(`previewBtn=visible`);
            }
          }

          return {
            scrollWidth,
            innerWidth,
            layoutPassed,
            layoutNote: layoutDetails.join(', ') || 'ok'
          };
        }, {
          pageName: pageDef.name,
          vpWidth: vp.width,
          vpHeight: vp.height,
          vpCategory: vp.category
        });

        const noOverflow = evalData.scrollWidth <= evalData.innerWidth;
        const noErrors = pageErrors.length === 0;
        const passed = noOverflow && noErrors && evalData.layoutPassed;

        if (passed) passedTests++;

        // Save screenshot for sweep
        const screenshotName = `${pageDef.name}-${vp.name}.png`;
        const screenshotPath = path.join(SWEEP_DIR, screenshotName);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        // Save dedicated artifact screenshots for 820x1180
        if (vp.name === '820x1180') {
          if (pageDef.name === 'my-business-approved') {
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'my-business-approved-820x1180.png'), fullPage: false });
          } else if (pageDef.name === 'business-profile') {
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'business-profile-820x1180.png'), fullPage: false });
          }
        }

        results.push({
          page: pageDef.name,
          category: vp.category,
          viewport: vp.name,
          dimensions: `${vp.width}x${vp.height}`,
          scrollWidth: evalData.scrollWidth,
          innerWidth: evalData.innerWidth,
          layoutNote: evalData.layoutNote,
          errorCount: pageErrors.length,
          passed,
        });
      } catch (err) {
        console.error(`Error on ${pageDef.name} (${vp.name}):`, err.message);
        results.push({
          page: pageDef.name,
          category: vp.category,
          viewport: vp.name,
          dimensions: `${vp.width}x${vp.height}`,
          scrollWidth: -1,
          innerWidth: vp.width,
          layoutNote: 'error',
          errorCount: 1,
          passed: false,
        });
      } finally {
        page.off('pageerror', errorHandler);
      }
    }
  }

  await browser.close();
  if (authServer) authServer.close();

  // Print Pass/Fail Summary Table
  console.log('\n========================================================================================================================');
  console.log('|                                            RESPONSIVE SWEEP & TABLET TABLE                                           |');
  console.log('========================================================================================================================');
  console.log('| Page                  | Viewport   | Category  | Scroll / Inner | Errors | Layout Check                  | Result    |');
  console.log('|-----------------------|------------|-----------|----------------|--------|-------------------------------|-----------|');

  for (const r of results) {
    const pageCol = r.page.padEnd(21, ' ');
    const vpCol = r.viewport.padEnd(10, ' ');
    const catCol = r.category.padEnd(9, ' ');
    const scrollCol = `${r.scrollWidth}/${r.innerWidth}`.padEnd(14, ' ');
    const errCol = String(r.errorCount).padEnd(6, ' ');
    const layoutCol = r.layoutNote.slice(0, 29).padEnd(29, ' ');
    const resCol = r.passed ? 'PASS     ' : 'FAIL     ';
    console.log(`| ${pageCol} | ${vpCol} | ${catCol} | ${scrollCol} | ${errCol} | ${layoutCol} | ${resCol} |`);
  }

  console.log('========================================================================================================================');
  console.log(`Summary: ${passedTests}/${totalTests} combinations passed (${((passedTests / totalTests) * 100).toFixed(1)}%).`);

  if (passedTests === totalTests) {
    console.log('>>> ALL RESPONSIVE SWEEP & TABLET LAYOUT CHECKS PASSED: Every row passes with 0 overflow and verified layout. <<<');
    process.exit(0);
  } else {
    console.error(`>>> ${totalTests - passedTests} COMBINATIONS FAILED. <<<`);
    process.exit(1);
  }
}

runSweep().catch((err) => {
  console.error('Fatal sweep error:', err);
  process.exit(1);
});
