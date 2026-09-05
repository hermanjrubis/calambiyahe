/**
 * place-panel.js
 * Handles the Side-by-Side Place Overview Panel logic for places.html
 */

const placesData = {
    "STI College Calamba": {
        name: "STI College - Calamba",
        category: "School",
        image: "/assets/places/sti-college/sti-1.jpg",
        full_address: "Manila S Rd, Calamba, 4027 Laguna",
        phone: "(049) 502 8225",
        website: "sti.edu",
        opening_hours: {
            "mon": "8:00 AM - 5:00 PM",
            "tue": "8:00 AM - 5:00 PM",
            "wed": "8:00 AM - 5:00 PM",
            "thu": "8:00 AM - 5:00 PM",
            "fri": "8:00 AM - 5:00 PM",
            "sat": "8:00 AM - 12:00 PM",
            "sun": "Closed"
        },
        barangay: "Brgy. Halang, Calamba City",
        landmarks: ["Near Robinsons Calamba", "Along National Highway", "Beside LTO Calamba"],
        howToGetThere: "Ride any jeepney going to Crossing or Halang. Fare starts at ₱13. Travel time approx. 10–15 mins.",
        about: "STI College Calamba offers tech and business programs. It is one of the major schools along the National Highway in Halang.",
        fare: "₱13–₱20",
        travelTime: "10–15 mins",
        transport: "Jeepney / Tricycle"
    },
    "STI College - Calamba": {
        name: "STI College - Calamba",
        category: "School",
        image: "/assets/places/sti-college/sti-1.jpg",
        full_address: "Manila S Rd, Calamba, 4027 Laguna",
        phone: "(049) 502 8225",
        website: "sti.edu",
        opening_hours: {
            "mon": "8:00 AM - 5:00 PM",
            "tue": "8:00 AM - 5:00 PM",
            "wed": "8:00 AM - 5:00 PM",
            "thu": "8:00 AM - 5:00 PM",
            "fri": "8:00 AM - 5:00 PM",
            "sat": "8:00 AM - 12:00 PM",
            "sun": "Closed"
        },
        barangay: "Brgy. Halang, Calamba City",
        landmarks: ["Near Robinsons Calamba", "Along National Highway", "Beside LTO Calamba"],
        howToGetThere: "Ride any jeepney going to Crossing or Halang. Fare starts at ₱13. Travel time approx. 10–15 mins.",
        about: "STI College Calamba offers tech and business programs. It is one of the major schools along the National Highway in Halang.",
        fare: "₱13–₱20",
        travelTime: "10–15 mins",
        transport: "Jeepney / Tricycle"
    },
    "Calamba City Hall": {
        name: "Calamba City Hall",
        category: "Establishment",
        image: "https://lh3.googleusercontent.com/pw/AP1GczM1DDQ8qkvS-5Yc_dvrpnI5HAwRSuj5zofc7zFnSeoqvrNcP1lBLZRsQv-GuutdVIb96tE83_WyDHGHxYviOh7JlUiUZNWnKJRuEOC4cyb6If3r669AS8ZN9iJB6fo_itMSwMNjVPSPmAvzo7Fe6Xw5zw=w2734-h2050-s-no-gm?authuser=0",
        full_address: "Bacnotan Drive, Brgy. Real, Calamba, 4027 Laguna",
        phone: "(049) 545 6789",
        website: "calambacity.gov.ph",
        opening_hours: {
            "mon": "8:00 AM - 5:00 PM",
            "tue": "8:00 AM - 5:00 PM",
            "wed": "8:00 AM - 5:00 PM",
            "thu": "8:00 AM - 5:00 PM",
            "fri": "8:00 AM - 5:00 PM",
            "sat": "Closed",
            "sun": "Closed"
        },
        barangay: "Brgy. Real, Calamba City",
        landmarks: ["Near Rizal Shrine", "Beside Calamba Plaza", "Near St. John the Baptist Parish"],
        howToGetThere: "Take a tricycle from Calamba Crossing or a Jeepney bound for Canlubang/Mayapa. Tell the driver to drop you off at the City Hall.",
        about: "The Calamba City Hall is the seat of local government. It features a modern architectural design and serves as a central hub for public services and local events.",
        fare: "₱15–₱40",
        travelTime: "15–20 mins",
        transport: "Jeepney / Tricycle"
    },
    "SM City Calamba": {
        name: "SM City Calamba",
        category: "Mall",
        image: "https://evendo-location-media.s3.amazonaws.com/ShoppingImages/6267eb28-343f-4cc5-a08f-8f6022fcba2b",
        full_address: "National Highway, Brgy. Real, Calamba, 4027 Laguna",
        phone: "(049) 530 0061",
        website: "smsupermalls.com",
        opening_hours: {
            "mon": "10:00 AM - 9:00 PM",
            "tue": "10:00 AM - 9:00 PM",
            "wed": "10:00 AM - 9:00 PM",
            "thu": "10:00 AM - 9:00 PM",
            "fri": "10:00 AM - 10:00 PM",
            "sat": "10:00 AM - 10:00 PM",
            "sun": "10:00 AM - 9:00 PM"
        },
        barangay: "Brgy. Real, Calamba City",
        landmarks: ["Calamba Crossing", "Near Calamba Medical Center"],
        howToGetThere: "Accessible via almost all Jeepneys heading to Calamba Crossing. It is located right at the major intersection of the city.",
        about: "SM City Calamba is a major shopping mall providing retail, dining, and entertainment options for residents of Calamba and nearby towns.",
        fare: "₱13",
        travelTime: "5–10 mins",
        transport: "Jeepney / Bus"
    },
    "Rizal Shrine": {
        name: "Bahay ni Rizal",
        category: "Historic",
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS_EEk4rCx1aWAAIKLD-D9dGvcre4MjbxKdFQ&s",
        full_address: "Francisco Mercado St. cor. J.P. Rizal St., Poblacion, Calamba, 4027 Laguna",
        phone: "(049) 834 1599",
        website: "nhcp.gov.ph",
        opening_hours: {
            "mon": "Closed",
            "tue": "8:00 AM - 4:00 PM",
            "wed": "8:00 AM - 4:00 PM",
            "thu": "8:00 AM - 4:00 PM",
            "fri": "8:00 AM - 4:00 PM",
            "sat": "8:00 AM - 4:00 PM",
            "sun": "8:00 AM - 4:00 PM"
        },
        barangay: "Brgy. 5 (Poblacion), Calamba City",
        landmarks: ["Adjacent to St. John the Baptist Church", "Near Calamba City Plaza"],
        howToGetThere: "Take a tricycle from Calamba Crossing directly to the Rizal Shrine. Fare is usually around ₱40-₱50 for special trips.",
        about: "A reproduction of the original two-story, Spanish-colonial style house where José Rizal was born. It is one of the most visited historical sites in Laguna.",
        fare: "₱40–₱50",
        travelTime: "15 mins",
        transport: "Tricycle"
    },
    "Moonbucks": {
        name: "Moonbucks",
        category: "Coffee Shop",
        image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ5SF7ZvAMmCMYah6b2qjK4ziOySSiP8JzzCg&s",
        full_address: "Elepaño Subdivision, Brgy. 3 (Bayan), Calamba City, Laguna",
        phone: "(049) 545 1234",
        website: "facebook.com/moonbuckscalamba",
        opening_hours: {
            "mon": "9:00 AM - 11:00 PM",
            "tue": "9:00 AM - 11:00 PM",
            "wed": "9:00 AM - 11:00 PM",
            "thu": "9:00 AM - 11:00 PM",
            "fri": "9:00 AM - 12:00 AM",
            "sat": "9:00 AM - 12:00 AM",
            "sun": "9:00 AM - 11:00 PM"
        },
        barangay: "Elepaño Subdivision, Brgy. 3 (Bayan), Calamba City",
        landmarks: ["Near Calamba Plaza", "Bayan", "Elepaño Subdivision"],
        howToGetThere: "Ride any jeepney going to Calamba Bayan. Drop off at Elepaño Subdivision / Plaza area. The coffee shop is within walking distance.",
        about: "A cozy local favorite offering affordable coffee, snacks, and a chill atmosphere. Features amenities like billiards and dynamic seating, making it a great hangout spot.",
        fare: "₱13–₱30",
        travelTime: "10–15 mins",
        transport: "Jeepney / Tricycle"
    }
};

