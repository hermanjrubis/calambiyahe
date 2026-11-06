/**
 * Calzada Legal Modals (Terms of Service & Privacy Policy), version 2.0
 *
 * Effective November 20, 2026 (published November 6, 2026: 14 days' notice).
 * Written against RA 10173 (Data Privacy Act of 2012) and its IRR, NPC Circular 2023-04 (consent),
 * RA 8792 (E-Commerce Act), RA 10175 (Cybercrime Prevention Act) and RA 11967 (Internet
 * Transactions Act). Internal review against the NPC templates; not a substitute for legal advice.
 *
 * Every number in the Privacy Policy matches the code:
 *   route history fields: firestore.rules isValidRouteHistoryCreate; 12 months: server/data-retention.js
 *   searches 20, places viewed 20, Routie messages 50: js/firebase-init.js
 *   reset throttle: server/password-reset.js; consent record: users/{uid}/consents
 * Change both together.
 *
 * Opens from any element with data-open-legal="terms|privacy" (and old terms/privacy links).
 * window.CalzadaLegal = { versions, effectiveDate, open(type), close() }.
 * Layout (v3.2): fixed header (title only), a scrollable body (opening paragraphs, a divider, the
 * numbered sections in one readable column) and a fixed footer
 * whose "I understand" turns on only after the body is scrolled to its end. Fires
 * "calzada:legal-read" { type, version } on document when it is pressed.
 * Styles: css/legal-modal.css (loaded by this file, so pages need no extra tag).
 */

