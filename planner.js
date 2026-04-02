// =============================================
// CALZADA PLANNER - LEAFLET MAP LOGIC
// =============================================

document.addEventListener('DOMContentLoaded', () => {

    // Center map horizontally on Calamba City coordinates
    // Using zoom level 14 to see the city details
    const map = L.map('map').setView([14.2045, 121.1641], 14);

    // CartoDB Positron Tile Layer (Clean roads-only Mapbox-style view)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        className: 'calzada-map-tiles'
    }).addTo(map);

    // Simulated Router Data for Calamba to Los Baños/UPLB Gate Region
    const routeSimulations = {
        jeep: {
            paths: [
                [14.2045, 121.1641], // SM Calamba
                [14.2010, 121.1700], // Crossing
                [14.1950, 121.1820], // Bucal
                [14.1850, 121.2000], // Anos
                [14.1687, 121.2435]  // UPLB Gate
            ],
            color: '#1a8fff', // Primary blue
            weight: 6,
            dashArray: null
        },
        bus: {
            paths: [
                [14.2045, 121.1641],
                [14.2150, 121.1550], // Turbina/SLEX area
                [14.2500, 121.1000]
            ],
            color: '#0f6fd1', // Dark blue
            weight: 6,
            dashArray: '1, 10' // represents long routes mostly
        },
        van: {
            paths: [
                [14.2045, 121.1641], // SM Calamba
                [14.1900, 121.1700], // Shortcut alternative
                [14.1700, 121.2000], 
                [14.1687, 121.2435]  // UPLB
            ],
            color: '#f59e0b', // Yellow/Orange tint for Van
            weight: 5,
            dashArray: null
        },
        tricycle: {
            paths: [
                [14.2045, 121.1641], 
                [14.2055, 121.1620], // Small inner barangay roads
                [14.2085, 121.1645]
            ],
            color: '#16a34a', // Green
            weight: 4,
            dashArray: '5, 5'
        }
    };

    let currentPolyline = null;
    let markers = [];

    // ==========================================
    // GEOCODING: Nominatim + Coordinate Storage
    // ==========================================
    const selectedCoords = { origin: null, destination: null };

    const searchNominatim = async (query, callback) => {
        if (!query || query.length < 3) { callback([]); return; }
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=ph`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await res.json();
            callback(data);
        } catch (e) {
            callback([]);
        }
    };

    const buildSuggestions = (results, listEl, inputEl, coordKey, poweredByEl) => {
        listEl.innerHTML = '';
        if (!results.length) {
            listEl.style.display = 'none';
            if (poweredByEl) poweredByEl.style.display = 'none';
            return;
        }

        results.forEach(place => {
            const li = document.createElement('li');
            li.className = 'suggestion-item';

            const icon = document.createElement('span');
            icon.className = 'suggestion-icon';
            icon.innerHTML = place.type === 'bus_stop' ? '🚌' : '📍';

            const textBlock = document.createElement('div');
            textBlock.className = 'suggestion-text';

            const name = document.createElement('span');
            name.className = 'suggestion-name';
            name.textContent = place.name || place.display_name.split(',')[0];

            const address = document.createElement('span');
            address.className = 'suggestion-address';
            // Show city/province level for context
            const parts = place.display_name.split(',').slice(1, 3).map(p => p.trim());
            address.textContent = parts.join(', ');

            textBlock.appendChild(name);
            textBlock.appendChild(address);
            li.appendChild(icon);
            li.appendChild(textBlock);

            li.addEventListener('click', () => {
                inputEl.value = place.name || place.display_name.split(',')[0];
                selectedCoords[coordKey] = [parseFloat(place.lat), parseFloat(place.lon)];
                listEl.style.display = 'none';
                if (poweredByEl) poweredByEl.style.display = 'none';
                checkFormStatus();
            });

            listEl.appendChild(li);
        });

        listEl.style.display = 'block';
        if (poweredByEl) poweredByEl.style.display = 'flex';
    };

    const bindSearchInput = (inputEl, listEl, coordKey, poweredByEl) => {
        let debounce;
        inputEl.addEventListener('input', () => {
            selectedCoords[coordKey] = null; // clear saved coord when user types again
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                searchNominatim(inputEl.value, results => {
                    buildSuggestions(results, listEl, inputEl, coordKey, poweredByEl);
                });
            }, 350);
            checkFormStatus();
        });

        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!inputEl.contains(e.target) && !listEl.contains(e.target)) {
                listEl.style.display = 'none';
                if (poweredByEl) poweredByEl.style.display = 'none';
            }
        });
    };

    // Parse URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const destParam = urlParams.get('dest');
    const originInput = document.getElementById('originInput');
    const destinationInput = document.getElementById('destinationInput');
    
    if (destParam && destinationInput) {
        destinationInput.value = destParam;
    }

    // Custom Icon Maker (Uses Ionicons injected via HTML string)
    const createTransitMarker = (iconName, colorClass) => {
        return L.divIcon({
            html: `
                <div style="background-color: ${colorClass}; color: white; border: 2px solid white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
                    <ion-icon name="${iconName}"></ion-icon>
                </div>
            `,
            className: 'custom-leaflet-marker',
            iconSize: [32, 32],
            iconAnchor: [16, 16] // Center
        });
    };

    // ==========================================
    // OSRM ROUTING (Real road directions)
    // ==========================================
    const fetchOSRMRoute = async (originCoord, destCoord) => {
        // OSRM expects [lon, lat] order
        const [oLat, oLon] = originCoord;
        const [dLat, dLon] = destCoord;
        const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?geometries=geojson&overview=full`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('OSRM request failed');
        const data = await res.json();
        if (!data.routes || !data.routes.length) throw new Error('No route found');
        const route = data.routes[0];
        // Convert [lon, lat] → [lat, lon] for Leaflet
        const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
        return {
            coords,
            distanceM: route.distance,   // meters
            durationS: route.duration,   // seconds
        };
    };

    // Loading indicator helper
    const showRouteLoading = (show) => {
        let el = document.getElementById('routeLoadingIndicator');
        if (!el) {
            el = document.createElement('div');
            el.id = 'routeLoadingIndicator';
            el.innerHTML = `<div class="route-loading-inner"><div class="route-spinner"></div><span>Calculating route…</span></div>`;
            document.body.appendChild(el);
        }
        el.style.display = show ? 'flex' : 'none';
    };

    const drawRoute = async (mode) => {
        const routeData = routeSimulations[mode];
        if (!routeData) return;

        // Clear existing routes
        if (currentPolyline) {
            map.removeLayer(currentPolyline);
            currentPolyline = null;
        }
        markers.forEach(m => map.removeLayer(m));
        markers = [];

        let startIconStr = 'pin-outline';
        let vehicleIconStr = 'bus-outline';
        if (mode === 'van') vehicleIconStr = 'car-sport-outline';
        if (mode === 'tricycle') vehicleIconStr = 'bicycle-outline';
        if (mode === 'jeep') vehicleIconStr = 'bus-outline';

        const originVal = originInput ? originInput.value.trim() : '';
        const destVal = destinationInput ? destinationInput.value.trim() : '';

        // Hide book button while drawing
        const bookActionArea = document.getElementById('bookActionArea');
        if (bookActionArea) bookActionArea.style.display = 'none';

        // If both empty, just return
        if (!originVal || !destVal) {
            document.getElementById('tripQuickDetails').style.display = 'none';
            return;
        }

        // Use real coordinates if geocoded, otherwise fall back to simulation path
        const originCoord = selectedCoords.origin || routeData.paths[0];
        const destCoord   = selectedCoords.destination || routeData.paths[routeData.paths.length - 1];

        let routePath = routeData.paths; // default fallback
        let realRouteData = null;

        // If both real coords exist, fetch actual road route via OSRM
        if (selectedCoords.origin && selectedCoords.destination) {
            showRouteLoading(true);
            try {
                realRouteData = await fetchOSRMRoute(originCoord, destCoord);
                routePath = realRouteData.coords;
            } catch (err) {
                console.warn('OSRM fetch failed, falling back to simulation:', err);
                // fallback: straight line between real coords
                routePath = [originCoord, destCoord];
            } finally {
                showRouteLoading(false);
            }
        }

        currentPolyline = L.polyline(routePath, {
            color: routeData.color,
            weight: routeData.weight,
            opacity: 0.88,
            dashArray: routeData.dashArray,
            lineJoin: 'round',
            lineCap: 'round'
        }).addTo(map);

        // Adjust map to fit route
        const isMobile = window.innerWidth <= 768;
        const bottomPadding = isMobile ? window.innerHeight * 0.5 : 50;

        map.fitBounds(currentPolyline.getBounds(), {
            paddingTopLeft:     [50, 60],
            paddingBottomRight: [isMobile ? 50 : 450, bottomPadding],
            maxZoom: 16
        });

        // Add Origin Marker
        const originMarker = L.marker(originCoord, {
            icon: createTransitMarker(startIconStr, '#64748b')
        }).bindPopup(`<b>${originVal}</b><br>📍 Start`).addTo(map);

        // Add Destination Marker
        const destMarker = L.marker(destCoord, {
            icon: createTransitMarker(vehicleIconStr, routeData.color)
        }).bindPopup(`<b>${destVal}</b><br>🏁 Destination`).addTo(map);

        markers.push(originMarker, destMarker);

        // Show results — pass real data if available
        updateResultsUI(mode, realRouteData);
    };

    // Initialize with Jeep route
    drawRoute('jeep');

    // UI Interactions
    
    // Reusable Custom Dropdown Logic (uses position:fixed to escape overflow clipping)
    const initDropdown = (containerId, selectedId, textId, optionsListId, onChangeCallback) => {
        const container = document.getElementById(containerId);
        const selected = document.getElementById(selectedId);
        const text = document.getElementById(textId);
        const optionsList = document.getElementById(optionsListId);
        const options = optionsList ? optionsList.querySelectorAll('li') : [];

        if (!container || !selected || !optionsList) return;

        const positionMenu = () => {
            const rect = selected.getBoundingClientRect();
            const menuW = Math.max(rect.width, 190);

            // Determine top (flip up if too close to bottom)
            let top = rect.bottom + 6;
            const estimatedMenuH = options.length * 48 + 16;
            if (top + estimatedMenuH > window.innerHeight - 20) {
                top = rect.top - estimatedMenuH - 6;
            }

            // Clamp left so it doesn't go off the right edge
            let left = rect.left;
            if (left + menuW > window.innerWidth - 12) {
                left = window.innerWidth - menuW - 12;
            }
            left = Math.max(12, left);

            optionsList.style.top  = `${top}px`;
            optionsList.style.left = `${left}px`;
            optionsList.style.minWidth = `${menuW}px`;
        };

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = container.classList.contains('open');
            document.querySelectorAll('.custom-dropdown.open').forEach(d => d.classList.remove('open'));
            if (!isOpen) {
                positionMenu();
                container.classList.add('open');
            }
        });

        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                options.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                text.textContent = option.textContent.trim();

                const optionImg = option.querySelector('img');
                const selectedImg = selected.querySelector('.mode-option-icon');
                if (optionImg && selectedImg) {
                    selectedImg.src = optionImg.src;
                    selectedImg.alt = optionImg.alt;
                }

                container.classList.remove('open');
                if (onChangeCallback) onChangeCallback(option.getAttribute('data-value'));
            });
        });

        document.addEventListener('click', () => container.classList.remove('open'));
    };

    // Initialize Schedule Dropdown — callback opens the datetime picker for Depart/Arrive
    initDropdown('scheduleDropdownContainer', 'scheduleSelected', 'scheduleSelectedText', 'scheduleOptions',
        (val) => {
            if ((val === 'depart' || val === 'arrive') && typeof window.openDtPicker === 'function') {
                // use setTimeout so dropdown closes cleanly before modal opens
                setTimeout(() => window.openDtPicker(val), 80);
            }
        }
    );

    // Initialize Mode Dropdown
    initDropdown('modeDropdownContainer', 'modeSelected', 'modeSelectedText', 'modeOptions', (mode) => {
        if (document.getElementById('tripQuickDetails').style.display === 'flex') {
            drawRoute(mode);
        }
    });

    // Check if fields are ready
    const checkFormStatus = () => {
        const originVal = originInput ? originInput.value.trim() : '';
        const destVal = destinationInput ? destinationInput.value.trim() : '';
        const bookActionArea = document.getElementById('bookActionArea');
        const startJourneyBtn = document.getElementById('startJourneyBtn');
        
        if (bookActionArea) bookActionArea.style.display = 'block';
        
        if (startJourneyBtn) {
            startJourneyBtn.disabled = !(originVal && destVal);
        }
        document.getElementById('tripQuickDetails').style.display = 'none';
    };

    // Wire Nominatim Autocomplete to both inputs
    if (originInput && destinationInput) {
        bindSearchInput(
            originInput,
            document.getElementById('originSuggestions'),
            'origin',
            document.getElementById('originPoweredBy')
        );
        bindSearchInput(
            destinationInput,
            document.getElementById('destSuggestions'),
            'destination',
            document.getElementById('destPoweredBy')
        );
    }
    
    // Simulan ang Biyahe Booking Logic
    const startJourneyBtn = document.getElementById('startJourneyBtn');
    const activeTripArea  = document.getElementById('activeTripArea');
    const cancelTripBtn   = document.getElementById('cancelTripBtn');

    if (startJourneyBtn) {
        startJourneyBtn.addEventListener('click', () => {
            const activeModeEl = document.querySelector('#modeOptions li.active');
            const mode = activeModeEl ? activeModeEl.getAttribute('data-value') : 'jeep';
            drawRoute(mode);

            // Switch UI state: hide "Simulan" → show "Cancel Trip"
            document.getElementById('bookActionArea').style.display = 'none';
            if (activeTripArea) activeTripArea.style.display = 'flex';
        });
    }

    // Cancel Trip: reset everything back to clean state
    if (cancelTripBtn) {
        cancelTripBtn.addEventListener('click', () => {
            // Clear map route and markers
            if (currentPolyline) { map.removeLayer(currentPolyline); currentPolyline = null; }
            markers.forEach(m => map.removeLayer(m));
            markers = [];

            // Reset stored coordinates
            selectedCoords.origin = null;
            selectedCoords.destination = null;

            // Clear input values
            if (originInput) originInput.value = '';
            if (destinationInput) destinationInput.value = '';

            // Hide trip details
            const tripDetails = document.getElementById('tripQuickDetails');
            if (tripDetails) tripDetails.style.display = 'none';

            // Reset schedule dropdown text to default
            const schedText = document.getElementById('scheduleSelectedText');
            if (schedText) schedText.textContent = 'Leaving now';

            // Reset first schedule li to active
            const firstSchedule = document.querySelector('#scheduleOptions li');
            if (firstSchedule) {
                document.querySelectorAll('#scheduleOptions li').forEach(l => l.classList.remove('active'));
                firstSchedule.classList.add('active');
            }

            // Switch UI state back: hide "Cancel Trip" → show disabled book area
            activeTripArea.style.display = 'none';
            document.getElementById('bookActionArea').style.display = 'block';
            if (startJourneyBtn) startJourneyBtn.disabled = true;

            // Re-center map
            map.setView([14.2045, 121.1641], 14);
        });
    }

    // Swap Button (also swap stored coordinates)
    const swapBtn = document.getElementById('swapBtn');
    if (swapBtn && originInput && destinationInput) {
        swapBtn.addEventListener('click', () => {
            originInput.classList.remove('flash-animation');
            destinationInput.classList.remove('flash-animation');
            void originInput.offsetWidth;
            
            const temp = originInput.value;
            originInput.value = destinationInput.value;
            destinationInput.value = temp;

            // Also swap stored coordinates
            const tempCoord = selectedCoords.origin;
            selectedCoords.origin = selectedCoords.destination;
            selectedCoords.destination = tempCoord;

            originInput.classList.add('flash-animation');
            destinationInput.classList.add('flash-animation');
            
            checkFormStatus();
            
            if (document.getElementById('tripQuickDetails').style.display === 'flex') {
                const activeModeEl = document.querySelector('#modeOptions li.active');
                const mode = activeModeEl ? activeModeEl.getAttribute('data-value') : 'jeep';
                drawRoute(mode);
            }
        });
    }

    const updateResultsUI = (mode, routeData = null) => {
        let timeStr, fareStr;

        if (routeData) {
            // Use REAL data from OSRM
            const mins = Math.round(routeData.durationS / 60);
            const km   = routeData.distanceM / 1000;

            // Format time nicely
            if (mins < 60) {
                timeStr = `${mins} min`;
            } else {
                const h = Math.floor(mins / 60);
                const m = mins % 60;
                timeStr = m > 0 ? `${h}h ${m}m` : `${h}h`;
            }

            // Philippine fare estimates based on mode + distance
            let fare = 0;
            if (mode === 'jeep') {
                // LTFRB 2023: ₱13 base (first 4km), +₱1.80/km
                fare = km <= 4 ? 13 : 13 + (km - 4) * 1.80;
            } else if (mode === 'bus') {
                // Ordinary bus: ₱13 base, ₱2.20/km
                fare = km <= 4 ? 13 : 13 + (km - 4) * 2.20;
            } else if (mode === 'van') {
                // UV Express: slightly higher
                fare = km <= 4 ? 15 : 15 + (km - 4) * 2.50;
            } else if (mode === 'tricycle') {
                // Tricycle: typically ₱15–₱50 special
                fare = Math.max(15, km * 6);
            }
            fareStr = `₱${Math.ceil(fare)}`;
        } else {
            // Fallback simulated data
            if (mode === 'bus')      { timeStr = '25–45 min'; fareStr = '₱60'; }
            else if (mode === 'van') { timeStr = '12–20 min'; fareStr = '₱50'; }
            else if (mode === 'tricycle') { timeStr = '8–15 min'; fareStr = '₱40'; }
            else                     { timeStr = '14–28 min'; fareStr = '₱20'; }
        }

        const quickDetails = document.getElementById('tripQuickDetails');
        if (quickDetails) {
            quickDetails.style.display = 'flex';
            document.getElementById('estTimeValue').textContent = timeStr;
            document.getElementById('estFareValue').textContent = fareStr;
        }
    };
    
    // Check initial state
    checkFormStatus();

    // ==========================================
    // MOBILE BOTTOM SHEET DRAG LOGIC
    // ==========================================
    const panel = document.querySelector('.floating-panel');
    const dragHandle = document.getElementById('dragHandle');
    const panelHeader = document.querySelector('.panel-header-blue');
    const isMobileView = () => window.innerWidth <= 768;

    const HEIGHTS = {
        peek:     () => window.innerHeight * 0.25,   // collapsed/peek
        mid:      () => window.innerHeight * 0.48,   // default resting state
        expanded: () => window.innerHeight * 0.85,   // fully open
    };

    const snapPanel = (targetHeight, animate = true) => {
        if (!panel || !isMobileView()) return;
        if (!animate) panel.classList.add('dragging');
        panel.style.height = `${targetHeight}px`;
        if (!animate) {
            requestAnimationFrame(() => panel.classList.remove('dragging'));
        }
    };

    // Auto-expand when user interacts with inputs or dropdowns
    const expandPanel = () => {
        if (!isMobileView()) return;
        snapPanel(HEIGHTS.expanded());
    };

    // Collapse to mid when interaction ends and panels close
    const midPanel = () => {
        if (!isMobileView()) return;
        snapPanel(HEIGHTS.mid());
    };

    if (panel && isMobileView()) {
        // Start at mid height
        panel.style.height = `${HEIGHTS.mid()}px`;

        let startY = 0;
        let startHeight = 0;
        let isDragging = false;

        const onDragStart = (e) => {
            const touch = e.touches[0];
            startY = touch.clientY;
            startHeight = panel.getBoundingClientRect().height;
            isDragging = true;
            panel.classList.add('dragging');
        };

        const onDragMove = (e) => {
            if (!isDragging) return;
            const currentY = e.touches[0].clientY;
            const deltaY = startY - currentY; // positive = drag up
            const newHeight = startHeight + deltaY;
            const minH = HEIGHTS.peek();
            const maxH = HEIGHTS.expanded();
            panel.style.height = `${Math.max(minH, Math.min(newHeight, maxH))}px`;
        };

        const onDragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            panel.classList.remove('dragging');

            const currentH = panel.getBoundingClientRect().height;
            const peek = HEIGHTS.peek();
            const mid  = HEIGHTS.mid();
            const full = HEIGHTS.expanded();

            // Snap to nearest stop
            const stops = [peek, mid, full];
            const closest = stops.reduce((a, b) => Math.abs(b - currentH) < Math.abs(a - currentH) ? b : a);
            snapPanel(closest);
        };

        // Only attach drag to the handle and blue header - NOT the whole panel
        [dragHandle, panelHeader].forEach(el => {
            if (!el) return;
            el.addEventListener('touchstart', onDragStart, { passive: true });
            el.addEventListener('touchmove', onDragMove, { passive: true });
            el.addEventListener('touchend', onDragEnd);
        });

        // Auto-expand when user starts typing or focuses an input
        [originInput, destinationInput].forEach(inp => {
            if (!inp) return;
            inp.addEventListener('focus', expandPanel);
            inp.addEventListener('blur', () => setTimeout(midPanel, 300));
        });

        // Auto-expand when dropdowns open
        document.querySelectorAll('.dropdown-selected').forEach(sel => {
            sel.addEventListener('click', expandPanel);
        });
    }
});

