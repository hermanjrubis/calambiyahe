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
    // BOTTOM SHEET DRAG (Sakay.ph style snap)
    // =============================================
    const panel = document.getElementById('mainFloatingPanel');
    const dragBar = document.getElementById('dragHandleBar');
    const panelHeader = document.getElementById('panelHeader');
    const scrollBody = document.getElementById('panelScrollBody');
    const PEEK = 100;
    const getMid = () => window.innerHeight * 0.52;
    const getFull = () => window.innerHeight * 0.90;

    const snapPanel = (h, animate = true) => {
        if (!panel || window.innerWidth > 768) return;
        if (!animate) panel.classList.add('dragging');
        panel.style.height = h + 'px';
        if (!animate) { requestAnimationFrame(() => panel.classList.remove('dragging')); }
    };
    const snapToNearest = () => {
        if (!panel || window.innerWidth > 768) return;
        const cur = panel.getBoundingClientRect().height;
        const snaps = [PEEK, getMid(), getFull()];
        const closest = snaps.reduce((a, b) => Math.abs(b - cur) < Math.abs(a - cur) ? b : a);
        panel.classList.add('snapping');
        panel.style.height = closest + 'px';
        setTimeout(() => panel.classList.remove('snapping'), 380);
    };

    if (panel) {
        let startY = 0, startH = 0, isDragging = false;
        let isScrollDragging = false, scrollStartY = 0;

        const handleDragStart = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return;
            startY = e.touches[0].clientY;
            startH = panel.getBoundingClientRect().height;
            isDragging = true;
            panel.classList.add('dragging');
        };

        if (dragBar) dragBar.addEventListener('touchstart', handleDragStart, { passive: true });
        if (panelHeader) panelHeader.addEventListener('touchstart', handleDragStart, { passive: true });

        // Scroll top handoff
        if (scrollBody) {
            scrollBody.addEventListener('touchstart', (e) => {
                if (scrollBody.scrollTop <= 0) {
                    scrollStartY = e.touches[0].clientY;
                    isScrollDragging = true;
                }
            }, { passive: true });
            
            scrollBody.addEventListener('touchmove', (e) => {
                if (isScrollDragging && scrollBody.scrollTop <= 0) {
                    const dy = scrollStartY - e.touches[0].clientY;
                    if (dy < -5 && !isDragging) { // User swiping down at top of scroll
                        isDragging = true;
                        startY = e.touches[0].clientY;
                        startH = panel.getBoundingClientRect().height;
                        panel.classList.add('dragging');
                        if(e.cancelable) e.preventDefault();
                    }
                }
            }, { passive: false });
            
            scrollBody.addEventListener('touchend', () => {
                isScrollDragging = false;
            });
        }

        document.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            if (e.cancelable && !isScrollDragging) e.preventDefault();
            const dy = startY - e.touches[0].clientY;
            const newH = Math.max(PEEK, Math.min(getFull(), startH + dy));
            panel.style.height = newH + 'px';
        }, { passive: false });

        document.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            panel.classList.remove('dragging');
            snapToNearest();
        });
    }

    // Auto-expand panel to mid when inputs are focused
    const autoExpandPanel = () => {
        if (window.innerWidth > 768) return;
        const cur = panel?.getBoundingClientRect().height || 0;
        if (cur < getMid()) snapPanel(getMid());
    };


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
        const distToTerm = calcDist(originCoords[0], originCoords[1], terminal.coords[0], terminal.coords[1]);
        const mode = modeKey || 'jeep';
        const fareInfo = FARE_MAP[mode] || FARE_MAP.jeep;

        // --- LEG 1: Access leg (Case A / B / C) ---
        if (distToTerm > 10.0) {
            // Case A: Far → Tricycle
            const fare = FARE_MAP.tricycle.base + Math.max(0, distToTerm - 1) * FARE_MAP.tricycle.perKm;
            legs.push({
                type: 'access', mode: 'tricycle', icon: 'bicycle-outline', iconColor: '#16a34a',
                title: 'Tricycle Ride', from: 'Iyong Lokasyon', to: terminal.shortName,
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
        const iconMap = { bus: 'bus', van: 'car-sport-outline', tricycle: 'bicycle-outline', 'modern-jeep': 'bus-outline', jeep: 'bus-outline' };
        const colorMap = { bus: '#0f6fd1', van: '#f59e0b', tricycle: '#16a34a', 'modern-jeep': '#7c3aed', jeep: '#1a8fff' };
        legs.push({
            type: 'main', mode, icon: iconMap[mode] || 'bus-outline', iconColor: colorMap[mode] || '#1a8fff',
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
        if (!container || !list) return;

        list.innerHTML = '';
        container.style.display = 'block';

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

            card.innerHTML = `
                <div class="leg-icon-column">
                    <div class="leg-icon-circle" style="background:${leg.iconColor}18;color:${leg.iconColor};">
                        <ion-icon name="${leg.icon}"></ion-icon>
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

        // Update summary
        const badge = document.getElementById('totalSummaryBadge');
        if (badge) badge.textContent = `~${totalMins} min · ₱${Math.ceil(totalFare)}`;
        const estTimeEl = document.getElementById('estTimeValue');
        const estFareEl = document.getElementById('estFareValue');
        if (estTimeEl) estTimeEl.textContent = `${totalMins} min`;
        if (estFareEl) estFareEl.textContent = `₱${Math.ceil(totalFare)}`;

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

    // =============================================
    // TRIGGER TERMINAL PICKER
    // =============================================
    const triggerTerminalPicker = () => {
        const destVal = destinationInput?.value.trim();
        if (!destVal || destVal.length < 2) { hideTerminalPicker(); return; }

        const terminals = getNearestTerminals(destVal, selectedCoords.destination);
        renderTerminalPicker(terminals);

        // If origin is also set, auto-generate itinerary with first terminal
        if (selectedCoords.origin && selectedCoords.destination && terminals.length) {
            const term = terminals.find(t => t.id === selectedTerminalId) || terminals[0];
            selectedTerminalId = term.id;
            const mode = getActiveMode();
            const legs = generateItineraryLegs(selectedCoords.origin, term, selectedCoords.destination, destVal, mode);
            renderItinerary(legs);
            drawRoute(mode);
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
    const createTransitMarker = (iconName, color) => L.divIcon({
        html: `<div style="background:${color};color:white;border:2px solid white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,.3);"><ion-icon name="${iconName}"></ion-icon></div>`,
        className: 'custom-leaflet-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16]
    });

    const fetchOSRMRoute = async (o, d) => {
        const url = `https://router.project-osrm.org/route/v1/driving/${o[1]},${o[0]};${d[1]},${d[0]}?geometries=geojson&overview=full`;
        const res = await fetch(url); if (!res.ok) throw new Error('OSRM fail');
        const data = await res.json(); if (!data.routes?.length) throw new Error('no route');
        return { coords: data.routes[0].geometry.coordinates.map(([ln, lt]) => [lt, ln]) };
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
        const data = routeSimulations[mode] || routeSimulations.jeep;
        if (currentPolyline) { map.removeLayer(currentPolyline); currentPolyline = null; }
        markers.forEach(m => map.removeLayer(m)); markers = [];

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

        const vehicleIcon = { bus: 'bus', van: 'car-sport-outline', tricycle: 'bicycle-outline' }[mode] || 'bus-outline';
        markers.push(
            L.marker(oC, { icon: createTransitMarker('ellipse-outline', '#64748b') }).bindPopup(`<b>${ov}</b><br>📍 Start`).addTo(map),
            L.marker(dC, { icon: createTransitMarker(vehicleIcon, data.color) }).bindPopup(`<b>${dv}</b><br>🏁 Destination`).addTo(map)
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
                searchNominatim(inputEl.value, r => buildSuggestions(r, listEl, inputEl, coordKey));
                if (coordKey === 'destination') {
                    selectedTerminalId = null;
                    if (inputEl.value.length >= 2) triggerTerminalPicker();
                    else { hideTerminalPicker(); hideItinerary(); }
                }
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
    const originParam = urlParams.get('origin');
    if (destParam && destinationInput) destinationInput.value = destParam;
    if (originParam && originInput) originInput.value = originParam;

    // Bind inputs
    if (originInput && destinationInput) {
        bindSearchInput(originInput, document.getElementById('originSuggestions'), 'origin');
        bindSearchInput(destinationInput, document.getElementById('destSuggestions'), 'destination');
    }

    // If dest was passed via URL, trigger terminal picker after short delay
    if (destParam) setTimeout(triggerTerminalPicker, 800);

    // =============================================
    // DROPDOWNS
    // =============================================
    const initDropdown = (containerId, selectedId, textId, optionsListId, onChange) => {
        const container = document.getElementById(containerId);
        const selected = document.getElementById(selectedId);
        const text = document.getElementById(textId);
        const list = document.getElementById(optionsListId);
        if (!container || !selected || !list) return;

        const position = () => {
            const r = selected.getBoundingClientRect();
            const w = Math.max(r.width, 190);
            let top = r.bottom + 6;
            const est = list.querySelectorAll('li').length * 48 + 16;
            if (top + est > window.innerHeight - 20) top = r.top - est - 6;
            let left = r.left;
            if (left + w > window.innerWidth - 12) left = window.innerWidth - w - 12;
            list.style.cssText = `top:${Math.max(left, 12)}px;left:${Math.max(left, 12)}px;min-width:${w}px;`;
            list.style.top = `${top}px`; list.style.left = `${Math.max(left, 12)}px`;
        };

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const was = container.classList.contains('open');
            document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
            if (!was) { position(); container.classList.add('open'); }
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

    initDropdown('scheduleDropdownContainer', 'scheduleSelected', 'scheduleSelectedText', 'scheduleOptions', (val) => {
        if ((val === 'depart' || val === 'arrive') && typeof window.openDtPicker === 'function') {
            setTimeout(() => window.openDtPicker(val), 80);
        } else if (val === 'now') {
            const btnText = document.getElementById('startJourneyBtnText');
            if (btnText) btnText.textContent = 'Simulan ang Biyahe';
            const schedCard = document.getElementById('scheduleSummaryCard');
            if (schedCard) schedCard.style.display = 'none';
        }
    });

    initDropdown('modeDropdownContainer', 'modeSelected', 'modeSelectedText', 'modeOptions', (mode) => {
        if (selectedCoords.origin && selectedCoords.destination && selectedTerminalId) {
            const term = TERMINALS.find(t => t.id === selectedTerminalId);
            if (term) {
                const legs = generateItineraryLegs(selectedCoords.origin, term, selectedCoords.destination, destinationInput.value.trim(), mode);
                renderItinerary(legs);
                drawRoute(mode);
            }
        }
    });

    // =============================================
    // FORM STATUS
    // =============================================
    const checkFormStatus = () => {
        const ov = originInput?.value.trim(), dv = destinationInput?.value.trim();
        const btn = document.getElementById('startJourneyBtn');
        if (btn) btn.disabled = !(ov && dv);
        document.getElementById('bookActionArea').style.display = 'block';
    };
    checkFormStatus();

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
        const btnText = document.getElementById('startJourneyBtnText');
        if (btnText) btnText.textContent = 'Simulan ang Biyahe';
        document.querySelectorAll('#scheduleOptions li').forEach((l, i) => l.classList.toggle('active', i === 0));
        document.getElementById('activeTripArea').style.display = 'none';
        document.getElementById('bookActionArea').style.display = 'block';
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
    const mainFloatingPanel = document.getElementById('mainFloatingPanel');

    const exitMapPicker = () => {
        isMapPickerMode = false;
        if (mapCenterPin) mapCenterPin.style.display = 'none';
        if (mapPickerUI) mapPickerUI.style.display = 'none';
        if (mainFloatingPanel) mainFloatingPanel.style.display = 'flex';
    };

    document.getElementById('useLocationBtnEx')?.addEventListener('click', () => {
        isMapPickerMode = true;
        if (mainFloatingPanel) mainFloatingPanel.style.display = 'none';
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
