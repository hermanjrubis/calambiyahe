/**
 * place-panel.js
 * Handles the Place Overview Panel logic for places.html
 */

const placesData = {
    "STI College Calamba": {
        name: "STI College Calamba",
        category: "School",
        image: "https://www.sti.edu/cms/images/school/all/calamba.jpg",
        barangay: "Brgy. Halang, Calamba City",
        landmarks: ["Near Robinsons Calamba", "Along National Highway", "Beside LTO Calamba"],
        howToGetThere: "Ride any jeepney going to Crossing or Halang. Fare starts at ₱13. Travel time approx. 10–15 mins from Central Terminal.",
        about: "STI College Calamba offers tech and business programs. It is one of the major schools along the National Highway in Halang.",
        fare: "₱13–₱20",
        travelTime: "10–15 mins",
        transport: "Jeepney / Tricycle"
    },
    "Calamba City Hall": {
        name: "Calamba City Hall",
        category: "Establishment",
        image: "https://lh3.googleusercontent.com/pw/AP1GczM1DDQ8qkvS-5Yc_dvrpnI5HAwRSuj5zofc7zFnSeoqvrNcP1lBLZRsQv-GuutdVIb96tE83_WyDHGHxYviOh7JlUiUZNWnKJRuEOC4cyb6If3r669AS8ZN9iJB6fo_itMSwMNjVPSPmAvzo7Fe6Xw5zw=w2734-h2050-s-no-gm?authuser=0",
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
        barangay: "Brgy. 5 (Poblacion), Calamba City",
        landmarks: ["Adjacent to St. John the Baptist Church", "Near Calamba City Plaza"],
        howToGetThere: "Take a tricycle from Calamba Crossing directly to the Rizal Shrine. Fare is usually around ₱40-₱50 for special trips.",
        about: "A reproduction of the original two-story, Spanish-colonial style house where José Rizal was born. It is one of the most visited historical sites in Laguna.",
        fare: "₱40–₱50",
        travelTime: "15 mins",
        transport: "Tricycle"
    },
    "Calamba Central Terminal": {
        name: "Calamba Central Terminal",
        category: "Terminal",
        image: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=600&q=80",
        barangay: "Brgy. Real, Calamba City",
        landmarks: ["Near SM City Calamba", "Crossing"],
        howToGetThere: "Accessible via almost all jeepneys, buses, and tricycles in Calamba. It serves as the main transportation hub of the city.",
        about: "The primary transport terminal connecting Calamba to Metro Manila, Batangas, Quezon, and other parts of Laguna.",
        fare: "₱13+",
        travelTime: "N/A",
        transport: "Bus / Jeepney / UV"
    },
    "City College of Calamba": {
        name: "City College of Calamba",
        category: "School",
        image: "https://static.where-e.com/Philippines/City-College-Of-Calamba_ba2dfbc35e249893367f22e7076f4a27.jpg",
        barangay: "Brgy. 7, Calamba City",
        landmarks: ["Behind Calamba City Plaza", "Near Rizal Shrine"],
        howToGetThere: "Take a tricycle from Calamba Crossing going to the Plaza or Rizal Shrine. The college is located just behind the plaza.",
        about: "The premier local community college offering various degree programs to residents of Calamba City.",
        fare: "₱40–₱50",
        travelTime: "10-15 mins",
        transport: "Tricycle"
    },
    "National Museum": {
        name: "National Museum",
        category: "Historic",
        image: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/29/e2/63/5e/caption.jpg?w=900&h=500&s=1",
        barangay: "Manila",
        landmarks: ["Luneta Park", "Intramuros"],
        howToGetThere: "Take a bus from Calamba Central Terminal bound for Lawton or Buendia. From there, take an LRT or jeepney to the museum.",
        about: "The National Museum of the Philippines houses the most important historical and cultural artifacts of the country.",
        fare: "₱120+",
        travelTime: "1.5–2 hours",
        transport: "Bus"
    },
    "Festival Mall Alabang": {
        name: "Festival Mall Alabang",
        category: "Mall",
        image: "https://image-tc.galaxy.tf/wijpeg-8apqa2wrqbabqxgblbqaaqrl0/_photo.jpg",
        barangay: "Alabang, Muntinlupa",
        landmarks: ["Filinvest City", "South Station"],
        howToGetThere: "Take an Alabang-bound bus or UV Express from Calamba Central Terminal. Get off at South Station and walk to Festival Mall.",
        about: "One of the largest shopping malls in the south, offering a massive array of dining, shopping, and entertainment.",
        fare: "₱70–₱100",
        travelTime: "45 mins–1 hour",
        transport: "Bus / UV Express"
    },
    "Nuvali Sta Rosa": {
        name: "Nuvali (Sta. Rosa)",
        category: "Leisure",
        image: "https://images.squarespace-cdn.com/content/v1/5fa1522044bdda192713063c/1694433501371-TZH3WMEXP477B0IUHAGU/20230910_095936-v2.jpg",
        barangay: "Sta. Rosa, Laguna",
        landmarks: ["Solenad", "Paseo de Sta. Rosa"],
        howToGetThere: "Take a jeepney to Balibago complex from Calamba. From Balibago, ride a tricycle or jeepney going to Nuvali/Tagaytay.",
        about: "A popular eco-city development known for its commercial centers, parks, and koi feeding activities.",
        fare: "₱40–₱60",
        travelTime: "30–45 mins",
        transport: "Jeepney"
    },
    "Tagaytay": {
        name: "Tagaytay City",
        category: "Nature",
        image: "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1b/1c/54/ff/caption.jpg?w=1200&h=-1&s=1",
        barangay: "Tagaytay City, Cavite",
        landmarks: ["Sky Ranch", "Picnic Grove", "Taal Volcano View"],
        howToGetThere: "Take a Tagaytay-bound passenger van (UV Express) from Calamba Central Terminal.",
        about: "A popular holiday town south of Manila known for its mild climate and dramatic views of Taal Volcano.",
        fare: "₱100+",
        travelTime: "1–1.5 hours",
        transport: "UV Express"
    }
};