let currentActivePlace = null;
let currentPlaceId = null;
let panelDOMInitialized = false;

// Inject Panel HTML into DOM
function initPlacePanelDOM() {
    if (panelDOMInitialized || document.getElementById('placePanel')) {
        panelDOMInitialized = true;
        return;
    }

    const panelHTML = `
        <div class="place-panel-backdrop" id="placePanelBackdrop"></div>
        <div class="place-panel-container" id="placePanel">
            <div class="panel-drag-handle"><div class="panel-drag-pill"></div></div>
            <button class="panel-close-btn" id="closePanelBtn" aria-label="Close details" type="button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            
            <!-- Hero Carousel / Image Container (12px radius) -->
            <div class="panel-hero" id="ppHero">
                <div class="carousel-container" id="ppCarousel">
                    <div class="carousel-slides" id="ppCarouselSlides">
                        <img id="ppImage" class="carousel-slide" src="" alt="Place Hero">
                    </div>
                    <button class="carousel-nav carousel-prev" id="ppCarouselPrev" aria-label="Previous Image" type="button" style="display:none;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button class="carousel-nav carousel-next" id="ppCarouselNext" aria-label="Next Image" type="button" style="display:none;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                    <div class="carousel-dots" id="ppCarouselDots"></div>
                </div>
            </div>


            <!-- Details Body -->
            <div class="panel-body" id="ppBody">
                <!-- 1. Header Row: 18px semibold Name + Save Button -->
                <div class="panel-header-row">
                    <h3 class="panel-place-title" id="ppName">Place Name</h3>
                    <button class="panel-save-btn" id="ppSaveBtn" type="button" aria-label="Save place" title="Save place">
                        <svg class="save-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </button>
                </div>

                <!-- 360 Photosphere Preview Section (Rendered only if placeId has linked 360 photo) -->
                <div class="panel-360-section" id="pp360Section" style="display:none;">
                    <div class="panel-360-container">
                        <div class="popup-360-thumb-wrap" id="pp360ThumbWrap" title="Click to view 360° photo">
                            <img src="" alt="360 View" class="popup-360-thumb" id="pp360Thumb">
                            <span class="popup-360-badge">360°</span>
                        </div>
                        <div class="popup-360-action-wrap">
                            <button type="button" class="popup-360-btn" id="pp360Btn">
                                <svg class="popup-360-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="9"/>
                                    <path d="M3.6 9h16.8M3.6 15h16.8"/>
                                    <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
                                </svg>
                                <span>View 360°</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 2. Info Block with Hairline Dividers -->
                <div class="panel-info-block" id="ppInfoBlock">
                    <!-- Address Row -->
                    <div class="panel-info-row" id="ppRowAddress">
                        <div class="panel-info-icon" title="Address">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>
                        </div>
                        <div class="panel-info-text" id="ppAddress">--</div>
                    </div>

                    <!-- Hours Row with Expandable Accordion -->
                    <div class="panel-info-row panel-hours-row" id="ppRowHours">
                        <div class="panel-info-icon" title="Opening Hours">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div class="panel-hours-wrapper" id="ppHoursWrapper">
                            <div class="panel-hours-header" id="ppHoursToggle">
                                <span class="panel-hours-status" id="ppHoursStatus">Open · Closes 5 PM</span>
                                <svg class="panel-hours-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="6 9 12 15 18 9"></polyline>
                                </svg>
                            </div>
                            <div class="panel-hours-dropdown" id="ppHoursDropdown">
                                <table class="panel-hours-table" id="ppHoursTable"></table>
                            </div>
                        </div>
                    </div>

                    <!-- Website Row -->
                    <div class="panel-info-row" id="ppRowWebsite">
                        <div class="panel-info-icon" title="Website">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="2" y1="12" x2="22" y2="12"></line>
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                            </svg>
                        </div>
                        <div class="panel-info-text">
                            <a href="#" target="_blank" rel="noopener noreferrer" class="panel-info-link" id="ppWebsite">--</a>
                        </div>
                    </div>

                    <!-- Phone Row -->
                    <div class="panel-info-row" id="ppRowPhone">
                        <div class="panel-info-icon" title="Phone">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            </svg>
                        </div>
                        <div class="panel-info-text">
                            <a href="#" class="panel-info-link" id="ppPhone">--</a>
                        </div>
                    </div>
                </div>

                <!-- 3. Rating Section (5 Outline Stars, interactive on hover/click) -->
                <div class="panel-rating-section" id="ppRatingCard">
                    <div class="rating-header">
                        <span class="rating-label">Rating & reviews</span>
                        <div class="rating-summary">
                            <span class="rating-score" id="ppRatingScore">0.0</span>
                            <svg class="rating-star-badge" width="13" height="13" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" stroke-width="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                            <span class="rating-count" id="ppRatingCount">(0)</span>
                        </div>
                    </div>

                    <!-- 5 Outline Star Picker -->
                    <div class="star-rating-picker" id="ppStarPicker">
                        <button type="button" class="star-btn" data-value="1" aria-label="1 star">
                            <svg class="star-outline-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </button>
                        <button type="button" class="star-btn" data-value="2" aria-label="2 stars">
                            <svg class="star-outline-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </button>
                        <button type="button" class="star-btn" data-value="3" aria-label="3 stars">
                            <svg class="star-outline-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </button>
                        <button type="button" class="star-btn" data-value="4" aria-label="4 stars">
                            <svg class="star-outline-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </button>
                        <button type="button" class="star-btn" data-value="5" aria-label="5 stars">
                            <svg class="star-outline-svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                            </svg>
                        </button>
                    </div>

                    <!-- Post-interaction feedback / prompts (Hidden upfront) -->
                    <div class="rating-feedback-area" id="ppRatingFeedbackArea" style="display:none;">
                        <!-- Inline unauthenticated login prompt revealed ONLY on star click -->
                        <div class="rating-inline-auth" id="ppRatingAuthNotice" style="display:none;">
                            Log in to submit a rating — <a href="login.html" class="rating-inline-login-link">Log in</a>
                        </div>

                        <!-- Action Bar for existing reviews (Collapsed view) -->
                        <div class="rating-action-bar" id="ppRatingActionBar" style="display:none;">
                            <button type="button" class="btn-edit-review" id="ppEditReviewBtn">Update rating</button>
                            <button type="button" class="btn-delete-review" id="ppDeleteReviewBtn" style="display:none;">Delete</button>
                        </div>

                        <!-- Authenticated review comment & submission -->
                        <div class="rating-comment-box" id="ppRatingCommentBox" style="display:none;">
                            <textarea id="ppRatingCommentInput" class="rating-comment-textarea" placeholder="Share your experience... (optional)" rows="2" maxlength="500"></textarea>
                            <div class="rating-form-buttons">
                                <button type="button" class="btn-cancel-edit" id="ppCancelEditBtn" style="display:none;">Cancel</button>
                                <button type="button" class="btn-submit-review" id="ppSubmitReviewBtn">Submit rating</button>
                            </div>
                        </div>

                        <p class="rating-prompt" id="ppRatingPrompt" style="display:none;"></p>
                    </div>
                </div>

                <!-- 4. Customer Reviews List -->
                <div class="panel-reviews-section" id="ppReviewsSection">
                    <div class="reviews-section-header">
                        <span class="reviews-section-title" id="ppReviewsTitle">Customer reviews (0)</span>
                        <button type="button" class="reviews-see-more-btn" id="ppReviewsSeeMoreBtn" style="display:none;">See more</button>
                    </div>

                    <div class="reviews-container" id="ppReviewsContainer">
                        <div class="reviews-loading-state" id="ppReviewsLoading" style="display:none;">
                            <div class="review-skeleton-item">
                                <div class="skeleton-avatar"></div>
                                <div class="skeleton-lines">
                                    <div class="skeleton-line short"></div>
                                    <div class="skeleton-line"></div>
                                </div>
                            </div>
                        </div>

                        <div class="reviews-empty-state" id="ppReviewsEmpty" style="display:none;">
                            No ratings yet.
                        </div>

                        <div class="reviews-list" id="ppReviewsList"></div>
                    </div>
                </div>

                <!-- 5. Bottom Action: Plan Route Primary Button -->
                <div class="panel-bottom-section">
                    <button class="panel-cta-btn" id="ppPlanBtn" type="button">Plan route</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', panelHTML);
    panelDOMInitialized = true;

    const backdrop = document.getElementById('placePanelBackdrop');
    const closeBtn = document.getElementById('closePanelBtn');
    const planBtn = document.getElementById('ppPlanBtn');
    const hoursToggle = document.getElementById('ppHoursToggle');
    const hoursWrapper = document.getElementById('ppHoursWrapper');
    const saveBtn = document.getElementById('ppSaveBtn');

    // Close Events
    if (backdrop) backdrop.addEventListener('click', closePlacePanel);
    if (closeBtn) closeBtn.addEventListener('click', closePlacePanel);

    // Opening Hours Accordion Toggle
    if (hoursToggle && hoursWrapper) {
        hoursToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            hoursWrapper.classList.toggle('expanded');
        });
    }

    // Save Place Event
    if (saveBtn) {
        saveBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentActivePlace) return;

            const placeName = currentActivePlace.name;
            const category = currentActivePlace.category || 'Establishment';
            const isCurrentlySaved = saveBtn.classList.contains('saved');

            // Toggle visual state
            if (isCurrentlySaved) {
                saveBtn.classList.remove('saved');
                saveBtn.setAttribute('title', 'Save place');
            } else {
                saveBtn.classList.add('saved');
                saveBtn.setAttribute('title', 'Place saved');
            }

            // Sync with Calzada User Stats / Firestore / localStorage
            if (typeof window.toggleSavePlace === 'function') {
                window.toggleSavePlace(placeName, category, currentPlaceId);
            } else if (window.CalzadaActivity) {
                if (isCurrentlySaved) {
                    window.CalzadaActivity.unsavePlace(currentPlaceId || placeName);
                } else {
                    window.CalzadaActivity.savePlace(currentPlaceId || placeName, placeName, { category });
                }
            } else {
                // Fallback direct localStorage toggle
                let saved = JSON.parse(localStorage.getItem('calzadaSavedPlaces') || '[]');
                const idx = saved.findIndex(s => (s.name || s.placeName || '').toLowerCase() === placeName.toLowerCase());
                if (idx > -1) {
                    saved.splice(idx, 1);
                } else {
                    saved.unshift({ name: placeName, category, id: currentPlaceId });
                }
                localStorage.setItem('calzadaSavedPlaces', JSON.stringify(saved));
            }

            // Sync to backend endpoint
            if (currentPlaceId) {
                try {
                    await fetch(`/api/places/${currentPlaceId}/save`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ saved: !isCurrentlySaved })
                    });
                } catch (err) {
                    console.warn('Backend save API sync:', err);
                }
            }
        });
    }

    // Plan Route Event
    if (planBtn) {
        planBtn.addEventListener('click', () => {
            const placeName = planBtn.getAttribute('data-dest');
            if (placeName) {
                setTimeout(() => {
                    window.location.href = `planner.html?dest=${encodeURIComponent(placeName)}`;
                }, 0);
            }
        });
    }
}

// Inject on DOM Content Loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPlacePanelDOM();
        handleUrlParamsOnLoad();
    });
} else {
    initPlacePanelDOM();
    handleUrlParamsOnLoad();
}

function handleUrlParamsOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const placeParam = urlParams.get('place');
    if (placeParam) {
        setTimeout(() => openPlacePanel(placeParam), 250);
    }
    
    // Handle back button closing panel
    window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('place')) {
            closePlacePanel(false);
        }
    });
}


let currentCarouselIndex = 0;
let carouselImagesList = [];

function setupCarousel(images) {
    const slidesContainer = document.getElementById('ppCarouselSlides');
    const dotsContainer = document.getElementById('ppCarouselDots');
    const prevBtn = document.getElementById('ppCarouselPrev');
    const nextBtn = document.getElementById('ppCarouselNext');
    const carouselEl = document.getElementById('ppCarousel');

    if (!slidesContainer) return;
    slidesContainer.innerHTML = '';
    dotsContainer.innerHTML = '';
    currentCarouselIndex = 0;
    carouselImagesList = images || [];

    if (carouselImagesList.length === 0) {
        slidesContainer.innerHTML = `<img class="carousel-slide" src="../assets/hero-places-bg.png" alt="Place Hero">`;
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        dotsContainer.style.display = 'none';
        return;
    }

    carouselImagesList.forEach((imgObj, idx) => {
        const imgEl = document.createElement('img');
        imgEl.className = 'carousel-slide';
        imgEl.src = imgObj.image_path || imgObj.image || '../assets/hero-places-bg.png';
        imgEl.alt = `Place Image ${idx + 1}`;
        slidesContainer.appendChild(imgEl);

        if (carouselImagesList.length > 1) {
            const dot = document.createElement('div');
            dot.className = `carousel-dot ${idx === 0 ? 'active' : ''}`;
            dotsContainer.appendChild(dot);
        }
    });

    if (carouselImagesList.length > 1) {
        dotsContainer.style.display = 'flex';
    } else {
        dotsContainer.style.display = 'none';
    }

    if (prevBtn && nextBtn) {
        prevBtn.onclick = (e) => {
            e.stopPropagation();
            goToCarouselSlide(currentCarouselIndex - 1);
        };
        nextBtn.onclick = (e) => {
            e.stopPropagation();
            goToCarouselSlide(currentCarouselIndex + 1);
        };
    }

    if (carouselEl) {
        let touchStartX = 0;
        let touchStartY = 0;

        carouselEl.ontouchstart = (e) => {
            if (e.touches && e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        };

        carouselEl.ontouchend = (e) => {
            if (e.changedTouches && e.changedTouches.length > 0) {
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                const diffX = touchStartX - touchEndX;
                const diffY = touchStartY - touchEndY;

                if (Math.abs(diffX) > 30 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX > 0) {
                        goToCarouselSlide(currentCarouselIndex + 1);
                    } else {
                        goToCarouselSlide(currentCarouselIndex - 1);
                    }
                }
            }
        };
    }

    goToCarouselSlide(0);
}

function goToCarouselSlide(index) {
    if (carouselImagesList.length === 0) return;
    if (index < 0) index = 0;
    if (index >= carouselImagesList.length) index = carouselImagesList.length - 1;

    currentCarouselIndex = index;
    const slidesContainer = document.getElementById('ppCarouselSlides');
    if (slidesContainer) {
        slidesContainer.style.transform = `translateX(-${index * 100}%)`;
    }

    const dots = document.querySelectorAll('#ppCarouselDots .carousel-dot');
    dots.forEach((dot, idx) => {
        if (idx === index) {
            dot.classList.add('active');
        } else {
            dot.classList.remove('active');
        }
    });

    const prevBtn = document.getElementById('ppCarouselPrev');
    const nextBtn = document.getElementById('ppCarouselNext');
    if (prevBtn && nextBtn) {
        if (carouselImagesList.length <= 1) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
        } else {
            prevBtn.style.display = index > 0 ? 'flex' : 'none';
            nextBtn.style.display = index < carouselImagesList.length - 1 ? 'flex' : 'none';
        }
    }
}

/**
 * Format Opening Hours status and schedule map
 */
function formatOpeningHoursStatus(openingHours) {
    if (!openingHours) return null;
    let hoursObj = openingHours;
    if (typeof hoursObj === 'string') {
        try {
            hoursObj = JSON.parse(hoursObj);
        } catch (e) {
            return { isOpen: true, statusText: hoursObj, hoursMap: null, todayKey: '' };
        }
    }
    if (typeof hoursObj !== 'object' || hoursObj === null) return null;

    const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const now = new Date();
    const currentDayIdx = now.getDay();
    const todayKey = days[currentDayIdx];
    const todaySchedule = hoursObj[todayKey];

    const parseTimeToMins = (timeStr) => {
        if (!timeStr) return null;
        const match = timeStr.trim().match(/^(\d+):?(\d+)?\s*(AM|PM)$/i);
        if (!match) return null;
        let hours = parseInt(match[1], 10);
        const mins = match[2] ? parseInt(match[2], 10) : 0;
        const period = match[3].toUpperCase();
        if (period === 'PM' && hours < 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + mins;
    };

    const currentMins = now.getHours() * 60 + now.getMinutes();
    let isOpen = false;
    let statusText = 'Closed';

    if (todaySchedule && todaySchedule.toLowerCase() !== 'closed') {
        const parts = todaySchedule.split('-').map(s => s.trim());
        if (parts.length === 2) {
            const startMins = parseTimeToMins(parts[0]);
            const endMins = parseTimeToMins(parts[1]);

            if (startMins !== null && endMins !== null) {
                if (currentMins >= startMins && currentMins < endMins) {
                    isOpen = true;
                    statusText = `Open · Closes ${parts[1]}`;
                } else if (currentMins < startMins) {
                    isOpen = false;
                    statusText = `Closed · Opens ${parts[0]}`;
                } else {
                    isOpen = false;
                    const nextDayKey = days[(currentDayIdx + 1) % 7];
                    const nextSched = hoursObj[nextDayKey];
                    if (nextSched && nextSched.toLowerCase() !== 'closed') {
                        const nextStart = nextSched.split('-')[0].trim();
                        statusText = `Closed · Opens ${nextStart} tomorrow`;
                    } else {
                        statusText = 'Closed';
                    }
                }
            } else {
                statusText = todaySchedule;
            }
        } else {
            statusText = todaySchedule;
        }
    } else {
        isOpen = false;
        const nextDayKey = days[(currentDayIdx + 1) % 7];
        const nextSched = hoursObj[nextDayKey];
        if (nextSched && nextSched.toLowerCase() !== 'closed') {
            const nextStart = nextSched.split('-')[0].trim();
            statusText = `Closed · Opens ${nextStart} tomorrow`;
        } else {
            statusText = 'Closed today';
        }
    }

    return {
        isOpen,
        statusText,
        hoursMap: hoursObj,
        todayKey
    };
}

/**
 * Helpers for Reviews & Ratings
 */
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getAvatarColor(name) {
    // Flat, clean neutral avatar background
    return '#e2e8f0';
}


function formatRelativeTime(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return 'yesterday';
    if (diffInDays < 7) return `${diffInDays}d ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)}w ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get Firebase Auth ID Token for API requests
 */
