/**
 * public/js/register-wizard.js
 *
 * 5-Step Registration Wizard for Calzada Businesses:
 * 1. #store     - Store details, front photo (4:3, compressed), offerings chips
 * 2. #location  - MapLibre pin bounded to Uno/Real/Halang, nearest barangay preselect
 * 3. #hours     - 7-day open hours with 30-min steps, lunch breaks, shortcuts
 * 4. #plan      - Plans cards from plans-config.js (preselected plus360 or ?plan=)
 * 5. #review    - Preview card matching Places, edit links, terms checkbox, submission
 *
 * Features:
 * - Hash navigation (#store, #location, #hours, #plan, #review)
 * - Autosave to businessDrafts/{uid} debounced 1.5s
 * - Live preview card updating in real time (side-by-side on desktop/tablet landscape, bottom sheet on phone)
 * - Validation preventing progression until step is valid
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
    store: { title: 'Your store', benefit: 'Show shoppers what you sell and how to reach you.' },
    location: { title: 'Location', benefit: 'Commuters get a jeepney route and fare straight to your door.' },
    hours: { title: 'Open hours', benefit: "We show 'Open now' so people come at the right time." },
    plan: { title: 'Choose a plan', benefit: "Choose how long you're promoted across Calamba." },
    review: { title: 'Review and submit', benefit: 'Check how your business looks on Places before submitting.' }
};

// Barangays center coordinates for nearest distance calculation
const BARANGAY_CENTERS = [
    { name: 'Uno', lat: 14.2140, lng: 121.1620 },
    { name: 'Real', lat: 14.2080, lng: 121.1550 },
    { name: 'Halang', lat: 14.1950, lng: 121.1630 }
];

// Coverage bounding box around Uno, Real, Halang
const COVERAGE_BBOX = {
    minLat: 14.1800,
    maxLat: 14.2300,
    minLng: 121.1300,
    maxLng: 121.1850
};

export class RegisterWizard {
    constructor({ auth, db, containerEl, user = null }) {
        this.auth = auth;
        this.db = db;
        this.containerEl = containerEl;
        this.currentUser = user;

        this.currentStep = 'store';
        this.formData = {
            frontPhotoFile: null,
            thumbnailUrl: '',
            photoPreviewUrl: '',
            name: '',
            category: '',
            description: '',
            contactNumber: '',
            offerings: [],
            location: { lat: 14.2117, lng: 121.1652 },
            barangay: 'Real',
            address: '',
            landmark: '',
            openHours: window.CalzadaBusinessFields?.getDefaultHours() || {
                mon: [{ open: '08:00', close: '18:00' }],
                tue: [{ open: '08:00', close: '18:00' }],
                wed: [{ open: '08:00', close: '18:00' }],
                thu: [{ open: '08:00', close: '18:00' }],
                fri: [{ open: '08:00', close: '18:00' }],
                sat: [{ open: '08:00', close: '18:00' }],
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

        // Check URL for ?plan=
        const urlParams = new URLSearchParams(window.location.search);
        const queryPlan = urlParams.get('plan');
        if (queryPlan && ['listed', 'plus360', 'featured'].includes(queryPlan)) {
            this.formData.plan = queryPlan;
        }
    }

    async init() {
        this.currentUser = this.currentUser || this.auth.currentUser || (typeof window !== 'undefined' ? window.__MOCK_AUTH_USER__ : null);
        this.renderLayout();
        this.wireHashRouting();

        // Restore draft if exists
        if (this.currentUser) {
            await this.loadDraft();
        }

        // Navigate to initial hash or restored step
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

    renderLayout() {
        this.containerEl.innerHTML = `
            <div class="wizard-root" style="max-width: 1200px; margin: 0 auto; padding: 24px 16px;">
                <!-- Stepper Header -->
                <div class="wizard-stepper" style="margin-bottom: 24px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px 20px;">
                    <!-- Desktop / Tablet Stepper -->
                    <div class="stepper-desktop" style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                        ${STEPS.map((stepKey, idx) => `
                            <div class="step-item step-item-${stepKey}" style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                                <div class="step-num" style="width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; border: 2px solid #E2E8F0; color: #64748B;">
                                    ${idx + 1}
                                </div>
                                <span class="step-label" style="font-size: 14px; font-weight: 600; color: #64748B;">${STEP_TITLES[stepKey].title}</span>
                            </div>
                            ${idx < STEPS.length - 1 ? '<div style="flex: 1; height: 1px; background: #E2E8F0; margin: 0 8px;"></div>' : ''}
                        `).join('')}
                    </div>

                    <!-- Phone Stepper -->
                    <div class="stepper-phone" style="display: none;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <span id="phoneStepTitle" style="font-size: 14px; font-weight: 700; color: #042C53;">Step 1 of 5 · Store</span>
                            <span id="wizardSaveStatus" class="wizard-save-status" style="font-size: 12px; color: #64748B;" aria-live="polite"></span>
                        </div>
                        <div style="width: 100%; height: 4px; background: #E2E8F0; border-radius: 2px; overflow: hidden;">
                            <div id="phoneProgressBar" style="width: 20%; height: 100%; background: #378ADD; transition: width 0.3s ease;"></div>
                        </div>
                    </div>

                    <div class="stepper-status-bar" style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                        <span id="stepBenefitText" style="font-size: 13px; color: #64748B;">${STEP_TITLES[this.currentStep].benefit}</span>
                        <span id="desktopSaveStatus" class="wizard-save-status wizard-save-desktop" style="font-size: 12px; color: #64748B; flex: 0 0 auto;" aria-live="polite"></span>
                    </div>
                </div>

                <!-- Main Content Area: Side-by-side on desktop/tablet landscape -->
                <div class="wizard-grid" style="display: grid; grid-template-columns: 1fr 380px; gap: 24px; align-items: start;">
                    <!-- Step Form Container -->
                    <div class="wizard-form-card" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px;">
                        <div id="stepContentArea"></div>

                        <!-- Wizard Nav Buttons -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 24px; padding-top: 20px; border-top: 1px solid #E2E8F0;">
                            <button type="button" id="btnWizardPrev" style="background: transparent; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 18px; font-size: 14px; font-weight: 600; color: #042C53; cursor: pointer; display: none;">
                                &larr; Back
                            </button>
                            <div style="flex: 1;"></div>
                            <button type="button" id="btnWizardNext" style="background: #378ADD; border: none; border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 600; color: #FFFFFF; cursor: pointer; transition: background 0.15s ease;">
                                Continue &rarr;
                            </button>
                        </div>
                    </div>

                    <!-- Live Preview Card (Right Column) -->
                    <div class="wizard-preview-col">
                        <div style="position: sticky; top: 80px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <span style="font-size: 13px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.05em;">Places Preview</span>
                                <span style="font-size: 12px; color: #378ADD; font-weight: 600;">Updates live</span>
                            </div>
                            <div id="placesLiveCard" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden;">
                                <div style="position: relative; width: 100%; padding-top: 75%; background: #F1F5F9; overflow: hidden;">
                                    <img id="prevImg" src="" alt="Store preview" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: none;" />
                                    <div id="prevImgPlaceholder" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #94A3B8; font-size: 13px;">
                                        4:3 Store Front Photo
                                    </div>
                                </div>
                                <div style="padding: 16px;">
                                    <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
                                        <h3 id="prevName" style="font-family: 'Sora', sans-serif; font-size: 17px; font-weight: 700; color: #042C53; margin: 0;">Business Name</h3>
                                        <span id="prevNewLabel" style="font-size: 12px; font-weight: 500; color: #378ADD;">New</span>
                                    </div>
                                    <div id="prevBarangay" style="font-size: 13px; color: #64748B; margin-bottom: 8px;">Barangay</div>
                                    <div id="prevOpenStatus" style="font-size: 13px; font-weight: 600; color: #16A34A; margin-bottom: 12px;">Open now · Closes 6:00 PM</div>
                                    <div id="prevOfferings" style="font-size: 13px; color: #042C53; line-height: 1.4;">Offerings &amp; Specialties</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Phone Bottom Sheet Floating Button -->
                <button type="button" id="btnOpenPhonePreview" style="display: none; position: fixed; bottom: calc(20px + env(safe-area-inset-bottom, 0px)); right: 16px; z-index: 99; background: #378ADD; color: #FFFFFF; border: 1px solid #378ADD; border-radius: 8px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer;">
                    Preview card
                </button>
            </div>
        `;

        this.saveStatusEls = Array.from(this.containerEl.querySelectorAll('.wizard-save-status'));
        // Kept for older callers: writes go through setSaveStatus()
        this.saveStatusEl = { set textContent(v) { this._t = v; } };

        // Responsive css styles injection
        const style = document.createElement('style');
        style.textContent = `
            .wizard-form-card, .wizard-preview-col, .wizard-stepper { min-width: 0; }
            .wizard-form-card input, .wizard-form-card select, .wizard-form-card textarea { max-width: 100%; box-sizing: border-box; }
            @media (max-width: 1023px) {
                .wizard-grid {
                    grid-template-columns: 1fr !important;
                }
                .wizard-preview-col {
                    display: none;
                }
                #btnOpenPhonePreview {
                    display: block !important;
                }
                .stepper-desktop {
                    display: none !important;
                }
                .stepper-phone {
                    display: block !important;
                }
                .wizard-save-desktop { display: none; }
            }
            @media (max-width: 480px) {
                .wizard-root { padding: 16px 12px !important; }
                .wizard-form-card { padding: 16px !important; }
                .wizard-stepper { padding: 12px 14px !important; }
            }
        `;
        document.head.appendChild(style);

        // Stepper click handlers
        STEPS.forEach(stepKey => {
            const item = this.containerEl.querySelector(`.step-item-${stepKey}`);
            if (item) {
                item.addEventListener('click', () => {
                    const targetIdx = STEPS.indexOf(stepKey);
                    const currentIdx = STEPS.indexOf(this.currentStep);
                    if (targetIdx <= currentIdx || this.isStepValid(this.currentStep)) {
                        this.goToStep(stepKey, true);
                    }
                });
            }
        });

        // Prev & Next Buttons
        this.containerEl.querySelector('#btnWizardPrev').addEventListener('click', () => {
            const currentIdx = STEPS.indexOf(this.currentStep);
            if (currentIdx > 0) {
                this.goToStep(STEPS[currentIdx - 1], true);
            }
        });

        this.containerEl.querySelector('#btnWizardNext').addEventListener('click', () => {
            const currentIdx = STEPS.indexOf(this.currentStep);
            if (currentIdx < STEPS.length - 1) {
                if (this.isStepValid(this.currentStep)) {
                    this.goToStep(STEPS[currentIdx + 1], true);
                }
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

    // The first step that is not complete yet (or review when all are)
    firstOpenStep() {
        return STEPS.slice(0, -1).find(k => !this.isStepValid(k)) || 'review';
    }

    goToStep(stepKey, updateHash = true) {
        if (!STEPS.includes(stepKey)) stepKey = 'store';
        // A typed #review (or an old draft step) cannot skip a step that is not done
        const requested = stepKey;
        const limit = STEPS.indexOf(this.firstOpenStep());
        if (STEPS.indexOf(stepKey) > limit) stepKey = STEPS[limit];
        this.currentStep = stepKey;
        const target = '#' + stepKey;
        if (window.location.hash !== target) {
            // Buttons add a history entry (so the browser Back button steps back);
            // a corrected or initial hash replaces the current one.
            if (updateHash && requested === stepKey && !this._fromHashChange) history.pushState(null, '', target);
            else history.replaceState(null, '', target);
        }

        this.updateStepperUI();
        this.renderStepContent();
        this.updateNavButtons();
        this.updateLivePreview();
        this.triggerAutosave();
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
            } else if (idx < currentIdx && this.isStepValid(stepKey)) {
                numEl.style.borderColor = '#16A34A';
                numEl.style.color = '#FFFFFF';
                numEl.style.background = '#16A34A';
                numEl.innerHTML = '&#10003;'; // Check mark
                labelEl.style.color = '#042C53';
                labelEl.style.fontWeight = '600';
            } else {
                numEl.style.borderColor = '#E2E8F0';
                numEl.style.color = '#64748B';
                numEl.style.background = '#FFFFFF';
                numEl.textContent = String(idx + 1);
                labelEl.style.color = '#64748B';
                labelEl.style.fontWeight = '500';
            }
        });

        // Phone view update
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
        const currentIdx = STEPS.indexOf(this.currentStep);

        if (currentIdx === 0) {
            prevBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'inline-block';
        }

        if (this.currentStep === 'review') {
            nextBtn.textContent = 'Submit Registration';
            nextBtn.style.background = '#378ADD';
        } else {
            nextBtn.textContent = 'Continue →';
            nextBtn.style.background = '#378ADD';
        }

        this.validateCurrentStepButton();
    }

    validateCurrentStepButton() {
        const nextBtn = this.containerEl.querySelector('#btnWizardNext');
        if (!nextBtn) return;
        const valid = this.isStepValid(this.currentStep);
        nextBtn.disabled = !valid;
        nextBtn.style.opacity = valid ? '1' : '0.5';
        nextBtn.style.cursor = valid ? 'pointer' : 'not-allowed';
    }

    isStepValid(stepKey) {
        if (stepKey === 'store') {
            const hasPhoto = !!this.formData.thumbnailUrl || !!this.formData.frontPhotoFile;
            const hasName = this.formData.name.trim().length >= 1 && this.formData.name.trim().length <= 80;
            const hasCat = !!this.formData.category;
            const hasOfferings = Array.isArray(this.formData.offerings) && this.formData.offerings.length >= 1 && this.formData.offerings.length <= 10;
            return hasPhoto && hasName && hasCat && hasOfferings;
        }
        if (stepKey === 'location') {
            const inCoverage = this.isInCoverage(this.formData.location.lat, this.formData.location.lng);
            const hasBrgy = ['Uno', 'Real', 'Halang'].includes(this.formData.barangay);
            const hasAddress = this.formData.address.trim().length >= 1 && this.formData.address.trim().length <= 160;
            return inCoverage && hasBrgy && hasAddress;
        }
        if (stepKey === 'hours') {
            const check = window.CalzadaBusinessFields?.isValidOpenHours;
            return check ? check(this.formData.openHours) : (!!this.formData.openHours && typeof this.formData.openHours === 'object');
        }
        if (stepKey === 'plan') {
            return ['listed', 'plus360', 'featured'].includes(this.formData.plan);
        }
        if (stepKey === 'review') {
            return this.formData.termsAgreed === true && this.isStepValid('store') && this.isStepValid('location') && this.isStepValid('hours') && this.isStepValid('plan');
        }
        return true;
    }

    isInCoverage(lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number') return false;
        if (window.CalzadaScope && typeof window.CalzadaScope.contains === 'function') {
            return window.CalzadaScope.contains(lat, lng);
        }
        // Fallback bounding box for Uno, Real, Halang if scope not loaded yet
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
        area.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <!-- Front photo 4:3 -->
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Store front photo <span style="color: #DC2626;">*</span>
                    </label>
                    <div style="display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
                        <div id="frontPhotoBox" style="width: 140px; height: 105px; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; background: #F8FAFC; display: flex; align-items: center; justify-content: center; position: relative;">
                            <img id="frontPhotoImg" src="${this.formData.photoPreviewUrl || this.formData.thumbnailUrl || ''}" style="width: 100%; height: 100%; object-fit: cover; display: ${this.formData.photoPreviewUrl || this.formData.thumbnailUrl ? 'block' : 'none'};" />
                            <span id="frontPhotoEmpty" style="font-size: 12px; color: #94A3B8; text-align: center; padding: 4px; display: ${this.formData.photoPreviewUrl || this.formData.thumbnailUrl ? 'none' : 'block'};">4:3 Front View</span>
                        </div>
                        <div>
                            <input type="file" id="frontPhotoFileInput" accept="image/jpeg,image/png,image/webp" style="display: none;" />
                            <button type="button" id="btnSelectFrontPhoto" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; color: #042C53; cursor: pointer;">
                                Choose photo
                            </button>
                            <div style="font-size: 12px; color: #64748B; margin-top: 4px;">Clear front view of store. JPG, PNG or WebP.</div>
                            <div id="frontPhotoError" style="font-size: 12px; color: #DC2626; margin-top: 2px; display: none;">Front photo is required.</div>
                        </div>
                    </div>
                </div>

                <!-- Business Name -->
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Business name <span style="color: #DC2626;">*</span>
                    </label>
                    <input type="text" id="inputBizName" value="${this.escapeHtml(this.formData.name)}" maxlength="80" placeholder="Your store name"
                        style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; font-family: 'Outfit', sans-serif;"
                    />
                    <div id="bizNameError" style="font-size: 12px; color: #DC2626; margin-top: 2px; display: none;">Please enter a business name (1–80 chars).</div>
                </div>

                <!-- Category -->
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Category <span style="color: #DC2626;">*</span>
                    </label>
                    <select id="selectBizCategory" style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; background: #FFFFFF; font-family: 'Outfit', sans-serif;">
                        <option value="" ${this.formData.category ? '' : 'selected'} disabled>Choose a category</option>
                        <option value="coffee" ${this.formData.category === 'coffee' ? 'selected' : ''}>Coffee &amp; Cafes</option>
                        <option value="eateries" ${this.formData.category === 'eateries' ? 'selected' : ''}>Eateries &amp; Restaurants</option>
                        <option value="malls" ${this.formData.category === 'malls' ? 'selected' : ''}>Malls &amp; Shopping</option>
                        <option value="establishments" ${this.formData.category === 'establishments' ? 'selected' : ''}>Commercial Establishments</option>
                        <option value="schools" ${this.formData.category === 'schools' ? 'selected' : ''}>Schools &amp; Universities</option>
                        <option value="terminals" ${this.formData.category === 'terminals' ? 'selected' : ''}>Transport Terminals</option>
                    </select>
                </div>

                <!-- Description -->
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Short description <span style="font-weight: 400; color: #64748B;">(optional)</span>
                    </label>
                    <textarea id="inputBizDesc" maxlength="500" rows="3" placeholder="Tell commuters what makes your store special..."
                        style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; font-family: 'Outfit', sans-serif;"
                    >${this.escapeHtml(this.formData.description)}</textarea>
                </div>

                <!-- Contact Number -->
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Contact number <span style="font-weight: 400; color: #64748B;">(optional)</span>
                    </label>
                    <input type="text" id="inputBizContact" value="${this.escapeHtml(this.formData.contactNumber)}" maxlength="20" placeholder="0912 345 6789"
                        style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; font-family: 'Outfit', sans-serif;"
                    />
                </div>

                <!-- Offerings chip input -->
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Offerings &amp; Specialties <span style="color: #DC2626;">*</span>
                    </label>
                    <div id="offeringsEditorMount"></div>
                    <div id="offeringsError" style="font-size: 12px; color: #DC2626; margin-top: 2px; display: none;">Add at least 1 offering (up to 10).</div>
                </div>
            </div>
        `;

        // Wire inputs
        const fileInput = area.querySelector('#frontPhotoFileInput');
        area.querySelector('#btnSelectFrontPhoto').addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            const btn = area.querySelector('#btnSelectFrontPhoto');
            const errEl = area.querySelector('#frontPhotoError');
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
                errEl.textContent = 'Use a JPG, PNG or WebP photo.';
                errEl.style.display = 'block';
                return;
            }
            errEl.style.display = 'none';
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

            // Upload now (not at submit), so the draft keeps the photo after a reload
            btn.disabled = true;
            btn.textContent = 'Uploading…';
            try {
                this.formData.thumbnailUrl = await this.uploadFrontPhoto(compressed);
                this.formData.frontPhotoFile = null;
                this.triggerAutosave();
            } catch (upErr) {
                errEl.textContent = upErr.message || 'The photo could not be uploaded. Try again.';
                errEl.style.display = 'block';
            } finally {
                btn.disabled = false;
                btn.textContent = 'Change photo';
                this.validateCurrentStepButton();
            }
        });

        const nameInput = area.querySelector('#inputBizName');
        nameInput.addEventListener('input', (e) => {
            this.formData.name = e.target.value;
            this.updateLivePreview();
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });

        const catSelect = area.querySelector('#selectBizCategory');
        catSelect.addEventListener('change', (e) => {
            this.formData.category = e.target.value;
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });

        const descInput = area.querySelector('#inputBizDesc');
        descInput.addEventListener('input', (e) => {
            this.formData.description = e.target.value;
            this.triggerAutosave();
        });

        const contactInput = area.querySelector('#inputBizContact');
        contactInput.addEventListener('input', (e) => {
            this.formData.contactNumber = e.target.value;
            this.triggerAutosave();
        });

        // Mount offerings editor
        const mount = area.querySelector('#offeringsEditorMount');
        if (window.CalzadaBusinessFields?.renderOfferingsInput) {
            this.offeringsEditor = window.CalzadaBusinessFields.renderOfferingsInput(mount, {
                initialOfferings: this.formData.offerings,
                onChange: (newOfferings) => {
                    this.formData.offerings = newOfferings;
                    this.updateLivePreview();
                    this.validateCurrentStepButton();
                    this.triggerAutosave();
                }
            });
        }
    }

    renderLocationStep(area) {
        area.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 4px;">
                        Place Pin on Map <span style="color: #DC2626;">*</span>
                    </label>
                    <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">
                        Click or drag the pin to set your exact location (Uno, Real, or Halang).
                    </div>
                    <div id="wizardMapContainer" style="width: 100%; height: 260px; border: 1px solid #E2E8F0; border-radius: 8px; overflow: hidden; background: #F1F5F9;"></div>
                    <div id="mapCoverageError" style="font-size: 12px; color: #DC2626; margin-top: 4px; display: none;">
                        Pin must be inside Calzada's coverage area (Brgy. Uno, Real, Halang).
                    </div>
                </div>

                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Barangay <span style="color: #DC2626;">*</span>
                    </label>
                    <select id="selectBarangay" style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; background: #FFFFFF; font-family: 'Outfit', sans-serif;">
                        <option value="Uno" ${this.formData.barangay === 'Uno' ? 'selected' : ''}>Brgy. Uno</option>
                        <option value="Real" ${this.formData.barangay === 'Real' ? 'selected' : ''}>Brgy. Real</option>
                        <option value="Halang" ${this.formData.barangay === 'Halang' ? 'selected' : ''}>Brgy. Halang</option>
                    </select>
                </div>

                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Street address <span style="color: #DC2626;">*</span>
                    </label>
                    <input type="text" id="inputAddress" value="${this.escapeHtml(this.formData.address)}" maxlength="160" placeholder="House no., street, purok"
                        style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; font-family: 'Outfit', sans-serif;"
                    />
                    <div id="addressError" style="font-size: 12px; color: #DC2626; margin-top: 2px; display: none;">Street address is required.</div>
                </div>

                <div>
                    <label style="display: block; font-weight: 600; font-size: 14px; color: #042C53; margin-bottom: 6px;">
                        Nearby landmark <span style="font-weight: 400; color: #64748B;">(optional)</span>
                    </label>
                    <input type="text" id="inputLandmark" value="${this.escapeHtml(this.formData.landmark)}" maxlength="80" placeholder="Near a known spot (optional)"
                        style="width: 100%; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; font-size: 14px; color: #042C53; font-family: 'Outfit', sans-serif;"
                    />
                </div>
            </div>
        `;

        const brgySelect = area.querySelector('#selectBarangay');
        brgySelect.addEventListener('change', (e) => {
            this.formData.barangay = e.target.value;
            this.updateLivePreview();
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });

        const addrInput = area.querySelector('#inputAddress');
        addrInput.addEventListener('input', (e) => {
            this.formData.address = e.target.value;
            this.validateCurrentStepButton();
            this.triggerAutosave();
        });

        const landmarkInput = area.querySelector('#inputLandmark');
        landmarkInput.addEventListener('input', (e) => {
            this.formData.landmark = e.target.value;
            this.triggerAutosave();
        });

        // Initialize MapLibre
        setTimeout(() => this.initMapLibre(area), 50);
    }

    initMapLibre(area) {
        const mapContainer = area.querySelector('#wizardMapContainer');
        if (!mapContainer || typeof window.maplibregl === 'undefined') return;

        const defaultCenter = [this.formData.location.lng || 121.1652, this.formData.location.lat || 14.2117];

        this.map = new window.maplibregl.Map({
            container: mapContainer,
            style: 'https://tiles.openfreemap.org/styles/bright',
            center: defaultCenter,
            zoom: 14
        });

        if (window.CalzadaScope && typeof window.CalzadaScope.addFog === 'function') {
            window.CalzadaScope.addFog(this.map);
        }

        this.marker = new window.maplibregl.Marker({ draggable: true, color: '#378ADD' })
            .setLngLat(defaultCenter)
            .addTo(this.map);

        const onPinMoved = (lngLat) => {
            const lat = Number(lngLat.lat.toFixed(6));
            const lng = Number(lngLat.lng.toFixed(6));

            if (window.CalzadaScope && typeof window.CalzadaScope.contains === 'function' && !window.CalzadaScope.contains(lat, lng)) {
                const toastMsg = (typeof window.t === 'function')
                    ? window.t('scope.outside_toast')
                    : 'Calzada covers Brgy. Uno, Real and Halang for now.';
                if (typeof window.showToast === 'function') {
                    window.showToast(toastMsg, 'warning');
                }
                const prev = [this.formData.location.lng || 121.1652, this.formData.location.lat || 14.2117];
                this.marker.setLngLat(prev);
                return;
            }

            this.formData.location = { lat, lng };

            const errEl = area.querySelector('#mapCoverageError');
            if (errEl) errEl.style.display = 'none';

            // Auto-preselect nearest barangay
            let nearest = BARANGAY_CENTERS[0];
            let minDist = Infinity;
            BARANGAY_CENTERS.forEach(b => {
                const dist = Math.hypot(b.lat - lat, b.lng - lng);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = b;
                }
            });

            this.formData.barangay = nearest.name;
            const brgySel = area.querySelector('#selectBarangay');
            if (brgySel) brgySel.value = nearest.name;

            this.updateLivePreview();
            this.validateCurrentStepButton();
            this.triggerAutosave();
        };

        this.marker.on('dragend', () => {
            onPinMoved(this.marker.getLngLat());
        });

        this.map.on('click', (e) => {
            const { lat, lng } = e.lngLat;
            if (window.CalzadaScope && typeof window.CalzadaScope.contains === 'function' && !window.CalzadaScope.contains(lat, lng)) {
                const toastMsg = (typeof window.t === 'function')
                    ? window.t('scope.outside_toast')
                    : 'Calzada covers Brgy. Uno, Real and Halang for now.';
                if (typeof window.showToast === 'function') {
                    window.showToast(toastMsg, 'warning');
                }
                return;
            }
            this.marker.setLngLat(e.lngLat);
            onPinMoved(e.lngLat);
        });
    }

    renderHoursStep(area) {
        area.innerHTML = `
            <div>
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
            listed: { name: 'Listed', price: 59, postsPerMonth: 4, newTagDays: 7, boostDays: 0 },
            plus360: { name: 'Listed + 360', price: 199, postsPerMonth: 8, recommended: true, newTagDays: 14, boostDays: 7, has360: true },
            featured: { name: 'Featured', price: 299, postsPerMonth: null, newTagDays: 30, boostDays: 30, has360: true }
        };

        area.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 16px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
                    ${Object.entries(plans).map(([planKey, cfg]) => {
                        const isSelected = this.formData.plan === planKey;
                        const isRec = cfg.recommended;
                        return `
                            <div class="plan-select-card plan-card-${planKey}" data-plan="${planKey}" style="border: 2px solid ${isSelected ? '#378ADD' : '#E2E8F0'}; border-radius: 12px; padding: 18px 16px; background: #FFFFFF; cursor: pointer; position: relative; transition: all 0.15s ease;">
                                ${isRec ? '<div style="font-size: 11px; font-weight: 700; color: #378ADD; text-transform: uppercase; margin-bottom: 4px;">Recommended</div>' : ''}
                                <h4 style="font-family: 'Sora', sans-serif; font-size: 16px; font-weight: 700; color: #042C53; margin: 0 0 6px 0;">${cfg.name || planKey}</h4>
                                <div style="font-size: 22px; font-weight: 800; color: #042C53; margin-bottom: 12px;">₱${cfg.price}<span style="font-size: 13px; font-weight: 500; color: #64748B;">/mo</span></div>
                                <ul style="list-style: none; padding: 0; margin: 0; font-size: 13px; color: #042C53; display: flex; flex-direction: column; gap: 6px;">
                                    <li>&#10003; ${cfg.postsPerMonth ? `${cfg.postsPerMonth} updates/mo` : 'Unlimited updates'}</li>
                                    <li>&#10003; ${cfg.newTagDays}-day "New" tag</li>
                                    ${cfg.boostDays ? `<li>&#10003; ${cfg.boostDays}-day search boost</li>` : ''}
                                    ${cfg.has360 ? `<li>&#10003; 360° Virtual Tour</li>` : ''}
                                </ul>
                            </div>
                        `;
                    }).join('')}
                </div>

                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #64748B;">
                    You pay with GCash only after we approve your business.
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
        const planName = window.CALZADA_PLANS?.[this.formData.plan]?.name || this.formData.plan;

        area.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <!-- Review summary details -->
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #E2E8F0;">
                        <div>
                            <span style="font-size: 12px; color: #64748B; display: block;">Store</span>
                            <span style="font-weight: 600; font-size: 14px; color: #042C53;">${this.escapeHtml(this.formData.name)} (${this.formData.category})</span>
                        </div>
                        <a href="#store" style="font-size: 13px; font-weight: 600; color: #378ADD; text-decoration: none;">Edit</a>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #E2E8F0;">
                        <div>
                            <span style="font-size: 12px; color: #64748B; display: block;">Location</span>
                            <span style="font-weight: 600; font-size: 14px; color: #042C53;">Brgy. ${this.formData.barangay} · ${this.escapeHtml(this.formData.address)}</span>
                        </div>
                        <a href="#location" style="font-size: 13px; font-weight: 600; color: #378ADD; text-decoration: none;">Edit</a>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 1px solid #E2E8F0;">
                        <div>
                            <span style="font-size: 12px; color: #64748B; display: block;">Plan</span>
                            <span style="font-weight: 600; font-size: 14px; color: #042C53;">${planName}</span>
                        </div>
                        <a href="#plan" style="font-size: 13px; font-weight: 600; color: #378ADD; text-decoration: none;">Edit</a>
                    </div>
                </div>

                <!-- Terms checkbox -->
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px;">
                    <label style="display: flex; align-items: flex-start; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="chkTermsAgreed" ${this.formData.termsAgreed ? 'checked' : ''} style="margin-top: 3px; width: 16px; height: 16px; accent-color: #378ADD;" />
                        <span style="font-size: 13px; color: #042C53; line-height: 1.4;">
                            I confirm that the business details provided are accurate and agree to Calzada's terms of service and registration review.
                        </span>
                    </label>
                </div>

                <div id="submitErrorMessage" style="display: none; background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 12px; color: #DC2626; font-size: 13px;"></div>
            </div>
        `;

        const chk = area.querySelector('#chkTermsAgreed');
        chk.addEventListener('change', () => {
            this.formData.termsAgreed = chk.checked;
            this.validateCurrentStepButton();
        });
    }

    updateLivePreview() {
        const prevImg = this.containerEl.querySelector('#prevImg');
        const prevEmpty = this.containerEl.querySelector('#prevImgPlaceholder');
        const prevName = this.containerEl.querySelector('#prevName');
        const prevBrgy = this.containerEl.querySelector('#prevBarangay');
        const prevStatus = this.containerEl.querySelector('#prevOpenStatus');
        const prevOfferings = this.containerEl.querySelector('#prevOfferings');

        if (!prevName) return;

        // Photo
        const photoSrc = this.formData.photoPreviewUrl || this.formData.thumbnailUrl;
        if (photoSrc) {
            prevImg.src = photoSrc;
            prevImg.style.display = 'block';
            prevEmpty.style.display = 'none';
        } else {
            prevImg.style.display = 'none';
            prevEmpty.style.display = 'flex';
        }

        // Name
        prevName.textContent = this.formData.name.trim() || 'Business Name';

        // Barangay
        prevBrgy.textContent = this.formData.barangay ? `Brgy. ${this.formData.barangay}, Calamba` : 'Barangay';

        // Open status
        const openInfo = window.CalzadaBusinessFields?.getOpenStatus(this.formData.openHours) || {
            isOpen: true,
            formattedText: 'Open now · Closes 6:00 PM'
        };
        prevStatus.textContent = openInfo.formattedText;
        prevStatus.style.color = openInfo.isOpen ? '#16A34A' : '#DC2626';

        // First 3 offerings
        const first3 = (this.formData.offerings || []).slice(0, 3);
        prevOfferings.textContent = first3.length > 0 ? first3.join(' · ') : 'Offerings & Specialties';
    }

    async uploadFrontPhoto(fileOrBlob) {
        const user = this.auth.currentUser || this.currentUser;
        if (!user) throw new Error('Sign in again to upload the photo.');
        const token = await user.getIdToken();
        const form = new FormData();
        form.append('photo', fileOrBlob, 'front.jpg');
        const res = await fetch('/api/businesses/upload-thumbnail', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.url) throw new Error(json.error || 'The photo could not be uploaded. Try again.');
        return json.url;
    }

    setSaveStatus(text) {
        (this.saveStatusEls || []).forEach(el => { el.textContent = text; });
    }

    async saveDraftNow() {
        if (!this.currentUser || this.isSubmitted) return;
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;
        try {
            const draftRef = doc(this.db, 'businessDrafts', this.currentUser.uid);
            const draftData = {
                step: this.currentStep,
                name: this.formData.name || '',
                category: this.formData.category || '',
                description: this.formData.description || '',
                contactNumber: this.formData.contactNumber || '',
                offerings: this.formData.offerings || [],
                location: this.formData.location || { lat: 14.2117, lng: 121.1652 },
                barangay: this.formData.barangay || '',
                address: this.formData.address || '',
                landmark: this.formData.landmark || '',
                openHours: this.formData.openHours || {},
                plan: this.formData.plan || 'plus360',
                thumbnailUrl: this.formData.thumbnailUrl || '',
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
                this.formData.category = d.category || this.formData.category;
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
            // 1. Upload photo if file present
            let finalPhotoUrl = this.formData.thumbnailUrl;
            if (this.formData.frontPhotoFile) {
                const token = await this.currentUser.getIdToken();
                const form = new FormData();
                form.append('photo', this.formData.frontPhotoFile);

                const upRes = await fetch('/api/businesses/upload-thumbnail', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: form
                });
                const upJson = await upRes.json();
                if (!upRes.ok || !upJson.url) {
                    throw new Error(upJson.error || 'Failed to upload store front photo.');
                }
                finalPhotoUrl = upJson.url;
            }

            if (!finalPhotoUrl) {
                throw new Error('Front store photo is required.');
            }

            // 2. Create businesses/{id} document
            const newBizRef = doc(collection(this.db, 'businesses'));
            const businessId = newBizRef.id;

            const bizPayload = {
                ownerId: this.currentUser.uid,
                status: 'pending',
                submittedAt: serverTimestamp(),
                name: this.formData.name.trim(),
                category: this.formData.category,
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

            const batch = writeBatch(this.db);
            batch.set(newBizRef, bizPayload);
            const ownerPrivateRef = doc(this.db, 'businesses', businessId, 'private', 'owner');
            batch.set(ownerPrivateRef, {
                ownerEmail: this.currentUser.email || null
            });
            await batch.commit();

            // 3. Delete the draft
            try {
                await deleteDoc(doc(this.db, 'businessDrafts', this.currentUser.uid));
            } catch (dErr) {
                console.warn('Could not delete draft:', dErr);
            }

            // 4. POST /api/events { event: 'application_received' } (unawaited)
            this.currentUser.getIdToken().then(idToken => {
                fetch('/api/events', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        event: 'application_received',
                        entityId: businessId
                    })
                }).catch(e => console.warn('application_received error:', e));
            }).catch(e => console.warn('Could not get token for event:', e));

            // 5. Show success screen
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
            <div style="max-width: 680px; margin: 40px auto; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 36px 32px; text-align: center;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: #F0FDF4; border: 1px solid #BBF7D0; color: #16A34A; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; margin-bottom: 20px;">
                    &#10003;
                </div>
                <h2 style="font-family: 'Sora', sans-serif; font-size: 24px; font-weight: 700; color: #042C53; margin: 0 0 10px 0;">
                    Registration submitted!
                </h2>
                <p style="font-size: 15px; color: #64748B; margin: 0 0 28px 0; line-height: 1.5;">
                    Your business is now pending review. We'll email you at <strong>${this.escapeHtml(userEmail)}</strong> from <strong>thecalzada@gmail.com</strong> once approved.
                </p>

                <!-- Process Timeline -->
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
                    <a href="/my-business" style="background: #378ADD; color: #FFFFFF; border-radius: 8px; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 8px;">
                        Go to My Business &rarr;
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