// Inject Panel HTML on load
document.addEventListener('DOMContentLoaded', () => {
    const panelHTML = `
        <div class="place-panel-backdrop" id="placePanelBackdrop"></div>
        <div class="place-panel-container" id="placePanel">
            <div class="panel-drag-handle"><div class="panel-drag-pill"></div></div>
            <button class="panel-close-btn" id="closePanelBtn">
                <ion-icon name="close-outline"></ion-icon>
            </button>
            
            <div class="panel-hero">
                <img id="ppImage" src="" alt="Place Hero">
                <div class="panel-hero-overlay">
                    <span class="panel-hero-tag" id="ppCategory">Category</span>
                    <h2 class="panel-hero-title" id="ppName">Place Name</h2>
                </div>
            </div>

            <div class="panel-body">


                <div>
                    <h3 class="panel-section-title"><ion-icon name="location-outline"></ion-icon> Location</h3>
                    <p class="panel-text" id="ppBarangay">--</p>
                </div>

                <div>
                    <h3 class="panel-section-title"><ion-icon name="navigate-outline"></ion-icon> How to Get There</h3>
                    <p class="panel-text" id="ppHowToGetThere">--</p>
                </div>

                <div>
                    <h3 class="panel-section-title"><ion-icon name="business-outline"></ion-icon> Nearby Landmarks</h3>
                    <ul class="panel-list" id="ppLandmarks">
                        <li>--</li>
                    </ul>
                </div>

                <div>
                    <h3 class="panel-section-title"><ion-icon name="information-circle-outline"></ion-icon> About</h3>
                    <p class="panel-text" id="ppAbout">--</p>
                </div>
            </div>

            <div class="panel-footer">
                <button class="panel-cta-btn" id="ppPlanBtn">
                    Plan Route <ion-icon name="arrow-forward-outline"></ion-icon>
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', panelHTML);

    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');
    const closeBtn = document.getElementById('closePanelBtn');
    const planBtn = document.getElementById('ppPlanBtn');

    // Close Events
    backdrop.addEventListener('click', closePlacePanel);
    closeBtn.addEventListener('click', closePlacePanel);

    // Plan Route Event
    planBtn.addEventListener('click', () => {
        const placeName = planBtn.getAttribute('data-dest');
        if (placeName) {
            // FIXED 1: Bypass transition race condition
            setTimeout(() => {
                window.location.href = `planner.html?dest=${encodeURIComponent(placeName)}`;
            }, 0);
        }
    });

    // Check URL for ?place= on load
    const urlParams = new URLSearchParams(window.location.search);
    const placeParam = urlParams.get('place');
    if (placeParam) {
        // slight delay to let skeleton clear
        setTimeout(() => openPlacePanel(placeParam), 500);
    }
    
    // Handle back button closing panel
    window.addEventListener('popstate', (e) => {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('place')) {
            closePlacePanel(false); // false means don't push state again
        }
    });
});

window.openPlacePanel = function(placeName) {
    // FIXED 2: Normalize lookup to handle case/whitespace differences
    const normalizedKey = Object.keys(placesData).find(
        k => k.toLowerCase().trim() === placeName.toLowerCase().trim()
    );
    let data = placesData[normalizedKey] || null;
    
    // Fallback data if not in dictionary
    if (!data) {
        // FIXED 4: Add console warning for fallback
        console.warn(`[PlacePanel] No match found for: "${placeName}" — using fallback`);
        data = {
            name: placeName,
            category: "Destination",
            image: "assets/hero-places-bg.png", // fallback image
            barangay: "Calamba City",
            landmarks: ["Popular destination in Calamba"],
            howToGetThere: "Use the Route Planner for detailed directions to this location.",
            about: "A notable destination within the Calambiyahe transit network.",
            fare: "Depends",
            travelTime: "Depends",
            transport: "Multiple"
        };
    }

    // Populate Data
    document.getElementById('ppImage').src = data.image;
    document.getElementById('ppCategory').textContent = data.category;
    document.getElementById('ppName').textContent = data.name;
    /* REVISED - Removed stats populators */
    document.getElementById('ppBarangay').textContent = data.barangay;
    document.getElementById('ppHowToGetThere').textContent = data.howToGetThere;
    document.getElementById('ppAbout').textContent = data.about;
    
    const landmarksUl = document.getElementById('ppLandmarks');
    landmarksUl.innerHTML = '';
    data.landmarks.forEach(lm => {
        const li = document.createElement('li');
        li.textContent = lm;
        landmarksUl.appendChild(li);
    });

    document.getElementById('ppPlanBtn').setAttribute('data-dest', data.name);

    // Open animations
    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');
    backdrop.classList.add('active');
    panel.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Update URL
    const url = new URL(window.location);
    url.searchParams.set('place', placeName);
    window.history.pushState({}, '', url);
};

window.closePlacePanel = function(updateHistory = true) {
    const backdrop = document.getElementById('placePanelBackdrop');
    const panel = document.getElementById('placePanel');
    if(backdrop) backdrop.classList.remove('active');
    if(panel) panel.classList.remove('active');
    document.body.style.overflow = ''; 

    if (updateHistory) {
        const url = new URL(window.location);
        url.searchParams.delete('place');
        window.history.pushState({}, '', url);
    }
};