async function fetchAuthToken() {
    if (window.CalzadaAuth && typeof window.CalzadaAuth.getFirebaseIdToken === 'function') {
        return await window.CalzadaAuth.getFirebaseIdToken();
    }
    try {
        const mod = await import('../js/firebase-init.js');
        return await mod.getFirebaseIdToken();
    } catch (e) {
        console.warn('Could not load Firebase auth module:', e);
        return null;
    }
}
function isUserLoggedIn() {
    if (window.CalzadaAuth && typeof window.CalzadaAuth.getCurrentUser === 'function') {
        const user = window.CalzadaAuth.getCurrentUser();
        return !!user;
    }
    return false;
}

// Global state for active place panel ratings
let reviewsOffset = 0;
const REVIEWS_PAGE_LIMIT = 3;
let activeUserRating = 0;
let userHasExistingReview = false;

// Global Firebase Auth listener for Place Panel UI synchronization
let authListenerInitialized = false;
function initAuthListenerForPlacePanel() {
    if (authListenerInitialized) return;
    if (window.CalzadaAuth && typeof window.CalzadaAuth.onAuthStateChanged === 'function') {
        authListenerInitialized = true;
        window.CalzadaAuth.onAuthStateChanged((user) => {
            console.log('[PLACE PANEL] Live onAuthStateChanged listener fired, user:', user ? user.uid : 'Logged out');
            if (currentPlaceId) {
                setupRatingAndReviews(currentPlaceId);
            }
        });
    } else {
        setTimeout(initAuthListenerForPlacePanel, 300);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuthListenerForPlacePanel);
} else {
    initAuthListenerForPlacePanel();
}