(function () {
    'use strict';

    if (window.__calzadaLegalModalInitialized) return;
    window.__calzadaLegalModalInitialized = true;

    const VERSIONS = { terms: '2.0', privacy: '2.0' };
    const EFFECTIVE_ISO = '2026-11-20';
    const EFFECTIVE_LABEL = 'November 20, 2026';
    const PUBLISHED_LABEL = 'November 6, 2026';
    const DPO = { title: 'Calzada Data Protection Officer', email: 'thecalzadaph@gmail.com' };
    const STYLE_HREF = '/css/legal-modal.css?v=3.2.0';


    const dpoLine = `<strong>${DPO.title}</strong>, <a href="mailto:${DPO.email}" class="legal-link">${DPO.email}</a>`;

    const LEGAL_CONTENT = {
        terms: {
            title: 'Terms of Service',
            version: VERSIONS.terms,
            switchLabel: 'See also how we handle your data.',
            switchTarget: 'privacy',
            // Opening paragraphs (shown first, on a light block)
            summary: [
                'These Terms of Service govern your use of Calzada, a free guide for finding places and getting around Calamba City on foot or by jeepney. By using Calzada or creating an account, you agree to them, so please read them carefully.',
                'Routes, fares and travel times on Calzada are estimates. Always check the road, the signs and the jeepney itself before you rely on them. You can plan and preview routes without an account; live navigation needs one, and you must be 13 years old or older to create it. You are responsible for what happens in your account.',
                'Please use Calzada lawfully and with respect for others. Misusing the site, other people’s data or Routie can also break the Cybercrime Prevention Act of 2012 (RA 10175).'
            ],
            sections: [
                {
                    id: 'acceptance', title: 'Agreement',
                    html: `
                    <p>These Terms are an agreement between you and Calzada (calzadaph.com), a place-finding and commuting guide for Calamba City, Laguna. By using Calzada, or by ticking “I agree” or continuing when you sign up, you accept these Terms and our <button type="button" class="legal-link-btn" data-open-legal="privacy">Privacy Policy</button>.</p>
                    <p>Under the Electronic Commerce Act (RA 8792), ticking a box or tapping a button to accept is a valid electronic agreement, the same as signing on paper. We keep a record of the version you accepted and when.</p>`
                },
                {
                    id: 'eligibility', title: 'Who can use Calzada',
                    html: `
                    <ul>
                        <li>Anyone can browse places and plan or preview routes without an account.</li>
                        <li>To make an account you must be <strong>13 years old or older</strong>. You confirm this when you sign up.</li>
                        <li>If you are under 18, please use Calzada with the knowledge of a parent or guardian, and ask them to read the Privacy Policy with you.</li>
                        <li>One account is for one person. Business owners use their own account to manage their listing.</li>
                    </ul>`
                },
                {
                    id: 'service', title: 'What Calzada does, and its limits',
                    html: `
                    <p>Calzada helps you find places in Brgy. Uno, Real and Halang and get there on foot or by jeepney. It shows routes on a map, walking steps, estimated travel times and estimated fares, and offers Routie, an AI assistant for commuting questions.</p>
                    <ul>
                        <li><strong>Estimates only.</strong> Fares follow the LTFRB fare guide as we understand it; the fare you pay is what the driver charges under the current fare matrix. Times, routes, stops and loading points can change without notice.</li>
                        <li><strong>Your safety comes first.</strong> Follow traffic rules, use footbridges and pedestrian lanes, and board only at allowed loading points. Do not use live navigation while driving.</li>
                        <li><strong>Routie can be wrong.</strong> Its answers are generated by AI. Check anything important.</li>
                        <li><strong>Not official.</strong> Calzada is not run by, or connected with, the LTFRB, the City of Calamba or any transport group.</li>
                        <li><strong>Live navigation needs an account,</strong> because a started trip is kept in your route history (see the Privacy Policy).</li>
                    </ul>`
                },
                {
                    id: 'accounts', title: 'Your account',
                    html: `
                    <ul>
                        <li>Use your real name (letters, spaces, and . - ’ as in “Ma. Dela Cruz-Reyes”) and an email address you can open.</li>
                        <li>Choose a strong password (8 to 64 characters with upper- and lowercase letters, a number and a symbol) that you do not use elsewhere. Never share it. Calzada will never ask for it by email, chat or phone.</li>
                        <li>You are responsible for activity in your account. Tell us right away at <a href="mailto:${DPO.email}" class="legal-link">${DPO.email}</a> if you think someone else got in.</li>
                        <li>We may suspend or close an account that breaks these Terms or the law, after telling you why unless the law or someone’s safety requires otherwise.</li>
                        <li>You can stop using Calzada at any time and ask us to delete your account.</li>
                    </ul>`
                },
                {
                    id: 'conduct', title: 'Acceptable use',
                    html: `
                    <p>Do not use Calzada to do anything unlawful. In particular, and in line with the Cybercrime Prevention Act of 2012 (RA 10175), do not:</p>
                    <ul>
                        <li>get into accounts, systems or data that are not yours, or try to;</li>
                        <li>disrupt, overload, probe or break the site, its servers or its security;</li>
                        <li>collect other people’s information, or copy Calzada’s data with bots, scrapers or other automated tools;</li>
                        <li>post false, misleading, defamatory, hateful or harassing content, fake reviews, or content you have no right to share;</li>
                        <li>trick Routie into going beyond its purpose, or use it to produce harmful content;</li>
                        <li>pretend to be someone else, or another business.</li>
                    </ul>`
                },
                {
                    id: 'content', title: 'What you post',
                    html: `
                    <p>Reviews, ratings, photos, posts and feedback stay yours. By posting them you let Calzada show them on the site, resize them, and keep them as long as they are up. Post only what you have the right to share, and do not include other people’s personal information without their permission. We may hide content that breaks these Terms; we tell business owners when we hide their posts.</p>`
                },
                {
                    id: 'business', title: 'Business listings and paid plans',
                    html: `
                    <p>Businesses in the covered barangays can apply for a listing. In line with the Internet Transactions Act (RA 11967):</p>
                    <ul>
                        <li>Each plan’s price and what it includes are shown on the Plans page before you apply. Payment is one-time (no subscription) and only after your application is approved.</li>
                        <li>You pay by GCash to the QR shown on My Business and upload the receipt and reference number. We check every payment and email you at each step.</li>
                        <li>Your listing must be accurate: a real business, its real location and contact details, and photos you have the right to use. We may decline or remove a listing that is false or unlawful, and we tell you why.</li>
                        <li>Questions or problems with a payment: email <a href="mailto:${DPO.email}" class="legal-link">${DPO.email}</a> with your reference number.</li>
                    </ul>`
                },
                {
                    id: 'liability', title: 'Limitation of liability',
                    html: `
                    <p>Calzada is provided “as is”. We work to keep it accurate and available, but we cannot promise that every route, fare, time or place detail is correct or that the site is always up. To the extent the law allows, Calzada is not liable for losses from relying on that information, such as a missed ride or a different fare. Nothing in these Terms limits rights you have under Philippine law that cannot be waived.</p>`
                },
                {
                    id: 'changes', title: 'Changes to these Terms',
                    html: `
                    <p>When we change these Terms in a way that matters, we post the new version here with its version number and effective date at least 14 days before it applies, and show a notice on the site. If you keep using Calzada after that date, the new Terms apply. If you do not agree, you can stop using Calzada and ask us to delete your account. This is version ${VERSIONS.terms}, published ${PUBLISHED_LABEL}, effective ${EFFECTIVE_LABEL}.</p>`
                },
                {
                    id: 'law', title: 'Governing law and contact',
                    html: `
                    <p>These Terms are governed by the laws of the Philippines. We will first try to settle any concern with you directly; if that fails, the proper courts of Calamba City, Laguna have jurisdiction, without taking away your right to go to a government agency such as the National Privacy Commission.</p>
                    <p>Contact: ${dpoLine}, or the <a href="/feedback" class="legal-link">Feedback page</a>.</p>`
                }
            ]
        },
        privacy: {
            title: 'Privacy Policy',
            version: VERSIONS.privacy,
            switchLabel: 'See also the rules for using Calzada.',
            switchTarget: 'terms',
            // Opening paragraphs (shown first, on a light block)
            summary: [
                'This Privacy Policy explains what personal data Calzada collects when you use calzadaph.com, why we collect it, and the choices you have. We keep only what Calzada needs to work for you, and we never sell your data or use it for advertising.',
                'Your exact location (GPS) is never saved. When you plan or start a route while signed in, your starting point is kept only as a name, such as “My Location” or a place name, together with its barangay. Route history is deleted automatically after 12 months, and you can delete one route or all of them at any time before then.',
                'Under the Data Privacy Act of 2012 (RA 10173), you have the right to access, correct and delete your data, and to file a complaint with the National Privacy Commission. Section 9 explains how to use these rights.'
            ],
            sections: [
                {
                    id: 'controller', title: 'Who is responsible for your data',
                    html: `
                    <p>Calzada (calzadaph.com), Calamba City, Laguna, is the personal information controller for the data described here. Our Data Protection Officer is the ${dpoLine}. Write to the DPO about anything in this policy or to use your rights.</p>
                    <p>This policy follows the Data Privacy Act of 2012 (RA 10173), its Implementing Rules and Regulations, and the National Privacy Commission’s Circular 2023-04 on consent.</p>`
                },
                {
                    id: 'collect', title: 'What we collect',
                    html: `
                    <ul>
                        <li><strong>Account:</strong> your name and email address; if you use Google Sign-In, the name, email and profile photo Google shares. Your password is handled by Firebase Authentication and stored only in hashed form; we never see it.</li>
                        <li><strong>Consent record:</strong> the versions of these Terms and this Policy you accepted, that you confirmed being 13 or older, the sign-up method and language, and the time.</li>
                        <li><strong>Route history and trips:</strong> described in full in the next section.</li>
                        <li><strong>Reminders you set:</strong> the destination, starting point name, leave and arrival times, travel mode, fare and language, so we can email you at the right time.</li>
                        <li><strong>Activity in your account:</strong> your last 20 searches, your last 20 places viewed, saved places, visits and badges, and your last 50 messages with Routie, so you can pick up where you left off.</li>
                        <li><strong>Sign-in records:</strong> time, method (email or Google) and browser type, for security.</li>
                        <li><strong>What you send us:</strong> reviews, ratings, photos, posts and feedback (with the name and email you give).</li>
                        <li><strong>Business owners:</strong> business details, contact details, the map pin, photos, and the GCash reference number and receipt you upload.</li>
                        <li><strong>Password reset requests:</strong> a one-way code made from the email address and one from the network address (not the addresses themselves) with the request times, for up to 24 hours, to stop abuse.</li>
                    </ul>
                    <p><strong>Guests</strong> (not signed in): nothing is tied to you. A route you preview stays only in your browser tab, briefly, so it is not lost while you sign in.</p>
                    <p><strong>Your location:</strong> when you allow it, your device’s location is used in your browser to show where you are and to guide you. It is never saved to our servers.</p>`
                },
                {
                    id: 'route-history', title: 'Route history and live navigation',
                    html: `
                    <div class="legal-disclosure">
                        <p class="legal-disclosure-title">What Calzada keeps when you plan or start a route (signed in only)</p>
                        <ul>
                            <li><strong>Where you were going:</strong> the destination’s name, category and map point.</li>
                            <li><strong>Where you started, as a name only:</strong> “My Location”, “Pinned location” or the place name, the kind of starting point, and its barangay. <strong>Never the coordinates of your starting point.</strong></li>
                            <li><strong>The trip:</strong> walk or jeepney, the estimated minutes, distance and fare, and for finished trips the legs (walk or jeepney, minutes, km, fare) and how long it actually took.</li>
                            <li><strong>Status and times:</strong> planned, started, cancelled (and whether you cancelled or switched routes) or arrived, with the times.</li>
                        </ul>
                        <p><strong>Not kept:</strong> your GPS position during the trip, the path you actually walked or rode, or anything that tracks you after the trip ends.</p>
                        <p><strong>Why:</strong> to show your route history and trips, to bring back a trip after you reload the page, and to count trips for your stats and badges. Live navigation (Start Journey) needs an account for this reason; planning and previewing do not.</p>
                        <p><strong>How long:</strong> each route history entry is deleted automatically <strong>12 months</strong> after it was planned. You can delete one route or all of them at any time in Route history. Finished trips (My Trips) stay until you delete them or your account. Everything is deleted with your account.</p>
                        <p><strong>To draw any route</strong> (guests too), the start and end points are sent to the routing and map services listed below. They receive the points and your device’s network address, not your name or account.</p>
                    </div>
                    <div class="legal-disclosure legal-disclosure-tl" lang="tl">
                        <p class="legal-disclosure-title">Sa Tagalog: Ano ang itinatago ng Calzada kapag nagplano o nagsimula ka ng ruta (kapag naka-sign in lang)</p>
                        <p>Ang pangalan, uri at lokasyon sa mapa ng iyong pupuntahan; ang panimulang punto bilang <strong>pangalan lang</strong> (“My Location”, “Pinned location” o pangalan ng lugar) at ang barangay nito, <strong>hindi kailanman ang coordinates</strong>; lakad o dyip, tinatayang minuto, layo at pamasahe; at ang status (planned, started, cancelled, arrived) at mga oras. Hindi namin itinatago ang iyong GPS habang bumibiyahe o ang dinaanan mo. Awtomatikong binubura ang bawat entry <strong>pagkalipas ng 12 buwan</strong>. Puwede mong burahin ang isa o lahat anumang oras sa Route history, at nabubura ang lahat kapag binura ang account. Para maipakita ang ruta, ipinapadala ang simula at dulo sa mga routing at map service sa ibaba, nang walang pangalan o account mo.</p>
                    </div>`
                },
                {
                    id: 'purposes', title: 'Why we use it, and on what basis',
                    html: `
                    <ul>
                        <li><strong>To give you the service you asked for</strong> (RA 10173 Sec. 12(b)): your account and sign-in, route history, live navigation, reminders you set, Routie, saved places and business listings.</li>
                        <li><strong>With your consent</strong> (Sec. 12(a)): you give it when you sign up. You can withdraw it at any time by deleting your data or your account; this does not undo processing already done.</li>
                        <li><strong>Legitimate interests</strong> (Sec. 12(f)): keeping Calzada secure, preventing abuse, and fixing problems, in ways that do not override your rights.</li>
                        <li><strong>Legal duties</strong> (Sec. 12(c)): when the law or a lawful order requires it.</li>
                    </ul>
                    <p>We do not sell your data, use it for advertising, or build profiles of you. We do not collect sensitive personal information (such as health or government ID numbers) and ask you not to put it in reviews, feedback or Routie.</p>`
                },
                {
                    id: 'recipients', title: 'Who processes it for us',
                    html: `
                    <p>These services process data for us under their own security and privacy terms. Some are outside the Philippines; we use them only with safeguards and stay accountable for your data (RA 10173 Sec. 21).</p>
                    <ul>
                        <li><strong>Google Firebase</strong> <span class="legal-tag">Sign-in &amp; database</span>: accounts, Firestore data.</li>
                        <li><strong>Vercel</strong> <span class="legal-tag">Hosting</span>: runs the website and its server.</li>
                        <li><strong>Google Gmail</strong> <span class="legal-tag">Email</span>: sends account, reminder and business emails.</li>
                        <li><strong>Groq</strong> <span class="legal-tag">Routie AI</span>: receives the messages you send Routie to write its answers.</li>
                        <li><strong>Cloudinary</strong> <span class="legal-tag">Images</span>: stores photos and payment receipts.</li>
                        <li><strong>Routing and maps</strong> <span class="legal-tag">Routes</span>: OSRM (router.project-osrm.org, routing.openstreetmap.de), Esri ArcGIS and Nominatim (finding places), Geoapify (through our server), OpenFreeMap and CARTO (map tiles). They receive map points or search text and your network address.</li>
                    </ul>
                    <p>We share personal data with others only when the law requires it, to protect someone’s life or safety, or with your consent.</p>`
                },
                {
                    id: 'automated', title: 'Automated processing',
                    html: `
                    <p>Routes, fares and times are worked out automatically, and Routie’s answers are generated by AI. None of this makes decisions about you with legal or similar effects. Business listings and payments are always checked by a person.</p>`
                },
                {
                    id: 'retention', title: 'How long we keep it',
                    html: `
                    <ul>
                        <li><strong>Route history:</strong> 12 months from when the route was planned, then deleted automatically; or sooner if you delete it.</li>
                        <li><strong>Sign-in records, email logs and feedback:</strong> 12 months, then deleted automatically.</li>
                        <li><strong>Searches and places viewed:</strong> only the last 20 of each. <strong>Routie messages:</strong> only the last 50.</li>
                        <li><strong>Password reset request records:</strong> up to 24 hours.</li>
                        <li><strong>Account, trips, saved places, visits, reminders and consent record:</strong> while your account exists.</li>
                        <li><strong>Business listings and payment records:</strong> while the listing exists, and afterwards only as long as needed for records the law requires.</li>
                        <li><strong>When your account is deleted</strong> (ask the DPO), its data is deleted too, except what the law requires us to keep.</li>
                    </ul>`
                },
                {
                    id: 'security', title: 'How we protect it',
                    html: `
                    <ul>
                        <li>Data travels over HTTPS. Passwords are hashed by Firebase Authentication and must meet a strong-password rule.</li>
                        <li>Database security rules decide who can read and change each record. From the app, only you can read or change your route history, trips, reminders and account activity, and a consent record cannot be changed by anyone.</li>
                        <li>Password reset emails are limited per email address and per network, and say the same thing whether or not an account exists.</li>
                        <li>Only our administrator can see the data needed to run listings and payments.</li>
                    </ul>
                    <p>If a breach puts your data at real risk, we will tell the National Privacy Commission and you within 72 hours of finding out, as the law requires.</p>`
                },
                {
                    id: 'rights', title: 'Your rights',
                    html: `
                    <p>Under RA 10173 (Sec. 16 to 18) you have the right to:</p>
                    <ul>
                        <li><strong>Be informed</strong> about how your data is used (this policy);</li>
                        <li><strong>Access</strong> your data and get a copy in a common format (data portability);</li>
                        <li><strong>Correct</strong> wrong data (you can edit your name in Account settings);</li>
                        <li><strong>Object</strong> to processing, and <strong>withdraw consent</strong>;</li>
                        <li><strong>Erase or block</strong> data (you can delete route history yourself, or ask us to delete your account);</li>
                        <li><strong>Damages</strong>, and to <strong>file a complaint</strong> with the National Privacy Commission (privacy.gov.ph).</li>
                    </ul>
                    <p>To use a right, email the DPO at <a href="mailto:${DPO.email}" class="legal-link">${DPO.email}</a> from your account’s email address, so we know the request is yours. It is free.</p>`
                },
                {
                    id: 'children', title: 'Children',
                    html: `
                    <p>Accounts are for people 13 and older. If you are under 18, please use Calzada with a parent or guardian’s knowledge. If we learn that an account belongs to someone under 13, we delete it. Parents or guardians can write to the DPO about a child’s data.</p>`
                },
                {
                    id: 'changes', title: 'Changes to this policy',
                    html: `
                    <p>We post every new version here with its version number and effective date, at least 14 days before it applies, and show a notice on the site. If a change needs your consent again, we will ask for it. This is version ${VERSIONS.privacy}, published ${PUBLISHED_LABEL}, effective ${EFFECTIVE_LABEL}.</p>`
                }
            ]
        }
    };

    let modalOverlay = null;
    let lastFocusedElement = null;
    let hideTimer = null;
    let currentKey = 'terms';
    let accepted = false;

    // Text for the line beside "I understand" (also read out by screen readers, aria-live)
    const HINT_LOCKED = 'Scroll to the end to continue';
    const HINT_DONE = 'You’ve reached the end.';
    const END_SLACK_PX = 24; // counts as "at the end" within this distance (zoom and rounding)

    function ensureStyles() {
        if (document.querySelector('link[data-legal-modal-css]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = STYLE_HREF;
        link.setAttribute('data-legal-modal-css', '');
        document.head.appendChild(link);
    }

    // ── Scroll to accept ─────────────────────────────────────────────────────────────────────────
    // "I understand" starts disabled and turns on once the body has been scrolled to its end. If
    // the whole text fits without scrolling, it turns on straight away. Closing (X, Esc, backdrop)
    // always works: reading the terms is never a trap; agreeing happens with the sign-up checkbox.
    function setAccept(on) {
        const ok = modalOverlay.querySelector('#legalModalOkBtn');
        const hint = modalOverlay.querySelector('#legalModalHint');
        accepted = on;
        ok.disabled = !on;
        hint.textContent = on ? HINT_DONE : HINT_LOCKED;
        hint.classList.toggle('is-done', on);
    }

    function checkScrollEnd() {
        if (accepted || !modalOverlay || !modalOverlay.classList.contains('active')) return;
        const body = modalOverlay.querySelector('#legalModalBody');
        if (body.scrollTop + body.clientHeight >= body.scrollHeight - END_SLACK_PX) setAccept(true);
    }

    function buildModalDOM() {
        if (modalOverlay && document.body.contains(modalOverlay)) return modalOverlay;
        ensureStyles();

        const existing = document.getElementById('calzadaLegalModal');
        if (existing) existing.remove();

        modalOverlay = document.createElement('div');
        modalOverlay.id = 'calzadaLegalModal';
        modalOverlay.className = 'legal-modal-overlay';
        modalOverlay.hidden = true; // stays hidden until its stylesheet and an open() call
        modalOverlay.setAttribute('role', 'dialog');
        modalOverlay.setAttribute('aria-modal', 'true');
        modalOverlay.setAttribute('aria-labelledby', 'legalModalTitle');
        // Fixed header (title) · scrollable body (opening paragraphs, divider, text) · fixed footer
        modalOverlay.innerHTML = `
            <div class="legal-modal-dialog">
                <header class="legal-modal-header">
                    <div class="legal-modal-header-text">
                        <h2 id="legalModalTitle" class="legal-modal-title">Terms of Service</h2>
                    </div>
                    <button type="button" class="legal-modal-close" id="legalModalCloseBtn" aria-label="Close">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </header>
                <div class="legal-modal-body" id="legalModalBody" tabindex="0" aria-label="Document text">
                    <div class="legal-modal-column" id="legalModalContent"></div>
                </div>
                <footer class="legal-modal-footer">
                    <p class="legal-modal-hint" id="legalModalHint" aria-live="polite">${HINT_LOCKED}</p>
                    <button type="button" class="legal-modal-action-btn" id="legalModalOkBtn" disabled aria-describedby="legalModalHint">I understand</button>
                </footer>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        const body = modalOverlay.querySelector('#legalModalBody');
        body.addEventListener('scroll', checkScrollEnd, { passive: true });
        // Fonts loading, rotation or zoom change the height: check again
        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(() => checkScrollEnd()).observe(modalOverlay.querySelector('#legalModalContent'));
        }
        window.addEventListener('resize', checkScrollEnd, { passive: true });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeLegalModal();
        });
        modalOverlay.querySelector('#legalModalCloseBtn').addEventListener('click', closeLegalModal);
        modalOverlay.querySelector('#legalModalOkBtn').addEventListener('click', () => {
            if (!accepted) return;
            const data = LEGAL_CONTENT[currentKey];
            // Pages that care (e.g. sign-up) can listen; nothing is ticked or saved here
            document.dispatchEvent(new CustomEvent('calzada:legal-read', { detail: { type: currentKey, version: data.version } }));
            closeLegalModal();
        });
        // Keep keyboard focus inside the dialog
        modalOverlay.addEventListener('keydown', (e) => {
            if (e.key !== 'Tab') return;
            const items = [...modalOverlay.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]')].filter((el) => el.offsetParent !== null);
            if (!items.length) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        });

        return modalOverlay;
    }

    function renderBody(key, data) {
        const other = LEGAL_CONTENT[data.switchTarget];
        // Opening paragraphs: plain text on white, before the numbered sections
        const summary = `
            <div class="legal-intro">
                ${data.summary.map((s) => `<p>${s}</p>`).join('')}
            </div>
            <hr class="legal-divider">`;
        const sections = data.sections.map((sec, i) => `
            <section class="legal-modal-section" id="legal-${key}-${sec.id}" aria-labelledby="legal-${key}-${sec.id}-h">
                <h3 id="legal-${key}-${sec.id}-h"><span class="legal-sec-num">${i + 1}.</span> ${sec.title}</h3>
                ${sec.html}
            </section>`).join('');
        const end = `
            <hr class="legal-divider">
            <div class="legal-doc-end">
                <p>Questions: ${DPO.title}, <a href="mailto:${DPO.email}" class="legal-link">${DPO.email}</a></p>
                <p>${data.switchLabel} <button type="button" class="legal-link-btn" data-open-legal="${data.switchTarget}">Read the ${other.title}</button></p>
            </div>`;
        return summary + sections + end;
    }

    function openLegalModal(type) {
        const key = (type === 'privacy' || (type && String(type).includes('privacy'))) ? 'privacy' : 'terms';
        const data = LEGAL_CONTENT[key];
        if (!data) return;
        currentKey = key;

        buildModalDOM();
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

        const titleEl = modalOverlay.querySelector('#legalModalTitle');
        const bodyEl = modalOverlay.querySelector('#legalModalBody');
        const contentEl = modalOverlay.querySelector('#legalModalContent');
        const closeBtn = modalOverlay.querySelector('#legalModalCloseBtn');

        titleEl.textContent = data.title;
        contentEl.innerHTML = renderBody(key, data);
        bodyEl.scrollTop = 0;
        setAccept(false); // every document is read from the top, also when switching between them

        if (!modalOverlay.classList.contains('active')) lastFocusedElement = document.activeElement;
        document.body.classList.add('legal-modal-open');
        modalOverlay.hidden = false;
        void modalOverlay.offsetHeight; // start the transition from the hidden state
        modalOverlay.classList.add('active');

        requestAnimationFrame(() => {
            bodyEl.scrollTop = 0;
            if (closeBtn) closeBtn.focus();
            checkScrollEnd(); // short text that needs no scrolling
        });
    }

    function closeLegalModal() {
        if (!modalOverlay || !modalOverlay.classList.contains('active')) return;
        modalOverlay.classList.remove('active');
        document.body.classList.remove('legal-modal-open');
        hideTimer = setTimeout(() => { if (modalOverlay && !modalOverlay.classList.contains('active')) modalOverlay.hidden = true; }, 220);
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            try { lastFocusedElement.focus(); } catch (_) { }
        }
        lastFocusedElement = null;
    }

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
            e.preventDefault();
            e.stopPropagation();
            closeLegalModal();
        }
    }, true);

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-open-legal], a[href*="terms.html"], a[href*="privacy.html"], a[href="#terms"], a[href="#privacy"]');
        if (!trigger) return;

        let type = trigger.dataset.openLegal;
        if (!type) {
            const href = trigger.getAttribute('href') || '';
            if (href.includes('privacy')) type = 'privacy';
            else if (href.includes('terms')) type = 'terms';
        }

        if (type) {
            e.preventDefault();
            e.stopPropagation();
            openLegalModal(type);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => buildModalDOM());
    } else {
        buildModalDOM();
    }

    window.openLegalModal = openLegalModal;
    window.closeLegalModal = closeLegalModal;
    window.CalzadaLegal = {
        versions: { ...VERSIONS },
        effectiveDate: EFFECTIVE_ISO,
        dpo: { ...DPO },
        open: openLegalModal,
        close: closeLegalModal
    };
})();
