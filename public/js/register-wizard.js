/**
 * public/js/register-wizard.js
 *
 * 5-Step Business Owner Registration Wizard for Calzada:
 * 1. #store     - Business Info (Logo upload, Front photo, strict Business Name validation, Calamba Category + Others, strict +639XXXXXXXXX Contact Number, Offerings)
 * 2. #location  - Location & Map ("Use My Current Location" Geolocation API, responsive h-64 md:h-96 MapLibre map, structured House No./Building/Street + Barangay [Uno, Real, Halang] + Landmark, bidirectional Pin <-> Address sync)
 * 3. #hours     - Open Hours (7-day toggle switches, single continuous time range per day, manual <input type="time"> inputs, mobile-stacked / desktop-row layout)
 * 4. #plan      - Plans & Pricing (One-time payment display without /mo, responsive grid-cols-1 md:grid-cols-3 cards)
 * 5. #review    - Full Review & Submit (Displays all Stage 1-4 data with section "Edit" buttons that jump to the stage and return directly to Review after saving)
 */

import {
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    collection,
    serverTimestamp,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js';

const STEPS = ['store', 'location', 'hours', 'plan', 'review'];
const STEP_TITLES = {
    store: { title: 'Business Info', benefit: 'Provide your official store details, logo, and offerings.' },
    location: { title: 'Location & Map', benefit: 'Pin your exact store location in Brgy. Uno, Real, or Halang.' },
    hours: { title: 'Open Hours', benefit: 'Set your daily operating schedule so commuters know when you are open.' },
    plan: { title: 'Plans & Pricing', benefit: 'Select a one-time listing plan for your business.' },
    review: { title: 'Review & Submit', benefit: 'Verify all registration details before submitting for review.' }
};

// Calamba category options mapped to Firestore allowed base categories + serviceType
const CALAMBA_CATEGORIES = [
    { key: 'eateries', label: 'Eatery, Karinderya & Restaurant', firestoreCat: 'eateries', serviceType: 'Eatery & Restaurant' },
    { key: 'coffee', label: 'Coffee Shop, Cafe & Bakery', firestoreCat: 'coffee', serviceType: 'Coffee & Cafe' },
    { key: 'retail', label: 'Retail, Grocery & Sari-Sari Store', firestoreCat: 'establishments', serviceType: 'Retail & Sari-Sari Store' },
    { key: 'services', label: 'Services & Repair (Laundry, Salon, Shop)', firestoreCat: 'establishments', serviceType: 'Services & Repair' },
    { key: 'health', label: 'Health, Pharmacy & Clinic', firestoreCat: 'establishments', serviceType: 'Health & Pharmacy' },
    { key: 'lodging', label: 'Resort, Hotel & Transient Lodging', firestoreCat: 'establishments', serviceType: 'Resort & Lodging' },
    { key: 'malls', label: 'Mall & Shopping Center', firestoreCat: 'malls', serviceType: 'Mall & Shopping' },
    { key: 'establishments', label: 'Commercial Establishment & Office', firestoreCat: 'establishments', serviceType: 'Commercial Establishment' },
    { key: 'schools', label: 'School, Tutorial & Training Center', firestoreCat: 'schools', serviceType: 'School & Training' },
    { key: 'terminals', label: 'Transport Terminal & Hub', firestoreCat: 'terminals', serviceType: 'Transport Terminal' },
    { key: 'others', label: 'Others (Specify below)', firestoreCat: 'establishments', serviceType: null }
];

const BARANGAY_CENTERS = [
    { name: 'Uno', lat: 14.20415, lng: 121.15691 },
    { name: 'Real', lat: 14.19625, lng: 121.14964 },
    { name: 'Halang', lat: 14.19505, lng: 121.16341 }
];
const BARANGAY_CODES = { U: 'Uno', R: 'Real', H: 'Halang' };
const BARANGAY_SAMPLES = [
    [14.19459,121.16488,"H"],[14.20251,121.15840,"U"],[14.19880,121.15235,"R"],[14.19776,121.16026,"H"],[14.20295,121.15715,"U"],[14.19549,121.14353,"R"],
    [14.20562,121.15623,"U"],[14.20270,121.15755,"U"],[14.20404,121.15594,"U"],[14.20391,121.15607,"U"],[14.20370,121.15616,"U"],[14.19465,121.16522,"H"],
    [14.19301,121.16575,"H"],[14.19596,121.16369,"H"],[14.19748,121.16186,"H"],[14.19491,121.14354,"R"],[14.19593,121.16371,"H"],[14.20218,121.15862,"U"],
    [14.19582,121.16414,"H"],[14.20447,121.15559,"U"],[14.20247,121.15838,"U"],[14.20548,121.15647,"U"],[14.20385,121.15658,"U"],[14.20351,121.15739,"U"],
    [14.20555,121.15578,"U"],[14.20265,121.15823,"U"],[14.20275,121.15817,"U"],[14.20483,121.15671,"U"],[14.20366,121.15629,"U"],[14.20457,121.15664,"U"],
    [14.20509,121.15634,"U"],[14.20538,121.15578,"U"],[14.20362,121.15756,"U"],[14.20428,121.15670,"U"],[14.20380,121.15619,"U"],[14.20483,121.15842,"U"],
    [14.20368,121.15753,"U"],[14.20322,121.15789,"U"],[14.20578,121.15758,"U"],[14.20488,121.15651,"U"],[14.20554,121.15574,"U"],[14.20457,121.15665,"U"],
    [14.20456,121.15683,"U"],[14.20468,121.15652,"U"],[14.20529,121.15611,"U"],[14.20260,121.15823,"U"],[14.20484,121.15640,"U"],[14.20421,121.15702,"U"],
    [14.20444,121.15654,"U"],[14.20227,121.15841,"U"],[14.20507,121.15652,"U"],[14.20335,121.15773,"U"],[14.20530,121.15667,"U"],[14.20457,121.15812,"U"],
    [14.20431,121.15702,"U"],[14.20435,121.15773,"U"],[14.20375,121.15710,"U"],[14.20397,121.15689,"U"],[14.20562,121.15627,"U"],[14.20582,121.15762,"U"],
    [14.20299,121.15804,"U"],[14.20442,121.15695,"U"],[14.20431,121.15562,"U"],[14.19651,121.16259,"H"],[14.19400,121.16536,"H"],[14.19662,121.16196,"H"],
    [14.19313,121.16554,"H"],[14.19390,121.16488,"H"],[14.19338,121.16538,"H"],[14.19742,121.16249,"H"],[14.19369,121.16578,"H"],[14.19675,121.16211,"H"],
    [14.19835,121.16173,"H"],[14.19840,121.16225,"H"],[14.19520,121.16360,"H"],[14.19667,121.16244,"H"],[14.19607,121.14363,"R"],[14.19405,121.15969,"R"],
    [14.19704,121.14638,"R"],[14.19720,121.14583,"R"],[14.19587,121.15979,"R"],[14.19674,121.15920,"R"],[14.19784,121.14971,"R"],[14.19681,121.16106,"H"],
    [14.20402,121.15664,"U"],[14.20397,121.15667,"U"],[14.20395,121.15668,"U"],[14.20388,121.15677,"U"],[14.20393,121.15599,"U"],[14.20385,121.15606,"U"],
    [14.19552,121.16352,"H"],[14.18861,121.16271,"H"],[14.19557,121.16113,"H"],[14.19578,121.16095,"H"],[14.19612,121.16141,"H"],[14.19303,121.16571,"H"],
    [14.19141,121.16621,"H"],[14.19680,121.16230,"H"],[14.19438,121.16455,"H"],[14.19801,121.16143,"H"],[14.19610,121.16182,"H"],[14.19307,121.16569,"H"],
    [14.19267,121.16646,"H"],[14.19097,121.16536,"H"],[14.19573,121.16130,"H"],[14.19139,121.16587,"H"],[14.19631,121.16165,"H"],[14.19436,121.16454,"H"],
    [14.19102,121.16532,"H"],[14.19106,121.16532,"H"],[14.19770,121.16158,"H"],[14.19784,121.16151,"H"],[14.18977,121.16398,"H"],[14.19350,121.16578,"H"],
    [14.19413,121.15757,"R"],[14.19727,121.14655,"R"],[14.19706,121.16279,"H"],[14.20449,121.15578,"U"]
];

function brgyDistanceM(lat1, lng1, lat2, lng2) {
    const kx = 111320 * Math.cos(lat1 * Math.PI / 180);
    return Math.hypot((lat2 - lat1) * 110540, (lng2 - lng1) * kx);
}

function detectBarangay(lat, lng) {
    const near = BARANGAY_SAMPLES
        .map(([sLat, sLng, code]) => ({ d: brgyDistanceM(lat, lng, sLat, sLng), name: BARANGAY_CODES[code] }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 3);
    if (near.length && near[0].d <= 600) {
        const votes = {};
        near.forEach(n => { votes[n.name] = (votes[n.name] || 0) + 1 / Math.max(n.d, 5); });
        return Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    }
    let best = BARANGAY_CENTERS[0];
    let bestD = Infinity;
    BARANGAY_CENTERS.forEach(b => {
        const d = brgyDistanceM(lat, lng, b.lat, b.lng);
        if (d < bestD) { bestD = d; best = b; }
    });
    return best.name;
}

const COVERAGE_BBOX = {
    minLat: 14.1800,
    maxLat: 14.2300,
    minLng: 121.1300,
    maxLng: 121.1850
};

/**
 * Strict Business Name Validator:
 * - Required, 2 to 80 characters
 * - Only letters, numbers, spaces, and standard business punctuation (.,-&'()/)
 * - Requires at least one vowel (/[aeiouAEIOU]/)
 * - Rejects 3+ consecutive identical characters (/(.)\1{2,}/i)
 * - Rejects keyboard-mash / random gibberish (e.g., asdfgh, qwerty, zxcvbn, 5+ consecutive consonants)
 */
export function validateBusinessName(raw) {
    const val = String(raw || '').trim();
    if (!val) {
        return { valid: false, message: 'Business name is required.' };
    }
    if (val.length < 2 || val.length > 80) {
        return { valid: false, message: 'Business name must be between 2 and 80 characters.' };
    }
    if (!/^[A-Za-z0-9\s.,\-&'()/]+$/.test(val)) {
        return { valid: false, message: 'Only letters, numbers, spaces, and standard punctuation.' };
    }
    if (!/[A-Za-z]/.test(val) || !/[aeiouAEIOU]/.test(val)) {
        return { valid: false, message: 'Business name must contain real words with at least one vowel.' };
    }
    if (/(.)\1{2,}/i.test(val)) {
        return { valid: false, message: 'Excessive consecutive repeating characters (e.g., "aaa" or "---") are not allowed.' };
    }
    const lettersOnly = val.replace(/[^A-Za-z]/g, '').toLowerCase();
    const keyboardMashPattern = /(asdf|sdfg|dfgh|fghj|ghjk|hjkl|qwer|wert|erty|rtyu|tyui|yuio|uiop|zxcv|xcvb|cvbn|vbnm)/i;
    if (keyboardMashPattern.test(lettersOnly)) {
        return { valid: false, message: 'Please enter a legitimate business name (keyboard sequences like "asdf" or "qwerty" are not allowed).' };
    }
    if (/[bcdfghjklmnpqrstvwxyz]{5,}/i.test(lettersOnly)) {
        return { valid: false, message: 'Please enter a legitimate business name (random consonant strings are not allowed).' };
    }
    if (lettersOnly.length >= 6 && /([a-z]{2})\1{2,}/i.test(lettersOnly)) {
        return { valid: false, message: 'Please enter a legitimate business name without repetitive character patterns.' };
    }
    return { valid: true, message: '' };
}

/**
 * Strict Philippine Contact Number Validator (+639XXXXXXXXX)
 */
export function validatePhContactNumber(raw) {
    const val = String(raw || '').trim();
    if (!val || val === '+63') {
        return { valid: false, message: 'Contact number is required.' };
    }
    if (!/^\+639\d{9}$/.test(val)) {
        return { valid: false, message: 'Enter a valid 10-digit Philippine mobile number starting with 9 (e.g., 9171234567).' };
    }
    return { valid: true, message: '' };
}

/**
 * Custom Category ("Others") Validator
 */
export function validateCustomCategory(raw) {
    const val = String(raw || '').trim();
    if (!val) {
        return { valid: false, message: 'Please specify what your business serves.' };
    }
    if (val.length < 2 || val.length > 40) {
        return { valid: false, message: 'Category description must be between 2 and 40 characters.' };
    }
    if (!/^[A-Za-z0-9\s.,\-&'()/]+$/.test(val) || !/[aeiouAEIOU]/.test(val) || /(.)\1{2,}/i.test(val)) {
        return { valid: false, message: 'Please enter a valid business category (e.g., Pet Supplies, Printing Shop).' };
    }
    const lettersOnly = val.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (/(asdf|sdfg|dfgh|qwer|wert|erty|zxcv|xcvb)/i.test(lettersOnly) || /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(lettersOnly)) {
        return { valid: false, message: 'Please enter a legitimate category description.' };
    }
    return { valid: true, message: '' };
}

export class RegisterWizard {
    constructor({ auth, db, containerEl, user = null }) {
        this.auth = auth;
        this.db = db;
        this.containerEl = containerEl;
        this.currentUser = user;

        this.currentStep = 'store';
        this.editingFromReview = false;
        this.reverseGeocodeAbort = null;

        this.formData = {
            logoFile: null,
            logoUrl: '',
            logoPreviewUrl: '',
            frontPhotoFile: null,
            thumbnailUrl: '',
            photoPreviewUrl: '',
            name: '',
            categoryKey: '',
            category: '',
            customCategory: '',
            description: '',
            contactNumber: '',
            offerings: [],
            location: { lat: 14.20415, lng: 121.15691 },
            barangay: 'Uno',
            address: '',
            landmark: '',
            openHours: window.CalzadaBusinessFields?.getDefaultHours() || {
                mon: [{ open: '08:00', close: '17:00' }],
                tue: [{ open: '08:00', close: '17:00' }],
                wed: [{ open: '08:00', close: '17:00' }],
                thu: [{ open: '08:00', close: '17:00' }],
                fri: [{ open: '08:00', close: '17:00' }],
                sat: [{ open: '08:00', close: '17:00' }],
                sun: []
            },
            plan: (Object.values(window.CALZADA_PLANS || {}).find(p => p.recommended) || {}).id || 'plus360',
            termsAgreed: false
        };

        this.autosaveTimer = null;
        this.saveStatusEl = null;
        this.isSubmitted = false;
        this.map = null;
        this.marker = null;
        this.offeringsEditor = null;
        this.hoursEditor = null;

        const urlParams = new URLSearchParams(window.location.search);
        const queryPlan = urlParams.get('plan');
        if (queryPlan && ['listed', 'plus360', 'featured'].includes(queryPlan)) {
            this.formData.plan = queryPlan;
        }
    }

    async init() {
        this.currentUser = this.currentUser || this.auth.currentUser;
        this.renderLayout();
        this.wireHashRouting();

        if (this.currentUser) {
            await this.loadDraft();
        }

        const hash = window.location.hash.replace('#', '');
        this._initializing = true;
        if (STEPS.includes(hash)) {
            this.goToStep(hash, false);
        } else {
            this.goToStep(this.currentStep, false);
        }
        this._initializing = false;
        if (this._resumed) this.setSaveStatus('Draft restored');

        this.updateLivePreview();
    }

    getCategoryMeta() {
        const found = CALAMBA_CATEGORIES.find(c => c.key === this.formData.categoryKey)
            || CALAMBA_CATEGORIES.find(c => c.key === this.formData.category);
        if (!found) {
            return { key: '', label: 'Category', firestoreCat: '', serviceType: null };
        }
        if (found.key === 'others') {
            const custom = (this.formData.customCategory || '').trim();
            return {
                key: 'others',
                label: custom ? `Others — ${custom}` : 'Others',
                firestoreCat: 'establishments',
                serviceType: custom || null
            };
        }
        return found;
    }

    renderLayout() {
        this.containerEl.innerHTML = `
            <div class="wizard-root max-w-6xl mx-auto px-4 py-6">
                <!-- Stepper Header -->
                <div class="wizard-stepper mb-6 bg-white border border-slate-200 rounded-xl p-4 md:px-6 md:py-4">
                    <!-- Desktop / Tablet Stepper -->
                    <div class="stepper-desktop hidden md:flex justify-between items-center gap-2">
                        ${STEPS.map((stepKey, idx) => `
                            <button type="button" class="step-item step-item-${stepKey} flex items-center gap-2.5 bg-transparent border-0 p-1 cursor-pointer text-left min-h-[44px]" data-step-target="${stepKey}">
                                <span class="step-num w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 border-slate-200 text-slate-500 shrink-0">
                                    ${idx + 1}
                                </span>
                                <span class="step-label text-sm font-semibold text-slate-500 whitespace-nowrap">${STEP_TITLES[stepKey].title}</span>
                            </button>
                            ${idx < STEPS.length - 1 ? '<div class="flex-1 h-px bg-slate-200 mx-2"></div>' : ''}
                        `).join('')}
                    </div>

                    <!-- Mobile / Phone Stepper -->
                    <div class="stepper-phone md:hidden">
                        <div class="flex justify-between items-center mb-2 gap-2">
                            <span id="phoneStepTitle" class="text-sm font-bold text-[#042C53]">Step 1 of 5 · Business Info</span>
                            <span id="wizardSaveStatus" class="wizard-save-status text-xs text-slate-500" aria-live="polite"></span>
                        </div>
                        <div class="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div id="phoneProgressBar" class="h-full bg-[#378ADD] transition-all duration-300" style="width: 20%;"></div>
                        </div>
                    </div>

                    <div class="stepper-status-bar mt-2.5 pt-2.5 border-t border-slate-100 flex justify-between items-center gap-3">
                        <span id="stepBenefitText" class="text-xs md:text-sm text-slate-500">${STEP_TITLES[this.currentStep].benefit}</span>
                        <span id="desktopSaveStatus" class="wizard-save-status wizard-save-desktop hidden md:inline text-xs text-slate-500 shrink-0" aria-live="polite"></span>
                    </div>
                </div>

                <!-- Main Content Grid: Form Left, Live Preview Right on Desktop -->
                <div class="wizard-grid grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    <!-- Step Form Container -->
                    <div class="wizard-form-card lg:col-span-8 bg-white border border-slate-200 rounded-xl p-4 sm:p-6">
                        <div id="editingFromReviewBanner" style="display: none;" class="mb-5 p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 flex-wrap">
                            <span class="text-xs font-medium text-[#042C53]">Editing section from Review &amp; Submit. Your other steps remain saved.</span>
                            <button type="button" id="btnCancelReturnReview" class="text-xs font-semibold text-[#378ADD] bg-transparent border-0 cursor-pointer underline min-h-[36px] px-2">
                                Return to Review
                            </button>
                        </div>

                        <div id="stepContentArea"></div>

                        <!-- Global Stage Navigation Buttons (Back & Continue on ALL stages, no arrows) -->
                        <div class="wizard-nav-bar flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 mt-6 pt-5 border-t border-slate-200">
                            <button type="button" id="btnWizardPrev" class="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-[#042C53] cursor-pointer hover:bg-slate-50 transition-colors">
                                Back
                            </button>
                            <button type="button" id="btnWizardNext" class="w-full sm:w-auto min-h-[44px] px-6 py-2.5 bg-[#378ADD] hover:bg-[#1F69B8] border-0 rounded-lg text-sm font-semibold text-white cursor-pointer transition-colors">
                                Continue
                            </button>
                        </div>
                    </div>

                    <!-- Live Preview Card (Right Column on Desktop) -->
                    <div class="wizard-preview-col lg:col-span-4 hidden lg:block">
                        <div class="sticky top-20">
                            <div class="flex justify-between items-center mb-2">
                                <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">Places Preview</span>
                                <span class="text-xs text-[#378ADD] font-semibold">Updates live</span>
                            </div>
                            <div id="placesLiveCard" class="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                <div style="position: relative; width: 100%; padding-top: 68%; background: #F1F5F9; overflow: hidden;">
                                    <img id="prevImg" src="" alt="Store preview" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: none;" />
                                    <div id="prevImgPlaceholder" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #94A3B8; font-size: 13px;">
                                        4:3 Store Front Photo
                                    </div>
                                </div>
                                <div class="p-4">
                                    <div class="flex items-center gap-3 mb-2">
                                        <div id="prevLogoWrap" class="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 font-bold text-sm text-[#042C53]">
                                            <img id="prevLogoImg" src="" alt="Logo" style="width: 100%; height: 100%; object-fit: cover; display: none;" />
                                            <span id="prevLogoInitial">B</span>
                                        </div>
                                        <div class="min-w-0 flex-1">
                                            <div class="flex items-baseline gap-2">
                                                <h3 id="prevName" class="font-bold text-base text-[#042C53] truncate m-0" style="font-family: 'Sora', sans-serif;">Business Name</h3>
                                                <span id="prevNewLabel" class="text-xs font-semibold text-[#378ADD] shrink-0">New</span>
                                            </div>
                                            <div id="prevCategoryText" class="text-xs text-slate-500 truncate">Category</div>
                                        </div>
                                    </div>
                                    <div id="prevBarangay" class="text-xs text-slate-500 mb-1.5">Brgy. Uno, Calamba</div>
                                    <div id="prevOpenStatus" class="text-xs font-semibold text-emerald-600 mb-2.5">Open now · Closes 5:00 PM</div>
                                    <div id="prevOfferings" class="text-xs text-[#042C53] leading-relaxed">Offerings &amp; Specialties</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Mobile Bottom Floating Preview Button -->
                <button type="button" id="btnOpenPhonePreview" class="lg:hidden" style="position: fixed; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); right: 16px; z-index: 90; min-height: 44px; background: #042C53; color: #FFFFFF; border: 1px solid #042C53; border-radius: 8px; padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;">
                    Preview Card
                </button>
            </div>
        `;

        this.saveStatusEls = Array.from(this.containerEl.querySelectorAll('.wizard-save-status'));
        this.saveStatusEl = { set textContent(v) { this._t = v; } };

        const cancelReturnBtn = this.containerEl.querySelector('#btnCancelReturnReview');
        if (cancelReturnBtn) {
            cancelReturnBtn.addEventListener('click', () => {
                if (this.validateStep(this.currentStep, { showErrors: true })) {
                    this.editingFromReview = false;
                    this.goToStep('review', true);
                }
            });
        }

        // Stepper header clicks
        STEPS.forEach(stepKey => {
            const item = this.containerEl.querySelector(`.step-item-${stepKey}`);
            if (item) {
                item.addEventListener('click', () => {
                    const targetIdx = STEPS.indexOf(stepKey);
                    const currentIdx = STEPS.indexOf(this.currentStep);
                    if (targetIdx < currentIdx) {
                        this.goToStep(stepKey, true);
                    } else if (targetIdx > currentIdx) {
                        if (this.validateStep(this.currentStep, { showErrors: true })) {
                            this.goToStep(stepKey, true);
                        }
                    }
                });
            }
        });

        // Back button handler (present on ALL stages)
        this.containerEl.querySelector('#btnWizardPrev').addEventListener('click', () => {
            if (this.editingFromReview && this.currentStep !== 'review') {
                this.editingFromReview = false;
                this.goToStep('review', true);
                return;
            }
            const currentIdx = STEPS.indexOf(this.currentStep);
            if (currentIdx > 0) {
                this.goToStep(STEPS[currentIdx - 1], true);
            } else {
                // Stage 1 Back button: navigate back to My Business or previous page
                if (document.referrer && document.referrer.includes(window.location.origin)) {
                    window.history.back();
                } else {
                    window.location.href = '/my-business';
                }
            }
        });

        // Continue / Submit button handler (always clickable; shows inline errors if invalid)
        this.containerEl.querySelector('#btnWizardNext').addEventListener('click', () => {
            const isValid = this.validateStep(this.currentStep, { showErrors: true, scrollToError: true });
            if (!isValid) return;

            if (this.editingFromReview && this.currentStep !== 'review') {
                this.editingFromReview = false;
                this.goToStep('review', true);
                return;
            }

            const currentIdx = STEPS.indexOf(this.currentStep);
            if (currentIdx < STEPS.length - 1) {
                this.goToStep(STEPS[currentIdx + 1], true);
            } else if (this.currentStep === 'review') {
                this.submitRegistration();
            }
        });
    }

    wireHashRouting() {
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '');
            if (STEPS.includes(hash) && hash !== this.currentStep) {
                this._fromHashChange = true;
                this.goToStep(hash, false);
                this._fromHashChange = false;
            }
        });
    }

    firstOpenStep() {
        return STEPS.slice(0, -1).find(k => !this.isStepValid(k)) || 'review';
    }

    goToStep(stepKey, updateHash = true) {
        if (!STEPS.includes(stepKey)) stepKey = 'store';
        const requested = stepKey;
        if (!this.editingFromReview) {
            const limit = STEPS.indexOf(this.firstOpenStep());
            if (STEPS.indexOf(stepKey) > limit) stepKey = STEPS[limit];
        }
        if (stepKey === 'review') {
            this.editingFromReview = false;
        }
        this.currentStep = stepKey;
        const target = '#' + stepKey;
        if (window.location.hash !== target) {
            if (updateHash && requested === stepKey && !this._fromHashChange) history.pushState(null, '', target);
            else history.replaceState(null, '', target);
        }

        const banner = this.containerEl.querySelector('#editingFromReviewBanner');
        if (banner) {
            banner.style.display = (this.editingFromReview && this.currentStep !== 'review') ? 'flex' : 'none';
        }

        this.updateStepperUI();
        this.renderStepContent();
        this.updateNavButtons();
        this.updateLivePreview();
        this.triggerAutosave();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    updateStepperUI() {
        const currentIdx = STEPS.indexOf(this.currentStep);

        STEPS.forEach((stepKey, idx) => {
            const item = this.containerEl.querySelector(`.step-item-${stepKey}`);
            if (!item) return;
            const numEl = item.querySelector('.step-num');
            const labelEl = item.querySelector('.step-label');

            if (idx === currentIdx) {
                numEl.style.borderColor = '#378ADD';
                numEl.style.color = '#FFFFFF';
                numEl.style.background = '#378ADD';
                numEl.textContent = String(idx + 1);
                labelEl.style.color = '#378ADD';
                labelEl.style.fontWeight = '700';
            } else if (this.isStepValid(stepKey) && (idx < currentIdx || this.editingFromReview)) {
                numEl.style.borderColor = '#16A34A';
                numEl.style.color = '#FFFFFF';
                numEl.style.background = '#16A34A';
                numEl.innerHTML = '&#10003;';
                labelEl.style.color = '#042C53';
                labelEl.style.fontWeight = '600';
            } else {
                numEl.style.borderColor = '#CBD5E1';
                numEl.style.color = '#64748B';
                numEl.style.background = '#FFFFFF';
                numEl.textContent = String(idx + 1);
                labelEl.style.color = '#64748B';
                labelEl.style.fontWeight = '500';
            }
        });

        const phoneTitle = this.containerEl.querySelector('#phoneStepTitle');
        if (phoneTitle) {
            phoneTitle.textContent = `Step ${currentIdx + 1} of 5 · ${STEP_TITLES[this.currentStep].title}`;
        }
        const phoneBar = this.containerEl.querySelector('#phoneProgressBar');
        if (phoneBar) {
            phoneBar.style.width = `${((currentIdx + 1) / STEPS.length) * 100}%`;
        }

        const benefitEl = this.containerEl.querySelector('#stepBenefitText');
        if (benefitEl) {
            benefitEl.textContent = STEP_TITLES[this.currentStep].benefit;
        }
    }

    updateNavButtons() {
        const prevBtn = this.containerEl.querySelector('#btnWizardPrev');
        const nextBtn = this.containerEl.querySelector('#btnWizardNext');
        if (!prevBtn || !nextBtn) return;

        // Every stage has 'Back' and 'Continue' buttons at the bottom (no arrows)
        prevBtn.style.display = 'inline-flex';
        prevBtn.style.alignItems = 'center';
        prevBtn.style.justifyContent = 'center';
        prevBtn.textContent = 'Back';

        nextBtn.disabled = false;
        nextBtn.style.opacity = '1';
        nextBtn.style.cursor = 'pointer';

        if (this.currentStep === 'review') {
            nextBtn.textContent = 'Submit Registration';
        } else if (this.editingFromReview) {
            nextBtn.textContent = 'Continue';
        } else {
            nextBtn.textContent = 'Continue';
        }
    }

    validateCurrentStepButton() {
        // Keep button enabled so clicking Continue always provides explicit inline error feedback
        this.updateStepperUI();
    }

    setFieldError(inputEl, errEl, message) {
        if (errEl) {
            if (message) {
                errEl.textContent = message;
                errEl.style.display = 'block';
            } else {
                errEl.style.display = 'none';
            }
        }
        if (inputEl) {
            inputEl.style.borderColor = message ? '#DC2626' : '#CBD5E1';
        }
    }

    isStepValid(stepKey) {
        return this.validateStep(stepKey, { showErrors: false });
    }

    validateStep(stepKey, { showErrors = false, scrollToError = false } = {}) {
        const area = this.containerEl.querySelector('#stepContentArea');
        let firstInvalidEl = null;
        const markInvalid = (el) => {
            if (!firstInvalidEl && el) firstInvalidEl = el;
        };

        if (stepKey === 'store') {
            const hasLogo = !!this.formData.logoUrl || !!this.formData.logoFile;
            const hasPhoto = !!this.formData.thumbnailUrl || !!this.formData.frontPhotoFile;
            const nameCheck = validateBusinessName(this.formData.name);
            const hasCat = !!this.formData.categoryKey;
            const customCatCheck = this.formData.categoryKey === 'others'
                ? validateCustomCategory(this.formData.customCategory)
                : { valid: true, message: '' };
            const phoneCheck = validatePhContactNumber(this.formData.contactNumber);
            const hasOfferings = Array.isArray(this.formData.offerings) && this.formData.offerings.length >= 1 && this.formData.offerings.length <= 10;

            if (showErrors && area) {
                const logoBox = area.querySelector('#logoPreviewBox');
                const logoErr = area.querySelector('#logoError');
                this.setFieldError(logoBox, logoErr, hasLogo ? '' : 'Business logo is required. Please upload a PNG, JPG, or WebP image.');
                if (!hasLogo) markInvalid(area.querySelector('#btnSelectLogo'));

                const frontBox = area.querySelector('#frontPhotoBox');
                const frontErr = area.querySelector('#frontPhotoError');
                this.setFieldError(frontBox, frontErr, hasPhoto ? '' : 'Storefront photo is required.');
                if (!hasPhoto) markInvalid(area.querySelector('#btnSelectFrontPhoto'));

                const nameInput = area.querySelector('#inputBizName');
                const nameErr = area.querySelector('#bizNameError');
                this.setFieldError(nameInput, nameErr, nameCheck.valid ? '' : nameCheck.message);
                if (!nameCheck.valid) markInvalid(nameInput);

                const catSelect = area.querySelector('#selectBizCategory');
                const catErr = area.querySelector('#bizCategoryError');
                this.setFieldError(catSelect, catErr, hasCat ? '' : 'Please select a business category.');
                if (!hasCat) markInvalid(catSelect);

                if (this.formData.categoryKey === 'others') {
                    const customInput = area.querySelector('#inputCustomCategory');
                    const customErr = area.querySelector('#customCategoryError');
                    this.setFieldError(customInput, customErr, customCatCheck.valid ? '' : customCatCheck.message);
                    if (!customCatCheck.valid) markInvalid(customInput);
                }

                const contactInput = area.querySelector('#inputBizContact');
                const contactGroup = area.querySelector('#contactInputGroup') || contactInput;
                const contactErr = area.querySelector('#bizContactError');
                this.setFieldError(contactGroup, contactErr, phoneCheck.valid ? '' : phoneCheck.message);
                if (!phoneCheck.valid) markInvalid(contactInput);

                const offBox = area.querySelector('.offerings-editor-box');
                const offErr = area.querySelector('#offeringsError');
                this.setFieldError(offBox, offErr, hasOfferings ? '' : 'Please add at least 1 offering or specialty (press Enter or comma after typing).');
                if (!hasOfferings) markInvalid(area.querySelector('#offeringsTextInput') || offBox);
            }

            if (scrollToError && firstInvalidEl) {
                firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (typeof firstInvalidEl.focus === 'function') firstInvalidEl.focus();
            }

            return hasLogo && hasPhoto && nameCheck.valid && hasCat && customCatCheck.valid && phoneCheck.valid && hasOfferings;
        }

        if (stepKey === 'location') {
            const inCoverage = this.isInCoverage(this.formData.location.lat, this.formData.location.lng);
            const hasBrgy = ['Uno', 'Real', 'Halang'].includes(this.formData.barangay);
            const detectedBrgy = detectBarangay(this.formData.location.lat, this.formData.location.lng);
            const brgyPinSynced = hasBrgy && detectedBrgy === this.formData.barangay;
            const addrTrimmed = (this.formData.address || '').trim();
            const hasAddress = addrTrimmed.length >= 3 && addrTrimmed.length <= 160;

            if (showErrors && area) {
                const mapEl = area.querySelector('#wizardMapContainer');
                const mapErr = area.querySelector('#mapCoverageError');
                if (!inCoverage) {
                    this.setFieldError(mapEl, mapErr, 'Your map pin must be dropped inside Brgy. Uno, Real, or Halang.');
                    markInvalid(mapEl);
                } else if (hasBrgy && !brgyPinSynced) {
                    this.setFieldError(mapEl, mapErr, `Your map pin is currently in Brgy. ${detectedBrgy}, which does not match the selected Brgy. ${this.formData.barangay}. Move the pin or update the Barangay dropdown.`);
                    markInvalid(mapEl);
                } else {
                    this.setFieldError(mapEl, mapErr, '');
                }

                const addrInput = area.querySelector('#inputAddress');
                const addrErr = area.querySelector('#addressError');
                this.setFieldError(addrInput, addrErr, hasAddress ? '' : 'Please enter your House No., Building, or Street name (at least 3 characters).');
                if (!hasAddress) markInvalid(addrInput);

                const brgySelect = area.querySelector('#selectBarangay');
                const brgyErr = area.querySelector('#barangayError');
                this.setFieldError(brgySelect, brgyErr, hasBrgy ? '' : 'Please select a Barangay (Uno, Real, or Halang).');
                if (!hasBrgy) markInvalid(brgySelect);
            }

            if (scrollToError && firstInvalidEl) {
                firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (typeof firstInvalidEl.focus === 'function') firstInvalidEl.focus();
            }

            return inCoverage && hasBrgy && brgyPinSynced && hasAddress;
        }

        if (stepKey === 'hours') {
            const check = window.CalzadaBusinessFields?.isValidOpenHours;
            const valid = check ? check(this.formData.openHours) : (!!this.formData.openHours && typeof this.formData.openHours === 'object');
            if (showErrors && !valid && area) {
                const globalErr = area.querySelector('#hoursGlobalError');
                if (globalErr) {
                    globalErr.textContent = 'Please ensure at least one day is toggled Open and all closing times are later than opening times.';
                    globalErr.style.display = 'block';
                    globalErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
            return valid;
        }

        if (stepKey === 'plan') {
            const valid = ['listed', 'plus360', 'featured'].includes(this.formData.plan);
            if (showErrors && area) {
                const planErr = area.querySelector('#planStepError');
                if (planErr) planErr.style.display = valid ? 'none' : 'block';
            }
            return valid;
        }

        if (stepKey === 'review') {
            const storeOk = this.validateStep('store');
            const locOk = this.validateStep('location');
            const hoursOk = this.validateStep('hours');
            const planOk = this.validateStep('plan');
            const termsOk = this.formData.termsAgreed === true;

            if (showErrors && area) {
                const termsErr = area.querySelector('#termsError');
                if (termsErr) {
                    termsErr.style.display = termsOk ? 'none' : 'block';
                }
                const submitErr = area.querySelector('#submitErrorMessage');
                if (!storeOk || !locOk || !hoursOk || !planOk) {
                    if (submitErr) {
                        submitErr.textContent = 'Some required fields in earlier steps are incomplete or invalid. Click "Edit" on the highlighted section above to fix them.';
                        submitErr.style.display = 'block';
                    }
                } else if (submitErr && !termsOk) {
                    submitErr.style.display = 'none';
                }
            }

            return termsOk && storeOk && locOk && hoursOk && planOk;
        }

        return true;
    }

    isInCoverage(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number') return false;
        if (window.CalzadaScope && typeof window.CalzadaScope.contains === 'function') {
            return window.CalzadaScope.contains(lat, lng);
        }
        return lat >= COVERAGE_BBOX.minLat && lat <= COVERAGE_BBOX.maxLat &&
               lng >= COVERAGE_BBOX.minLng && lng <= COVERAGE_BBOX.maxLng;
    }

    renderStepContent() {
        const area = this.containerEl.querySelector('#stepContentArea');
        if (!area) return;

        if (this.currentStep === 'store') {
            this.renderStoreStep(area);
        } else if (this.currentStep === 'location') {
            this.renderLocationStep(area);
        } else if (this.currentStep === 'hours') {
            this.renderHoursStep(area);
        } else if (this.currentStep === 'plan') {
            this.renderPlanStep(area);
        } else if (this.currentStep === 'review') {
            this.renderReviewStep(area);
        }
    }

    renderStoreStep(area) {
        const logoSrc = this.formData.logoPreviewUrl || this.formData.logoUrl || '';
        const frontSrc = this.formData.photoPreviewUrl || this.formData.thumbnailUrl || '';
        const isOthers = this.formData.categoryKey === 'others';

        area.innerHTML = `
            <div class="flex flex-col gap-5">
                <div>
                    <h2 class="text-lg font-bold text-[#042C53] m-0" style="font-family: 'Sora', sans-serif;">Stage 1: Business Information</h2>
                    <p class="text-xs sm:text-sm text-slate-500 mt-1">Provide your official business name, category, Philippine mobile number, and store media.</p>
                </div>

                <!-- Media Uploads: Business Logo + Storefront Photo (Responsive Grid) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <!-- Required Business Logo Upload -->
                    <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                        <label class="block font-semibold text-sm text-[#042C53] mb-2">
                            Business Logo <span class="text-red-600">*</span>
                        </label>
                        <div class="flex items-center gap-3.5">
                            <div id="logoPreviewBox" class="w-16 h-16 rounded-xl border border-slate-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
                                <img id="logoPreviewImg" src="${this.escapeHtml(logoSrc)}" alt="Business Logo Preview" style="width: 100%; height: 100%; object-fit: cover; display: ${logoSrc ? 'block' : 'none'};" />
                                <span id="logoPreviewEmpty" class="text-[11px] text-slate-400 text-center px-1" style="display: ${logoSrc ? 'none' : 'block'};">1:1 Logo</span>
                            </div>
                            <div class="min-w-0 flex-1">
                                <input type="file" id="logoFileInput" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                                <button type="button" id="btnSelectLogo" class="min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold text-[#042C53] cursor-pointer hover:border-[#378ADD] transition-colors">
                                    ${logoSrc ? 'Change logo' : 'Upload logo'}
                                </button>
                                <div class="text-xs text-slate-500 mt-1">Square brand logo or icon (JPG, PNG, WebP).</div>
                            </div>
                        </div>
                        <div id="logoError" class="text-xs text-red-600 mt-2 font-medium" style="display: none;"></div>
                    </div>

                    <!-- Required Storefront Photo Upload -->
                    <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                        <label class="block font-semibold text-sm text-[#042C53] mb-2">
                            Storefront Photo <span class="text-red-600">*</span>
                        </label>
                        <div class="flex items-center gap-3.5">
                            <div id="frontPhotoBox" class="w-20 h-16 rounded-xl border border-slate-300 bg-white overflow-hidden flex items-center justify-center shrink-0">
                                <img id="frontPhotoImg" src="${this.escapeHtml(frontSrc)}" alt="Storefront Preview" style="width: 100%; height: 100%; object-fit: cover; display: ${frontSrc ? 'block' : 'none'};" />
                                <span id="frontPhotoEmpty" class="text-[11px] text-slate-400 text-center px-1" style="display: ${frontSrc ? 'none' : 'block'};">4:3 Photo</span>
                            </div>
                            <div class="min-w-0 flex-1">
                                <input type="file" id="frontPhotoFileInput" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                                <button type="button" id="btnSelectFrontPhoto" class="min-h-[44px] px-3.5 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold text-[#042C53] cursor-pointer hover:border-[#378ADD] transition-colors">
                                    ${frontSrc ? 'Change photo' : 'Choose photo'}
                                </button>
                                <div class="text-xs text-slate-500 mt-1">Clear exterior view so commuters recognize your store.</div>
                            </div>
                        </div>
                        <div id="frontPhotoError" class="text-xs text-red-600 mt-2 font-medium" style="display: none;"></div>
                    </div>
                </div>

                <!-- Business Name & Category Row -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="inputBizName" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                            Business Name <span class="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            id="inputBizName"
                            value="${this.escapeHtml(this.formData.name)}"
                            maxlength="80"
                            placeholder="e.g. Lola Nena's Eatery & Grill"
                            class="cz-input w-full min-h-[44px] border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53]"
                        />
                        <div id="bizNameError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                    </div>

                    <div>
                        <label for="selectBizCategory" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                            Category <span class="text-red-600">*</span>
                        </label>
                        <select
                            id="selectBizCategory"
                            class="cz-input w-full min-h-[44px] border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53] bg-white"
                        >
                            <option value="" ${this.formData.categoryKey ? '' : 'selected'} disabled>Select a category</option>
                            ${CALAMBA_CATEGORIES.map(c => `
                                <option value="${c.key}" ${this.formData.categoryKey === c.key ? 'selected' : ''}>${this.escapeHtml(c.label)}</option>
                            `).join('')}
                        </select>
                        <div id="bizCategoryError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                    </div>
                </div>

                <!-- Dynamic "Others" Category Specification -->
                <div id="othersCategoryWrap" style="display: ${isOthers ? 'block' : 'none'};" class="p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <label for="inputCustomCategory" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                        What does your business serve or offer? <span class="text-red-600">*</span>
                    </label>
                    <input
                        type="text"
                        id="inputCustomCategory"
                        value="${this.escapeHtml(this.formData.customCategory)}"
                        maxlength="40"
                        placeholder="e.g. Veterinary Clinic & Pet Grooming, Printing & Photocopy Services"
                        class="cz-input w-full min-h-[44px] border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53] bg-white"
                    />
                    <div class="text-xs text-slate-500 mt-1">Specify your exact business type (2–40 characters).</div>
                    <div id="customCategoryError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                </div>

                <!-- Contact Number (+639XXXXXXXXX with fixed +63 prefix) -->
                <div>
                    <label for="inputBizContact" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                        Contact Number <span class="text-red-600">*</span>
                    </label>
                    <div id="contactInputGroup" class="flex items-stretch border border-slate-300 rounded-lg overflow-hidden bg-white transition-colors" style="min-height: 44px;">
                        <span class="inline-flex items-center px-3.5 bg-slate-100 border-r border-slate-300 text-sm font-semibold text-[#042C53] select-none">+63</span>
                        <input
                            type="tel"
                            id="inputBizContact"
                            value="${this.escapeHtml((this.formData.contactNumber || '').replace(/^\+?63/, '').replace(/^0/, ''))}"
                            maxlength="10"
                            inputmode="numeric"
                            pattern="[0-9]*"
                            placeholder="9171234567"
                            class="w-full min-h-[44px] border-0 px-3.5 py-2.5 text-sm text-[#042C53] focus:outline-none"
                        />
                    </div>
                    <div id="bizContactError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                </div>

                <!-- Offerings & Specialties -->
                <div>
                    <label class="block font-semibold text-sm text-[#042C53] mb-1.5">
                        Offerings &amp; Specialties <span class="text-red-600">*</span>
                    </label>
                    <div id="offeringsEditorMount"></div>
                    <div id="offeringsError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                </div>

                <!-- Short Description -->
                <div>
                    <label for="inputBizDesc" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                        Short Description <span class="font-normal text-slate-500">(optional)</span>
                    </label>
                    <textarea
                        id="inputBizDesc"
                        maxlength="500"
                        rows="3"
                        placeholder="Tell commuters what makes your business helpful or worth visiting..."
                        class="cz-input w-full border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53]"
                    >${this.escapeHtml(this.formData.description)}</textarea>
                </div>
            </div>
        `;

        // 1. Wire Business Logo Upload
        const logoInput = area.querySelector('#logoFileInput');
        const btnLogo = area.querySelector('#btnSelectLogo');
        btnLogo.addEventListener('click', () => logoInput.click());

        logoInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const logoBox = area.querySelector('#logoPreviewBox');
            const errEl = area.querySelector('#logoError');
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
                this.setFieldError(logoBox, errEl, 'Please upload a JPG, PNG, or WebP image for your logo.');
                return;
            }
            this.setFieldError(logoBox, errEl, '');
            const comp = window.CalzadaBusinessFields?.compressImageFile || ((f) => f);
            const compressed = await comp(file, { maxSide: 512, quality: 0.86, maxBytes: 400 * 1024 });
            if (this.formData.logoPreviewUrl) URL.revokeObjectURL(this.formData.logoPreviewUrl);
            this.formData.logoPreviewUrl = URL.createObjectURL(compressed);
            this.formData.logoFile = compressed;
            this.formData.logoUrl = '';

            const img = area.querySelector('#logoPreviewImg');
            const empty = area.querySelector('#logoPreviewEmpty');
            img.src = this.formData.logoPreviewUrl;
            img.style.display = 'block';
            empty.style.display = 'none';
            this.updateLivePreview();
            this.validateCurrentStepButton();

            btnLogo.disabled = true;
            btnLogo.textContent = 'Uploading...';
            try {
                this.formData.logoUrl = await this.uploadBusinessMedia(compressed, 'logo');
                this.formData.logoFile = null;
                this.triggerAutosave();
            } catch (upErr) {
                this.setFieldError(logoBox, errEl, upErr.message || 'Could not upload logo. It will retry on submission.');
            } finally {
                btnLogo.disabled = false;
                btnLogo.textContent = 'Change logo';
                this.validateCurrentStepButton();
            }
        });

        // 2. Wire Storefront Photo Upload
        const fileInput = area.querySelector('#frontPhotoFileInput');
        const btnPhoto = area.querySelector('#btnSelectFrontPhoto');
        btnPhoto.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const frontBox = area.querySelector('#frontPhotoBox');
            const errEl = area.querySelector('#frontPhotoError');
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
                this.setFieldError(frontBox, errEl, 'Please upload a JPG, PNG, or WebP photo.');
                return;
            }
            this.setFieldError(frontBox, errEl, '');
            const comp = window.CalzadaBusinessFields?.compressImageFile || ((f) => f);
            const compressed = await comp(file);
            if (this.formData.photoPreviewUrl) URL.revokeObjectURL(this.formData.photoPreviewUrl);
            this.formData.photoPreviewUrl = URL.createObjectURL(compressed);
            this.formData.frontPhotoFile = compressed;
            this.formData.thumbnailUrl = '';

            const img = area.querySelector('#frontPhotoImg');
            const empty = area.querySelector('#frontPhotoEmpty');
            img.src = this.formData.photoPreviewUrl;
            img.style.display = 'block';
            empty.style.display = 'none';
            this.updateLivePreview();
            this.validateCurrentStepButton();

            btnPhoto.disabled = true;
            btnPhoto.textContent = 'Uploading...';
            try {
                this.formData.thumbnailUrl = await this.uploadBusinessMedia(compressed, 'front');
                this.formData.frontPhotoFile = null;
                this.triggerAutosave();
            } catch (upErr) {
                this.setFieldError(frontBox, errEl, upErr.message || 'The photo could not be uploaded. Try again.');
            } finally {
                btnPhoto.disabled = false;
                btnPhoto.textContent = 'Change photo';
                this.validateCurrentStepButton();
            }
        });

        // 3. Wire Business Name with live inline validation
        const nameInput = area.querySelector('#inputBizName');
        const nameErr = area.querySelector('#bizNameError');
        const checkNameInline = () => {
            this.formData.name = nameInput.value;
            const res = validateBusinessName(this.formData.name);
            this.setFieldError(nameInput, nameErr, res.valid ? '' : res.message);
            this.updateLivePreview();
            this.validateCurrentStepButton();
            this.triggerAutosave();
        };
        nameInput.addEventListener('input', checkNameInline);
        nameInput.addEventListener('blur', checkNameInline);

        // 4. Wire Category & Others input
        const catSelect = area.querySelector('#selectBizCategory');
        const catErr = area.querySelector('#bizCategoryError');
        const othersWrap = area.querySelector('#othersCategoryWrap');
        const customInput = area.querySelector('#inputCustomCategory');
        const customErr = area.querySelector('#customCategoryError');

        catSelect.addEventListener('change', (e) => {
            const val = e.target.value;
            this.formData.categoryKey = val;
            const meta = this.getCategoryMeta();
            this.formData.category = meta.firestoreCat;
            this.setFieldError(catSelect, catErr, val ? '' : 'Please select a business category.');

            if (val === 'others') {
                othersWrap.style.display = 'block';
                if (customInput) customInput.focus();
            } else {
                othersWrap.style.display = 'none';
                this.setFieldError(customInput, customErr, '');
            }

            this.updateLivePreview();
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });

        if (customInput) {
            const checkCustomInline = () => {
                this.formData.customCategory = customInput.value;
                const res = validateCustomCategory(this.formData.customCategory);
                this.setFieldError(customInput, customErr, res.valid ? '' : res.message);
                this.updateLivePreview();
                this.validateCurrentStepButton();
                this.triggerAutosave();
            };
            customInput.addEventListener('input', checkCustomInline);
            customInput.addEventListener('blur', checkCustomInline);
        }

        // 5. Wire Contact Number (+63 fixed prefix + 10 mobile digits)
        const contactInput = area.querySelector('#inputBizContact');
        const contactGroup = area.querySelector('#contactInputGroup') || contactInput;
        const contactErr = area.querySelector('#bizContactError');
        const normalizeLocalMobileDigits = (rawVal) => {
            let digits = String(rawVal || '').replace(/\D/g, '');
            if (digits.startsWith('639') && digits.length > 10) {
                digits = digits.slice(2);
            } else if (digits.startsWith('09')) {
                digits = digits.slice(1);
            } else if (digits.startsWith('0')) {
                digits = digits.replace(/^0+/, '');
            }
            return digits.slice(0, 10);
        };
        const checkContactInline = () => {
            const digits = normalizeLocalMobileDigits(contactInput.value);
            if (contactInput.value !== digits) {
                contactInput.value = digits;
            }
            this.formData.contactNumber = digits ? `+63${digits}` : '';
            const res = validatePhContactNumber(this.formData.contactNumber);
            this.setFieldError(contactGroup, contactErr, res.valid ? '' : res.message);
            this.validateCurrentStepButton();
            this.triggerAutosave();
        };
        contactInput.addEventListener('input', checkContactInline);
        contactInput.addEventListener('blur', checkContactInline);

        // 6. Wire Description
        const descInput = area.querySelector('#inputBizDesc');
        descInput.addEventListener('input', (e) => {
            this.formData.description = e.target.value;
            this.triggerAutosave();
        });

        // 7. Mount Offerings Editor
        const mount = area.querySelector('#offeringsEditorMount');
        if (window.CalzadaBusinessFields?.renderOfferingsInput) {
            this.offeringsEditor = window.CalzadaBusinessFields.renderOfferingsInput(mount, {
                initialOfferings: this.formData.offerings,
                onChange: (newOfferings) => {
                    this.formData.offerings = newOfferings;
                    const offBox = area.querySelector('.offerings-editor-box');
                    const offErr = area.querySelector('#offeringsError');
                    this.setFieldError(offBox, offErr, newOfferings.length >= 1 ? '' : 'Please add at least 1 offering or specialty.');
                    this.updateLivePreview();
                    this.validateCurrentStepButton();
                    this.triggerAutosave();
                }
            });
        }
    }

    renderLocationStep(area) {
        area.innerHTML = `
            <div class="flex flex-col gap-5">
                <div>
                    <h2 class="text-lg font-bold text-[#042C53] m-0" style="font-family: 'Sora', sans-serif;">Stage 2: Location &amp; Map</h2>
                    <p class="text-xs sm:text-sm text-slate-500 mt-1">Pinpoint your exact location on the map and verify your structured address in Brgy. Uno, Real, or Halang.</p>
                </div>

                <!-- Map Header + Real-time Geolocation Button -->
                <div>
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 mb-2.5">
                        <div>
                            <label class="block font-semibold text-sm text-[#042C53]">
                                Pin Store Location on Map <span class="text-red-600">*</span>
                            </label>
                            <div class="text-xs text-slate-500">Click or drag the map pin within Brgy. Uno, Real, or Halang.</div>
                        </div>
                        <button
                            type="button"
                            id="btnUseCurrentLocation"
                            class="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-white border border-[#378ADD] rounded-lg text-xs sm:text-sm font-semibold text-[#378ADD] hover:bg-blue-50/60 cursor-pointer inline-flex items-center justify-center gap-2 transition-colors shrink-0"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3m0 14v3M2 12h3m14 0h3"></path><circle cx="12" cy="12" r="7"></circle></svg>
                            <span id="btnGeoLabel">Use My Current Location</span>
                        </button>
                    </div>

                    <!-- Responsive Map Container (h-64 on mobile, md:h-96 on tablet/desktop) -->
                    <div id="wizardMapContainer" class="w-full h-64 md:h-96 border border-slate-300 rounded-xl overflow-hidden bg-slate-100"></div>

                    <div class="flex flex-wrap items-center justify-between gap-2 mt-2">
                        <div id="pinCoordsBadge" class="text-xs text-slate-500 font-mono">
                            Pin: ${(this.formData.location.lat || 14.20415).toFixed(5)}, ${(this.formData.location.lng || 121.15691).toFixed(5)}
                        </div>
                        <div id="locationSyncStatus" class="text-xs text-slate-500" aria-live="polite"></div>
                    </div>
                    <div id="mapCoverageError" class="text-xs text-red-600 mt-1.5 font-medium" style="display: none;"></div>
                </div>

                <!-- Structured Address Fields -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div class="md:col-span-2">
                        <label for="inputAddress" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                            House No. / Building / Street <span class="text-red-600">*</span>
                        </label>
                        <input
                            type="text"
                            id="inputAddress"
                            value="${this.escapeHtml(this.formData.address)}"
                            maxlength="160"
                            placeholder="e.g. Unit 2B, 45 J.P. Rizal St., Purok 3"
                            class="cz-input w-full min-h-[44px] border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53]"
                        />
                        <div class="text-xs text-slate-500 mt-1">Synced with your map pin when available; edit to add exact unit or building number.</div>
                        <div id="addressError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                    </div>

                    <div>
                        <label for="selectBarangay" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                            Barangay <span class="text-red-600">*</span>
                        </label>
                        <select
                            id="selectBarangay"
                            class="cz-input w-full min-h-[44px] border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53] bg-white"
                        >
                            <option value="" disabled ${this.formData.barangay ? '' : 'selected'}>Select Barangay</option>
                            <option value="Uno" ${this.formData.barangay === 'Uno' ? 'selected' : ''}>Brgy. Uno</option>
                            <option value="Real" ${this.formData.barangay === 'Real' ? 'selected' : ''}>Brgy. Real</option>
                            <option value="Halang" ${this.formData.barangay === 'Halang' ? 'selected' : ''}>Brgy. Halang</option>
                        </select>
                        <div id="barangayHint" class="text-xs text-slate-500 mt-1"></div>
                        <div id="barangayError" class="text-xs text-red-600 mt-1 font-medium" style="display: none;"></div>
                    </div>

                    <div>
                        <label for="inputLandmark" class="block font-semibold text-sm text-[#042C53] mb-1.5">
                            Landmark <span class="font-normal text-slate-500">(optional)</span>
                        </label>
                        <input
                            type="text"
                            id="inputLandmark"
                            value="${this.escapeHtml(this.formData.landmark)}"
                            maxlength="80"
                            placeholder="e.g. Across SM City Calamba / Beside 7-Eleven"
                            class="cz-input w-full min-h-[44px] border border-slate-300 rounded-lg px-3.5 py-2.5 text-sm text-[#042C53]"
                        />
                        <div class="text-xs text-slate-500 mt-1">Helps jeepney commuters spot your store quickly.</div>
                    </div>
                </div>
            </div>
        `;

        const addrInput = area.querySelector('#inputAddress');
        const addrErr = area.querySelector('#addressError');
        addrInput.addEventListener('input', (e) => {
            this.formData.address = e.target.value;
            this._addressManuallyTyped = this.formData.address.trim().length > 0;
            const ok = this.formData.address.trim().length >= 3;
            this.setFieldError(addrInput, addrErr, ok ? '' : 'Please enter your House No., Building, or Street name (at least 3 characters).');
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });
        addrInput.addEventListener('blur', () => {
            const ok = this.formData.address.trim().length >= 3;
            this.setFieldError(addrInput, addrErr, ok ? '' : 'Please enter your House No., Building, or Street name (at least 3 characters).');
        });

        const brgySelect = area.querySelector('#selectBarangay');
        const brgyErr = area.querySelector('#barangayError');
        brgySelect.addEventListener('change', (e) => {
            const selectedBrgy = e.target.value;
            this.formData.barangay = selectedBrgy;
            this.barangaySource = 'manual';
            this.setFieldError(brgySelect, brgyErr, '');

            // Sync Barangay -> Map Pin if the current pin is in a different barangay
            const detected = detectBarangay(this.formData.location.lat, this.formData.location.lng);
            if (selectedBrgy && detected !== selectedBrgy) {
                const center = BARANGAY_CENTERS.find(b => b.name === selectedBrgy);
                if (center) {
                    this.formData.location = { lat: center.lat, lng: center.lng };
                    if (this.marker) this.marker.setLngLat([center.lng, center.lat]);
                    if (this.map) this.map.flyTo({ center: [center.lng, center.lat], zoom: 15.5 });
                    this.updatePinBadge(area);
                    this.syncAddressFromCoordinates(area, center.lat, center.lng);
                }
            }

            const mapEl = area.querySelector('#wizardMapContainer');
            const mapErr = area.querySelector('#mapCoverageError');
            this.setFieldError(mapEl, mapErr, '');

            this.paintBarangayHint(area);
            this.updateLivePreview();
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });

        const landmarkInput = area.querySelector('#inputLandmark');
        landmarkInput.addEventListener('input', (e) => {
            this.formData.landmark = e.target.value;
            this.triggerAutosave();
        });

        // Wire "Use My Current Location" button
        const btnGeo = area.querySelector('#btnUseCurrentLocation');
        const btnGeoLabel = area.querySelector('#btnGeoLabel');
        btnGeo.addEventListener('click', () => {
            const mapEl = area.querySelector('#wizardMapContainer');
            const mapErr = area.querySelector('#mapCoverageError');
            if (!navigator.geolocation) {
                this.setFieldError(mapEl, mapErr, 'Geolocation is not supported by your browser. Please drag the map pin manually.');
                return;
            }
            btnGeo.disabled = true;
            if (btnGeoLabel) btnGeoLabel.textContent = 'Locating...';
            this.setFieldError(mapEl, mapErr, '');

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    btnGeo.disabled = false;
                    if (btnGeoLabel) btnGeoLabel.textContent = 'Use My Current Location';
                    const lat = Number(pos.coords.latitude.toFixed(6));
                    const lng = Number(pos.coords.longitude.toFixed(6));

                    if (!this.isInCoverage(lat, lng)) {
                        this.setFieldError(
                            mapEl,
                            mapErr,
                            `Your current location (${lat.toFixed(4)}, ${lng.toFixed(4)}) is outside Calzada's service area (Brgy. Uno, Real, and Halang). Please drag the pin inside the highlighted map area.`
                        );
                        return;
                    }

                    this.applyPinCoordinates(area, lat, lng, { fly: true, forceAddressSync: true });
                },
                (err) => {
                    btnGeo.disabled = false;
                    if (btnGeoLabel) btnGeoLabel.textContent = 'Use My Current Location';
                    const msg = err && err.code === 1
                        ? 'Location permission was denied. Please allow location access in your browser or drag the pin on the map.'
                        : 'Could not detect your current location. Please place the pin on the map manually.';
                    this.setFieldError(mapEl, mapErr, msg);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });

        this.paintBarangayHint(area);
        setTimeout(() => this.initMapLibre(area), 50);
    }

    updatePinBadge(area) {
        const badge = area && area.querySelector('#pinCoordsBadge');
        if (badge && this.formData.location) {
            badge.textContent = `Pin: ${Number(this.formData.location.lat).toFixed(5)}, ${Number(this.formData.location.lng).toFixed(5)}`;
        }
    }

    async syncAddressFromCoordinates(area, lat, lng, { force = false } = {}) {
        const syncEl = area && area.querySelector('#locationSyncStatus');
        const addrInput = area && area.querySelector('#inputAddress');
        const addrErr = area && area.querySelector('#addressError');
        if (syncEl) syncEl.textContent = 'Syncing address from pin...';

        try {
            if (this.reverseGeocodeAbort) this.reverseGeocodeAbort.abort();
            this.reverseGeocodeAbort = new AbortController();
            const res = await fetch(`/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`, {
                signal: this.reverseGeocodeAbort.signal
            });
            const data = await res.json().catch(() => ({}));
            const suggested = (data && data.streetAddress) ? String(data.streetAddress).trim() : '';

            if (suggested && (force || !this._addressManuallyTyped || !this.formData.address.trim())) {
                this.formData.address = suggested;
                if (addrInput) {
                    addrInput.value = suggested;
                    this.setFieldError(addrInput, addrErr, '');
                }
                if (syncEl) syncEl.textContent = 'Street address updated from map pin.';
                this.validateCurrentStepButton();
                this.triggerAutosave();
            } else if (syncEl) {
                syncEl.textContent = `Pin synced to Brgy. ${this.formData.barangay}.`;
            }
        } catch (err) {
            if (err && err.name === 'AbortError') return;
            if (syncEl) syncEl.textContent = `Pin synced to Brgy. ${this.formData.barangay}.`;
        }
    }

    applyPinCoordinates(area, lat, lng, { fly = false, forceAddressSync = false } = {}) {
        const mapEl = area.querySelector('#wizardMapContainer');
        const mapErr = area.querySelector('#mapCoverageError');

        if (!this.isInCoverage(lat, lng)) {
            this.setFieldError(mapEl, mapErr, 'Pin must be placed inside Brgy. Uno, Real, or Halang.');
            if (this.marker) {
                this.marker.setLngLat([this.formData.location.lng || 121.15691, this.formData.location.lat || 14.20415]);
            }
            return;
        }

        this.formData.location = { lat, lng };
        this.setFieldError(mapEl, mapErr, '');

        if (this.marker) this.marker.setLngLat([lng, lat]);
        if (fly && this.map) this.map.flyTo({ center: [lng, lat], zoom: 16 });

        const detected = detectBarangay(lat, lng);
        this.formData.barangay = detected;
        this.barangaySource = 'auto';
        const brgySel = area.querySelector('#selectBarangay');
        if (brgySel) brgySel.value = detected;

        this.updatePinBadge(area);
        this.paintBarangayHint(area);
        this.syncAddressFromCoordinates(area, lat, lng, { force: forceAddressSync });

        this.updateLivePreview();
        this.validateCurrentStepButton();
        this.triggerAutosave();
    }

    paintBarangayHint(area) {
        const hint = area.querySelector('#barangayHint');
        if (!hint) return;
        if (!this.formData.barangay) {
            hint.textContent = 'Drop your pin or select Uno, Real, or Halang.';
        } else if (this.barangaySource === 'auto') {
            hint.textContent = `Auto-detected Brgy. ${this.formData.barangay} from your map pin.`;
        } else if (this.barangaySource === 'manual') {
            hint.textContent = `Synced with Brgy. ${this.formData.barangay} on the map.`;
        } else {
            hint.textContent = `Coverage: Brgy. ${this.formData.barangay}, Calamba.`;
        }
    }

    initMapLibre(area) {
        const mapContainer = area.querySelector('#wizardMapContainer');
        if (!mapContainer || typeof window.maplibregl === 'undefined') return;

        const defaultCenter = [this.formData.location.lng || 121.15691, this.formData.location.lat || 14.20415];

        this.map = new window.maplibregl.Map({
            container: mapContainer,
            style: 'https://tiles.openfreemap.org/styles/bright',
            center: defaultCenter,
            zoom: 14.5
        });

        this.map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        if (window.CalzadaScope && typeof window.CalzadaScope.addFog === 'function') {
            window.CalzadaScope.addFog(this.map);
        }

        this.marker = new window.maplibregl.Marker({ draggable: true, color: '#378ADD' })
            .setLngLat(defaultCenter)
            .addTo(this.map);

        if (!this.formData.barangay && this.isInCoverage(defaultCenter[1], defaultCenter[0])) {
            this.formData.barangay = detectBarangay(defaultCenter[1], defaultCenter[0]);
            this.barangaySource = 'auto';
            const brgySel = area.querySelector('#selectBarangay');
            if (brgySel) brgySel.value = this.formData.barangay;
            this.paintBarangayHint(area);
            this.updateLivePreview();
            this.validateCurrentStepButton();
        }

        this.marker.on('dragend', () => {
            const lngLat = this.marker.getLngLat();
            this.applyPinCoordinates(area, Number(lngLat.lat.toFixed(6)), Number(lngLat.lng.toFixed(6)));
        });

        this.map.on('click', (e) => {
            const lat = Number(e.lngLat.lat.toFixed(6));
            const lng = Number(e.lngLat.lng.toFixed(6));
            this.applyPinCoordinates(area, lat, lng);
        });
    }

    renderHoursStep(area) {
        area.innerHTML = `
            <div class="flex flex-col gap-4">
                <div>
                    <h2 class="text-lg font-bold text-[#042C53] m-0" style="font-family: 'Sora', sans-serif;">Stage 3: Open Hours</h2>
                    <p class="text-xs sm:text-sm text-slate-500 mt-1">Toggle each day Open or Closed and enter one continuous operating time range per open day.</p>
                </div>
                <div id="openHoursMount"></div>
            </div>
        `;

        const mount = area.querySelector('#openHoursMount');
        if (window.CalzadaBusinessFields?.renderOpenHoursEditor) {
            this.hoursEditor = window.CalzadaBusinessFields.renderOpenHoursEditor(mount, {
                initialHours: this.formData.openHours,
                onChange: (newHours) => {
                    this.formData.openHours = newHours;
                    this.updateLivePreview();
                    this.validateCurrentStepButton();
                    this.triggerAutosave();
                }
            });
        }
    }

    renderPlanStep(area) {
        const plans = window.CALZADA_PLANS || {
            listed: { name: 'Listed', price: 59, postsPerMonth: 4, newTagDays: 7, boostDays: 7 },
            plus360: { name: 'Listed + 360', price: 199, postsPerMonth: 8, recommended: true, newTagDays: 14, boostDays: 14, has360: true },
            featured: { name: 'Featured', price: 299, postsPerMonth: null, newTagDays: 30, boostDays: 30, has360: true }
        };

        area.innerHTML = `
            <div class="flex flex-col gap-5">
                <div>
                    <h2 class="text-lg font-bold text-[#042C53] m-0" style="font-family: 'Sora', sans-serif;">Stage 4: Plans &amp; Pricing</h2>
                    <p class="text-xs sm:text-sm text-slate-500 mt-1">One-time registration payment. You only pay via GCash after your business details are approved.</p>
                </div>

                <!-- Responsive Plan Cards: Stack vertically on mobile, 3 columns side-by-side on desktop -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    ${Object.entries(plans).map(([planKey, cfg]) => {
                        const isSelected = this.formData.plan === planKey;
                        const isRec = cfg.recommended;
                        return `
                            <button
                                type="button"
                                class="plan-select-card plan-card-${planKey} text-left rounded-xl p-5 bg-white cursor-pointer transition-all flex flex-col justify-between min-h-[44px]"
                                data-plan="${planKey}"
                                style="border: ${isSelected ? '2px solid #378ADD' : '1px solid #CBD5E1'}; background: ${isSelected ? '#F8FAFC' : '#FFFFFF'};"
                            >
                                <div>
                                    <div class="flex items-center justify-between gap-2 mb-1.5">
                                        <span class="text-xs font-bold uppercase tracking-wider ${isRec ? 'text-[#378ADD]' : 'text-slate-400'}">
                                            ${isRec ? 'Recommended' : 'One-Time Plan'}
                                        </span>
                                        <span class="w-5 h-5 rounded-full border flex items-center justify-center text-xs ${isSelected ? 'border-[#378ADD] bg-[#378ADD] text-white' : 'border-slate-300 bg-white text-transparent'}">
                                            &#10003;
                                        </span>
                                    </div>
                                    <h4 class="text-base font-bold text-[#042C53] m-0 mb-2" style="font-family: 'Sora', sans-serif;">${this.escapeHtml(cfg.name || planKey)}</h4>
                                    <div class="flex items-baseline gap-1.5 mb-3">
                                        <span class="text-2xl font-extrabold text-[#042C53]">₱${cfg.price}</span>
                                        <span class="text-xs font-medium text-slate-500">one-time</span>
                                    </div>
                                    <ul class="list-none p-0 m-0 text-xs sm:text-sm text-[#042C53] flex flex-col gap-2">
                                        <li class="flex items-center gap-2"><span class="text-[#378ADD] font-bold">&#10003;</span> ${cfg.postsPerMonth ? `${cfg.postsPerMonth} post updates` : 'Unlimited post updates'}</li>
                                        <li class="flex items-center gap-2"><span class="text-[#378ADD] font-bold">&#10003;</span> ${cfg.newTagDays}-day "New" badge</li>
                                        ${cfg.boostDays ? `<li class="flex items-center gap-2"><span class="text-[#378ADD] font-bold">&#10003;</span> ${cfg.boostDays}-day search priority</li>` : ''}
                                        ${cfg.has360 ? `<li class="flex items-center gap-2"><span class="text-[#378ADD] font-bold">&#10003;</span> 360° Virtual Tour shoot</li>` : ''}
                                    </ul>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>

                <div id="planStepError" class="text-xs text-red-600 font-medium" style="display: none;">
                    Please select a plan to continue.
                </div>

                <div class="bg-slate-50 border border-slate-200 rounded-lg p-3.5 text-xs sm:text-sm text-slate-600">
                    <strong>No upfront payment today:</strong> You pay the one-time fee via GCash only after our team approves your business listing.
                </div>
            </div>
        `;

        area.querySelectorAll('.plan-select-card').forEach(card => {
            card.addEventListener('click', () => {
                this.formData.plan = card.getAttribute('data-plan');
                this.renderPlanStep(area);
                this.validateCurrentStepButton();
                this.triggerAutosave();
            });
        });
    }

    renderReviewStep(area) {
        const plans = window.CALZADA_PLANS || {
            listed: { name: 'Listed', price: 59, postsPerMonth: 4, newTagDays: 7, boostDays: 7 },
            plus360: { name: 'Listed + 360', price: 199, postsPerMonth: 8, recommended: true, newTagDays: 14, boostDays: 14, has360: true },
            featured: { name: 'Featured', price: 299, postsPerMonth: null, newTagDays: 30, boostDays: 30, has360: true }
        };
        const selectedPlan = plans[this.formData.plan] || { name: this.formData.plan, price: 199 };
        const catMeta = this.getCategoryMeta();
        const logoSrc = this.formData.logoPreviewUrl || this.formData.logoUrl || '';
        const frontSrc = this.formData.photoPreviewUrl || this.formData.thumbnailUrl || '';
        const weeklyHours = window.CalzadaBusinessFields?.formatWeeklyHours
            ? window.CalzadaBusinessFields.formatWeeklyHours(this.formData.openHours)
            : [];

        area.innerHTML = `
            <div class="flex flex-col gap-5">
                <div>
                    <h2 class="text-lg font-bold text-[#042C53] m-0" style="font-family: 'Sora', sans-serif;">Stage 5: Review &amp; Submit</h2>
                    <p class="text-xs sm:text-sm text-slate-500 mt-1">Review all details from Stages 1 to 4. Click "Edit" on any section to make changes and return directly here.</p>
                </div>

                <!-- Section 1: Business Information -->
                <div class="border border-slate-200 rounded-xl p-4 bg-white">
                    <div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                        <h3 class="text-sm font-bold text-[#042C53] m-0">1. Business Information</h3>
                        <button type="button" class="btn-review-edit min-h-[36px] px-3 py-1 rounded-md border border-slate-200 bg-slate-50 hover:border-[#378ADD] text-xs font-semibold text-[#378ADD] cursor-pointer" data-edit-step="store">
                            Edit
                        </button>
                    </div>
                    <div class="flex flex-wrap items-center gap-4 mb-3">
                        <div class="flex items-center gap-2.5">
                            <div class="w-12 h-12 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                                ${logoSrc ? `<img src="${this.escapeHtml(logoSrc)}" alt="Logo" style="width:100%;height:100%;object-fit:cover;" />` : `<span class="text-[11px] text-red-600">No Logo</span>`}
                            </div>
                            <span class="text-xs text-slate-500">Business Logo</span>
                        </div>
                        <div class="flex items-center gap-2.5">
                            <div class="w-16 h-12 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center shrink-0">
                                ${frontSrc ? `<img src="${this.escapeHtml(frontSrc)}" alt="Storefront" style="width:100%;height:100%;object-fit:cover;" />` : `<span class="text-[11px] text-red-600">No Photo</span>`}
                            </div>
                            <span class="text-xs text-slate-500">Storefront Photo</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                        <div>
                            <span class="text-slate-500 block text-xs">Business Name</span>
                            <strong class="text-[#042C53]">${this.escapeHtml(this.formData.name || '—')}</strong>
                        </div>
                        <div>
                            <span class="text-slate-500 block text-xs">Category</span>
                            <strong class="text-[#042C53]">${this.escapeHtml(catMeta.label || '—')}</strong>
                        </div>
                        <div>
                            <span class="text-slate-500 block text-xs">Contact Number</span>
                            <strong class="text-[#042C53]">${this.escapeHtml(this.formData.contactNumber || '—')}</strong>
                        </div>
                        <div>
                            <span class="text-slate-500 block text-xs">Offerings &amp; Specialties</span>
                            <strong class="text-[#042C53]">${this.escapeHtml((this.formData.offerings || []).join(', ') || '—')}</strong>
                        </div>
                        ${this.formData.description ? `
                            <div class="sm:col-span-2">
                                <span class="text-slate-500 block text-xs">Description</span>
                                <span class="text-[#042C53]">${this.escapeHtml(this.formData.description)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Section 2: Location & Map -->
                <div class="border border-slate-200 rounded-xl p-4 bg-white">
                    <div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                        <h3 class="text-sm font-bold text-[#042C53] m-0">2. Location &amp; Map</h3>
                        <button type="button" class="btn-review-edit min-h-[36px] px-3 py-1 rounded-md border border-slate-200 bg-slate-50 hover:border-[#378ADD] text-xs font-semibold text-[#378ADD] cursor-pointer" data-edit-step="location">
                            Edit
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs sm:text-sm">
                        <div class="sm:col-span-2">
                            <span class="text-slate-500 block text-xs">House No. / Building / Street</span>
                            <strong class="text-[#042C53]">${this.escapeHtml(this.formData.address || '—')}</strong>
                        </div>
                        <div>
                            <span class="text-slate-500 block text-xs">Barangay</span>
                            <strong class="text-[#042C53]">Brgy. ${this.escapeHtml(this.formData.barangay || '—')}, Calamba</strong>
                        </div>
                        <div>
                            <span class="text-slate-500 block text-xs">Landmark</span>
                            <strong class="text-[#042C53]">${this.escapeHtml(this.formData.landmark || 'None specified')}</strong>
                        </div>
                        <div class="sm:col-span-2">
                            <span class="text-slate-500 block text-xs">Pinned Coordinates</span>
                            <span class="font-mono text-xs text-[#042C53]">${Number(this.formData.location.lat).toFixed(5)}, ${Number(this.formData.location.lng).toFixed(5)}</span>
                        </div>
                    </div>
                </div>

                <!-- Section 3: Open Hours -->
                <div class="border border-slate-200 rounded-xl p-4 bg-white">
                    <div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                        <h3 class="text-sm font-bold text-[#042C53] m-0">3. Open Hours</h3>
                        <button type="button" class="btn-review-edit min-h-[36px] px-3 py-1 rounded-md border border-slate-200 bg-slate-50 hover:border-[#378ADD] text-xs font-semibold text-[#378ADD] cursor-pointer" data-edit-step="hours">
                            Edit
                        </button>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:text-sm">
                        ${weeklyHours.map(w => `
                            <div class="flex justify-between items-center py-1 border-b border-slate-50">
                                <span class="text-slate-600 font-medium">${this.escapeHtml(w.dayName)}</span>
                                <span class="font-semibold ${w.hoursText === 'Closed' ? 'text-slate-400' : 'text-[#042C53]'}">${this.escapeHtml(w.hoursText)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Section 4: Plan & Pricing -->
                <div class="border border-slate-200 rounded-xl p-4 bg-white">
                    <div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                        <h3 class="text-sm font-bold text-[#042C53] m-0">4. Selected Plan &amp; Pricing</h3>
                        <button type="button" class="btn-review-edit min-h-[36px] px-3 py-1 rounded-md border border-slate-200 bg-slate-50 hover:border-[#378ADD] text-xs font-semibold text-[#378ADD] cursor-pointer" data-edit-step="plan">
                            Edit
                        </button>
                    </div>
                    <div class="flex items-center justify-between gap-3">
                        <div>
                            <strong class="text-sm sm:text-base text-[#042C53]">${this.escapeHtml(selectedPlan.name)} Plan</strong>
                            <div class="text-xs text-slate-500 mt-0.5">One-time payment via GCash after approval</div>
                        </div>
                        <div class="text-lg font-extrabold text-[#042C53]">₱${selectedPlan.price}</div>
                    </div>
                </div>

                <!-- Terms Agreement -->
                <div class="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <label class="flex items-start gap-3 cursor-pointer min-h-[44px]">
                        <input
                            type="checkbox"
                            id="chkTermsAgreed"
                            ${this.formData.termsAgreed ? 'checked' : ''}
                            class="mt-1 w-5 h-5 accent-[#378ADD] shrink-0"
                        />
                        <span class="text-xs sm:text-sm text-[#042C53] leading-relaxed">
                            I confirm that the business details provided above are accurate and legitimate, and I agree to Calzada's terms of service and registration review.
                        </span>
                    </label>
                    <div id="termsError" class="text-xs text-red-600 mt-2 font-medium" style="display: none;">
                        Please check the confirmation box above before submitting your registration.
                    </div>
                </div>

                <div id="submitErrorMessage" style="display: none;" class="bg-red-50 border border-red-200 rounded-lg p-3.5 text-red-600 text-xs sm:text-sm font-medium"></div>
            </div>
        `;

        // Wire section "Edit" buttons -> jump to specific stage with editingFromReview = true
        area.querySelectorAll('.btn-review-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetStep = btn.getAttribute('data-edit-step');
                if (STEPS.includes(targetStep)) {
                    this.editingFromReview = true;
                    this.goToStep(targetStep, true);
                }
            });
        });

        const chk = area.querySelector('#chkTermsAgreed');
        const termsErr = area.querySelector('#termsError');
        chk.addEventListener('change', () => {
            this.formData.termsAgreed = chk.checked;
            if (termsErr) termsErr.style.display = chk.checked ? 'none' : 'block';
            this.validateCurrentStepButton();
        });
    }

    updateLivePreview() {
        const prevImg = this.containerEl.querySelector('#prevImg');
        const prevEmpty = this.containerEl.querySelector('#prevImgPlaceholder');
        const prevLogoImg = this.containerEl.querySelector('#prevLogoImg');
        const prevLogoInitial = this.containerEl.querySelector('#prevLogoInitial');
        const prevName = this.containerEl.querySelector('#prevName');
        const prevCategoryText = this.containerEl.querySelector('#prevCategoryText');
        const prevBrgy = this.containerEl.querySelector('#prevBarangay');
        const prevStatus = this.containerEl.querySelector('#prevOpenStatus');
        const prevOfferings = this.containerEl.querySelector('#prevOfferings');

        if (!prevName) return;

        // Storefront Photo
        const photoSrc = this.formData.photoPreviewUrl || this.formData.thumbnailUrl;
        if (photoSrc) {
            prevImg.src = photoSrc;
            prevImg.style.display = 'block';
            prevEmpty.style.display = 'none';
        } else {
            prevImg.style.display = 'none';
            prevEmpty.style.display = 'flex';
        }

        // Logo
        const logoSrc = this.formData.logoPreviewUrl || this.formData.logoUrl;
        if (prevLogoImg && prevLogoInitial) {
            if (logoSrc) {
                prevLogoImg.src = logoSrc;
                prevLogoImg.style.display = 'block';
                prevLogoInitial.style.display = 'none';
            } else {
                prevLogoImg.style.display = 'none';
                prevLogoInitial.style.display = 'inline';
                prevLogoInitial.textContent = (this.formData.name.trim().charAt(0) || 'B').toUpperCase();
            }
        }

        // Name & Category
        prevName.textContent = this.formData.name.trim() || 'Business Name';
        if (prevCategoryText) {
            const catMeta = this.getCategoryMeta();
            prevCategoryText.textContent = catMeta.label || 'Category';
        }

        // Barangay
        prevBrgy.textContent = this.formData.barangay ? `Brgy. ${this.formData.barangay}, Calamba` : 'Barangay';

        // Open status
        const openInfo = window.CalzadaBusinessFields?.getOpenStatus(this.formData.openHours) || {
            isOpen: true,
            formattedText: 'Open now · Closes 5:00 PM'
        };
        prevStatus.textContent = openInfo.formattedText;
        prevStatus.style.color = openInfo.isOpen ? '#16A34A' : '#DC2626';

        // Offerings
        const first3 = (this.formData.offerings || []).slice(0, 3);
        prevOfferings.textContent = first3.length > 0 ? first3.join(' · ') : 'Offerings & Specialties';
    }

    async uploadBusinessMedia(fileOrBlob, kind = 'front') {
        const user = this.auth.currentUser || this.currentUser;
        if (!user) throw new Error('Sign in again to upload the photo.');
        const token = await user.getIdToken();
        const form = new FormData();
        form.append('kind', kind);
        form.append('photo', fileOrBlob, kind === 'logo' ? 'logo.jpg' : 'front.jpg');
        const res = await fetch('/api/businesses/upload-thumbnail', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) throw new Error(json.error || 'The image could not be uploaded. Try again.');
        return json.url;
    }

    async uploadFrontPhoto(fileOrBlob) {
        return this.uploadBusinessMedia(fileOrBlob, 'front');
    }

    setSaveStatus(text) {
        (this.saveStatusEls || []).forEach(el => { el.textContent = text; });
    }

    async saveDraftNow() {
        if (!this.currentUser || this.isSubmitted) return;
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;
        try {
            const meta = this.getCategoryMeta();
            const draftRef = doc(this.db, 'businessDrafts', this.currentUser.uid);
            const draftData = {
                step: this.currentStep,
                name: this.formData.name || '',
                categoryKey: this.formData.categoryKey || '',
                category: meta.firestoreCat || this.formData.category || '',
                customCategory: this.formData.customCategory || '',
                description: this.formData.description || '',
                contactNumber: this.formData.contactNumber || '',
                offerings: this.formData.offerings || [],
                location: this.formData.location || { lat: 14.20415, lng: 121.15691 },
                barangay: this.formData.barangay || 'Uno',
                address: this.formData.address || '',
                landmark: this.formData.landmark || '',
                openHours: this.formData.openHours || {},
                plan: this.formData.plan || 'plus360',
                thumbnailUrl: this.formData.thumbnailUrl || '',
                logoUrl: this.formData.logoUrl || '',
                updatedAt: serverTimestamp()
            };
            await setDoc(draftRef, draftData);
            this.setSaveStatus('Saved');
        } catch (err) {
            console.warn('Draft autosave error:', err);
            this.setSaveStatus('Not saved. Check your connection.');
        }
    }

    triggerAutosave() {
        if (!this.currentUser || this.isSubmitted || this._initializing) return;
        clearTimeout(this.autosaveTimer);
        this.setSaveStatus('Saving…');
        this.autosaveTimer = setTimeout(() => this.saveDraftNow(), 1500);
    }

    async loadDraft() {
        try {
            const draftRef = doc(this.db, 'businessDrafts', this.currentUser.uid);
            const snap = await getDoc(draftRef);
            if (snap.exists()) {
                const d = snap.data();
                this.formData.name = d.name || this.formData.name;
                this.formData.categoryKey = d.categoryKey || d.category || this.formData.categoryKey;
                this.formData.category = d.category || this.formData.category;
                this.formData.customCategory = d.customCategory || this.formData.customCategory;
                this.formData.description = d.description || this.formData.description;
                this.formData.contactNumber = d.contactNumber || this.formData.contactNumber;
                this.formData.offerings = Array.isArray(d.offerings) ? d.offerings : this.formData.offerings;
                this.formData.location = d.location || this.formData.location;
                this.formData.barangay = d.barangay || this.formData.barangay;
                this.formData.address = d.address || this.formData.address;
                this.formData.landmark = d.landmark || this.formData.landmark;
                this.formData.openHours = d.openHours || this.formData.openHours;
                this.formData.plan = d.plan || this.formData.plan;
                this.formData.thumbnailUrl = d.thumbnailUrl || this.formData.thumbnailUrl;
                this.formData.logoUrl = d.logoUrl || this.formData.logoUrl;
                if (d.step && STEPS.includes(d.step)) {
                    this.currentStep = d.step;
                }
                this._resumed = true;
            }
        } catch (err) {
            console.warn('Error loading draft:', err);
        }
    }

    async submitRegistration() {
        this.isSubmitted = true;
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;

        const nextBtn = this.containerEl.querySelector('#btnWizardNext');
        const errEl = this.containerEl.querySelector('#submitErrorMessage');
        if (errEl) errEl.style.display = 'none';

        nextBtn.disabled = true;
        nextBtn.textContent = 'Submitting...';

        try {
            // 1. Upload Business Logo if pending file
            let finalLogoUrl = this.formData.logoUrl;
            if (!finalLogoUrl && this.formData.logoFile) {
                finalLogoUrl = await this.uploadBusinessMedia(this.formData.logoFile, 'logo');
                this.formData.logoUrl = finalLogoUrl;
            }
            if (!finalLogoUrl) {
                throw new Error('Business logo is required. Please upload your business logo in Stage 1.');
            }

            // 2. Upload Storefront Photo if pending file
            let finalPhotoUrl = this.formData.thumbnailUrl;
            if (!finalPhotoUrl && this.formData.frontPhotoFile) {
                finalPhotoUrl = await this.uploadBusinessMedia(this.formData.frontPhotoFile, 'front');
                this.formData.thumbnailUrl = finalPhotoUrl;
            }
            if (!finalPhotoUrl) {
                throw new Error('Storefront photo is required. Please upload your storefront photo in Stage 1.');
            }

            // 3. Resolve Category & ServiceType for Firestore schema compliance
            const catMeta = this.getCategoryMeta();
            const firestoreCategory = catMeta.firestoreCat || 'establishments';
            const serviceType = (catMeta.serviceType || '').trim().slice(0, 40) || null;

            // 4. Create businesses/{id} document
            const newBizRef = doc(collection(this.db, 'businesses'));
            const businessId = newBizRef.id;

            const basePayload = {
                ownerId: this.currentUser.uid,
                status: 'pending',
                submittedAt: serverTimestamp(),
                name: this.formData.name.trim(),
                category: firestoreCategory,
                ...(serviceType && serviceType.length >= 2 ? { serviceType } : {}),
                address: this.formData.address.trim(),
                description: this.formData.description.trim() || null,
                contactNumber: this.formData.contactNumber.trim() || null,
                location: {
                    lat: Number(this.formData.location.lat.toFixed(6)),
                    lng: Number(this.formData.location.lng.toFixed(6))
                },
                plan: this.formData.plan,
                thumbnailUrl: finalPhotoUrl,
                offerings: this.formData.offerings,
                openHours: this.formData.openHours,
                barangay: this.formData.barangay,
                landmark: this.formData.landmark.trim() || null
            };

            const ownerPrivateRef = doc(this.db, 'businesses', businessId, 'private', 'owner');

            try {
                const batchWithLogo = writeBatch(this.db);
                batchWithLogo.set(newBizRef, { ...basePayload, logoUrl: finalLogoUrl });
                batchWithLogo.set(ownerPrivateRef, { ownerEmail: this.currentUser.email || null });
                await batchWithLogo.commit();
            } catch (firstCommitErr) {
                // Fallback if live Firestore rules have not been redeployed with logoUrl on create yet
                const batchFallback = writeBatch(this.db);
                batchFallback.set(newBizRef, basePayload);
                batchFallback.set(ownerPrivateRef, { ownerEmail: this.currentUser.email || null });
                await batchFallback.commit();
            }

            // 5. Delete the draft
            try {
                await deleteDoc(doc(this.db, 'businessDrafts', this.currentUser.uid));
            } catch (dErr) {
                console.warn('Could not delete draft:', dErr);
            }

            // 6. POST /api/events { event: 'application_received', logoUrl } (persists logoUrl via Admin SDK if needed)
            this.currentUser.getIdToken().then(idToken => {
                fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        event: 'application_received',
                        entityId: businessId,
                        logoUrl: finalLogoUrl
                    })
                }).catch(e => console.warn('application_received error:', e));
            }).catch(e => console.warn('Could not get token for event:', e));

            // 7. Show success screen
            this.renderSuccessScreen(businessId);

        } catch (err) {
            console.error('Submission error:', err);
            this.isSubmitted = false;
            nextBtn.disabled = false;
            nextBtn.textContent = 'Submit Registration';
            if (errEl) {
                errEl.textContent = err.message || 'An unexpected error occurred during submission.';
                errEl.style.display = 'block';
            }
        }
    }

    renderSuccessScreen(businessId) {
        const previewBtn = document.getElementById('btnOpenPhonePreview');
        if (previewBtn) previewBtn.remove();
        const userEmail = this.currentUser.email || 'your email';

        this.containerEl.innerHTML = `
            <div style="max-width: 680px; margin: 40px auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 36px 24px; text-align: center;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: #F0FDF4; border: 1px solid #BBF7D0; color: #16A34A; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px;">
                    &#10003;
                </div>
                <h2 style="font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 700; color: #042C53; margin: 0 0 10px 0;">
                    Registration submitted!
                </h2>
                <p style="font-size: 15px; color: #64748B; margin: 0 0 28px 0; line-height: 1.5;">
                    Your business is now pending review. We'll email you at <strong>${this.escapeHtml(userEmail)}</strong> from <strong>thecalzada@gmail.com</strong> once approved.
                </p>

                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 20px; margin-bottom: 28px; text-align: left;">
                    <div style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: #64748B; margin-bottom: 14px; letter-spacing: 0.05em;">What happens next</div>
                    <div style="display: flex; justify-content: space-between; align-items: center; position: relative;">
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 1;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: #378ADD; color: #FFFFFF; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">1</div>
                            <span style="font-size: 13px; font-weight: 600; color: #042C53;">Review</span>
                        </div>
                        <div style="flex: 1; height: 2px; background: #E2E8F0; margin: -16px 8px 0 8px;"></div>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 1;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: #E2E8F0; color: #64748B; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">2</div>
                            <span style="font-size: 13px; font-weight: 500; color: #64748B;">Pay with GCash</span>
                        </div>
                        <div style="flex: 1; height: 2px; background: #E2E8F0; margin: -16px 8px 0 8px;"></div>
                        <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 1;">
                            <div style="width: 24px; height: 24px; border-radius: 50%; background: #E2E8F0; color: #64748B; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700;">3</div>
                            <span style="font-size: 13px; font-weight: 500; color: #64748B;">Live</span>
                        </div>
                    </div>
                </div>

                <div style="display: flex; justify-content: center; gap: 12px;">
                    <a href="/my-business" style="min-height: 44px; background: #378ADD; color: #FFFFFF; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
                        Go to My Business
                    </a>
                </div>
            </div>
        `;
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