/**
 * Configure Live Ratings & Reviews
 */
async function setupRatingAndReviews(placeId) {
    if (placeId) currentPlaceId = placeId;
    const activeId = placeId || currentPlaceId;

    const scoreEl = document.getElementById('ppRatingScore');
    const countEl = document.getElementById('ppRatingCount');
    const picker = document.getElementById('ppStarPicker');
    const feedbackArea = document.getElementById('ppRatingFeedbackArea');
    const authNotice = document.getElementById('ppRatingAuthNotice');
    const actionBar = document.getElementById('ppRatingActionBar');
    const editBtn = document.getElementById('ppEditReviewBtn');
    const cancelBtn = document.getElementById('ppCancelEditBtn');
    const commentBox = document.getElementById('ppRatingCommentBox');
    const commentInput = document.getElementById('ppRatingCommentInput');
    const submitBtn = document.getElementById('ppSubmitReviewBtn');
    const deleteBtn = document.getElementById('ppDeleteReviewBtn');
    const promptEl = document.getElementById('ppRatingPrompt');

    const reviewsTitle = document.getElementById('ppReviewsTitle');
    const seeMoreBtn = document.getElementById('ppReviewsSeeMoreBtn');
    const reviewsList = document.getElementById('ppReviewsList');
    const reviewsLoading = document.getElementById('ppReviewsLoading');
    const reviewsEmpty = document.getElementById('ppReviewsEmpty');

    if (!scoreEl || !picker) return;

    const loggedIn = isUserLoggedIn();
    console.log('[PLACE PANEL setupRatingAndReviews] activeId:', activeId, 'isUserLoggedIn:', loggedIn);

    // Reset Form UI
    reviewsOffset = 0;
    activeUserRating = 0;
    userHasExistingReview = false;
    if (commentInput) commentInput.value = '';
    if (feedbackArea) feedbackArea.style.display = 'none';
    if (authNotice) authNotice.style.display = 'none';
    if (actionBar) actionBar.style.display = 'none';
    if (commentBox) commentBox.style.display = 'none';
    if (deleteBtn) deleteBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (submitBtn) {
        submitBtn.textContent = 'Submit rating';
        submitBtn.disabled = false;
        submitBtn.style.display = loggedIn ? 'inline-block' : 'none';
    }
    if (promptEl) {
        promptEl.textContent = '';
        promptEl.style.display = 'none';
        promptEl.className = 'rating-prompt';
    }

    const starBtns = picker.querySelectorAll('.star-btn');

    function updateStarsDisplay(val) {
        const rounded = Math.round(val);
        starBtns.forEach(btn => {
            const btnVal = parseInt(btn.getAttribute('data-value'), 10);
            if (btnVal <= rounded) {
                btn.classList.add('filled');
            } else {
                btn.classList.remove('filled');
            }
        });
    }
    updateStarsDisplay(0);

    // Star Hover and Click Handlers
    starBtns.forEach(btn => {
        const starVal = parseInt(btn.getAttribute('data-value'), 10);

        btn.onmouseenter = () => {
            starBtns.forEach(b => {
                const bVal = parseInt(b.getAttribute('data-value'), 10);
                if (bVal <= starVal) {
                    b.classList.add('hovered');
                } else {
                    b.classList.remove('hovered');
                }
            });
        };

        btn.onmouseleave = () => {
            starBtns.forEach(b => b.classList.remove('hovered'));
            updateStarsDisplay(activeUserRating);
        };

        btn.onclick = () => {
            activeUserRating = starVal;
            updateStarsDisplay(activeUserRating);

            if (feedbackArea) feedbackArea.style.display = 'block';

            const authenticated = isUserLoggedIn();
            console.log('[PLACE PANEL star click] selected star:', starVal, 'live authenticated state:', authenticated);

            if (!authenticated) {
                if (authNotice) authNotice.style.display = 'block';
                if (commentBox) commentBox.style.display = 'none';
                if (actionBar) actionBar.style.display = 'none';
            } else {
                if (authNotice) authNotice.style.display = 'none';
                if (actionBar) actionBar.style.display = 'none';
                if (commentBox) commentBox.style.display = 'flex';
                if (submitBtn) {
                    submitBtn.textContent = userHasExistingReview ? 'Update rating' : 'Submit rating';
                    submitBtn.style.display = 'inline-block';
                }
                if (cancelBtn) cancelBtn.style.display = userHasExistingReview ? 'inline-block' : 'none';
            }
        };
    });

    // "Update rating" Action Bar Edit Button Handler
    if (editBtn) {
        editBtn.onclick = () => {
            if (feedbackArea) feedbackArea.style.display = 'block';
            if (authNotice) authNotice.style.display = 'none';
            if (actionBar) actionBar.style.display = 'none';
            if (commentBox) commentBox.style.display = 'flex';
            if (submitBtn) {
                submitBtn.textContent = 'Update rating';
                submitBtn.style.display = 'inline-block';
            }
            if (cancelBtn) cancelBtn.style.display = 'inline-block';
        };
    }

    // Cancel Edit Button Handler
    if (cancelBtn) {
        cancelBtn.onclick = () => {
            if (commentBox) commentBox.style.display = 'none';
            if (userHasExistingReview && actionBar) {
                actionBar.style.display = 'flex';
            }
        };
    }

    // Review Submission Handler with Loading Spinner & Collapsing
    if (submitBtn) {
        submitBtn.onclick = async () => {
            const targetPlaceId = activeId || currentPlaceId;
            console.log('[PLACE PANEL submitBtn.onclick] targetPlaceId:', targetPlaceId, 'rating:', activeUserRating);
            if (!targetPlaceId) {
                console.warn('[PLACE PANEL submitBtn.onclick] Missing targetPlaceId!');
                return;
            }
            if (activeUserRating < 1 || activeUserRating > 5) return;

            // In-flight loading state: spinner + disabled button
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-sm"></span> Submitting...';

            try {
                const token = await fetchAuthToken();
                if (!token) {
                    console.warn('[PLACE PANEL submitBtn.onclick] No auth token returned, user is logged out.');
                    if (authNotice) authNotice.style.display = 'block';
                    if (commentBox) commentBox.style.display = 'none';
                    submitBtn.disabled = false;
                    submitBtn.textContent = userHasExistingReview ? 'Update rating' : 'Submit rating';
                    return;
                }

                const commentText = commentInput ? commentInput.value.trim() : '';
                const payload = {
                    rating: activeUserRating,
                    comment_text: commentText
                };

                console.log('[PLACE PANEL submitBtn.onclick] Sending POST /api/places/' + targetPlaceId + '/rating payload:', payload);

                const res = await fetch(`/api/places/${targetPlaceId}/rating`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(payload)
                });

                console.log('[PLACE PANEL submitBtn.onclick] Response HTTP status:', res.status);

                if (res.status === 401) {
                    if (authNotice) authNotice.style.display = 'block';
                    if (commentBox) commentBox.style.display = 'none';
                    submitBtn.disabled = false;
                    submitBtn.textContent = userHasExistingReview ? 'Update rating' : 'Submit rating';
                    return;
                }

                if (!res.ok) {
                    const errBody = await res.text();
                    throw new Error(`HTTP ${res.status}: ${errBody}`);
                }

                const resData = await res.json();
                console.log('[PLACE PANEL submitBtn.onclick] Raw POST response body:', resData);

                userHasExistingReview = true;

                // Brief success notification
                if (promptEl) {
                    promptEl.textContent = '✓ Thanks for your rating!';
                    promptEl.style.display = 'block';
                    promptEl.className = 'rating-prompt success';
                    // Auto-hide success message after 3.5 seconds
                    setTimeout(() => {
                        if (promptEl) promptEl.style.display = 'none';
                    }, 3500);
                }

                // Collapse comment box entirely after successful submit
                if (commentBox) commentBox.style.display = 'none';
                if (actionBar) actionBar.style.display = 'flex';
                if (editBtn) editBtn.style.display = 'inline-block';
                if (deleteBtn) deleteBtn.style.display = 'inline-block';

                submitBtn.disabled = false;
                submitBtn.textContent = 'Update rating';

                // Immediately update rating card summary elements from response data if available
                if (resData.average_rating !== undefined && resData.total_ratings !== undefined) {
                    const avg = parseFloat(resData.average_rating) || 0;
                    const total = parseInt(resData.total_ratings, 10) || 0;
                    if (scoreEl) scoreEl.textContent = avg.toFixed(1);
                    if (countEl) countEl.textContent = `(${total})`;
                    if (reviewsTitle) reviewsTitle.textContent = `Customer reviews (${total})`;
                }

                // Refresh Reviews list from offset 0
                console.log('[PLACE PANEL submitBtn.onclick] Refreshing reviews list...');
                await fetchAndRenderReviews(targetPlaceId, true);
            } catch (err) {
                console.error('[PLACE PANEL submitBtn.onclick] Error submitting review:', err);
                if (promptEl) {
                    promptEl.textContent = 'Failed to submit rating. Please try again.';
                    promptEl.style.display = 'block';
                    promptEl.className = 'rating-prompt';
                }
                submitBtn.textContent = userHasExistingReview ? 'Update rating' : 'Submit rating';
                submitBtn.disabled = false;
            }
        };
    }

    // Review Deletion Handler
    if (deleteBtn) {
        deleteBtn.onclick = async () => {
            const targetPlaceId = activeId || currentPlaceId;
            if (!targetPlaceId) return;
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';

            try {
                const token = await fetchAuthToken();
                if (!token) return;

                console.log('[PLACE PANEL deleteBtn.onclick] Sending DELETE /api/places/' + targetPlaceId + '/rating');
                const res = await fetch(`/api/places/${targetPlaceId}/rating`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                // Reset state
                activeUserRating = 0;
                userHasExistingReview = false;
                updateStarsDisplay(0);
                if (commentInput) commentInput.value = '';
                if (feedbackArea) feedbackArea.style.display = 'none';
                if (commentBox) commentBox.style.display = 'none';
                if (actionBar) actionBar.style.display = 'none';
                deleteBtn.style.display = 'none';
                if (submitBtn) submitBtn.textContent = 'Submit rating';

                // Refresh Reviews list
                await fetchAndRenderReviews(targetPlaceId, true);
            } catch (err) {
                console.error('[PLACE PANEL deleteBtn.onclick] Error deleting review:', err);
            } finally {
                deleteBtn.disabled = false;
                deleteBtn.textContent = 'Delete';
            }
        };
    }

    // See More Reviews Click
    if (seeMoreBtn) {
        seeMoreBtn.onclick = async () => {
            const targetPlaceId = activeId || currentPlaceId;
            reviewsOffset += REVIEWS_PAGE_LIMIT;
            await fetchAndRenderReviews(targetPlaceId, false);
        };
    }

    // Initial Live Fetch for Reviews & Summary
    if (activeId) {
        await fetchAndRenderReviews(activeId, true);
    }
}