// =============================================
// DATETIME PICKER — standalone module
// =============================================
(function() {
    const overlay  = document.getElementById('dtPickerOverlay');
    const modal    = document.getElementById('dtPickerModal');
    if (!overlay || !modal) return;

    const hrSlider    = document.getElementById('dtHrSlider');
    const minSlider   = document.getElementById('dtMinSlider');
    const timeDisplay = document.getElementById('dtTimeDisplay');
    const amBtn       = document.getElementById('dtAmBtn');
    const pmBtn       = document.getElementById('dtPmBtn');
    const leaveBtn    = document.getElementById('dtLeaveBtn');
    const arriveBtn   = document.getElementById('dtArriveBtn');
    const nowBtn      = document.getElementById('dtNowBtn');
    const backBtn     = document.getElementById('dtBackBtn');
    const confirmBtn  = document.getElementById('dtConfirmBtn');
    const calDays     = document.getElementById('dtCalDays');
    const calMonthYear = document.getElementById('dtCalMonthYear');
    const prevMonthBtn = document.getElementById('dtPrevMonth');
    const nextMonthBtn = document.getElementById('dtNextMonth');

    // State
    let pickerMode = 'depart'; // 'depart' | 'arrive'
    let ampm = 'pm';
    let calDate = new Date();       // currently displayed month
    let selectedDate = new Date();  // selected day

    const MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];

    // ---- Helpers ----
    const pad2 = n => String(n).padStart(2,'0');

    const updateTimeDisplay = () => {
        const h = parseInt(hrSlider.value);
        const m = parseInt(minSlider.value);
        timeDisplay.textContent = `${pad2(h)}:${pad2(m)} ${ampm}`;
    };

    const setAmPm = (val) => {
        ampm = val;
        amBtn.classList.toggle('active', val === 'am');
        pmBtn.classList.toggle('active', val === 'pm');
        updateTimeDisplay();
    };

    const setNow = () => {
        const now = new Date();
        let h = now.getHours();
        const m = now.getMinutes();
        const period = h >= 12 ? 'pm' : 'am';
        h = h % 12 || 12;
        hrSlider.value = h;
        minSlider.value = m;
        setAmPm(period);
        selectedDate = new Date();
        calDate = new Date();
        renderCalendar();
        updateTimeDisplay();
    };

    // ---- Calendar ----
    const renderCalendar = () => {
        const year  = calDate.getFullYear();
        const month = calDate.getMonth();
        calMonthYear.textContent = `${MONTHS[month]} ${year}`;

        calDays.innerHTML = '';
        const today = new Date();
        const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Empty padding cells
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('button');
            empty.className = 'dt-cal-day empty';
            empty.disabled = true;
            calDays.appendChild(empty);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const btn = document.createElement('button');
            btn.className = 'dt-cal-day';
            btn.textContent = d;

            const thisDate = new Date(year, month, d);
            const isToday = today.toDateString() === thisDate.toDateString();
            const isSelected = selectedDate.toDateString() === thisDate.toDateString();
            const isPast = thisDate < new Date(today.getFullYear(), today.getMonth(), today.getDate());

            if (isToday) btn.classList.add('today');
            if (isSelected) btn.classList.add('selected');
            if (isPast) { btn.classList.add('past'); btn.disabled = true; }

            btn.addEventListener('click', () => {
                selectedDate = new Date(year, month, d);
                renderCalendar();
            });

            calDays.appendChild(btn);
        }
    };

    // ---- Open / Close ----
    const openPicker = (mode) => {
        pickerMode = mode;
        leaveBtn.classList.toggle('active', mode === 'depart');
        arriveBtn.classList.toggle('active', mode === 'arrive');
        setNow();
        overlay.classList.add('visible');
        // Small delay so display:none→block triggers before CSS transition
        requestAnimationFrame(() => {
            requestAnimationFrame(() => modal.classList.add('visible'));
        });
    };

    // Expose globally so initDropdown callback can call it
    window.openDtPicker = openPicker;

    const closePicker = () => {
        modal.classList.remove('visible');
        overlay.classList.remove('visible');
    };

    // ---- Confirm → update the schedule dropdown label ----
    const confirmSchedule = () => {
        const h = pad2(hrSlider.value);
        const m = pad2(minSlider.value);
        const timeStr = `${h}:${m} ${ampm}`;
        const dateStr = selectedDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
        const modeLabel = pickerMode === 'depart' ? 'Depart' : 'Arrive';
        const label = `${modeLabel} ${dateStr} ${timeStr}`;

        // Update the schedule dropdown selected text
        const schedText = document.getElementById('scheduleSelectedText');
        if (schedText) schedText.textContent = label;

        closePicker();
    };

    // ---- Wire events ----
    hrSlider.addEventListener('input', updateTimeDisplay);
    minSlider.addEventListener('input', updateTimeDisplay);
    amBtn.addEventListener('click', () => setAmPm('am'));
    pmBtn.addEventListener('click', () => setAmPm('pm'));
    nowBtn.addEventListener('click', setNow);
    backBtn.addEventListener('click', closePicker);
    overlay.addEventListener('click', closePicker);
    confirmBtn.addEventListener('click', confirmSchedule);
    prevMonthBtn.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
    nextMonthBtn.addEventListener('click', () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });

    leaveBtn.addEventListener('click', () => {
        pickerMode = 'depart';
        leaveBtn.classList.add('active');
        arriveBtn.classList.remove('active');
    });
    arriveBtn.addEventListener('click', () => {
        pickerMode = 'arrive';
        arriveBtn.classList.add('active');
        leaveBtn.classList.remove('active');
    });
})();
