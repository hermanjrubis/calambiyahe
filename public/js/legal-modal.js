/**
 * Calzada Legal Modals (Terms of Service & Privacy Policy)
 * Clean, accessible, responsive popup modal system.
 * Minimal black & white legal document theme.
 */

(function () {
    'use strict';

    if (window.__calzadaLegalModalInitialized) return;
    window.__calzadaLegalModalInitialized = true;

    const LEGAL_CONTENT = {
        terms: {
            title: 'Terms of Service',
            switchLabel: 'Looking for our Privacy Policy?',
            switchTarget: 'privacy',
            switchText: 'View Privacy Policy →',
            bodyHtml: `
                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">1</span> Acceptance of Terms</h3>
                    <p>By accessing or using Calzada, you agree to be bound by these Terms of Service. If you do not agree with any part of these terms, please do not use Calzada.</p>
                    <p>These terms apply to all visitors, registered users, and anyone who accesses or uses Calzada in any manner.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">2</span> Description of Service</h3>
                    <p>Calzada is a place-finding and commuting guide for Calamba City, Laguna. The App helps users:</p>
                    <ul>
                        <li>Discover places of interest within Calamba City</li>
                        <li>Find how to get there by jeepney or tricycle</li>
                        <li>View general fare estimates and routing directions</li>
                        <li>Chat with Routie, an AI-powered assistant for commuting and place queries</li>
                    </ul>
                    <p>Route information, fares, and schedules are provided for general guidance only and may not reflect real-time conditions. Calzada is not affiliated with any official transport authority or government body.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">3</span> User Accounts</h3>
                    <p>You may register for a Calzada account using an email address and password, or via Google Sign-In (powered by Google Firebase Authentication). When creating an account, you agree to:</p>
                    <ul>
                        <li>Provide accurate and complete registration information</li>
                        <li>Keep your login credentials confidential</li>
                        <li>Be responsible for all activity occurring under your account</li>
                        <li>Notify us immediately of any unauthorized account access</li>
                    </ul>
                    <p>You may also use the App as a guest without creating an account, with limited functionality.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">4</span> User Conduct</h3>
                    <p>When using Calzada, you agree not to:</p>
                    <ul>
                        <li>Use the App for any unlawful or unauthorized purpose</li>
                        <li>Attempt to interfere with, hack, or disrupt the App's systems or servers</li>
                        <li>Submit false, misleading, or harmful content via feedback or chatbot</li>
                        <li>Attempt to jailbreak, override, or manipulate the Routie chatbot beyond its intended scope</li>
                        <li>Scrape, crawl, or extract data from the App in an automated manner</li>
                        <li>Use the App to harass, abuse, or harm other users or individuals</li>
                    </ul>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">5</span> Limitation of Liability</h3>
                    <p>Calzada is provided "as is" without any warranties of any kind. The developers make no guarantees regarding the accuracy, availability, or completeness of any information provided by the App.</p>
                    <p>The developers shall not be held liable for any direct, indirect, incidental, or consequential damages arising from the use of — or inability to use — the App, including reliance on any route, fare, or transit information displayed.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">6</span> Changes to Terms</h3>
                    <p>We reserve the right to modify these Terms of Service at any time. Changes will be updated within this modal. Continued use of the App after changes constitutes your acceptance of the revised terms.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">7</span> Contact Information</h3>
                    <p>For questions or concerns about these Terms of Service, you may reach the Calzada team through the <a href="/feedback" class="legal-link">Feedback page</a> or via email at <a href="mailto:thecalzada@gmail.com" class="legal-link">thecalzada@gmail.com</a>.</p>
                    <p>You may also view our <button type="button" class="legal-link-btn" data-open-legal="privacy">Privacy Policy</button> for information on how we handle your data.</p>
                </div>
            `
        },
        privacy: {
            title: 'Privacy Policy',
            switchLabel: 'Need the terms of service?',
            switchTarget: 'terms',
            switchText: 'View Terms of Service →',
            bodyHtml: `
                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">1</span> Information We Collect</h3>
                    <p>When you use Calzada, we may collect the following types of information:</p>
                    <ul>
                        <li><strong>Registration data:</strong> Your email address, used to create and identify your account.</li>
                        <li><strong>Authentication credentials:</strong> Your password, stored in hashed form via Firebase Authentication. We never see or store your password in plain text.</li>
                        <li><strong>Google account data (optional):</strong> If you sign in with Google, we receive your name, email address, and profile picture from Google's OAuth service.</li>
                        <li><strong>Search and place queries:</strong> What places or routes you look up within the App, to provide relevant results.</li>
                        <li><strong>Chatbot conversations:</strong> Messages sent to Routie (our AI assistant) are processed by the Groq API to generate responses. These messages are not stored permanently on our servers.</li>
                        <li><strong>Session and activity data:</strong> Login timestamps, device/browser type, and session logs, stored in Firestore for security and analysis purposes.</li>
                    </ul>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">2</span> How We Use Your Information</h3>
                    <p>The information we collect is used to:</p>
                    <ul>
                        <li>Authenticate your identity and manage your account</li>
                        <li>Provide personalized place-finding and route guidance within Calamba</li>
                        <li>Power the Routie chatbot to answer your commuting questions</li>
                        <li>Monitor login sessions for security and abuse prevention</li>
                        <li>Analyze usage patterns for system improvement and reliability</li>
                    </ul>
                    <p>We do not use your data for advertising, profiling, or any commercial monetization.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">3</span> Third-Party Services</h3>
                    <p>Calzada uses the following third-party services. When you use features that rely on them, relevant data is processed by their systems:</p>
                    <ul>
                        <li>
                            <strong>Google Firebase</strong> <span class="legal-tag">Authentication &amp; Database</span><br>
                            Used for user registration, login (including Google Sign-In), and storing session/activity data in Firestore. Google's privacy policy applies to data processed through Firebase.
                        </li>
                        <li style="margin-top: 10px;">
                            <strong>Groq API</strong> <span class="legal-tag">AI Chatbot</span><br>
                            Powers the Routie chatbot. Messages you send to Routie are transmitted to Groq's servers to generate responses. We recommend not sharing sensitive personal credentials through the chatbot.
                        </li>
                    </ul>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">4</span> Data Security</h3>
                    <p>We take standard, reasonable steps to protect your data:</p>
                    <ul>
                        <li>Passwords are hashed using industry-standard algorithms via Firebase Authentication — never stored in plain text</li>
                        <li>All data transmissions between the App and servers use HTTPS encryption</li>
                        <li>Firestore database access is restricted to authenticated users only, via Firebase Security Rules</li>
                    </ul>
                    <p>We encourage users not to reuse passwords from other online accounts.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">5</span> User Rights</h3>
                    <p>You have the following rights regarding your personal data:</p>
                    <ul>
                        <li><strong>Access:</strong> Request a summary of data associated with your account</li>
                        <li><strong>Correction:</strong> Request correction of inaccurate account information</li>
                        <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
                    </ul>
                    <p>To exercise any of these rights, contact us via the <a href="/feedback" class="legal-link">Feedback page</a> or email <a href="mailto:thecalzada@gmail.com" class="legal-link">thecalzada@gmail.com</a>.</p>
                </div>

                <div class="legal-modal-section">
                    <h3><span class="legal-sec-num">6</span> Contact Information</h3>
                    <p>For questions or concerns about this Privacy Policy, reach us through the <a href="/feedback" class="legal-link">Feedback page</a> or at <a href="mailto:thecalzada@gmail.com" class="legal-link">thecalzada@gmail.com</a>.</p>
                    <p>You may also review our <button type="button" class="legal-link-btn" data-open-legal="terms">Terms of Service</button> for the rules governing use of the App.</p>
                </div>
            `
        }
    };

    let modalOverlay = null;
    let lastFocusedElement = null;

    function buildModalDOM() {
        if (modalOverlay && document.body.contains(modalOverlay)) {
            return modalOverlay;
        }

        const existing = document.getElementById('calzadaLegalModal');
        if (existing) {
            modalOverlay = existing;
            const sub = modalOverlay.querySelector('#legalModalSubtitle');
            if (sub) sub.remove();
            return existing;
        }

        modalOverlay = document.createElement('div');
        modalOverlay.id = 'calzadaLegalModal';
        modalOverlay.className = 'legal-modal-overlay';
        modalOverlay.setAttribute('role', 'dialog');
        modalOverlay.setAttribute('aria-modal', 'true');
        modalOverlay.setAttribute('aria-labelledby', 'legalModalTitle');
        modalOverlay.innerHTML = `
            <div class="legal-modal-dialog">
                <div class="legal-modal-header">
                    <div class="legal-modal-header-text">
                        <h2 id="legalModalTitle" class="legal-modal-title"></h2>
                    </div>
                    <button type="button" class="legal-modal-close" id="legalModalCloseBtn" aria-label="Close modal">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="legal-modal-body" id="legalModalBody" tabindex="0"></div>
                <div class="legal-modal-footer">
                    <div class="legal-modal-footer-switch" id="legalModalSwitch"></div>
                    <button type="button" class="legal-modal-action-btn" id="legalModalOkBtn">I Understand</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        // Close on backdrop click (click outside dialog)
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeLegalModal();
            }
        });

        // Close buttons
        modalOverlay.querySelector('#legalModalCloseBtn').addEventListener('click', closeLegalModal);
        modalOverlay.querySelector('#legalModalOkBtn').addEventListener('click', closeLegalModal);

        return modalOverlay;
    }

    function openLegalModal(type) {
        const key = (type === 'privacy' || (type && type.includes('privacy'))) ? 'privacy' : 'terms';
        const data = LEGAL_CONTENT[key];
        if (!data) return;

        buildModalDOM();

        // Populate content scoped directly to modalOverlay
        const titleEl = modalOverlay.querySelector('#legalModalTitle');
        const bodyEl = modalOverlay.querySelector('#legalModalBody');
        const switchEl = modalOverlay.querySelector('#legalModalSwitch');
        const closeBtn = modalOverlay.querySelector('#legalModalCloseBtn');

        // Remove any residual subtitle element if present
        const subEl = modalOverlay.querySelector('#legalModalSubtitle');
        if (subEl) subEl.remove();

        if (titleEl) titleEl.textContent = data.title;
        if (bodyEl) {
            bodyEl.innerHTML = data.bodyHtml;
            bodyEl.scrollTop = 0;
        }
        if (switchEl) {
            switchEl.innerHTML = `
                <span class="legal-switch-label">${data.switchLabel}</span>
                <button type="button" class="legal-switch-btn" data-open-legal="${data.switchTarget}">${data.switchText}</button>
            `;
        }

        lastFocusedElement = document.activeElement;

        // Prevent body scroll
        document.body.classList.add('legal-modal-open');

        // Force reflow to guarantee content is laid out before transitions
        void modalOverlay.offsetHeight;

        // Show modal with transition
        modalOverlay.classList.add('active');

        // Reset scroll position and focus
        requestAnimationFrame(() => {
            if (bodyEl) bodyEl.scrollTop = 0;
            if (closeBtn) closeBtn.focus();
        });
    }

    function closeLegalModal() {
        if (!modalOverlay || !modalOverlay.classList.contains('active')) return;

        modalOverlay.classList.remove('active');
        document.body.classList.remove('legal-modal-open');

        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            try { lastFocusedElement.focus(); } catch (_) { }
        }
    }

    // Global Key Listener for Esc
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modalOverlay && modalOverlay.classList.contains('active')) {
            e.preventDefault();
            closeLegalModal();
        }
    });

    // Delegated click listener for any triggers across the site
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

    // Eagerly construct modal in DOM on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => buildModalDOM());
    } else {
        buildModalDOM();
    }

    // Expose API globally
    window.openLegalModal = openLegalModal;
    window.closeLegalModal = closeLegalModal;

})();