/**
 * Fetch and Render Reviews from Server
 */
async function fetchAndRenderReviews(placeId, resetList = true) {
    const activeId = placeId || currentPlaceId;
    console.log(`[PLACE PANEL fetchAndRenderReviews] activeId=${activeId}, resetList=${resetList}, reviewsOffset=${reviewsOffset}`);

    const scoreEl = document.getElementById('ppRatingScore');
    const countEl = document.getElementById('ppRatingCount');
    const promptEl = document.getElementById('ppRatingPrompt');
    const authNotice = document.getElementById('ppRatingAuthNotice');
    const actionBar = document.getElementById('ppRatingActionBar');
    const editBtn = document.getElementById('ppEditReviewBtn');
    const commentBox = document.getElementById('ppRatingCommentBox');
    const commentInput = document.getElementById('ppRatingCommentInput');
    const submitBtn = document.getElementById('ppSubmitReviewBtn');
    const deleteBtn = document.getElementById('ppDeleteReviewBtn');
    const picker = document.getElementById('ppStarPicker');

    const reviewsTitle = document.getElementById('ppReviewsTitle');
    const seeMoreBtn = document.getElementById('ppReviewsSeeMoreBtn');
    const reviewsList = document.getElementById('ppReviewsList');
    const reviewsLoading = document.getElementById('ppReviewsLoading');
    const reviewsError = document.getElementById('ppReviewsError');
    const reviewsEmpty = document.getElementById('ppReviewsEmpty');

    if (!activeId) {
        if (reviewsLoading) reviewsLoading.style.display = 'none';
        if (reviewsEmpty) reviewsEmpty.style.display = 'block';
        return;
    }

    if (resetList) {
        reviewsOffset = 0;
        if (reviewsList) reviewsList.innerHTML = '';
        if (reviewsLoading) reviewsLoading.style.display = 'flex';
        if (reviewsError) reviewsError.style.display = 'none';
        if (reviewsEmpty) reviewsEmpty.style.display = 'none';
    }

    try {
        const token = await fetchAuthToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(`/api/places/${activeId}/reviews?limit=${REVIEWS_PAGE_LIMIT}&offset=${reviewsOffset}`, {
            headers
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        console.log(`[PLACE PANEL fetchAndRenderReviews] Raw response for placeId ${activeId}:`, data);

        // Update Rating Card Summary
        const avg = parseFloat(data.average_rating) || 0;
        const total = parseInt(data.total_ratings, 10) || 0;

        if (scoreEl) scoreEl.textContent = avg.toFixed(1);
        if (countEl) countEl.textContent = `(${total})`;
        if (reviewsTitle) reviewsTitle.textContent = `Customer reviews (${total})`;

        // Handle Caller's Existing Review
        const authenticated = isUserLoggedIn();
        if (data.user_review && resetList && authenticated) {
            userHasExistingReview = true;
            activeUserRating = parseInt(data.user_review.rating, 10) || 0;
            const feedbackArea = document.getElementById('ppRatingFeedbackArea');
            if (feedbackArea) feedbackArea.style.display = 'block';
            if (commentInput) commentInput.value = data.user_review.comment_text || '';
            
            // Collapsed state by default for existing review:
            if (commentBox) commentBox.style.display = 'none';
            if (actionBar) actionBar.style.display = 'flex';
            if (editBtn) editBtn.style.display = 'inline-block';
            if (deleteBtn) deleteBtn.style.display = 'inline-block';
            if (submitBtn) submitBtn.textContent = 'Update rating';
            if (authNotice) authNotice.style.display = 'none';

            if (picker) {
                const starBtns = picker.querySelectorAll('.star-btn');
                starBtns.forEach(btn => {
                    const btnVal = parseInt(btn.getAttribute('data-value'), 10);
                    if (btnVal <= activeUserRating) btn.classList.add('filled');
                    else btn.classList.remove('filled');
                });
            }
        } else if (!authenticated && resetList) {
            if (commentBox) commentBox.style.display = 'none';
            if (actionBar) actionBar.style.display = 'none';
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (authNotice) authNotice.style.display = 'none';
        }

        if (reviewsLoading) reviewsLoading.style.display = 'none';

        const reviews = data.reviews || [];

        // Empty state check
        if (total === 0 || (resetList && reviews.length === 0)) {
            if (reviewsEmpty) {
                reviewsEmpty.textContent = 'No ratings yet.';
                reviewsEmpty.style.display = 'block';
            }
            if (reviewsList) reviewsList.style.display = 'none';
            if (seeMoreBtn) seeMoreBtn.style.display = 'none';
            return;
        }

        if (reviewsEmpty) reviewsEmpty.style.display = 'none';
        if (reviewsList) reviewsList.style.display = 'flex';

        // Render Review Cards
        const currentFirebaseUser = window.CalzadaAuth?.getCurrentUser();
        const currentUid = currentFirebaseUser ? currentFirebaseUser.uid : null;

        const html = reviews.map(r => {
            const reviewerName = r.reviewer_name || 'Calzada Commuter';
            const initial = reviewerName.trim().charAt(0).toUpperCase() || 'U';
            const relativeTime = formatRelativeTime(r.created_at);
            const isOwn = currentUid && r.user_id === currentUid;

            // Generate 5 Stars
            const rRating = parseInt(r.rating, 10) || 5;
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                if (i <= rRating) {
                    starsHtml += '<span>★</span>';
                } else {
                    starsHtml += '<span class="star-dim">★</span>';
                }
            }

            const commentHtml = r.comment_text && r.comment_text.trim()
                ? `<p class="review-comment">${escapeHtml(r.comment_text.trim())}</p>`
                : '';

            return `
                <div class="review-item">
                    <div class="review-user-row">
                        <div class="review-avatar">${initial}</div>
                        <div class="review-user-meta">
                            <div class="review-user-name-wrap">
                                <span class="review-user-name">${escapeHtml(reviewerName)}</span>
                                ${isOwn ? '<span class="review-badge-self">You</span>' : ''}
                            </div>
                            <span class="review-time">${relativeTime}</span>
                        </div>
                        <div class="review-stars-row">${starsHtml}</div>
                    </div>
                    ${commentHtml}
                </div>
            `;
        }).join('');

        if (resetList) {
            reviewsList.innerHTML = html;
        } else {
            reviewsList.insertAdjacentHTML('beforeend', html);
        }

        // See More Button Visibility
        if (seeMoreBtn) {
            seeMoreBtn.style.display = data.has_more ? 'inline-block' : 'none';
        }
    } catch (err) {
        console.warn('Error fetching place reviews:', err);
        if (reviewsLoading) reviewsLoading.style.display = 'none';
        if (resetList && reviewsEmpty) {
            reviewsEmpty.textContent = 'No reviews available.';
            reviewsEmpty.style.display = 'block';
        }
    }
}



/**
 * Open Place Detail Panel
 */
window.openPlacePanel = async function(placeName) {
    if (!placeName) return;

    // 1. Ensure DOM elements exist
    initPlacePanelDOM();

    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');

    // 2. Open animations immediately for instant UI feedback
    if (backdrop) backdrop.classList.add('active');
    if (panel) panel.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 3. Find base data or construct fallback
    const targetNorm = (placeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedKey = Object.keys(placesData).find(
        k => k.toLowerCase().trim() === placeName.toLowerCase().trim() ||
             k.toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm
    );
    let data = normalizedKey ? placesData[normalizedKey] : null;
    
    if (!data) {
        data = {
            name: placeName,
            category: "Destination",
            image: "../assets/hero-places-bg.png",
            barangay: "Calamba City",
            full_address: "Calamba City, Laguna",
            phone: "",
            website: "",
            opening_hours: null,
            landmarks: ["Popular destination in Calamba"],
            howToGetThere: "Use the Route Planner for detailed directions to this location.",
            about: "A notable destination within the Calambiyahe transit network.",
            fare: "Depends",
            travelTime: "Depends",
            transport: "Multiple"
        };
    }

    currentActivePlace = data;

    // 4. Set Place Name in header immediately
    const nameEl = document.getElementById('ppName');
    if (nameEl) nameEl.textContent = data.name;

    const planBtn = document.getElementById('ppPlanBtn');
    if (planBtn) planBtn.setAttribute('data-dest', data.name);

    // 5. Populate Initial Address Row
    const rowAddress = document.getElementById('ppRowAddress');
    const addressEl = document.getElementById('ppAddress');
    const displayAddress = data.full_address || data.barangay || (data.municipality ? `${data.barangay ? data.barangay + ', ' : ''}${data.municipality}` : '');
    if (addressEl && rowAddress) {
        if (displayAddress && displayAddress.trim()) {
            addressEl.textContent = displayAddress;
            rowAddress.style.display = 'flex';
        } else {
            rowAddress.style.display = 'none';
        }
    }

    // 6. Populate Initial Opening Hours Row & Accordion
    const rowHours = document.getElementById('ppRowHours');
    const hoursStatusEl = document.getElementById('ppHoursStatus');
    const hoursTableEl = document.getElementById('ppHoursTable');
    const hoursWrapper = document.getElementById('ppHoursWrapper');
    if (hoursWrapper) hoursWrapper.classList.remove('expanded');

    const hoursData = formatOpeningHoursStatus(data.opening_hours);
    if (rowHours && hoursStatusEl && hoursTableEl) {
        if (hoursData && hoursData.statusText) {
            hoursStatusEl.textContent = hoursData.statusText;
            hoursStatusEl.className = `panel-hours-status ${hoursData.isOpen ? 'open' : 'closed'}`;

            if (hoursData.hoursMap && typeof hoursData.hoursMap === 'object') {
                const dayNames = {
                    mon: 'Monday',
                    tue: 'Tuesday',
                    wed: 'Wednesday',
                    thu: 'Thursday',
                    fri: 'Friday',
                    sat: 'Saturday',
                    sun: 'Sunday'
                };
                const orderedDays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
                hoursTableEl.innerHTML = orderedDays.map(dKey => {
                    const isToday = dKey === hoursData.todayKey;
                    const timeStr = hoursData.hoursMap[dKey] || 'Closed';
                    return `
                        <tr class="${isToday ? 'today-row' : ''}">
                            <td class="day-col">${dayNames[dKey]}${isToday ? ' (Today)' : ''}</td>
                            <td class="time-col">${timeStr}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                hoursTableEl.innerHTML = `<tr><td colspan="2" style="padding:4px 6px;color:#64748b;">${hoursData.statusText}</td></tr>`;
            }
            rowHours.style.display = 'flex';
        } else {
            rowHours.style.display = 'none';
        }
    }

    // 7. Populate Initial Website Link
    const rowWebsite = document.getElementById('ppRowWebsite');
    const websiteEl = document.getElementById('ppWebsite');
    if (rowWebsite && websiteEl) {
        if (data.website && data.website.trim()) {
            const rawWeb = data.website.trim();
            const fullUrl = rawWeb.startsWith('http://') || rawWeb.startsWith('https://') ? rawWeb : `https://${rawWeb}`;
            websiteEl.textContent = rawWeb.replace(/^https?:\/\//i, '');
            websiteEl.href = fullUrl;
            rowWebsite.style.display = 'flex';
        } else {
            rowWebsite.style.display = 'none';
        }
    }

    // 8. Populate Initial Phone Link
    const rowPhone = document.getElementById('ppRowPhone');
    const phoneEl = document.getElementById('ppPhone');
    if (rowPhone && phoneEl) {
        if (data.phone && data.phone.trim()) {
            const phoneClean = data.phone.trim();
            phoneEl.textContent = phoneClean;
            phoneEl.href = `tel:${phoneClean.replace(/[^0-9+]/g, '')}`;
            rowPhone.style.display = 'flex';
        } else {
            rowPhone.style.display = 'none';
        }
    }

    // 9. Update Save Button State
    const saveBtn = document.getElementById('ppSaveBtn');
    if (saveBtn) {
        const savedPlaces = JSON.parse(localStorage.getItem('calzadaSavedPlaces') || '[]');
        const isSaved = savedPlaces.some(s => (s.name || s.placeName || '').toLowerCase() === data.name.toLowerCase());
        if (isSaved) {
            saveBtn.classList.add('saved');
            saveBtn.setAttribute('title', 'Place saved');
        } else {
            saveBtn.classList.remove('saved');
            saveBtn.setAttribute('title', 'Save place');
        }
    }

    // 10. Initial setup with hero image
    setupCarousel([{ image_path: data.image_path || data.image || '../assets/hero-places-bg.png' }]);

    // Update URL history
    try {
        const url = new URL(window.location);
        url.searchParams.set('place', placeName);
        window.history.pushState({}, '', url);
    } catch (e) {
        // Ignore URL state error in sandbox
    }

    // 11. Resolve place ID and live data from API asynchronously
    let placeId = data.id || null;
    try {
        const searchRes = await fetch(`/api/places?category=all`);
        if (searchRes.ok) {
            const allPlaces = await searchRes.json();
            const targetNorm = (placeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const match = allPlaces.find(p => p.name.toLowerCase().trim() === placeName.toLowerCase().trim()) ||
                          allPlaces.find(p => (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm);
            if (match) {
                placeId = match.id;
                currentPlaceId = match.id;
                data = { ...data, ...match };
                currentActivePlace = data;

                // Update fields with live database values if available
                if (match.full_address && addressEl && rowAddress) {
                    addressEl.textContent = match.full_address;
                    rowAddress.style.display = 'flex';
                }
                if (match.website && websiteEl && rowWebsite) {
                    const rawWeb = match.website.trim();
                    const fullUrl = rawWeb.startsWith('http://') || rawWeb.startsWith('https://') ? rawWeb : `https://${rawWeb}`;
                    websiteEl.textContent = rawWeb.replace(/^https?:\/\//i, '');
                    websiteEl.href = fullUrl;
                    rowWebsite.style.display = 'flex';
                }
                if (match.phone && phoneEl && rowPhone) {
                    phoneEl.textContent = match.phone.trim();
                    phoneEl.href = `tel:${match.phone.trim().replace(/[^0-9+]/g, '')}`;
                    rowPhone.style.display = 'flex';
                }
            }
        }
    } catch (e) {
        console.warn('Could not fetch place details from API:', e);
    }

    // 12. Fetch carousel images & setup ratings/reviews if place ID found
    if (placeId) {
        try {
            const imgRes = await fetch(`/api/places/${placeId}/images`);
            if (imgRes.ok) {
                const images = await imgRes.json();
                if (images.length > 0) setupCarousel(images);
            }
        } catch (e) {
            console.warn('Error fetching place carousel images:', e);
        }

        await setupRatingAndReviews(placeId);
    } else {
        await setupRatingAndReviews(null);
    }

    // 13. Record recentlyViewed activity (silently skipped if unauthenticated/guest)
    try {
        if (window.CalzadaActivity && typeof window.CalzadaActivity.addRecentlyViewed === 'function') {
            window.CalzadaActivity.addRecentlyViewed(placeId || data.id || data.name, data.name || placeName);
        }
    } catch (_) {}

    // 14. Check and render 360 photosphere section if linked
    try {
        await loadPlacePanel360Links();
        const link360 = getPlacePanel360Link(placeId, data.name || placeName);
        const sec360 = document.getElementById('pp360Section');
        const thumb360 = document.getElementById('pp360Thumb');
        const thumbWrap360 = document.getElementById('pp360ThumbWrap');
        const btn360 = document.getElementById('pp360Btn');

        if (link360 && link360.nodeId && sec360) {
            const photoFilename = `${link360.nodeId.replace('_', ', ')}.jpg`;
            const photoUrl = `/assets/360/${encodeURIComponent(photoFilename)}`;
            if (thumb360) thumb360.src = photoUrl;
            if (thumbWrap360) thumbWrap360.onclick = () => window._open360Viewer(link360.nodeId);
            if (btn360) btn360.onclick = () => window._open360Viewer(link360.nodeId);
            sec360.style.display = 'block';
        } else if (sec360) {
            sec360.style.display = 'none';
        }
    } catch (e) {
        console.warn('Error displaying 360 link in place-panel:', e);
    }
};

// 360 Photosphere Place Links Integration for Place Panel
let placePanel360LinksMap = new Map();
let placePanel360LoadPromise = null;

function loadPlacePanel360Links() {
    if (!placePanel360LoadPromise) {
        placePanel360LoadPromise = (async () => {
            try {
                const res = await fetch('/assets/360/place-links.json');
                if (res.ok) {
                    const data = await res.json();
                    (data.links || []).forEach(link => {
                        if (link.placeId) placePanel360LinksMap.set(String(link.placeId).trim(), link);
                        if (link.placeName) placePanel360LinksMap.set(link.placeName.trim().toLowerCase(), link);
                    });
                }
            } catch (err) {
                console.warn('[360 Links] Could not load place-links in place-panel:', err);
            }
        })();
    }
    return placePanel360LoadPromise;
}

loadPlacePanel360Links();

function getPlacePanel360Link(placeId, placeName) {
    if (placeId && placePanel360LinksMap.has(String(placeId).trim())) {
        return placePanel360LinksMap.get(String(placeId).trim());
    }
    if (placeName && placePanel360LinksMap.has(placeName.trim().toLowerCase())) {
        return placePanel360LinksMap.get(placeName.trim().toLowerCase());
    }
    return null;
}

// Fallback global handler for opening 360 viewer if not already provided
if (!window._open360Viewer) {
    window._open360Viewer = function(nodeId) {
        if (!nodeId) return;
        console.log('[Calzada 360] Requesting 360° viewer at node:', nodeId);

        window.dispatchEvent(new CustomEvent('calzada:open-360', {
            detail: { nodeId }
        }));

        if (typeof window.launch360Viewer === 'function') {
            window.launch360Viewer(nodeId);
            return;
        }

        let viewerModal = document.getElementById('calzada360ViewerModal');
        if (!viewerModal) {
            viewerModal = document.createElement('div');
            viewerModal.id = 'calzada360ViewerModal';
            viewerModal.className = 'calzada-360-modal-overlay';
            viewerModal.innerHTML = `
                <div class="calzada-360-modal-container">
                    <div class="calzada-360-modal-header">
                        <div class="calzada-360-modal-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#378ADD" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="9"/>
                                <path d="M3.6 9h16.8M3.6 15h16.8"/>
                                <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
                            </svg>
                            <span id="calzada360ModalNodeText">360° Photosphere Viewer</span>
                        </div>
                        <button type="button" class="calzada-360-close-btn" id="calzada360CloseBtn" aria-label="Close 360 Viewer">&times;</button>
                    </div>
                    <div class="calzada-360-preview-viewport" id="calzada360Viewport">
                        <img id="calzada360ModalImg" src="" alt="360 Photosphere" class="calzada-360-full-img" />
                        <div class="calzada-360-status-pill" id="calzada360StatusPill">
                            <span class="calzada-360-pulse-dot"></span>
                            <span id="calzada360PillText">Node: ${nodeId}</span>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(viewerModal);

            const closeBtn = document.getElementById('calzada360CloseBtn');
            if (closeBtn) closeBtn.onclick = () => viewerModal.classList.remove('active');
            viewerModal.onclick = (e) => {
                if (e.target === viewerModal) viewerModal.classList.remove('active');
            };
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && viewerModal.classList.contains('active')) {
                    viewerModal.classList.remove('active');
                }
            });
        }

        const modalImg = document.getElementById('calzada360ModalImg');
        const nodeText = document.getElementById('calzada360ModalNodeText');
        const pillText = document.getElementById('calzada360PillText');
        const photoFilename = `${nodeId.replace('_', ', ')}.jpg`;
        const photoUrl = `/assets/360/${encodeURIComponent(photoFilename)}`;

        if (modalImg) modalImg.src = photoUrl;
        if (nodeText) nodeText.textContent = `360° Photosphere · ${nodeId}`;
        if (pillText) pillText.textContent = `Node: ${nodeId}`;

        viewerModal.classList.add('active');
    };
}

window.closePlacePanel = function(updateHistory = true) {
    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');
    if (backdrop) backdrop.classList.remove('active');
    if (panel) panel.classList.remove('active');
    document.body.style.overflow = ''; 

    if (updateHistory) {
        const url = new URL(window.location);
        url.searchParams.delete('place');
        window.history.pushState({}, '', url);
    }
};
