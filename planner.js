// =============================================
// CALZADA PLANNER — FULL ROUTING ENGINE
// =============================================

document.addEventListener('DOMContentLoaded', () => {

    const map = L.map('map').setView([14.2045, 121.1641], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
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
        }
    ];

    const FARE_MAP = {
        jeep: { base: 13, perKm: 2, name: 'Jeepney' },
        'modern-jeep': { base: 15, perKm: 2.5, name: 'Modern Jeepney' },
        bus: { base: 15, perKm: 2.5, name: 'Bus' },
        van: { base: 25, perKm: 4, name: 'Van' },
        tricycle: { base: 20, perKm: 5, name: 'Tricycle' },
        walk: { base: 0, perKm: 0, name: 'Walk' }
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
            if (e.target.closest('input')) return;
            const scrollBody = e.target.closest('.search-card-scrollbody');
            // If touching inside the scroll body...
            if (scrollBody) {
                // ... ONLY allow minimizing pull-down if we are completely at the top of the list!
                // Otherwise let the user natively scroll the list.
                if (scrollBody.scrollTop > 0) return;
            }
            startY = e.touches[0].clientY;
            isDragging = true;
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            const y = e.touches[0].clientY;
            if (y - startY > 40) { // Dragged down
                card.classList.add('minimized');
                isDragging = false;
            } else if (y - startY < -40) { // Dragged up
                card.classList.remove('minimized');
                isDragging = false;
            }
        }, { passive: true });
        
        document.addEventListener('touchend', () => isDragging = false);

        // Tapping pulls it back up
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
        const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    // Step 2: Find terminals that serve the destination
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

    // Steps 3 & 4: Generate multi-leg itinerary
    const generateItineraryLegs = (originCoords, terminal, destCoords, destName, modeKey) => {
        const legs = [];
        const mode = modeKey || 'jeep';
        const fareInfo = FARE_MAP[mode] || FARE_MAP.jeep;

        // --- LEG 1: Access to terminal ---
        const distToTerm = calcDist(originCoords[0], originCoords[1], terminal.coords[0], terminal.coords[1]);
        if (distToTerm > 3) {
            // Case A: Too far → Trycycle access
            const fare = distToTerm > 3 ? 50 + (distToTerm - 3) * 15 : 50;
            legs.push({
                type: 'access', mode: 'tricycle', imageIcon: 'assets/icons/tricycle-icon.png', iconColor: '#16a34a',
                title: 'Sumakay ng Tricycle', from: 'Iyong Lokasyon', to: terminal.shortName,
                distance: distToTerm, fare, duration: Math.round(distToTerm * 6),
                note: `Sakay ng tricycle papunta sa ${terminal.name}`
            });
        } else if (distToTerm > 0.3) {
            // Case B: Near → Walk
            legs.push({
                type: 'access', mode: 'walk', icon: 'walk-outline', iconColor: '#64748b',
                title: 'Maglakad', from: 'Iyong Lokasyon', to: terminal.shortName,
                distance: distToTerm, fare: 0, duration: Math.round(distToTerm * 13),
                note: `Pumunta sa ${terminal.name}`
            });
        }
        // Case C: Already at terminal → no access leg

        // --- LEG 2: Main commute ---
        const distToDest = calcDist(terminal.coords[0], terminal.coords[1], destCoords[0], destCoords[1]);
        const mainFare = fareInfo.base + Math.max(0, distToDest - 4) * fareInfo.perKm;
        const colorMap = { bus: '#0f6fd1', van: '#f59e0b', tricycle: '#16a34a', 'modern-jeep': '#7c3aed', jeep: '#1a8fff' };
        const imageMap = { bus: 'assets/icons/bus-icon.png', van: 'assets/icons/van-icon.png', tricycle: 'assets/icons/tricycle-icon.png', 'modern-jeep': 'assets/icons/jeepney-icon.png', jeep: 'assets/icons/jeepney-icon.png' };
        
        legs.push({
            type: 'main', mode, imageIcon: imageMap[mode] || 'assets/icons/jeepney-icon.png', iconColor: colorMap[mode] || '#1a8fff',
            title: fareInfo.name, from: terminal.shortName, to: destName,
            distance: distToDest, fare: Math.max(mainFare, fareInfo.base),
            duration: Math.round(distToDest * 3) + 5,
            note: `Mula ${terminal.name} → ${destName}`
        });

        // --- LEG 3: Arrival ---
        legs.push({
            type: 'arrival', mode: 'arrive', icon: 'flag-outline', iconColor: '#ef4444',
            title: 'Nakarating!', from: destName, to: destName, distance: 0, fare: 0, duration: 0,
            note: `Dumating sa ${destName}`
        });

        return legs;
    };

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
        const mainFare = fareInfo.base + Math.max(0, dist - 4) * fareInfo.perKm;

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
                const mode = getActiveMode();
                const legs = generateLocalItinerary(selectedCoords.origin, selectedCoords.destination, destVal, mode);
                renderItinerary(legs);
                drawRoute(mode);
            }
        } else {
            const terminals = getNearestTerminals(destVal, selectedCoords.destination);
            renderTerminalPicker(terminals);

            if (selectedCoords.origin && selectedCoords.destination && terminals.length) {
                const term = terminals.find(t => t.id === selectedTerminalId) || terminals[0];
                selectedTerminalId = term.id;
                const mode = getActiveMode();
                const legs = generateItineraryLegs(selectedCoords.origin, term, selectedCoords.destination, destVal, mode);
                renderItinerary(legs);
                drawRoute(mode);
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

    const fetchOSRMRoute = async (o, d) => {
        const url = `https://router.project-osrm.org/route/v1/driving/${o[1]},${o[0]};${d[1]},${d[0]}?geometries=geojson&overview=full`;
        const res = await fetch(url); if (!res.ok) throw new Error('OSRM fail');
        const data = await res.json(); if (!data.routes?.length) throw new Error('no route');
        return { coords: data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]) }; // flip to lat,lng
    };

    const showRouteLoading = (show) => {
        let el = document.getElementById('routeLoadingIndicator');
        if (!el) {
            el = document.createElement('div'); el.id = 'routeLoadingIndicator';
            el.innerHTML = `<div class="route-loading-inner"><div class="route-spinner"></div><span>Calculating route…</span></div>`;
            document.body.appendChild(el);
        }
        el.style.display = show ? 'flex' : 'none';
    };

    const getActiveMode = () => document.querySelector('#modeOptions li.active')?.getAttribute('data-value') || 'jeep';

    const drawRoute = async (mode) => {
        if (currentPolyline) map.removeLayer(currentPolyline);
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        
        const data = routeSimulations[mode] || routeSimulations.jeep;

        const originInput = document.getElementById('originInput');
        const destinationInput = document.getElementById('destinationInput');
        const ov = originInput?.value.trim(), dv = destinationInput?.value.trim();
        if (!ov || !dv) return;

        const oC = selectedCoords.origin || data.paths[0];
        const dC = selectedCoords.destination || data.paths[data.paths.length - 1];
        let path = data.paths;

        if (selectedCoords.origin && selectedCoords.destination) {
            showRouteLoading(true);
            try { const r = await fetchOSRMRoute(oC, dC); path = r.coords; }
            catch { path = [oC, dC]; } finally { showRouteLoading(false); }
        }

        currentPolyline = L.polyline(path, { color: data.color, weight: data.weight, opacity: 0.88, dashArray: data.dashArray, lineJoin: 'round', lineCap: 'round' }).addTo(map);
        const isMob = window.innerWidth <= 768;
        map.fitBounds(currentPolyline.getBounds(), { paddingTopLeft: [50, 60], paddingBottomRight: [isMob ? 50 : 450, isMob ? window.innerHeight * .4 : 50], maxZoom: 16 });

        markers.push(
            L.marker(oC, { icon: L.icon({ iconUrl: 'assets/startingpoint-icon.png', iconSize: [40, 40], iconAnchor: [20, 36], popupAnchor: [0, -36] }) }).bindPopup(`<b>${ov}</b><br>📍 Start`).addTo(map),
            L.marker(dC, { icon: L.icon({ iconUrl: 'assets/destination-icon.png', iconSize: [40, 40], iconAnchor: [20, 36], popupAnchor: [0, -36] }) }).bindPopup(`<b>${dv}</b><br>🏁 Destination`).addTo(map)
        );
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
    const initDropdown = (containerId, selectedId, textId, optionsListId, onChange) => {
        const container = document.getElementById(containerId);
        const selected = document.getElementById(selectedId);
        const text = document.getElementById(textId);
        const list = document.getElementById(optionsListId);
        if (!container || !selected || !list) return;

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const was = container.classList.contains('open');
            // Close all others
            document.querySelectorAll('.sakay-action-row.open, .sakay-mode-selector.open').forEach(d => d.classList.remove('open'));
            if (!was) { container.classList.add('open'); }
        });

        list.querySelectorAll('li').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                list.querySelectorAll('li').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                text.textContent = opt.textContent.trim();
                const img = opt.querySelector('img');
                const sImg = selected.querySelector('.mode-option-icon');
                if (img && sImg) { sImg.src = img.src; sImg.alt = img.alt; }
                container.classList.remove('open');
                onChange?.(opt.getAttribute('data-value'));
            });
        });

        document.addEventListener('click', () => container.classList.remove('open'));
    };

    let fpInstance = null;

    initDropdown('scheduleDropdownContainer', 'scheduleSelected', 'scheduleSelectedText', 'scheduleOptions', (val) => {
        if ((val === 'depart' || val === 'arrive')) {
            if (fpInstance) setTimeout(() => fpInstance.open(), 50);
        } else if (val === 'now') {
            const btnText = document.getElementById('startJourneyBtnText');
            if (btnText) btnText.textContent = 'Simulan ang Biyahe';
            const schedCard = document.getElementById('scheduleSummaryCard');
            if (schedCard) schedCard.style.display = 'none';
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
                        
                        text.textContent = (activeOption === 'arrive' ? 'Arrive by ' : 'Depart at ') + fmt;
                        if (selectedCoords.origin && selectedCoords.destination) triggerTerminalPicker();
                    }
                }
            });
        }
    };
    bindDatePicker();

    initDropdown('modeDropdownContainer', 'modeSelected', 'modeSelectedText', 'modeOptions', (mode) => {
        if (selectedCoords.origin && selectedCoords.destination) {
            triggerTerminalPicker();
        }
    });

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
    // START JOURNEY (Steps 7 + 8)
    // =============================================
    document.getElementById('startJourneyBtn')?.addEventListener('click', () => {
        const mode = getActiveMode();
        const activeSchedule = document.querySelector('#scheduleOptions li.active');
        const schedVal = activeSchedule?.getAttribute('data-value') || 'now';
        const isScheduled = schedVal !== 'now';

        const proceedWithJourney = () => {
            // Draw route if not already drawn
            if (!currentPolyline) drawRoute(mode);

            document.getElementById('bookActionArea').style.display = 'none';
            const tripArea = document.getElementById('activeTripArea');
            if (tripArea) {
                tripArea.style.display = 'flex';
                const label = document.getElementById('activeTripLabel');
                if (label) label.textContent = isScheduled ? 'Trip Scheduled ✓' : 'Trip Active';
            }
            // Expand panel to full on mobile
            if (window.innerWidth <= 768) snapPanel(getFull());

            // Step 7: Notification Simulation
            if (isScheduled) {
                const schedTime = document.getElementById('scheduleSelectedText')?.textContent || '';
                const destName = destinationInput?.value.trim() || 'iyong destinasyon';
                const notifMsg = window._notifMsg || `Departure reminder para sa biyahe papunta sa ${destName} (${schedTime}).`;

                showToast(`✓ Naka-schedule! ${notifMsg.substring(0, 80)}...`);
                console.log('[Calzada Notification]', notifMsg);
                // Simulate SMS/email notification
                console.log('[SMS Simulation] To:', JSON.parse(localStorage.getItem('calzadaUser') || '{}')?.phone || 'user');
                console.log('[Email Simulation] Subject: Calzada Trip Reminder');
                console.log('[Email Simulation] Body:', notifMsg);
            } else {
                showToast('Maingat sa byahe! Nagsimula na ang iyong biyahe.', true);
            }
        };

        if (isScheduled && !localStorage.getItem('calzadaUser')) {
            showAuthModal(proceedWithJourney);
        } else {
            proceedWithJourney();
        }
    });

    // Cancel Trip
    document.getElementById('cancelTripBtn')?.addEventListener('click', () => {
        if (currentPolyline) { map.removeLayer(currentPolyline); currentPolyline = null; }
        markers.forEach(m => map.removeLayer(m)); markers = [];
        selectedCoords.origin = null; selectedCoords.destination = null;
        selectedTerminalId = null;
        if (originInput) originInput.value = '';
        if (destinationInput) destinationInput.value = '';
        hideTerminalPicker(); hideItinerary();
        const schedText = document.getElementById('scheduleSelectedText');
        if (schedText) schedText.textContent = 'Leaving now';
        
        document.querySelectorAll('#scheduleOptions li').forEach((l, i) => l.classList.toggle('active', i === 0));
        
        // Restore Input and Action cards
        if (searchCard) searchCard.style.display = 'block';
        if (actionCard) actionCard.style.display = 'flex';
        // Hide Active ITINERARY UI
        if (guideCard) guideCard.style.display = 'none';
        if (activeTripBanner) activeTripBanner.style.display = 'none';

        const startBtn = document.getElementById('startJourneyBtn');
        if (startBtn) startBtn.disabled = true;
        map.setView([14.2045, 121.1641], 14);
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
        const label = `${pickerMode === 'depart' ? 'Depart' : 'Arrive'} ${dateStr} ${timeStr}`;
        const schedText = document.getElementById('scheduleSelectedText');
        if (schedText) schedText.textContent = label;
        const btnText = document.getElementById('startJourneyBtnText');
        if (btnText) btnText.textContent = 'I-schedule ang Biyahe';
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
})();
