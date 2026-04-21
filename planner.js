// =============================================
// CALZADA PLANNER — FULL ROUTING ENGINE
// =============================================

document.addEventListener('DOMContentLoaded', () => {

    const map = L.map('map').setView([14.2045, 121.1641], 16);
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google',
        className: 'calzada-map-tiles'
    }).addTo(map);

    // =============================================
    // TERMINAL DATABASE (Step 2)
    // =============================================
    const TERMINALS = [
        {
            id: 'sm_calamba',
            name: 'SM City Calamba Terminal',
            shortName: 'SM Calamba',
            coords: [14.2045, 121.1641],
            serves: ['uplb', 'los baños', 'los banos', 'bay', 'calauan', 'university of the philippines', 'batong malake', 'college', 'laguna', 'national highway'],
            modes: ['jeep', 'bus'],
            address: 'Brgy. Real, Calamba City, Laguna'
        },
        {
            id: 'crossing',
            name: 'Calamba Crossing Terminal',
            shortName: 'Crossing',
            coords: [14.2010, 121.1700],
            serves: ['uplb', 'los baños', 'los banos', 'pansol', 'batong malake', 'bay', 'laguna'],
            modes: ['jeep', 'tricycle'],
            address: 'National Highway, Calamba City'
        },
        {
            id: 'turbina',
            name: 'Turbina Bus Terminal',
            shortName: 'Turbina',
            coords: [14.2150, 121.1550],
            serves: ['manila', 'makati', 'batangas', 'alabang', 'pasay', 'cubao', 'metro manila', 'ncr', 'tagaytay'],
            modes: ['bus', 'van'],
            address: 'Turbina, Calamba City, Laguna'
        },
        {
            id: 'canlubang',
            name: 'Canlubang / iMall Terminal',
            shortName: 'Canlubang',
            coords: [14.2120, 121.1000],
            serves: ['city hall', 'mayapa', 'sm calamba', 'tanauan', 'santo tomas', 'sto tomas'],
            modes: ['jeep', 'tricycle'],
            address: 'iMall, Canlubang, Calamba City'
        },
        {
            id: 'los_banos',
            name: 'Los Baños Crossing',
            shortName: 'Los Baños',
            coords: [14.1687, 121.2100],
            serves: ['uplb', 'university of the philippines', 'batong malake', 'bay', 'calauan', 'college'],
            modes: ['jeep', 'tricycle'],
            address: 'National Highway, Los Baños, Laguna'
        },
        {
            id: 'uplb_gate',
            name: 'UPLB Gate 1 Terminal',
            shortName: 'UPLB Gate',
            coords: [14.1687, 121.2435],
            serves: ['uplb', 'university of the philippines los baños', 'college', 'ipb', 'dost', 'caf'],
            modes: ['jeep', 'tricycle'],
            address: 'Jamboree Road, College, Los Baños'
        },
        // NEW: Inter-city / Long Distance Nodes
        {
            id: 'cubao',
            name: 'Araneta City bus Terminal, Cubao',
            shortName: 'Cubao',
            coords: [14.6178, 121.0560],
            serves: ['cubao', 'quezon city', 'ncr', 'metro manila', 'starmall', 'farmers'],
            modes: ['bus', 'van'],
            address: 'Cubao, Quezon City'
        },
        {
            id: 'buendia',
            name: 'Pasay / Buendia Terminal',
            shortName: 'Buendia',
            coords: [14.5540, 120.9991],
            serves: ['pasay', 'gil puyat', 'buendia', 'makati', 'moa', 'lrt'],
            modes: ['bus', 'van'],
            address: 'Pasay City, NCR'
        }
    ];


    const FARE_MAP = {
        jeep:           { base: 13, perKm: 2,   freeKm: 4, name: 'Jeepney' },
        'modern-jeep':  { base: 15, perKm: 2.5, freeKm: 4, name: 'Modern Jeepney' },
        bus:            { base: 15, perKm: 2.5, freeKm: 5, name: 'Bus' },
        van:            { base: 25, perKm: 4,   freeKm: 5, name: 'Van' },
        uv:             { base: 30, perKm: 4,   freeKm: 5, name: 'UV Express' },
        tricycle:       { base: 20, perKm: 5,   freeKm: 1, name: 'Tricycle' },
        walk:           { base: 0,  perKm: 0,   freeKm: 0, name: 'Walk' }
    };


    // Simulated fallback paths per mode
    const routeSimulations = {
        jeep: { paths: [[14.2045, 121.1641], [14.2010, 121.1700], [14.1950, 121.1820], [14.1850, 121.2000], [14.1687, 121.2435]], color: '#1a8fff', weight: 6, dashArray: null },
        'modern-jeep': { paths: [[14.2045, 121.1641], [14.2010, 121.1700], [14.1950, 121.1820], [14.1687, 121.2435]], color: '#7c3aed', weight: 6, dashArray: null },
        bus: { paths: [[14.2045, 121.1641], [14.2150, 121.1550], [14.2500, 121.1000]], color: '#0f6fd1', weight: 6, dashArray: '1,10' },
        van: { paths: [[14.2045, 121.1641], [14.1900, 121.1700], [14.1700, 121.2000], [14.1687, 121.2435]], color: '#f59e0b', weight: 5, dashArray: null },
        tricycle: { paths: [[14.2045, 121.1641], [14.2055, 121.1620], [14.2085, 121.1645]], color: '#16a34a', weight: 4, dashArray: '5,5' }
    };

    let currentPolyline = null;
    let markers = [];
    let selectedTerminalId = null;

    // Real-time tracking state
    let watchId = null;
    let userMarker = null;
    let userCircle = null;
    let currentItineraryOptions = [];
    let selectedOptionIndex = 0;
    let activeLegs = [];
    let currentLegIndex = 0;
    let isTrackingArrival = false;
    let lastUserPos = null;
    let mapAutoFollow = true;


    // =============================================
    // UI CONTROLS
    // =============================================
    const toggleDrawer = (open) => {
        document.getElementById('sideDrawer')?.classList.toggle('open', open);
        document.getElementById('sideDrawerOverlay')?.classList.toggle('visible', open);
    };
    const toggleReminders = (open) => {
        document.getElementById('remindersModal')?.classList.toggle('visible', open);
        document.getElementById('remindersOverlay')?.classList.toggle('visible', open);
    };

    document.getElementById('hamburgerBtn')?.addEventListener('click', () => toggleDrawer(true));
    document.getElementById('drawerCloseBtn')?.addEventListener('click', () => toggleDrawer(false));
    document.getElementById('sideDrawerOverlay')?.addEventListener('click', () => toggleDrawer(false));
    document.getElementById('remindersPillBtn')?.addEventListener('click', () => toggleReminders(true));
    document.getElementById('remindersCloseBtn')?.addEventListener('click', () => toggleReminders(false));
    document.getElementById('remindersOverlay')?.addEventListener('click', () => toggleReminders(false));

    // =============================================
    // BOTTOM SHEET DRAG (Mobile View)
    // =============================================
    const setupBottomSheetDrag = (cardId) => {
        const card = document.getElementById(cardId);
        if (!card) return;
        let startY = 0, isDragging = false;
        
        card.addEventListener('touchstart', (e) => {
            const scrollBody = e.target.closest('.search-card-scrollbody');
            // Allow drag if NOT in scroll body, OR if scroll body is at very top
            if (!scrollBody || scrollBody.scrollTop <= 0) {
                startY = e.touches[0].clientY;
                isDragging = true;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const y = e.touches[0].clientY;
            const deltaY = y - startY;

            // DRAG DOWN TO HIDE
            if (deltaY > 60) { 
                card.classList.add('minimized');
                isDragging = false;
            } 
            // DRAG UP TO SHOW
            else if (deltaY < -60) {
                card.classList.remove('minimized');
                isDragging = false;
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => {
            isDragging = false;
        });

        // Tapping/Clicking the card while minimized pulls it back up
        card.addEventListener('click', (e) => {
            if (card.classList.contains('minimized') && !e.target.closest('.search-card-scrollbody')) {
                card.classList.remove('minimized');
            }
        });
    };

    if (window.innerWidth <= 768) {
        setupBottomSheetDrag('searchCard');
        setupBottomSheetDrag('guideCard');
    }
    // UI CARD STATE TRANSITIONS (Search vs Active)
    // =============================================
    const searchCard = document.getElementById('searchCard');
    const actionCard = document.getElementById('actionCard');
    const guideCard = document.getElementById('guideCard');
    const activeTripBanner = document.getElementById('activeTripBanner');
    const startJourneyBtn = document.getElementById('startJourneyBtn');
    const cancelTripBtn = document.getElementById('cancelTripBtn');

    const checkFormStatus = () => {
        const ov = document.getElementById('originInput')?.value.trim();
        const dv = document.getElementById('destinationInput')?.value.trim();
        if (ov && dv && selectedCoords.origin && selectedCoords.destination) {
            if (startJourneyBtn) startJourneyBtn.disabled = false;
        } else {
            if (startJourneyBtn) startJourneyBtn.disabled = true;
        }
    };

    if (startJourneyBtn) {
        startJourneyBtn.addEventListener('click', () => {
            if (startJourneyBtn.disabled) return;
            // Hide Input and Action forms
            if (searchCard) searchCard.style.display = 'none';
            if (actionCard) actionCard.style.display = 'none';
            
            // Show Active ITINERARY UI
            if (guideCard) guideCard.style.display = 'block';
            if (activeTripBanner) activeTripBanner.style.display = 'block';
            
            // Populate Guide header
            document.getElementById('guideOriginText').textContent = document.getElementById('originInput')?.value || 'Origin';
            document.getElementById('guideDestText').textContent = document.getElementById('destinationInput')?.value || 'Destination';
        });
    }

    if (cancelTripBtn) {
        cancelTripBtn.addEventListener('click', () => {
            // Restore Input and Action forms
            if (searchCard) searchCard.style.display = 'block';
            if (actionCard) actionCard.style.display = 'flex';
            
            // Hide Active ITINERARY UI
            if (guideCard) guideCard.style.display = 'none';
            if (activeTripBanner) activeTripBanner.style.display = 'none';
        });
    }

    const autoExpandPanel = () => {}; // Stub to prevent errors from other components

    // =============================================
    // ROUTING ENGINE
    // =============================================

    // Haversine distance in km
    const calcDist = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    // Find destination terminals
    const getNearestTerminals = (destName, destCoords) => {
        const query = (destName || '').toLowerCase();
        const matching = TERMINALS.filter(t =>
            t.serves.some(kw => query.includes(kw) || kw.includes(query.split(' ')[0]))
        );
        const pool = matching.length > 0 ? matching : TERMINALS;
        if (destCoords) {
            return pool
                .map(t => ({ ...t, distFromDest: calcDist(t.coords[0], t.coords[1], destCoords[0], destCoords[1]) }))
                .sort((a, b) => a.distFromDest - b.distFromDest)
                .slice(0, 4);
        }
        return pool.slice(0, 4);
    };

    // =============================================
    // ITINERARY GENERATION (MULTI-OPTION)
    // =============================================

    const generateItineraryOptions = (originCoords, destCoords, destName) => {
        const options = [];
        const dist = calcDist(originCoords[0], originCoords[1], destCoords[0], destCoords[1]);
        
        // Scenario A: Local (Short Distance)
        if (dist < 8 || destName.toLowerCase().includes('calamba') || destName.toLowerCase().includes('crossing')) {
            // Option 1: Standard Jeep
            options.push({
                badge: 'planner.badge_fastest', badgeClass: 'badge-fastest',
                legs: generateLocalLegs(originCoords, destCoords, destName, 'jeep')
            });
            // Option 2: Modern Jeep
            options.push({
                badge: 'planner.badge_least_transfer', badgeClass: 'badge-least-transfer',
                legs: generateLocalLegs(originCoords, destCoords, destName, 'modern-jeep')
            });
            // Option 3: Tricycle (for short local trips only)
            if (dist < 4) {
                options.push({
                    badge: 'planner.badge_cheapest', badgeClass: 'badge-cheapest',
                    legs: generateLocalLegs(originCoords, destCoords, destName, 'tricycle')
                });
            }
        } 
        // Scenario B: Long Distance / Out of City
        else {
            const terminals = getNearestTerminals(destName, destCoords);
            const bestTerm = terminals[0] || TERMINALS[0];

            // Option 1: Via Main Terminal (Typical)
            options.push({
                badge: 'planner.badge_fastest', badgeClass: 'badge-fastest',
                legs: generateMultiLegs(originCoords, bestTerm, destCoords, destName, 'bus')
            });
            // Option 2: Alternative Mode
            options.push({
                badge: 'planner.badge_cheapest', badgeClass: 'badge-cheapest',
                legs: generateMultiLegs(originCoords, bestTerm, destCoords, destName, 'van')
            });
            // Option 3: UV Express
            options.push({
                badge: 'planner.badge_least_transfer', badgeClass: 'badge-least-transfer',
                legs: generateMultiLegs(originCoords, bestTerm, destCoords, destName, 'uv')
            });
        }

        // Post-process options (calculate totals)
        return options.map(opt => {
            let totalTime = 0, totalFare = 0;
            opt.legs.forEach(l => { totalTime += l.duration; totalFare += l.fare; });
            return { ...opt, totalTime, totalFare, transferCount: opt.legs.length - 1 };
        });
    };



    const generateLocalLegs = (originCoords, destCoords, destName, mode) => {
        const legs = [];
        const fareInfo = FARE_MAP[mode] || FARE_MAP.jeep;
        const dist = calcDist(originCoords[0], originCoords[1], destCoords[0], destCoords[1]);
        const imageMap = { bus: 'assets/icons/bus-icon.png', van: 'assets/icons/van-icon.png', uv: 'assets/icons/van-icon.png', 'modern-jeep': 'assets/icons/jeepney-icon.png', jeep: 'assets/icons/jeepney-icon.png' };
        const colorMap = { bus: '#0f6fd1', van: '#f59e0b', uv: '#f59e0b', tricycle: '#16a34a', 'modern-jeep': '#7c3aed', jeep: '#1a8fff' };

        if (dist > 0.5) {
            legs.push({ type: 'access', mode: 'walk', icon: 'walk-outline', iconColor: '#64748b', title: window.t('js.maglakad'), from: window.t('js.iyong_lokasyon'), to: 'Sakayan', distance: 0.3, fare: 0, duration: 5, note: 'Lakad papunta sa sakayan' });
        }
        legs.push({ type: 'main', mode, imageIcon: imageMap[mode], iconColor: colorMap[mode], title: fareInfo.name, from: 'Sakayan', to: destName, distance: dist, fare: fareInfo.base + Math.max(0, dist - fareInfo.freeKm) * fareInfo.perKm, duration: Math.round(dist * 4) + 5 });
        legs.push({ type: 'arrival', mode: 'arrive', icon: 'flag-outline', iconColor: '#ef4444', title: window.t('js.nakarating'), from: destName, to: destName, distance: 0, fare: 0, duration: 0 });
        return legs;
    };

    const generateMultiLegs = (originCoords, terminal, destCoords, destName, mode) => {
        const legs = [];
        const fareInfo = FARE_MAP[mode] || FARE_MAP.jeep;
        const distToTerm = calcDist(originCoords[0], originCoords[1], terminal.coords[0], terminal.coords[1]);
        const distToDest = calcDist(terminal.coords[0], terminal.coords[1], destCoords[0], destCoords[1]);
        const imageMap = { bus: 'assets/icons/bus-icon.png', van: 'assets/icons/van-icon.png', uv: 'assets/icons/van-icon.png', 'modern-jeep': 'assets/icons/jeepney-icon.png', jeep: 'assets/icons/jeepney-icon.png' };
        const colorMap = { bus: '#0f6fd1', van: '#f59e0b', uv: '#f59e0b', tricycle: '#16a34a', 'modern-jeep': '#7c3aed', jeep: '#1a8fff' };

        // Leg 1: Tricycle to Terminal
        legs.push({ type: 'access', mode: 'tricycle', imageIcon: 'assets/icons/tricycle-icon.png', iconColor: '#16a34a', title: 'Tricycle', from: 'Lokasyon', to: terminal.shortName, distance: distToTerm, fare: 20 + Math.max(0, distToTerm-1)*10, duration: Math.round(distToTerm * 6) });
        // Leg 2: Main Commute
        legs.push({ type: 'main', mode, imageIcon: imageMap[mode], iconColor: colorMap[mode], title: fareInfo.name, from: terminal.shortName, to: destName, distance: distToDest, fare: fareInfo.base + Math.max(0, distToDest - fareInfo.freeKm) * fareInfo.perKm, duration: Math.round(distToDest * 3) + 10 });
        // Leg 3: Arrival
        legs.push({ type: 'arrival', mode: 'arrive', icon: 'flag-outline', iconColor: '#ef4444', title: window.t('js.nakarating'), from: destName, to: destName, distance: 0, fare: 0, duration: 0 });
        return legs;
    };

    // =============================================
    // RENDERING LOGIC
    // =============================================

    const renderItineraryOptions = (options) => {
        currentItineraryOptions = options;
        const panel = document.getElementById('itineraryOptionsPanel');
        if (!panel) return;
        panel.innerHTML = '';
        panel.style.display = 'flex';

        // Upgrade #6: Empty state when no valid options could be generated
        const validOptions = options.filter(opt => opt.legs && opt.legs.length > 0);
        if (validOptions.length === 0) {
            panel.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:24px 16px;text-align:center;width:100%;">
                    <ion-icon name="map-outline" style="font-size:2.5rem;color:#94a3b8;"></ion-icon>
                    <div style="font-weight:700;color:#1e293b;font-size:1rem;">Walang nahanap na ruta</div>
                    <div style="font-size:0.85rem;color:#64748b;line-height:1.5;">
                        Hindi pa namin nase-serve ang destinasyong ito. Subukan ang ibang lugar o i-adjust ang iyong origin.
                    </div>
                </div>`;
            return;
        }

        validOptions.forEach((opt, idx) => {
            const card = document.createElement('div');
            card.className = `route-option-card ${idx === selectedOptionIndex ? 'selected' : ''}`;
            
            // Badge
            const badge = document.createElement('div');
            badge.className = `route-option-badge ${opt.badgeClass}`;
            badge.textContent = window.t(opt.badge);
            card.appendChild(badge);

            // Time & Fare
            const h = Math.floor(opt.totalTime / 60), m = opt.totalTime % 60;
            const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;
            card.innerHTML += `
                <div class="option-main-info">
                    <span class="option-time">${timeStr}</span>
                    <span class="option-fare">₱${Math.ceil(opt.totalFare)}</span>
                </div>
            `;

            // Leg Strip
            const strip = document.createElement('div');
            strip.className = 'leg-strip';
            opt.legs.forEach((leg, lIdx) => {
                if (leg.type === 'arrival') return;
                if (leg.mode === 'walk') {
                    strip.innerHTML += `<ion-icon name="walk-outline" class="leg-strip-walk"></ion-icon>`;
                } else if (leg.imageIcon) {
                    strip.innerHTML += `<img src="${leg.imageIcon}" class="leg-strip-icon">`;
                }
                if (lIdx < opt.legs.length - 2) {
                    strip.innerHTML += `<ion-icon name="chevron-forward-outline" class="leg-strip-arrow"></ion-icon>`;
                }
            });
            card.appendChild(strip);

            card.addEventListener('click', () => selectItinerary(idx));
            panel.appendChild(card);
        });

        selectItinerary(selectedOptionIndex < validOptions.length ? selectedOptionIndex : 0);
    };

    const selectItinerary = (index) => {
        selectedOptionIndex = index;
        const opts = document.querySelectorAll('.route-option-card');
        opts.forEach((o, i) => o.classList.toggle('selected', i === index));

        const selected = currentItineraryOptions[index];
        activeLegs = selected.legs;

        // Render full breakdown & steps
        renderItinerarySteps(activeLegs);
        renderFareBreakdown(activeLegs);
        
        // Fit Map to the route
        drawRouteMulti(activeLegs);

        // Update summary values
        const h = Math.floor(selected.totalTime / 60), m = selected.totalTime % 60;
        document.getElementById('estTimeValue').textContent = h > 0 ? `${h}hr ${m}min` : `${m}min`;
        document.getElementById('estFareValue').textContent = `₱ ${Math.ceil(selected.totalFare)}`;

        // Upgrade #5: Show estimated arrival clock time
        const arrivalTime = new Date(Date.now() + selected.totalTime * 60000);
        const arrivalStr = arrivalTime.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
        let arrivalEl = document.getElementById('estArrivalTime');
        if (!arrivalEl) {
            // Inject arrival time element once into the summary strip
            const strip = document.querySelector('.guide-summary-strip');
            if (strip) {
                strip.insertAdjacentHTML('beforeend', `
                    <div class="guide-summary-divider"></div>
                    <div class="guide-summary-item">
                        <ion-icon name="flag-outline"></ion-icon>
                        <span id="estArrivalTime"></span>
                    </div>`);
                arrivalEl = document.getElementById('estArrivalTime');
            }
        }
        if (arrivalEl) arrivalEl.textContent = arrivalStr;
    };

    const renderItinerarySteps = (legs) => {
        const list = document.getElementById('itineraryList');
        if (!list) return;
        list.innerHTML = '';
        
        legs.forEach((leg, idx) => {
            const card = document.createElement('div');
            card.className = `itinerary-card ${leg.type === 'arrival' ? 'icard-arrival' : ''}`;
            const isLast = idx === legs.length - 1;
            const fareHTML = leg.fare > 0 ? `<span class="leg-fare">₱${Math.ceil(leg.fare)}</span>` : (leg.type === 'main' ? '<span class="leg-fare free-fare">LORE</span>' : '');

            const iconHTML = leg.imageIcon 
                ? `<img src="${leg.imageIcon}" style="width:20px;height:20px;object-fit:contain;">` 
                : `<ion-icon name="${leg.icon || 'location-outline'}"></ion-icon>`;

            card.innerHTML = `
                <div class="leg-icon-column">
                    <div class="leg-icon-circle" style="background:${leg.iconColor}18;color:${leg.iconColor};">
                        ${iconHTML}
                    </div>
                    ${!isLast ? `<div class="leg-line" style="background: ${leg.iconColor}44"></div>` : ''}
                </div>
                <div class="leg-content">
                    <div class="leg-header"><span class="leg-title">${leg.title}</span>${fareHTML}</div>
                    <div class="leg-details"><span>${leg.from}</span> <span class="leg-arrow">→</span> <span>${leg.to}</span></div>
                    <div class="leg-meta"><span>${leg.distance.toFixed(1)} km</span> • <span>~${leg.duration} min</span></div>
                </div>`;
            list.appendChild(card);
        });
    };

    const renderFareBreakdown = (legs) => {
        const section = document.getElementById('fareBreakdownSection');
        const list = document.getElementById('fareBreakdownList');
        if (!section || !list) return;
        section.style.display = 'block';
        list.innerHTML = '';

        legs.forEach(leg => {
            if (leg.fare <= 0) return;
            const item = document.createElement('div');
            item.className = 'fare-item';
            item.innerHTML = `
                <div class="fare-item-mode">
                    ${leg.imageIcon ? `<img src="${leg.imageIcon}" style="width:16px;height:16px;object-fit:contain;">` : `<ion-icon name="${leg.icon}"></ion-icon>`}
                    <span>${leg.title}</span>
                </div>
                <strong>₱${Math.ceil(leg.fare)}</strong>
            `;
            list.appendChild(item);
        });
    };

    // Fare toggle
    document.getElementById('fareToggleBtn')?.addEventListener('click', () => {
        const list = document.getElementById('fareBreakdownList');
        const icon = document.querySelector('#fareToggleBtn ion-icon');
        if (list.style.display === 'none') {
            list.style.display = 'flex';
            icon.name = 'chevron-up-outline';
        } else {
            list.style.display = 'none';
            icon.name = 'chevron-down-outline';
        }
    });

    // =============================================
    // RENDER TERMINAL PICKER (Step 2 UI)
    // =============================================
    const renderTerminalPicker = (terminals) => {
        const section = document.getElementById('terminalPickerSection');
        const list = document.getElementById('terminalList');
        if (!section || !list || !terminals.length) return;

        list.innerHTML = '';
        section.style.display = 'block';

        terminals.forEach((term) => {
            const card = document.createElement('div');
            card.className = 'terminal-card';
            if (term.id === selectedTerminalId) card.classList.add('selected');

            const modesHTML = term.modes.map(m => {
                const emoji = { jeep: '🚌', 'modern-jeep': '🚌', bus: '🚍', van: '🚐', tricycle: '🛺' };
                return `<span class="mode-badge">${emoji[m] || '🚌'} ${FARE_MAP[m]?.name || m}</span>`;
            }).join('');

            card.innerHTML = `
                <div class="terminal-card-left">
                    <div class="terminal-icon-wrap"><ion-icon name="business-outline"></ion-icon></div>
                    <div class="terminal-info">
                        <div class="terminal-name">${term.name}</div>
                        <div class="terminal-address">${term.address}</div>
                        <div class="terminal-modes">${modesHTML}</div>
                    </div>
                </div>
                <ion-icon name="chevron-forward-outline" class="terminal-arrow"></ion-icon>`;

            card.addEventListener('click', () => {
                selectedTerminalId = term.id;
                list.querySelectorAll('.terminal-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                if (selectedCoords.origin && selectedCoords.destination) {
                    const mode = getActiveMode();
                    const legs = generateItineraryLegs(selectedCoords.origin, term, selectedCoords.destination, destinationInput.value.trim(), mode);
                    renderItinerary(legs);
                    drawRoute(mode);
                }
            });
            list.appendChild(card);
        });

        // Auto-select first terminal
        if (!selectedTerminalId && terminals.length) {
            selectedTerminalId = terminals[0].id;
            list.querySelector('.terminal-card')?.classList.add('selected');
        }
    };

    // =============================================
    // RENDER ITINERARY CARDS (Step 8)
    // =============================================
    const renderItinerary = (legs) => {
        const container = document.getElementById('itineraryResults');
        const list = document.getElementById('itineraryList');
        if (!list) return;

        list.innerHTML = '';
        if(container) container.style.display = 'block';

        let totalFare = 0, totalMins = 0;

        legs.forEach((leg, idx) => {
            totalFare += leg.fare;
            totalMins += leg.duration;
            const isLast = idx === legs.length - 1;
            const card = document.createElement('div');
            card.className = `itinerary-card icard-${leg.type}`;

            const fareHTML = leg.fare > 0
                ? `<span class="leg-fare" style="color:${leg.iconColor};">&#8369;${Math.ceil(leg.fare)}</span>`
                : leg.type !== 'arrival' ? `<span class="leg-fare free-fare">FREE</span>` : '';

            const directionHTML = leg.type === 'arrival'
                ? `<span>${leg.to}</span>`
                : `<span>${leg.from}</span> <span class="leg-arrow">→</span> <span>${leg.to}</span>`;

            const metaHTML = leg.distance > 0
                ? `<div class="leg-meta">
                    <span><ion-icon name="map-outline"></ion-icon> ${leg.distance.toFixed(1)} km</span>
                    <span><ion-icon name="time-outline"></ion-icon> ~${leg.duration} min</span>
                  </div>` : '';

            const iconHTML = leg.imageIcon 
                ? `<img src="${leg.imageIcon}" style="width:20px;height:20px;object-fit:contain;filter: drop-shadow(0 0 1px rgba(0,0,0,0.2));">` 
                : `<ion-icon name="${leg.icon}"></ion-icon>`;

            card.innerHTML = `
                <div class="leg-icon-column">
                    <div class="leg-icon-circle" style="background:${leg.iconColor}18;color:${leg.iconColor};">
                        ${iconHTML}
                    </div>
                    ${!isLast ? '<div class="leg-line"></div>' : ''}
                </div>
                <div class="leg-content">
                    <div class="leg-header"><span class="leg-title">${leg.title}</span>${fareHTML}</div>
                    <div class="leg-details">${directionHTML}</div>
                    ${metaHTML}
                    <div class="leg-note">${leg.note}</div>
                </div>`;
            list.appendChild(card);
        });

        // Update summary dynamically in Lakbay Guide
        const estTimeEl = document.getElementById('estTimeValue');
        const estFareEl = document.getElementById('estFareValue');
        
        const h = Math.floor(totalMins / 60);
        const m = Math.ceil(totalMins % 60);
        const timeStr = h > 0 ? `${h}hr ${m}min` : `${m}min`;

        if (estTimeEl) estTimeEl.textContent = timeStr;
        if (estFareEl) estFareEl.textContent = `₱ ${Math.ceil(totalFare)}`;

        const tripDetails = document.getElementById('tripQuickDetails');
        if (tripDetails) tripDetails.style.display = 'flex';

        computeAndShowSchedule(totalMins);

        const startBtn = document.getElementById('startJourneyBtn');
        if (startBtn) startBtn.disabled = false;
    };

    // =============================================
    // SCHEDULE COMPUTATION (Step 5)
    // =============================================
    const computeAndShowSchedule = (totalMins) => {
        const card = document.getElementById('scheduleSummaryCard');
        const textEl = document.getElementById('scheduleSummaryText');
        if (!card || !textEl) return;

        const activeSchedule = document.querySelector('#scheduleOptions li.active');
        const schedVal = activeSchedule?.getAttribute('data-value') || 'now';
        if (schedVal === 'now') { card.style.display = 'none'; return; }

        const schedText = document.getElementById('scheduleSelectedText')?.textContent || '';
        const m = schedText.match(/(\d+):(\d+)\s*(am|pm)/i);
        if (!m) { card.style.display = 'none'; return; }

        let hour = parseInt(m[1]), min = parseInt(m[2]);
        const period = m[3].toLowerCase();
        if (period === 'pm' && hour !== 12) hour += 12;
        if (period === 'am' && hour === 12) hour = 0;

        const scheduledTime = new Date();
        scheduledTime.setHours(hour, min, 0, 0);
        const fmt = (d) => d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

        const destName = destinationInput?.value.trim() || 'iyong destinasyon';
        if (schedVal === 'depart') {
            const arrival = new Date(scheduledTime.getTime() + totalMins * 60000);
            textEl.innerHTML = `Umalis ng <strong>${fmt(scheduledTime)}</strong> — makakarating ng halos <strong>${fmt(arrival)}</strong>`;
            window._notifMsg = `Departure reminder: Umalis ng ${fmt(scheduledTime)} para makarating sa ${destName} ng humigit-kumulang ${fmt(arrival)}.`;
        } else {
            const depart = new Date(scheduledTime.getTime() - totalMins * 60000);
            textEl.innerHTML = `Umalis ng <strong>${fmt(depart)}</strong> para makarating bago mag-<strong>${fmt(scheduledTime)}</strong>`;
            window._notifMsg = `Departure reminder: Umalis ng ${fmt(depart)} para makarating sa ${destName} bago mag-${fmt(scheduledTime)}.`;
        }
        card.style.display = 'flex';
    };

    // Steps 3 & 4: Generate DIRECT itinerary (For short distance / within Calamba)
    const generateLocalItinerary = (originCoords, destCoords, destName, modeKey) => {
        const legs = [];
        const mode = modeKey || 'jeep';
        const fareInfo = FARE_MAP[mode] || FARE_MAP.jeep;

        const dist = calcDist(originCoords[0], originCoords[1], destCoords[0], destCoords[1]);
        const mainFare = fareInfo.base + Math.max(0, dist - fareInfo.freeKm) * fareInfo.perKm;

        const colorMap = { bus: '#0f6fd1', van: '#f59e0b', tricycle: '#16a34a', 'modern-jeep': '#7c3aed', jeep: '#1a8fff' };
        const imageMap = { bus: 'assets/icons/bus-icon.png', van: 'assets/icons/van-icon.png', tricycle: 'assets/icons/tricycle-icon.png', 'modern-jeep': 'assets/icons/jeepney-icon.png', jeep: 'assets/icons/jeepney-icon.png' };

        if (dist > 0.5) {
            legs.push({
                type: 'access', mode: 'walk', icon: 'walk-outline', iconColor: '#64748b',
                title: 'Maglakad papunta sa sakayan', from: 'Iyong Lokasyon', to: 'National Highway / Sakayan',
                distance: 0.3, fare: 0, duration: 4,
                note: `Pumunta sa pinakamalapit na paradahan o highway`
            });
        }

        legs.push({
            type: 'main', mode, imageIcon: imageMap[mode] || 'assets/icons/jeepney-icon.png', iconColor: colorMap[mode] || '#1a8fff',
            title: `Sumakay ng ${fareInfo.name}`, from: 'Sakayan', to: destName,
            distance: dist, fare: Math.max(mainFare, fareInfo.base),
            duration: Math.round(dist * 4) + 2,
            note: `Direktang byahe papuntang ${destName}`
        });

        legs.push({
            type: 'arrival', mode: 'arrive', icon: 'flag-outline', iconColor: '#ef4444',
            title: 'Nakarating!', from: destName, to: destName, distance: 0, fare: 0, duration: 0,
            note: `Dumating sa ${destName}`
        });
        return legs;
    };

    // =============================================
    // TRIGGER TERMINAL PICKER
    // =============================================
    const triggerTerminalPicker = () => {
        const destVal = destinationInput?.value.trim();
        if (!destVal || destVal.length < 2) { hideTerminalPicker(); return; }

        let isLocal = false;
        const ldest = destVal.toLowerCase();
        if (ldest.includes('calamba') || ldest.includes('crossing') || ldest.includes('mayapa') || ldest.includes('turbina') || ldest.includes('pansol') || ldest.includes('canlubang')) {
            isLocal = true;
        }
        if (selectedCoords.destination) {
            const dist = calcDist(14.2045, 121.1641, selectedCoords.destination[0], selectedCoords.destination[1]);
            if (dist < 8) isLocal = true;
        }

        if (isLocal) {
            hideTerminalPicker();
            selectedTerminalId = null;
            if (selectedCoords.origin && selectedCoords.destination) {
                const options = generateItineraryOptions(selectedCoords.origin, selectedCoords.destination, destVal);
                renderItineraryOptions(options);
            }
        } else {
            const terminals = getNearestTerminals(destVal, selectedCoords.destination);
            renderTerminalPicker(terminals);

            if (selectedCoords.origin && selectedCoords.destination && terminals.length) {
                const options = generateItineraryOptions(selectedCoords.origin, selectedCoords.destination, destVal);
                renderItineraryOptions(options);
            }
        }


    };


    const hideTerminalPicker = () => {
        const s = document.getElementById('terminalPickerSection');
        if (s) s.style.display = 'none';
    };
    const hideItinerary = () => {
        ['itineraryResults', 'tripQuickDetails', 'scheduleSummaryCard'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    };

    // =============================================
    // MARKER + OSRM ROUTING
    // =============================================
    const createTransitMarker = (iconStr, color, isImage=false) => {
        let innerHtml = '';
        if (iconStr === 'circle') {
            innerHtml = `<div style="background:${color};border:3px solid white;border-radius:50%;width:20px;height:20px;box-shadow:0 0 0 1px ${color};"></div>`;
            return L.divIcon({ html: innerHtml, className: 'custom-leaflet-marker', iconSize: [20, 20], iconAnchor: [10, 10] });
        } else {
            innerHtml = `<div style="background:${color};color:white;border:2px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.3);"><ion-icon name="${iconStr}"></ion-icon></div>`;
            return L.divIcon({ html: innerHtml, className: 'custom-leaflet-marker', iconSize: [32, 32], iconAnchor: [16, 16] });
        }
    };


    const getActiveMode = () => 'jeep'; // Hardcoded fallback since mode selector was removed

    // Upgrade #1: Fetch a real road-following polyline from OSRM
    const fetchOSRMRoute = async (from, to, profile = 'driving') => {
        try {
            const url = `https://router.project-osrm.org/route/v1/${profile}/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
            const r = await fetch(url);
            const d = await r.json();
            if (d.code === 'Ok' && d.routes && d.routes.length > 0) {
                // GeoJSON coords are [lng, lat], Leaflet needs [lat, lng]
                return d.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            }
        } catch (e) {
            console.warn('OSRM fetch failed, falling back to straight line:', e);
        }
        return null;
    };

    const drawRouteMulti = async (legs) => {
        if (currentPolyline) {
            if (Array.isArray(currentPolyline)) currentPolyline.forEach(p => map.removeLayer(p));
            else map.removeLayer(currentPolyline);
        }
        markers.forEach(m => map.removeLayer(m));
        markers = [];

        currentPolyline = [];
        const bounds = L.latLngBounds();

        // Determine waypoints from legs
        const waypoints = [];
        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (i === 0) waypoints.push({ coords: leg.fromCoords || selectedCoords.origin, leg });
            if (leg.type !== 'arrival') {
                waypoints.push({ coords: leg.toCoords || selectedCoords.destination, leg });
            }
        }

        for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            if (leg.type === 'arrival') continue;

            const color = leg.iconColor || '#3b82f6';
            const weight = leg.mode === 'walk' ? 4 : 6;
            const dashArray = leg.mode === 'walk' ? '8,12' : null;

            const from = leg.fromCoords || selectedCoords.origin;
            const to   = leg.toCoords   || selectedCoords.destination;

            // Walk legs use foot profile; others use driving
            const osrmProfile = leg.mode === 'walk' ? 'foot' : 'driving';
            const roadPoints = await fetchOSRMRoute(from, to, osrmProfile);
            const points = roadPoints || [from, to]; // fallback to straight line

            const poly = L.polyline(points, {
                color, weight, opacity: 0.85, dashArray,
                lineJoin: 'round', lineCap: 'round'
            }).addTo(map);
            currentPolyline.push(poly);
            bounds.extend(poly.getBounds());

            // Transfer point markers (not the first leg start)
            if (i > 0) {
                const midIcon = createTransitMarker('circle', color, true);
                markers.push(L.marker(from, { icon: midIcon }).addTo(map));
            }
        }

        // Start and End markers
        markers.push(
            L.marker(selectedCoords.origin, { icon: L.icon({ iconUrl: 'assets/startingpoint-icon.png', iconSize: [40, 40], iconAnchor: [20, 36] }) }).addTo(map),
            L.marker(selectedCoords.destination, { icon: L.icon({ iconUrl: 'assets/destination-icon.png', iconSize: [40, 40], iconAnchor: [20, 36] }) }).addTo(map)
        );

        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    };

    // =============================================
    // REAL-TIME TRACKING & NAVIGATION
    // =============================================

    const startTracking = () => {
        if (!navigator.geolocation) {
            showToast(window.t('planner.tracking_unavailable'), false);
            return;
        }

        watchId = navigator.geolocation.watchPosition(
            (pos) => updateUserLocation(pos),
            (err) => {
                console.error(err);
                showToast(window.t('planner.tracking_unavailable'), false);
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
    };

    const stopTracking = () => {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
        if (userCircle) { map.removeLayer(userCircle); userCircle = null; }
    };

    const updateUserLocation = (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const latlng = [latitude, longitude];
        lastUserPos = latlng;

        // Pulse Marker
        if (!userMarker) {
            const gpsIcon = L.divIcon({
                className: 'custom-gps-marker',
                html: '<div class="gps-dot-pulse"></div>',
                iconSize: [20, 20]
            });
            userMarker = L.marker(latlng, { icon: gpsIcon, zIndexOffset: 1000 }).addTo(map);
            userCircle = L.circle(latlng, { radius: accuracy, weight: 1, color: '#4285F4', fillOpacity: 0.15 }).addTo(map);
            
            // Initial Fly
            map.flyTo(latlng, 16, { animate: true, duration: 1.5 });
        } else {
            userMarker.setLatLng(latlng);
            userCircle.setLatLng(latlng);
            userCircle.setRadius(accuracy);
            
            if (mapAutoFollow) {
                map.panTo(latlng, { animate: true });
            }
        }

        handleJourneyProgression(latlng);
    };

    const handleJourneyProgression = (userCoords) => {
        if (currentLegIndex >= activeLegs.length - 1) return;

        const currentLeg = activeLegs[currentLegIndex];
        const nextTargetCoords = activeLegs[currentLegIndex + 1].fromCoords || selectedCoords.destination; 
        
        const distToNext = calcDist(userCoords[0], userCoords[1], nextTargetCoords[0], nextTargetCoords[1]);

        // Auto-Advancement (80m)
        if (distToNext < 0.08) {
            const targetName = activeLegs[currentLegIndex + 1].from || activeLegs[currentLegIndex + 1].title;
            showToast(window.t('planner.reached_landmark').replace('{name}', targetName));
            advanceLeg();
        }

        // Contextual Zoom Out (150m)
        if (distToNext < 0.15 && mapAutoFollow) {
            // Zoom out to show both user and target
            const bounds = L.latLngBounds([userCoords, nextTargetCoords]);
            map.flyToBounds(bounds, { padding: [100, 100], maxZoom: 15 });
        }
    };

    const advanceLeg = () => {
        if (currentLegIndex < activeLegs.length - 1) {
            currentLegIndex++;
            updateActiveJourneyUI();
            
            // Zoom to next leg start if not auto-following
            if (!mapAutoFollow) {
                const nextTarget = activeLegs[currentLegIndex].fromCoords || activeLegs[currentLegIndex].coords;
                if (nextTarget) map.flyTo(nextTarget, 16);
            }
        } else {
            handleArrival();
        }
    };

    const handleArrival = () => {
        stopTracking();
        document.getElementById('arrivalOverlay').classList.add('show');
        document.getElementById('arrivalScreen').classList.add('show');
        map.flyTo(selectedCoords.destination, 15);
    };

    const updateActiveJourneyUI = () => {
        const leg = activeLegs[currentLegIndex];
        const banner = document.getElementById('activeTripBanner');
        if (!banner) return;

        document.getElementById('activeLegTitle').textContent = leg.title;
        document.getElementById('legProgressText').textContent = window.t('planner.leg_progress')
            .replace('{current}', currentLegIndex + 1)
            .replace('{total}', activeLegs.length);
        
        const iconImg = document.getElementById('activeLegIcon');
        if (leg.imageIcon) {
            iconImg.src = leg.imageIcon;
            iconImg.style.display = 'block';
        } else {
            iconImg.style.display = 'none';
        }

        // If it's the last leg (arrival), handle specially
        if (leg.type === 'arrival') {
            handleArrival();
        }
    };

    const reCenterMap = () => {
        if (lastUserPos) {
            mapAutoFollow = true;
            document.getElementById('reCenterBtn').style.display = 'none';
            map.flyTo(lastUserPos, 16);
        }
    };

    document.getElementById('reCenterBtn')?.addEventListener('click', reCenterMap);
    map.on('dragstart', () => {
        if (watchId !== null) {
            mapAutoFollow = false;
            document.getElementById('reCenterBtn').style.display = 'flex';
        }
    });

    document.getElementById('arrivalCloseBtn')?.addEventListener('click', () => {
        document.getElementById('arrivalOverlay').classList.remove('show');
        document.getElementById('arrivalScreen').classList.remove('show');
        // Reset to initial search state
        cancelJourney();
    });

    const cancelJourney = () => {
        stopTracking();
        currentLegIndex = 0;
        activeLegs = [];
        if (searchCard) searchCard.style.display = 'block';
        if (actionCard) actionCard.style.display = 'flex';
        if (guideCard) guideCard.style.display = 'none';
        if (activeTripBanner) activeTripBanner.style.display = 'none';
        if (document.getElementById('itineraryOptionsPanel')) document.getElementById('itineraryOptionsPanel').style.display = 'none';
        
        if (currentPolyline) {
            if (Array.isArray(currentPolyline)) currentPolyline.forEach(p => map.removeLayer(p));
            else map.removeLayer(currentPolyline);
            currentPolyline = null;
        }
        markers.forEach(m => map.removeLayer(m));
        markers = [];
    };

    // =============================================
    // GEOCODING
    // =============================================
    const selectedCoords = { origin: null, destination: null };
    const originInput = document.getElementById('originInput');
    const destinationInput = document.getElementById('destinationInput');

    const searchNominatim = async (q, cb) => {
        if (!q || q.length < 3) { cb([]); return; }
        try {
            const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=ph`, { headers: { 'Accept-Language': 'en' } });
            cb(await r.json());
        } catch { cb([]); }
    };

    const buildSuggestions = (results, listEl, inputEl, coordKey) => {
        listEl.innerHTML = '';
        if (!results.length) { listEl.style.display = 'none'; return; }
        results.forEach(p => {
            const li = document.createElement('li'); li.className = 'suggestion-item';
            const icon = document.createElement('span'); icon.className = 'suggestion-icon'; icon.innerHTML = '📍';
            const txt = document.createElement('div'); txt.className = 'suggestion-text';
            const name = document.createElement('span'); name.className = 'suggestion-name'; name.textContent = p.name || p.display_name.split(',')[0];
            const addr = document.createElement('span'); addr.className = 'suggestion-address'; addr.textContent = p.display_name.split(',').slice(1, 3).map(s => s.trim()).join(', ');
            txt.append(name, addr); li.append(icon, txt);
            li.addEventListener('click', () => {
                inputEl.value = p.name || p.display_name.split(',')[0];
                selectedCoords[coordKey] = [parseFloat(p.lat), parseFloat(p.lon)];
                listEl.style.display = 'none';
                checkFormStatus();
                if (coordKey === 'destination') { selectedTerminalId = null; triggerTerminalPicker(); }
                if (coordKey === 'origin' && selectedCoords.destination) triggerTerminalPicker();
            });
            listEl.appendChild(li);
        });
        listEl.style.display = 'block';
    };

    const bindSearchInput = (inputEl, listEl, coordKey) => {
        let debounce;
        inputEl.addEventListener('focus', autoExpandPanel);
        inputEl.addEventListener('input', () => {
            selectedCoords[coordKey] = null;
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                searchNominatim(inputEl.value, r => {
                    buildSuggestions(r, listEl, inputEl, coordKey);
                    // Critical Fix: If user manually typing and Nominatim finds it, cache the first result coordinates invisibly
                    if (r && r.length > 0 && !selectedCoords[coordKey]) {
                        selectedCoords[coordKey] = [parseFloat(r[0].lat), parseFloat(r[0].lon)];
                    }
                    if (coordKey === 'destination') {
                        selectedTerminalId = null;
                        if (inputEl.value.length >= 2) triggerTerminalPicker();
                        else { hideTerminalPicker(); hideItinerary(); }
                    }
                });
            }, 350);
            checkFormStatus();
        });
        document.addEventListener('click', (e) => {
            if (!inputEl.contains(e.target) && !listEl.contains(e.target)) listEl.style.display = 'none';
        });
    };

    // Parse URL params
    const urlParams = new URLSearchParams(window.location.search);
    const destParam = urlParams.get('dest');
    const dlatParam = urlParams.get('dlat');
    const dlngParam = urlParams.get('dlng');
    const originParam = urlParams.get('origin');
    
    if (destParam && destinationInput) {
        destinationInput.value = destParam;
        // Directly cache the API-proven coordinates
        if (dlatParam && dlngParam) {
            selectedCoords.destination = [parseFloat(dlatParam), parseFloat(dlngParam)];
        }
    }
    if (originParam && originInput) originInput.value = originParam;

    // Bind inputs
    if (originInput && destinationInput) {
        bindSearchInput(originInput, document.getElementById('originSuggestions'), 'origin');
        bindSearchInput(destinationInput, document.getElementById('destSuggestions'), 'destination');
    }

    // Process passed destination into routing engine
    if (destParam) {
        setTimeout(() => {
            if (dlatParam && dlngParam) {
                triggerTerminalPicker();
                checkFormStatus();
            } else {
                searchNominatim(destParam, r => {
                    if (r && r.length > 0) {
                        selectedCoords.destination = [parseFloat(r[0].lat), parseFloat(r[0].lon)];
                    }
                    triggerTerminalPicker();
                    checkFormStatus();
                });
            }
        }, 800);
    }

    // =============================================
    // DROPDOWNS
    // =============================================
    const closeAllDropdowns = () => {
        document.querySelectorAll('.sakay-action-row.open').forEach(d => d.classList.remove('open'));
        // Close mobile bottom sheet overlay if open
        const bsOverlay = document.getElementById('scheduleBottomSheetOverlay');
        if (bsOverlay) bsOverlay.classList.remove('visible');
        document.body.style.overflow = '';
    };

    const initDropdown = (containerId, selectedId, textId, optionsListId, onChange) => {
        const container = document.getElementById(containerId);
        const selected = document.getElementById(selectedId);
        const text = document.getElementById(textId);
        const list = document.getElementById(optionsListId);

        if (!container || !selected || !list) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const was = container.classList.contains('open');
            closeAllDropdowns();
            if (!was) {
                container.classList.add('open');
            }
        });

        list.querySelectorAll('li').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                list.querySelectorAll('li').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                if (text) text.textContent = opt.textContent.trim();
                closeAllDropdowns();
                onChange?.(opt.getAttribute('data-value'));
            });
        });

        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) closeAllDropdowns();
        });
    };

    let fpInstance = null;

    initDropdown('scheduleDropdownContainer', 'scheduleSelected', 'scheduleSelectedText', 'scheduleOptions', (val) => {
        if (val === 'depart' || val === 'arrive') {
            // Use the custom datetime picker (openDtPicker is defined in the standalone module below)
            if (typeof window.openDtPicker === 'function') {
                setTimeout(() => window.openDtPicker(val), 50);
            } else if (fpInstance) {
                setTimeout(() => fpInstance.open(), 50);
            }
        } else if (val === 'now') {
            const btnText = document.getElementById('startJourneyBtnText');
            if (btnText) btnText.textContent = window.t ? window.t('planner.simulan') : 'Simulan ang Biyahe';
            const schedCard = document.getElementById('scheduleSummaryCard');
            if (schedCard) schedCard.style.display = 'none';
            const schedText = document.getElementById('scheduleSelectedText');
            if (schedText) schedText.textContent = window.t ? window.t('planner.leave_now') : 'Leave now';
            if (fpInstance) fpInstance.clear();
        }
    });

    const bindDatePicker = () => {
        const pickerElement = document.getElementById('nativeDatePicker');
        const text = document.getElementById('scheduleSelectedText');
        if (pickerElement && window.flatpickr) {
            fpInstance = flatpickr(pickerElement, {
                enableTime: true,
                dateFormat: "Y-m-d H:i",
                minDate: "today",
                position: "auto center",
                onChange: (selectedDates, dateStr, instance) => {
                    if (selectedDates.length > 0) {
                        const date = selectedDates[0];
                        const fmt = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
                        let activeOption = document.querySelector('#scheduleOptions li.active')?.getAttribute('data-value');
                        
                        if (activeOption === 'now') {
                            document.querySelector('#scheduleOptions li[data-value="now"]').classList.remove('active');
                            document.querySelector('#scheduleOptions li[data-value="depart"]').classList.add('active');
                            activeOption = 'depart';
                        }
                        
                        const pre = activeOption === 'arrive'
                            ? (window.t ? window.t('planner.arrive_by_pre') : 'Arrive by')
                            : (window.t ? window.t('planner.depart_at_pre') : 'Depart at');
                        if (text) text.textContent = pre + ' ' + fmt;
                        if (selectedCoords.origin && selectedCoords.destination) triggerTerminalPicker();
                    }
                }
            });
        }
    };
    bindDatePicker();



    // =============================================


    // =============================================
    // TOAST
    // =============================================
    const showToast = (msg, success = true) => {
        const toast = document.getElementById('toastNotification');
        const icon = toast?.querySelector('ion-icon');
        const text = document.getElementById('toastMessage');
        if (!toast || !text) return;
        if (icon) icon.name = success ? 'checkmark-circle-outline' : 'warning-outline';
        toast.style.background = success ? '#16a34a' : '#ef4444';
        text.textContent = msg;
        toast.classList.add('active');
        setTimeout(() => toast.classList.remove('active'), 4000);
    };

    // =============================================
    // AUTH MODAL (Step 6) + Google Sign-In Mock
    // =============================================
    let pendingJourneyCallback = null;

    const showAuthModal = (callback) => {
        pendingJourneyCallback = callback;
        document.getElementById('authOverlay')?.classList.add('visible');
        document.getElementById('authModal')?.classList.add('visible');
    };
    const closeAuthModal = () => {
        document.getElementById('authOverlay')?.classList.remove('visible');
        document.getElementById('authModal')?.classList.remove('visible');
        pendingJourneyCallback = null;
        const phone = document.getElementById('authPhone');
        if (phone) phone.value = '';
    };

    document.getElementById('closeAuthBtn')?.addEventListener('click', closeAuthModal);
    document.getElementById('authOverlay')?.addEventListener('click', closeAuthModal);

    // Google Sign-In (Mock)
    document.getElementById('googleSignInBtn')?.addEventListener('click', () => {
        const btn = document.getElementById('googleSignInBtn');
        if (btn) { btn.textContent = 'Nag-co-connect...'; btn.disabled = true; }
        setTimeout(() => {
            localStorage.setItem('calzadaUser', JSON.stringify({ name: 'Google User', provider: 'google' }));
            closeAuthModal();
            showToast('Maligayang pagdating! Na-login ka na.', true);
            setTimeout(() => pendingJourneyCallback && pendingJourneyCallback(), 400);
            if (btn) { btn.innerHTML = '✓ Connected'; btn.disabled = false; }
        }, 1500);
    });

    // Mobile number submit
    document.getElementById('authSubmitBtn')?.addEventListener('click', () => {
        const phone = document.getElementById('authPhone');
        if (!phone?.value.trim() || phone.value.length < 10) {
            showToast('Pakilagay ang tamang mobile number', false); return;
        }
        document.getElementById('authBtnText').style.display = 'none';
        document.getElementById('authSpinner').style.display = 'block';
        document.getElementById('authSubmitBtn').disabled = true;

        setTimeout(() => {
            localStorage.setItem('calzadaUser', JSON.stringify({ phone: phone.value, provider: 'mobile' }));
            document.getElementById('authBtnText').style.display = 'inline';
            document.getElementById('authSpinner').style.display = 'none';
            document.getElementById('authSubmitBtn').disabled = false;
            closeAuthModal();
            showToast('Successfully logged in!', true);
            setTimeout(() => pendingJourneyCallback?.(), 400);
        }, 1200);
    });

    // =============================================
    // START JOURNEY & TRACKING WIRING
    // =============================================
    document.getElementById('startJourneyBtn')?.addEventListener('click', () => {
        if (!selectedCoords.origin || !selectedCoords.destination) return;

        // UI Transition
        if (searchCard) searchCard.style.display = 'none';
        if (actionCard) actionCard.style.display = 'none';
        if (guideCard) guideCard.style.display = 'block';
        if (activeTripBanner) activeTripBanner.style.display = 'block';
        if (document.getElementById('itineraryOptionsPanel')) document.getElementById('itineraryOptionsPanel').style.display = 'none';

        // Populate Guide header
        document.getElementById('guideOriginText').textContent = document.getElementById('originInput')?.value || 'Origin';
        document.getElementById('guideDestText').textContent = document.getElementById('destinationInput')?.value || 'Destination';

        // Initialize Journey state
        currentLegIndex = 0;
        updateActiveJourneyUI();

        // Start Real-time Tracking
        startTracking();
        showToast(window.t('planner.journey_started'));

        // Scroll to top of guide
        guideCard.classList.remove('minimized');
    });

    // Mark Done / Advance Leg
    document.getElementById('markDoneBtn')?.addEventListener('click', () => {
        advanceLeg();
    });

    // Cancel / Stop Journey
    document.getElementById('cancelTripBtn')?.addEventListener('click', () => {
        cancelJourney();
        showToast(window.t('planner.cancel'), false);
    });

    // Swap Button
    document.getElementById('swapBtn')?.addEventListener('click', () => {
        const tmpVal = originInput.value; originInput.value = destinationInput.value; destinationInput.value = tmpVal;
        const tmpC = selectedCoords.origin; selectedCoords.origin = selectedCoords.destination; selectedCoords.destination = tmpC;
        selectedTerminalId = null;
        checkFormStatus();
        if (selectedCoords.origin && selectedCoords.destination) {
            triggerTerminalPicker();
        } else {
            hideTerminalPicker(); hideItinerary();
        }
    });

    // =============================================
    // MAP PICKER MODE
    // =============================================
    let isMapPickerMode = false;
    const mapPickerAddress = document.getElementById('mapPickerAddress');
    const mapPickerUI = document.getElementById('mapPickerUI');
    const mapCenterPin = document.getElementById('mapCenterPin');
    const plannerGuiContainer = document.querySelector('.planner-gui-container');

    const exitMapPicker = () => {
        isMapPickerMode = false;
        if (mapCenterPin) mapCenterPin.style.display = 'none';
        if (mapPickerUI) mapPickerUI.style.display = 'none';
        if (plannerGuiContainer) plannerGuiContainer.style.display = 'flex';
    };

    document.getElementById('useLocationBtnEx')?.addEventListener('click', () => {
        isMapPickerMode = true;
        if (plannerGuiContainer) plannerGuiContainer.style.display = 'none';
        if (mapCenterPin) mapCenterPin.style.display = 'flex';
        if (mapPickerUI) mapPickerUI.style.display = 'flex';
        if (mapPickerAddress) mapPickerAddress.textContent = 'Locating...';
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                if (isMapPickerMode) map.setView([pos.coords.latitude, pos.coords.longitude], 16);
            }, () => { }, { enableHighAccuracy: true });
        }
        map.fire('moveend');
    });

    map.on('movestart', () => { if (isMapPickerMode) mapCenterPin?.classList.add('dragging'); });
    let moveTimeout;
    map.on('moveend', () => {
        if (!isMapPickerMode) return;
        mapCenterPin?.classList.remove('dragging');
        if (mapPickerAddress) mapPickerAddress.textContent = 'Loading address...';
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(async () => {
            if (!isMapPickerMode) return;
            const c = map.getCenter();
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json&addressdetails=1`);
                const d = await r.json();
                if (!isMapPickerMode) return;
                const addr = d.address || {};
                const parts = [d.name, addr.road, addr.neighbourhood || addr.village || addr.suburb, addr.city || addr.town || addr.municipality].filter(Boolean);
                if (mapPickerAddress) mapPickerAddress.textContent = parts.slice(0, 3).join(', ') || 'Selected Location';
            } catch { if (mapPickerAddress) mapPickerAddress.textContent = 'Selected Location'; }
        }, 500);
    });

    document.getElementById('mapPickerCancelBtn')?.addEventListener('click', exitMapPicker);
    document.getElementById('mapPickerConfirmBtn')?.addEventListener('click', () => {
        const c = map.getCenter();
        selectedCoords.origin = [c.lat, c.lng];
        if (originInput && mapPickerAddress) originInput.value = mapPickerAddress.textContent;
        exitMapPicker();
        checkFormStatus();
        if (selectedCoords.destination) triggerTerminalPicker();
    });

    // =============================================
    // UPGRADE #7: RECENT SEARCHES
    // =============================================
    const RECENTS_KEY = 'calzada_recent_searches';
    const MAX_RECENTS = 5;

    const getRecentSearches = () => {
        try { return JSON.parse(localStorage.getItem(RECENTS_KEY)) || []; }
        catch { return []; }
    };

    const saveRecentSearch = (origin, destination, originCoords, destCoords) => {
        if (!origin || !destination) return;
        let recents = getRecentSearches();
        // Remove duplicates (same origin+dest)
        recents = recents.filter(r => !(r.origin === origin && r.destination === destination));
        recents.unshift({ origin, destination, originCoords, destCoords, ts: Date.now() });
        if (recents.length > MAX_RECENTS) recents = recents.slice(0, MAX_RECENTS);
        localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
    };

    const renderRecentSearches = (inputEl, listEl, coordKey) => {
        const recents = getRecentSearches();
        if (!recents.length) { listEl.style.display = 'none'; return; }
        listEl.innerHTML = '';
        recents.forEach(r => {
            const label = coordKey === 'origin' ? r.origin : r.destination;
            const coordsToSet = coordKey === 'origin' ? r.originCoords : r.destCoords;
            const li = document.createElement('li'); li.className = 'suggestion-item';
            li.innerHTML = `<span class="suggestion-icon">🕐</span>
                <div class="suggestion-text">
                    <span class="suggestion-name">${label}</span>
                    <span class="suggestion-address">${r.origin} → ${r.destination}</span>
                </div>`;
            li.addEventListener('click', () => {
                inputEl.value = label;
                if (coordsToSet) selectedCoords[coordKey] = coordsToSet;
                listEl.style.display = 'none';
                checkFormStatus();
                if (coordKey === 'destination') { selectedTerminalId = null; triggerTerminalPicker(); }
                if (coordKey === 'origin' && selectedCoords.destination) triggerTerminalPicker();
            });
            listEl.appendChild(li);
        });
        listEl.style.display = 'block';
    };

    // Show recent searches when inputs are focused and empty
    [
        { input: originInput, list: document.getElementById('originSuggestions'), key: 'origin' },
        { input: destinationInput, list: document.getElementById('destSuggestions'), key: 'destination' }
    ].forEach(({ input, list, key }) => {
        if (!input || !list) return;
        input.addEventListener('focus', () => {
            if (!input.value.trim()) renderRecentSearches(input, list, key);
        });
    });

    // Save search when journey starts
    const origStartJourneyBtn = document.getElementById('startJourneyBtn');
    origStartJourneyBtn?.addEventListener('click', () => {
        const ov = originInput?.value.trim();
        const dv = destinationInput?.value.trim();
        if (ov && dv) {
            saveRecentSearch(ov, dv, selectedCoords.origin, selectedCoords.destination);
        }
    }, true); // capture phase so it fires before other listeners


    // =============================================
    // UPGRADE #8: FAVORITE ROUTES
    // =============================================
    const FAVS_KEY = 'calzada_favorite_routes';

    const getFavorites = () => {
        try { return JSON.parse(localStorage.getItem(FAVS_KEY)) || []; }
        catch { return []; }
    };

    const saveFavorite = (origin, destination, originCoords, destCoords) => {
        let favs = getFavorites();
        const exists = favs.some(f => f.origin === origin && f.destination === destination);
        if (exists) return false; // already saved
        favs.unshift({ origin, destination, originCoords, destCoords, ts: Date.now() });
        localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
        return true;
    };

    const removeFavorite = (origin, destination) => {
        let favs = getFavorites().filter(f => !(f.origin === origin && f.destination === destination));
        localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
    };

    const isFavorite = (origin, destination) =>
        getFavorites().some(f => f.origin === origin && f.destination === destination);

    // Inject star button into the guide card header
    const guideTitle = document.querySelector('.guide-title');
    if (guideTitle) {
        guideTitle.insertAdjacentHTML('afterend', `
            <button id="favStarBtn" title="Save as Favorite"
                style="position:absolute;right:16px;top:16px;background:none;border:none;cursor:pointer;font-size:1.4rem;color:#cbd5e1;transition:color 0.2s;"
                >☆</button>`);
    }

    const updateFavStar = () => {
        const btn = document.getElementById('favStarBtn');
        if (!btn) return;
        const ov = originInput?.value.trim();
        const dv = destinationInput?.value.trim();
        if (ov && dv && isFavorite(ov, dv)) {
            btn.textContent = '★'; btn.style.color = '#f59e0b';
        } else {
            btn.textContent = '☆'; btn.style.color = '#cbd5e1';
        }
    };

    document.getElementById('favStarBtn')?.addEventListener('click', () => {
        const ov = originInput?.value.trim();
        const dv = destinationInput?.value.trim();
        if (!ov || !dv) return;
        if (isFavorite(ov, dv)) {
            removeFavorite(ov, dv);
            showToast('Natanggal sa mga paboritong ruta.', false);
        } else {
            saveFavorite(ov, dv, selectedCoords.origin, selectedCoords.destination);
            showToast('✨ Nai-save ang paboritong ruta!', true);
        }
        updateFavStar();
        renderFavoritesInDrawer();
    });

    // Render favorites list inside side drawer
    const renderFavoritesInDrawer = () => {
        let container = document.getElementById('drawerFavsSection');
        const drawerLinks = document.querySelector('.drawer-links');
        if (!drawerLinks) return;

        if (!container) {
            drawerLinks.insertAdjacentHTML('beforeend', `
                <div id="drawerFavsSection" style="margin-top:12px;border-top:1px solid #e2e8f0;padding-top:12px;">
                    <div style="font-size:0.75rem;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;padding-left:4px;">
                        Mga Paboritong Ruta
                    </div>
                    <div id="drawerFavsList"></div>
                </div>`);
            container = document.getElementById('drawerFavsSection');
        }

        const list = document.getElementById('drawerFavsList');
        if (!list) return;
        const favs = getFavorites();
        if (!favs.length) { container.style.display = 'none'; return; }
        container.style.display = 'block';
        list.innerHTML = '';
        favs.forEach(f => {
            const item = document.createElement('a');
            item.href = '#';
            item.style.cssText = 'display:flex;align-items:center;gap:10px;padding:8px 4px;text-decoration:none;color:#1e293b;font-size:0.875rem;border-radius:8px;transition:background 0.15s;';
            item.innerHTML = `<ion-icon name="star" style="color:#f59e0b;font-size:1rem;flex-shrink:0;"></ion-icon>
                <div style="overflow:hidden;">
                    <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${f.origin} → ${f.destination}</div>
                </div>`;
            item.addEventListener('mouseover', () => item.style.background = '#f1f5f9');
            item.addEventListener('mouseout', () => item.style.background = '');
            item.addEventListener('click', (e) => {
                e.preventDefault();
                if (originInput) originInput.value = f.origin;
                if (destinationInput) destinationInput.value = f.destination;
                if (f.originCoords) selectedCoords.origin = f.originCoords;
                if (f.destCoords) selectedCoords.destination = f.destCoords;
                toggleDrawer(false);
                checkFormStatus();
                if (selectedCoords.origin && selectedCoords.destination) triggerTerminalPicker();
                updateFavStar();
            });
            list.appendChild(item);
        });
    };

    // Init favorites on load
    renderFavoritesInDrawer();
    // Update star when guide card becomes visible
    const origStartBtn = document.getElementById('startJourneyBtn');
    origStartBtn?.addEventListener('click', () => { setTimeout(updateFavStar, 100); }, true);


    // =============================================
    // UPGRADE #9: DYIPTOK CONTEXT AWARENESS
    // =============================================
    // Expose current route context globally so DyipTok in script.js can read it
    const updateDyipTokContext = () => {
        const ov = originInput?.value.trim();
        const dv = destinationInput?.value.trim();
        if (ov && dv) {
            window._calzadaRouteContext = {
                origin: ov,
                destination: dv,
                totalTime: currentItineraryOptions[selectedOptionIndex]?.totalTime || null,
                totalFare: currentItineraryOptions[selectedOptionIndex]?.totalFare || null,
                legs: currentItineraryOptions[selectedOptionIndex]?.legs?.map(l => l.title) || []
            };
        } else {
            window._calzadaRouteContext = null;
        }
    };

    // Patch selectItinerary to also update context
    const _origSelectItinerary = selectItinerary;
    // Re-hook via the already-defined selectItinerary — update context after each selection
    document.getElementById('itineraryOptionsPanel')?.addEventListener('click', () => {
        setTimeout(updateDyipTokContext, 50);
    });
    origStartBtn?.addEventListener('click', updateDyipTokContext, true);


}); // end DOMContentLoaded

// =============================================
// DATETIME PICKER — standalone module
// =============================================
(function () {
    const overlay = document.getElementById('dtPickerOverlay');
    const modal = document.getElementById('dtPickerModal');
    if (!overlay || !modal) return;

    const hrSlider = document.getElementById('dtHrSlider');
    const minSlider = document.getElementById('dtMinSlider');
    const timeDisplay = document.getElementById('dtTimeDisplay');
    const amBtn = document.getElementById('dtAmBtn');
    const pmBtn = document.getElementById('dtPmBtn');
    const leaveBtn = document.getElementById('dtLeaveBtn');
    const arriveBtn = document.getElementById('dtArriveBtn');
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    let pickerMode = 'depart', ampm = 'pm', calDate = new Date(), selectedDate = new Date();
    const pad2 = n => String(n).padStart(2, '0');

    const updateDisplay = () => {
        if (timeDisplay) timeDisplay.textContent = `${pad2(hrSlider.value)}:${pad2(minSlider.value)} ${ampm}`;
    };
    const setAmPm = (val) => {
        ampm = val;
        amBtn?.classList.toggle('active', val === 'am');
        pmBtn?.classList.toggle('active', val === 'pm');
        updateDisplay();
    };
    const setNow = () => {
        const now = new Date();
        let h = now.getHours(), mi = now.getMinutes();
        const p = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
        if (hrSlider) hrSlider.value = h;
        if (minSlider) minSlider.value = mi;
        setAmPm(p); selectedDate = new Date(); calDate = new Date();
        renderCalendar(); updateDisplay();
    };
    const renderCalendar = () => {
        const cal = document.getElementById('dtCalDays');
        const monthYear = document.getElementById('dtCalMonthYear');
        if (!cal || !monthYear) return;
        const yr = calDate.getFullYear(), mo = calDate.getMonth();
        monthYear.textContent = `${MONTHS[mo]} ${yr}`;
        cal.innerHTML = '';
        const today = new Date();
        for (let i = 0; i < new Date(yr, mo, 1).getDay(); i++) {
            const e = document.createElement('button'); e.className = 'dt-cal-day empty'; e.disabled = true; cal.appendChild(e);
        }
        for (let d = 1; d <= new Date(yr, mo + 1, 0).getDate(); d++) {
            const btn = document.createElement('button'); btn.className = 'dt-cal-day'; btn.textContent = d;
            const thisDate = new Date(yr, mo, d);
            if (today.toDateString() === thisDate.toDateString()) btn.classList.add('today');
            if (selectedDate.toDateString() === thisDate.toDateString()) btn.classList.add('selected');
            if (thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate())) { btn.classList.add('past'); btn.disabled = true; }
            btn.addEventListener('click', () => { selectedDate = new Date(yr, mo, d); renderCalendar(); });
            cal.appendChild(btn);
        }
    };
    const openPicker = (mode) => {
        pickerMode = mode;
        leaveBtn?.classList.toggle('active', mode === 'depart');
        arriveBtn?.classList.toggle('active', mode === 'arrive');
        setNow();
        overlay.classList.add('visible');
        requestAnimationFrame(() => requestAnimationFrame(() => modal.classList.add('visible')));
    };
    const closePicker = () => { modal.classList.remove('visible'); overlay.classList.remove('visible'); };
    window.openDtPicker = openPicker;

    const confirmSchedule = () => {
        const h = pad2(hrSlider.value), m = pad2(minSlider.value);
        const timeStr = `${h}:${m} ${ampm}`;
        const dateStr = selectedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        const label = `${pickerMode === 'depart' ? window.t('planner.depart_at_pre') : window.t('planner.arrive_by_pre')} ${dateStr} ${timeStr}`;
        const schedText = document.getElementById('scheduleSelectedText');
        if (schedText) schedText.textContent = label;
        const btnText = document.getElementById('startJourneyBtnText');
        if (btnText) btnText.textContent = window.t('planner.schedule_journey');
        closePicker();
        // Re-trigger schedule computation with updated time
        const estTime = document.getElementById('estTimeValue');
        if (estTime && estTime.textContent !== '-- min') {
            const mins = parseInt(estTime.textContent) || 0;
            // find and call computeAndShowSchedule if available
        }
    };

    hrSlider?.addEventListener('input', updateDisplay);
    minSlider?.addEventListener('input', updateDisplay);
    amBtn?.addEventListener('click', () => setAmPm('am'));
    pmBtn?.addEventListener('click', () => setAmPm('pm'));
    document.getElementById('dtNowBtn')?.addEventListener('click', setNow);
    document.getElementById('dtBackBtn')?.addEventListener('click', closePicker);
    overlay.addEventListener('click', closePicker);
    document.getElementById('dtConfirmBtn')?.addEventListener('click', confirmSchedule);
    document.getElementById('dtPrevMonth')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
    document.getElementById('dtNextMonth')?.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });
    leaveBtn?.addEventListener('click', () => { pickerMode = 'depart'; leaveBtn.classList.add('active'); arriveBtn?.classList.remove('active'); });
    arriveBtn?.addEventListener('click', () => { pickerMode = 'arrive'; arriveBtn.classList.add('active'); leaveBtn?.classList.remove('active'); });

    // Handle language change
    window.addEventListener('calzada_lang_changed', () => {
        // Update Start Journey button text
        const startBtnText = document.getElementById('startJourneyBtnText');
        if (startBtnText) {
            const isScheduled = document.getElementById('scheduleSummaryCard')?.style.display !== 'none';
            startBtnText.textContent = isScheduled ? window.t('planner.schedule_journey') : window.t('planner.simulan');
        }

        // Update schedule label if Leave Now is active
        const schedText = document.getElementById('scheduleSelectedText');
        const activeSchedOption = document.querySelector('#scheduleOptions li.active')?.getAttribute('data-value');
        if (schedText && activeSchedOption === 'now') {
            schedText.textContent = window.t('planner.leave_now');
        }

        // Re-apply static translations
        if (typeof window.applyLang === 'function') window.applyLang();
    });
})();
