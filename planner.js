// =============================================
// CALZADA PLANNER — REBUILT ROUTING ENGINE (INTER-CITY ONLY)
// =============================================

function t(key, context) {
    if (window.t) return window.t(key, context);
    return key;
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {

    // ── VIEWPORT FIX: --vh accounts for mobile browser chrome ────────────────
    const setVh = () => {
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    };
    setVh();
    window.addEventListener('resize', setVh);
    // On iOS, also listen for orientationchange which fires before resize
    window.addEventListener('orientationchange', () => setTimeout(setVh, 100));


    const map = L.map('map').setView([14.2045, 121.1641], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
    }).addTo(map);

    // Guarantee Leaflet recalculates container size after the timeout delay
    setTimeout(() => map.invalidateSize(), 0);
    setTimeout(() => map.invalidateSize(), 200);
    map.whenReady(() => map.invalidateSize());

    window.addEventListener('resize', () => map.invalidateSize());

    // NATIONAL_HIGHWAY_COORDS removed — OSRM handles road routing universally.

    let currentLocation = { lat: 14.2045, lng: 121.1641 }; // Default
    let selectedCoords = { origin: null, destination: null };
    let originPlaceName = '';
    let destPlaceName = '';

    // URL parameters parsed later
    let isTrackingArrival = false;
    let mapAutoFollow = true;
    let selectedMode = 'modern-jeepney';
    
    // Map objects
    let originMarker = null, destMarker = null, userMarker = null, gpsCircle = null;
    let walkPolyline = null, transitPolyline = null, completedTransitPolyline = null;
    let midpointBubbleMarker = null;

    // Routing State
    let currentWalkDist = 0, currentWalkDur = 0, currentTransitDist = 0, currentTransitDur = 0;
    let currentFare = 0;
    let walkRouteGeojson = null, transitRouteGeojson = null;
    let currentCorridor = 'unknown'; // FIX: was referenced but never declared

    // ── CONSTANTS ──────────────────────────────────────────────────────────
    const WALK_SPEED_KPH      = 4;     // realistic Filipino commute walk pace
    const JEEPNEY_SPEED_KPH   = 20;    // avg jeepney speed (km/h)
    const BOARDING_BUFFER_SEC = 180;   // 3-min boarding buffer added to transit ETA
    const STORAGE_KEY         = 'calzada_journey';

    // Real-Time Tracking State
    let watchId = null;
    let lastOsrmFetchTime = 0;
    let remainingTransitDurationStrRawTimer = null;
    let cachedRemainingSeconds = 0;
    let countdownInterval = null;
    let activeLegIndex = 0;      // FIX ∗2: declared here to prevent ReferenceError
    let boardingMarker = null;   // FIX ∗8: tracked for cleanup
    let trackedCoordinates = [];
    let completedCoords = [];
    let lastMovementTimestamp = Date.now();
    let lastValidPosition = null;
    let deviationTimer = null;

    // =============================================
    // UI SHELL LOGIC (Modals, Panels, Breakpoints)
    // =============================================

    const directionsCard = document.getElementById('directionsCard');
    const bottomStatusPill = document.getElementById('bottomStatusPill');
    const activeGuideCard = document.getElementById('activeGuideCard');

    // ── BOTTOM SHEET DRAG — Physics-based with live follow ───────────────────
    let sheetStartY       = 0;
    let sheetLastY        = 0;
    let sheetVelocity     = 0;
    let sheetDragging     = false;
    let sheetLastTime     = 0;
    let sheetBaseTranslateY = 0; // The translateY at drag start (0 = expanded, positive = collapsed peek)

    const SHEET_PEEK_HEIGHT = 80; // px exposed when collapsed

    const getSheetNaturalTranslate = () => {
        const sheetH = directionsCard.offsetHeight;
        return directionsCard.classList.contains('collapsed')
            ? sheetH - SHEET_PEEK_HEIGHT
            : 0;
    };

    const setSheetTranslate = (y) => {
        directionsCard.style.transition = 'none';
        directionsCard.style.transform  = `translateY(${y}px)`;
    };

    const snapSheet = (velocity) => {
        const sheetH     = directionsCard.offsetHeight;
        const collapseAt = sheetH - SHEET_PEEK_HEIGHT;

        // Get current translate from the live style
        const current = parseFloat(directionsCard.style.transform?.match(/translateY\(([^)]+)px\)/)?.[1] ?? getSheetNaturalTranslate());

        // Decide collapse vs expand based on position + fling velocity
        const flingDown = velocity > 0.4;   // fast downward fling → collapse
        const flingUp   = velocity < -0.4;  // fast upward fling → expand
        const midpoint  = collapseAt / 2;

        let shouldCollapse = flingDown || (!flingUp && current > midpoint);

        directionsCard.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';

        if (shouldCollapse) {
            directionsCard.style.transform = `translateY(${collapseAt}px)`;
            directionsCard.classList.add('collapsed');
            directionsCard.classList.remove('expanded');
            document.getElementById('dsPeekInfo').style.display = 'block';
            updateMidpointBubbleVisibility(true);
        } else {
            directionsCard.style.transform = `translateY(0px)`;
            directionsCard.classList.remove('collapsed');
            directionsCard.classList.add('expanded');
            document.getElementById('dsPeekInfo').style.display = 'none';
            updateMidpointBubbleVisibility(false);
        }
    };

    directionsCard.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.ds-drag-handle')) {
            const scrollBody = e.target.closest('.ds-body');
            if (scrollBody && scrollBody.scrollTop > 0) return;
        }

        sheetStartY     = e.touches[0].clientY;
        sheetLastY      = sheetStartY;
        sheetLastTime   = Date.now();
        sheetVelocity   = 0;
        sheetDragging   = true;
        sheetBaseTranslateY = parseFloat(
            directionsCard.style.transform?.match(/translateY\(([^)]+)px\)/)?.[1]
            ?? getSheetNaturalTranslate()
        );
        directionsCard.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!sheetDragging) return;

        const y      = e.touches[0].clientY;
        const now    = Date.now();
        const dt     = Math.max(1, now - sheetLastTime);
        const dy     = y - sheetLastY;
        sheetVelocity = dy / dt; // px/ms
        sheetLastY    = y;
        sheetLastTime = now;

        const sheetH     = directionsCard.offsetHeight;
        const collapseAt = sheetH - SHEET_PEEK_HEIGHT;
        const raw        = sheetBaseTranslateY + (y - sheetStartY);

        // Clamp with rubber-band resistance at extremes
        let clamped;
        if (raw < 0) {
            clamped = raw * 0.2; // rubber-band when pulling above top
        } else if (raw > collapseAt) {
            const over = raw - collapseAt;
            clamped = collapseAt + over * 0.2; // rubber-band past peek
        } else {
            clamped = raw;
        }

        setSheetTranslate(clamped);
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!sheetDragging) return;
        sheetDragging = false;
        snapSheet(sheetVelocity);
    });

    document.getElementById('dsPeekInfo').addEventListener('click', () => {
        directionsCard.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
        directionsCard.style.transform  = 'translateY(0px)';
        directionsCard.classList.remove('collapsed');
        directionsCard.classList.add('expanded');
        document.getElementById('dsPeekInfo').style.display = 'none';
        updateMidpointBubbleVisibility(false);
    });

    // ── GUIDE CARD DRAG — Swipe up to expand steps, down to minimize ─────────
    const guideCard       = document.getElementById('activeGuideCard');
    const guideDragHandle = document.querySelector('.guide-drag-handle');
    const guideStepsEl    = document.getElementById('guideExpandedSteps');

    let guideStartY     = 0;
    let guideLastY      = 0;
    let guideVelocity   = 0;
    let guideLastTime   = 0;
    let guideDragging   = false;
    let guideExpanded   = false; // tracks expanded state

    if (guideDragHandle) {
        guideDragHandle.addEventListener('touchstart', (e) => {
            guideStartY   = e.touches[0].clientY;
            guideLastY    = guideStartY;
            guideLastTime = Date.now();
            guideVelocity = 0;
            guideDragging = true;
            guideCard.style.transition = 'none';
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!guideDragging) return;
            const y   = e.touches[0].clientY;
            const now = Date.now();
            const dt  = Math.max(1, now - guideLastTime);
            guideVelocity = (y - guideLastY) / dt;
            guideLastY    = y;
            guideLastTime = now;
            // Visual feedback: translate the card slightly with the finger
            const delta  = y - guideStartY;
            const clamped = delta < 0 ? delta * 0.35 : delta * 0.5; // softer downward
            guideCard.style.transform = `translateY(${Math.max(-80, Math.min(40, clamped))}px)`;
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!guideDragging) return;
            guideDragging = false;
            guideCard.style.transition = 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)';
            guideCard.style.transform  = 'translateY(0)';

            // Determine intent from velocity and direction
            if (guideVelocity < -0.3 || (guideLastY - guideStartY < -40)) {
                // Swiped up → expand steps
                guideStepsEl.classList.add('visible');
                guideExpanded = true;
            } else if (guideVelocity > 0.3 || (guideLastY - guideStartY > 40)) {
                // Swiped down → collapse steps
                guideStepsEl.classList.remove('visible');
                guideExpanded = false;
            }
            // else no-op: small movement, snap back
        });
    }

    const updateMidpointBubbleVisibility = (show) => {
        const b = document.getElementById('midpointBubble');
        if (!b) return;
        if (show && transitRouteGeojson) {
            b.style.display = 'block';
            if (midpointBubbleMarker) map.addLayer(midpointBubbleMarker);
        } else {
            b.style.display = 'none';
            if (midpointBubbleMarker) map.removeLayer(midpointBubbleMarker);
        }
    };

    // Modals
    const locationModal = document.getElementById('locationModal');
    const locationModalOverlay = document.getElementById('locationModalOverlay');
    const locSearchInput = document.getElementById('locSearchInput');
    const locOptionsList = document.getElementById('locOptionsList');
    const locAttribution = document.getElementById('locAttribution');
    let activeSelectingField = 'origin';

    const openLocationModal = (type) => {
        activeSelectingField = type;
        document.getElementById('locModalTitle').textContent = type === 'origin' ? 'Change Origin' : 'Change Destination';
        locSearchInput.value = '';
        renderModalDefaultOptions();
        locationModal.classList.add('visible');
        locationModalOverlay.classList.add('visible');
        setTimeout(() => locSearchInput.focus(), 100);
    };
    const closeLocationModal = () => {
        locationModal.classList.remove('visible');
        locationModalOverlay.classList.remove('visible');
    };
    document.getElementById('openOriginModal').addEventListener('click', () => openLocationModal('origin'));
    document.getElementById('openDestModal').addEventListener('click', () => openLocationModal('destination'));
    document.getElementById('closeLocModal').addEventListener('click', closeLocationModal);
    locationModalOverlay.addEventListener('click', closeLocationModal);

    document.getElementById('closeDirectionsBtn').addEventListener('click', () => {
        selectedCoords.origin = null;
        selectedCoords.destination = null;
        originPlaceName = '';
        destPlaceName = '';
        updateODDisplay();
        
        if (originMarker) { map.removeLayer(originMarker); originMarker = null; }
        if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
        if (walkPolyline) { map.removeLayer(walkPolyline); walkPolyline = null; }
        if (transitPolyline) { map.removeLayer(transitPolyline); transitPolyline = null; }
        if (completedTransitPolyline) { map.removeLayer(completedTransitPolyline); completedTransitPolyline = null; }
        if (midpointBubbleMarker) { map.removeLayer(midpointBubbleMarker); midpointBubbleMarker = null; }
        if (boardingMarker) { map.removeLayer(boardingMarker); boardingMarker = null; }
        
        document.getElementById('transportModesBlock').style.display = 'none';
        document.getElementById('routeSummaryBlock').style.display = 'none';
        document.getElementById('startJourneyBtn').disabled = true;
        document.getElementById('closeDirectionsBtn').style.display = 'none';
        
        // Clear chatbot context
        window._calzadaRouteContext = null;
        
        updateMidpointBubbleVisibility(false);
        
        if (currentLocation && currentLocation.lat && currentLocation.lng) {
            map.setView([currentLocation.lat, currentLocation.lng], 14);
        } else {
            map.setView([14.2045, 121.1641], 13);
        }
    });

    const renderModalDefaultOptions = () => {
        const isOrig = activeSelectingField === 'origin';
        locOptionsList.innerHTML = '';
        if (isOrig) {
            locOptionsList.innerHTML += `<div class="loc-row" id="optMyLoc"><div class="loc-icon bg-blue"><ion-icon name="locate"></ion-icon></div><div class="loc-text">My Location</div></div>`;
        }
        locOptionsList.innerHTML += `<div class="loc-row" id="optPinLoc"><div class="loc-icon pin-blue"><ion-icon name="location"></ion-icon></div><div class="loc-text">Pin Location</div></div>`;
        locAttribution.style.display = 'none';
        
        document.getElementById('optMyLoc')?.addEventListener('click', () => {
            const locText = document.querySelector('#optMyLoc .loc-text');
            if (locText) locText.textContent = 'Getting your location...';

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    selectedCoords.origin = [pos.coords.latitude, pos.coords.longitude];
                    originPlaceName = 'My Location';
                    updateODDisplay();
                    closeLocationModal();
                    if (selectedCoords.destination) executeRouteQuery();
                },
                () => {
                    closeLocationModal();
                    showToast('Hindi ma-detect ang iyong lokasyon. I-check ang location permission.');
                },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        });
        document.getElementById('optPinLoc')?.addEventListener('click', () => {
            closeLocationModal();
            triggerMapPicker();
        });
    };

    document.getElementById('swapLocationsBtn').addEventListener('click', () => {
        const tempC = selectedCoords.origin;
        selectedCoords.origin = selectedCoords.destination;
        selectedCoords.destination = tempC;
        
        const tempN = originPlaceName;
        originPlaceName = destPlaceName;
        destPlaceName = tempN;
        
        updateODDisplay();
        executeRouteQuery();
    });

    const updateODDisplay = () => {
        const origEl = document.getElementById('openOriginModal');
        const destEl = document.getElementById('openDestModal');
        if (originPlaceName && selectedCoords.origin) { origEl.textContent = originPlaceName; origEl.classList.remove('unfilled'); }
        else { origEl.textContent = 'Where from?'; origEl.classList.add('unfilled'); }
        
        if (destPlaceName && selectedCoords.destination) { destEl.textContent = destPlaceName; destEl.classList.remove('unfilled'); }
        else { destEl.textContent = 'Where to?'; destEl.classList.add('unfilled'); }
    };

    const selectLocation = (name, coords) => {
        if (activeSelectingField === 'origin') {
            selectedCoords.origin = coords;
            originPlaceName = name;
        } else {
            selectedCoords.destination = coords;
            destPlaceName = name;
        }
        updateODDisplay();
        closeLocationModal();
        if (selectedCoords.origin && selectedCoords.destination) {
            executeRouteQuery();
        }
    };

    // Mode Selection
    const setModeUI = (mode) => {
        document.querySelectorAll('.segment-btn[data-mode]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });
    };

    document.getElementById('modeWalking').addEventListener('click', () => {
        selectedMode = 'walking';
        setModeUI('walking');
        executeRouteQuery();
    });
    document.getElementById('modeJeepney').addEventListener('click', (e) => {
        selectedMode = 'jeepney';
        setModeUI('jeepney');
        executeRouteQuery();
    });
    document.getElementById('modeModernJeepney').addEventListener('click', (e) => {
        selectedMode = 'modern-jeepney';
        setModeUI('modern-jeepney');
        executeRouteQuery();
    });

    // =============================================
    // GEOCODING (ESRI Primary, Nominatim Fallback)
    // =============================================
    let geocodeTimeout = null;
    locSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        clearTimeout(geocodeTimeout);
        if (val.length < 3 && val.toLowerCase() !== 'my') {
            renderModalDefaultOptions();
            return;
        }
        geocodeTimeout = setTimeout(() => performSearch(val), 600);
    });

    const performSearch = async (query) => {
        locOptionsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #94a3b8;"><div class="route-spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></div>`;
        
        try {
            const esriSuggestUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/suggest?text=${encodeURIComponent(query)}&location=121.1641,14.2045&distance=50000&countryCode=PHL&maxSuggestions=6&f=json`;
            const res = await fetch(esriSuggestUrl);
            const data = await res.json();
            
            if (data.suggestions && data.suggestions.length > 0) {
                renderSearchResults(data.suggestions.map(s => ({
                    name: s.text.split(',')[0],
                    address: s.text,
                    isSuggestion: true,
                    provider: 'ESRI'
                })), query);
                return;
            }
        } catch(e) { console.warn("ESRI Search failed, falling back to OSM", e); }
        
        try {
            const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)},+Laguna,+Philippines&format=json&addressdetails=1&limit=5&countrycodes=ph&viewbox=120.8,14.5,121.5,13.9&bounded=1`;
            const nm = await fetch(nomUrl, { headers: { 'Accept-Language': 'en' } });
            const nData = await nm.json();
            if (nData && nData.length > 0) {
                renderSearchResults(nData.map(c => ({
                    name: c.display_name.split(',')[0],
                    address: c.display_name,
                    lat: parseFloat(c.lat),
                    lng: parseFloat(c.lon),
                    isSuggestion: false,
                    provider: 'OpenStreetMap'
                })), query);
                return;
            }
        } catch(e) {}
        
        locOptionsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444; font-size: 0.9rem;">No results found.</div>`;
    };

    const renderSearchResults = (results, query) => {
        locOptionsList.innerHTML = '';
        
        if (activeSelectingField === 'origin' && query && query.toLowerCase().startsWith('my')) {
            locOptionsList.innerHTML += `<div class="loc-row" id="optMyLocSearch"><div class="loc-icon bg-blue"><ion-icon name="locate"></ion-icon></div><div class="loc-text">My Location</div></div>`;
            setTimeout(() => {
                document.getElementById('optMyLocSearch')?.addEventListener('click', () => {
                    const locText = document.querySelector('#optMyLocSearch .loc-text');
                    if (locText) locText.textContent = 'Getting your location...';
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                            selectedCoords.origin = [pos.coords.latitude, pos.coords.longitude];
                            originPlaceName = 'My Location';
                            updateODDisplay();
                            closeLocationModal();
                            if (selectedCoords.destination) executeRouteQuery();
                        },
                        () => {
                            closeLocationModal();
                            showToast('Hindi ma-detect ang iyong lokasyon. I-check ang location permission.');
                        },
                        { enableHighAccuracy: true, timeout: 8000 }
                    );
                });
            }, 0);
        }

        const bubble = document.createElement('div');
        bubble.className = 'search-results-bubble';
        results.forEach(r => {
            const row = document.createElement('div');
            row.className = 'loc-row search-result';
            row.innerHTML = `
                <div class="loc-text">
                    ${r.name}
                    <span class="sub-text">${r.address}</span>
                </div>
            `;
            row.addEventListener('click', async () => {
                if (r.isSuggestion) {
                    locOptionsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #94a3b8;"><div class="route-spinner" style="margin: 0 auto; border-top-color: var(--primary);"></div></div>`;
                    try {
                        const esriCandidatesUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(r.address)}&location=121.1641,14.2045&distance=50000&countryCode=PHL&outFields=PlaceName,Place_addr&maxLocations=1&f=json`;
                        const cRes = await fetch(esriCandidatesUrl);
                        const cData = await cRes.json();
                        if (cData.candidates && cData.candidates.length > 0) {
                            selectLocation(r.name, [cData.candidates[0].location.y, cData.candidates[0].location.x]);
                        } else {
                            selectLocation(r.name, [14.2045, 121.1641]);
                        }
                    } catch(e) {
                        selectLocation(r.name, [14.2045, 121.1641]);
                    }
                } else {
                    selectLocation(r.name, [r.lat, r.lng]);
                }
            });
            bubble.appendChild(row);
        });
        locOptionsList.appendChild(bubble);
        locAttribution.style.display = 'block';
    };


    // =============================================
    // MATH & GEOMETRY
    // =============================================

    // Returns distance in KM
    const getHaversineDist = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    // =============================================
    // ROUTING EXECUTOR — UNIVERSAL 2-LEG (OSRM)
    // =============================================

    // ── 24-HOUR TIME FORMATTER — no AM/PM ────────────────────────────────────
    const fmt24h = (date) => {
        const h = date.getHours().toString().padStart(2, '0');
        const m = date.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    };

    const executeRouteQuery = async () => {
        if (!selectedCoords.origin || !selectedCoords.destination) {
            document.getElementById('transportModesBlock').style.display = 'none';
            document.getElementById('routeSummaryBlock').style.display = 'none';
            document.getElementById('startJourneyBtn').disabled = true;
            return;
        }

        // FIX ∗13: Loading indicator
        document.getElementById('startJourneyBtn').disabled = true;
        const sumTime = document.getElementById('sumTime');
        const sumFare = document.getElementById('sumFare');
        if (sumTime) sumTime.innerHTML = '<div class="route-spinner" style="margin:0 auto;"></div>';
        if (sumFare) sumFare.textContent = '—';

        const oPt = selectedCoords.origin;
        const dPt = selectedCoords.destination;

        // Always show all mode buttons
        document.getElementById('modeWalking').style.display  = 'flex';
        document.getElementById('modeJeepney').style.display  = 'flex';
        document.getElementById('modeModernJeepney').style.display = 'flex';

        // Draw Markers
        if (originMarker) map.removeLayer(originMarker);
        if (destMarker)   map.removeLayer(destMarker);

        originMarker = L.marker([oPt[0], oPt[1]], {
            icon: L.divIcon({
                className: '',
                html: `<div style="width:16px;height:16px;background:#1C6EF2;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(28,110,242,0.5);"></div>`,
                iconSize: [16, 16], iconAnchor: [8, 8]
            })
        }).addTo(map);

        destMarker = L.marker([dPt[0], dPt[1]], {
            icon: L.divIcon({
                className: '',
                html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 0C6.268 0 0 6.268 0 14c0 8.75 14 22 14 22S28 22.75 28 14C28 6.268 21.732 0 14 0z" fill="#ef4444"/>
                    <circle cx="14" cy="14" r="6" fill="white"/>
                </svg>`,
                iconSize: [28, 36], iconAnchor: [14, 36]
            })
        }).addTo(map);

        // ── WALKING MODE: pure foot route, no transit ──────────────────────────
        if (selectedMode === 'walking') {
            let wRes = null;
            try {
                wRes = await fetchOSRMRouteCoords(oPt, dPt, 'foot');
            } catch (e) { console.error('Walk OSRM error:', e); }

            if (!wRes) {
                const dist = getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000;
                wRes = { coordinates: [oPt, dPt], distance: dist, duration: (dist / 1000 / 4) * 3600, steps: [] };
            }

            walkRouteGeojson    = wRes;
            transitRouteGeojson = { coordinates: [dPt, dPt], distance: 0, duration: 0, steps: [] };

            currentWalkDist = wRes.distance / 1000;
            // FIX #7: use OSRM duration when available; fall back to speed heuristic
            currentWalkDur  = wRes.duration
                ? Math.ceil(wRes.duration / 60)
                : Math.ceil((wRes.distance / 1000 / WALK_SPEED_KPH) * 60);
            currentTransitDist = 0;
            currentTransitDur  = 0;
            currentFare        = 0;

            drawRoutes(wRes.coordinates, []);
            updateSummaryRow();
            saveJourneyState();

            document.getElementById('transportModesBlock').style.display = 'flex';
            document.getElementById('routeSummaryBlock').style.display  = 'block';
            return;
        }

        // ── TRANSIT MODE (Jeepney / M. Jeepney): 2-leg routing ────────────────
        let tRes = null;
        try {
            tRes = await fetchOSRMRouteCoords(oPt, dPt, 'car');
        } catch (e) { console.error('Transit OSRM error:', e); }

        if (!tRes) {
            showToast('Route not found — check connection');
            tRes = {
                coordinates: [oPt, dPt],
                distance: getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000,
                duration: (getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) / 20) * 3600,
                steps: []
            };
        }

        // ── FIND HIGHWAY BOARDING POINT ──────────────────────────────────────────
        // Strategy: walk the car route steps looking for a step whose road name
        // contains "Highway", "National", or "Maharlika". That intersection is
        // where the commuter actually boards. Fallback to the first road-snapped
        // point that is at least 80 m from origin.

        const HIGHWAY_KEYWORDS = ['national highway', 'maharlika', 'highway', 'diversion', 'road 1'];

        const findHighwayBoardingPoint = (routeResult) => {
            const steps = routeResult.steps || [];
            for (let i = 0; i < steps.length; i++) {
                const name = (steps[i].name || '').toLowerCase();
                if (HIGHWAY_KEYWORDS.some(k => name.includes(k))) {
                    // Return the starting coordinate of this step
                    const geom = steps[i].geometry?.coordinates;
                    if (geom && geom.length > 0) return [geom[0][1], geom[0][0]]; // [lat, lng]
                }
            }
            // Fallback: find first coord that is >80 m from origin
            for (let i = 1; i < routeResult.coordinates.length; i++) {
                const d = getHaversineDist(oPt[0], oPt[1],
                    routeResult.coordinates[i][0], routeResult.coordinates[i][1]) * 1000;
                if (d > 80) return routeResult.coordinates[i];
            }
            return routeResult.coordinates[0]; // last-resort original snap
        };

        const boardingPt = findHighwayBoardingPoint(tRes);
        const walkDistM  = getHaversineDist(oPt[0], oPt[1], boardingPt[0], boardingPt[1]) * 1000;

        // Always fetch a real foot route to the boarding point regardless of distance
        let wRes = null;
        try {
            wRes = await fetchOSRMRouteCoords(oPt, boardingPt, 'foot');
        } catch (e) { console.error('Walk OSRM error:', e); }

        if (!wRes || !wRes.coordinates || wRes.coordinates.length < 2) {
            // Fallback: straight line with estimated distance
            wRes = {
                coordinates: [oPt, boardingPt],
                distance: Math.max(walkDistM, 50),
                duration: Math.max(30, (Math.max(walkDistM, 50) / 1000 / 4) * 3600),
                steps: []
            };
        }

        walkRouteGeojson    = wRes;
        transitRouteGeojson = tRes;

        currentWalkDist = wRes.distance / 1000;
        // FIX ∗7: Use OSRM duration if available; fall back to speed heuristic
        currentWalkDur  = wRes.duration
            ? Math.ceil(wRes.duration / 60)
            : Math.ceil((wRes.distance / 1000 / WALK_SPEED_KPH) * 60);
        currentTransitDist = tRes.distance / 1000;
        // Jeepney speed correction: real jeepney avg + boarding buffer
        const correctedTransitDur = (currentTransitDist / JEEPNEY_SPEED_KPH) * 3600 + BOARDING_BUFFER_SEC;
        currentTransitDur  = Math.ceil(correctedTransitDur / 60);

        currentFare = computeLTFRBFare(currentTransitDist, selectedMode);

        // Trim transit route to start from the boarding point (highway), not the origin
        // Find the closest coordinate in tRes to boardingPt and slice from there
        let trimIdx = 0;
        let minTrimDist = Infinity;
        for (let i = 0; i < tRes.coordinates.length; i++) {
            const d = getHaversineDist(boardingPt[0], boardingPt[1],
                tRes.coordinates[i][0], tRes.coordinates[i][1]) * 1000;
            if (d < minTrimDist) { minTrimDist = d; trimIdx = i; }
        }
        tRes.coordinates = tRes.coordinates.slice(trimIdx);

        drawRoutes(wRes.coordinates, tRes.coordinates);
        updateSummaryRow();

        // Persist route state for recovery on refresh/reconnect
        saveJourneyState();

        document.getElementById('transportModesBlock').style.display = 'flex';
        document.getElementById('routeSummaryBlock').style.display  = 'block';
    };

    // =============================================
    // SESSION PERSISTENCE HELPER
    // =============================================
    const saveJourneyState = () => {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
                origin        : selectedCoords.origin,
                destination   : selectedCoords.destination,
                originName    : originPlaceName,
                destName      : destPlaceName,
                selectedMode  : selectedMode,
                activeLegIndex: activeLegIndex,
                currentStepIndex: window.currentStepIndex || 0,
                isJourneyActive : isTrackingArrival,
                savedAt       : Date.now()
            }));
        } catch(e) { /* sessionStorage unavailable */ }
    };

    const fetchOSRMRouteCoords = async (start, end, profile) => {
        // OSRM public instance supports: foot, car (not 'driving')
        const osrmProfile = profile === 'foot' ? 'foot' : 'car';
        const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&steps=true&alternatives=false`;
        try {
            const req = await fetch(url);
            const json = await req.json();
            if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
                const rt = json.routes[0];
                return {
                    coordinates: rt.geometry.coordinates.map(c => [c[1], c[0]]),
                    distance: rt.distance,
                    duration: rt.duration,
                    steps: rt.legs[0]?.steps || []
                };
            }
        } catch(e) { console.error('OSRM Error:', e); }
        return null;
    };

    const computeLTFRBFare = (distKm, mode) => {
        let base = 13, perKm = 1.80; // Default Jeep
        if (mode === 'modern-jeepney') { base = 15; perKm = 2.20; }
        if (distKm <= 4) return base;
        const total = base + (distKm - 4) * perKm;
        return Math.round(total); // rounded to nearest whole peso
    };

    const drawRoutes = (walkCoords, transitCoords) => {
        if (walkPolyline) { map.removeLayer(walkPolyline); walkPolyline = null; }
        if (transitPolyline) { map.removeLayer(transitPolyline); transitPolyline = null; }
        if (completedTransitPolyline) { map.removeLayer(completedTransitPolyline); completedTransitPolyline = null; }
        if (midpointBubbleMarker) { map.removeLayer(midpointBubbleMarker); midpointBubbleMarker = null; }

        const modeColor = selectedMode === 'modern-jeepney' ? '#7c3aed'
                        : selectedMode === 'walking'         ? '#10b981'
                        : '#1a8fff';
        const isWalkOnly = selectedMode === 'walking';

        // Walk leg: always dashed blue, minimum weight 5 so it's visible even for short distances
        // For walk-only mode: solid green
        walkPolyline = L.polyline(walkCoords.length >= 2 ? walkCoords : [walkCoords[0], walkCoords[0]], {
            color: isWalkOnly ? '#10b981' : '#3b82f6',
            weight: 5,
            dashArray: isWalkOnly ? null : '12, 8',
            dashOffset: '0',
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        if (!isWalkOnly && transitCoords && transitCoords.length > 1) {
            // Transit leg: solid, mode-colored
            transitPolyline = L.polyline(transitCoords, {
                color: modeColor,
                weight: 6,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

            // Boarding point marker at junction — FIX ∗8: remove old before adding new
            if (boardingMarker) { map.removeLayer(boardingMarker); boardingMarker = null; }
            boardingMarker = L.circleMarker(transitCoords[0], {
                radius: 7,
                color: '#3b82f6',
                weight: 3,
                fillColor: '#ffffff',
                fillOpacity: 1
            }).bindTooltip('Board here', { permanent: false, direction: 'top' }).addTo(map);

            // Midpoint bubble
            const midNode = transitCoords[Math.floor(transitCoords.length / 2)];
            midpointBubbleMarker = L.marker(midNode, {
                icon: L.divIcon({
                    className: 'custom-mid-bubble',
                    html: `<div class="route-bubble">${currentWalkDur + currentTransitDur} min</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [0, 0]
                })
            });
            if (directionsCard.classList.contains('collapsed')) midpointBubbleMarker.addTo(map);
        }

        const layers = [walkPolyline, transitPolyline, originMarker, destMarker].filter(Boolean);
        const group = L.featureGroup(layers);
        map.fitBounds(group.getBounds(), { padding: [60, 60] });

        document.getElementById('startJourneyBtn').disabled = false;
        document.getElementById('closeDirectionsBtn').style.display = 'flex';
        setTimeout(() => map.invalidateSize(), 200);
    };

    const renderItinerary = () => {
        const container = document.getElementById('itineraryLegs');
        if (!container) return;
        container.innerHTML = '';

        const isWalkOnly = selectedMode === 'walking';
        const modeLabel  = selectedMode === 'modern-jeepney' ? 'MJEEP' : 'JEEP';
        const sidebarCls = selectedMode === 'modern-jeepney' ? 'mjeep-sidebar' : 'jeep-sidebar';

        // Helper: format meters
        const fmtM = (m) => m < 1000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`;

        // ── WALK CARD ───────────────────────────────────────────────────────────
        // Derive road name from last walk step if available
        const walkSteps  = walkRouteGeojson?.steps || [];
        const highwayName = walkSteps.length > 0
            ? (walkSteps[walkSteps.length - 1]?.name || 'National Highway')
            : 'National Highway';

        const walkCard = document.createElement('div');
        walkCard.className = 'leg-card';
        walkCard.innerHTML = `
            <div class="leg-sidebar walk-sidebar">
                <div class="leg-sidebar-icon">
                   <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                     <circle cx="13" cy="3.5" r="1.5"/>
                     <path d="M9.5 9.5L7 20h2l1.5-5 2.5 3v5h2v-6l-2.5-3 .5-4L15 12h3v-2h-3.5l-2-3.5c-.3-.5-.8-.8-1.4-.8-.3 0-.6.1-.9.2L6 8l.5 2 3-.5z"/>
                   </svg>
                </div>
                <div class="leg-sidebar-label">Walk</div>
            </div>
            <div class="leg-body">
                <div class="leg-title">Walk towards <strong>${highwayName}</strong></div>
                <div class="leg-detail">${fmtM(currentWalkDist * 1000)}</div>
                <div class="leg-meta">${currentWalkDur} min</div>
            </div>`;
        container.appendChild(walkCard);

        if (isWalkOnly) return; // Walk-only mode: only one card

        // ── TRANSIT CARD ─────────────────────────────────────────────────────────
        const tSteps   = transitRouteGeojson?.steps || [];
        // Board at = name of first transit step; Alight at = name of step before arrive
        const boardAt  = tSteps.length > 0 ? (tSteps[0]?.name || highwayName) : highwayName;
        const alightStep = tSteps.length > 1
            ? tSteps.slice(0, -1).reverse().find(s => s.name && s.name !== '') : null;
        const alightAt = alightStep?.name || destPlaceName || 'Destination';

        const transitCard = document.createElement('div');
        transitCard.className = 'leg-card';
        transitCard.innerHTML = `
            <div class="leg-sidebar ${sidebarCls}">
                <div class="leg-sidebar-icon">
                    ${selectedMode === 'jeepney'
                      ? '<img src="assets/icons/jeepney-icon.png" style="width:28px;height:28px;object-fit:contain;">'
                      : '<img src="assets/icons/bus-icon.png" style="width:28px;height:28px;object-fit:contain;">'}
                </div>
                <div class="leg-sidebar-label">${modeLabel}</div>
            </div>
            <div class="leg-body">
                <div style="display:flex;align-items:center;">
                    <div class="leg-title">${selectedMode === 'modern-jeepney' ? 'Modern Jeepney' : 'Jeepney'}</div>
                    <div class="leg-fare-badge">₱${currentFare}</div>
                </div>
                <div class="leg-meta">${currentTransitDur} min · ${currentTransitDist.toFixed(1)} km</div>
                <div class="leg-route-info">
                    <div class="leg-route-row">
                        <div class="leg-stop-line">
                            <div class="leg-stop-dot filled"></div>
                            <div class="leg-stop-connector"></div>
                            <div class="leg-stop-dot"></div>
                        </div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div>
                                <div class="leg-route-label">GET ON</div>
                                <div style="font-size:0.8rem;font-weight:600;color:#0f172a;">${boardAt}</div>
                            </div>
                            <div>
                                <div class="leg-route-label">GET OFF</div>
                                <div style="font-size:0.8rem;font-weight:600;color:#0f172a;">${alightAt}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
        container.appendChild(transitCard);
    };

    const updateSummaryRow = () => {
        const blk = document.getElementById('routeSummaryBlock');
        const st = document.getElementById('sumTime');
        const sf = document.getElementById('sumFare');
        const se = document.getElementById('sumETA');
        const sd = document.getElementById('sumDist');

        const totalMin = currentWalkDur + currentTransitDur;
        const totalDist = (currentWalkDist + currentTransitDist).toFixed(1);

        // ETA must use cachedRemainingSeconds for consistency with the bottom pill
        const totalSecs = (currentWalkDur + currentTransitDur) * 60;
        if (!isTrackingArrival) cachedRemainingSeconds = totalSecs; // sync only before journey starts
        const d = new Date(Date.now() + cachedRemainingSeconds * 1000);
        const eta = fmt24h(d);

        st.textContent = `${totalMin} min`;
        sf.textContent = selectedMode === 'walking' ? 'Free' : `₱${currentFare}`;
        se.textContent = eta;
        sd.textContent = totalDist;

        document.getElementById('peekSummary').textContent = selectedMode === 'walking'
            ? `${totalMin} min • Walk`
            : `${totalMin} min • ₱${currentFare}`;
        blk.style.visibility = 'visible';

        // Update chatbot context for DyipTok Assistant
        window._calzadaRouteContext = {
            origin: originPlaceName,
            destination: destPlaceName,
            totalTime: totalMin,
            totalFare: currentFare,
            totalDistance: totalDist,
            eta: eta
        };
        
        renderItinerary();
    };


    // =============================================
    // ACTIVE NAVIGATION (Screen 3)
    // =============================================

    window.activeRouteSteps = [];
    window.currentStepIndex = 0;

    const getStepIcon = (step, mode) => {
        const type = step.maneuver.type;
        const mod = step.maneuver.modifier || '';
        
        if (type === 'depart') {
            return mode === 'foot' ? 'walk-outline' : 'bus-outline';
        }
        if (type === 'arrive') return 'flag-outline';
        
        if (type === 'turn') {
            if (mod.includes('right')) return 'arrow-forward-outline';
            if (mod.includes('left')) return 'arrow-back-outline';
            return 'arrow-up-outline';
        }
        
        if (type === 'new name' || mod.includes('straight')) return 'arrow-up-outline';
        
        return 'arrow-forward-outline';
    };

    const formatDist = (m) => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';

    const updateGuideStepsUI = () => {
        if (!window.activeRouteSteps || window.activeRouteSteps.length === 0) return;
        const steps = window.activeRouteSteps;
        const idx = window.currentStepIndex;
        
        const formatStep = (step, mode) => {
            const name = step.name || 'the route';
            if (step.maneuver.type === 'depart') {
                return mode === 'foot'
                    ? `Walk towards ${name}`
                    : `Board ${selectedMode === 'modern-jeepney' ? 'Modern Jeepney' : 'Jeepney'} towards ${name}`;
            } else if (step.maneuver.type === 'turn') {
                const mod = step.maneuver.modifier || '';
                if (mod.includes('right')) return `Turn right onto ${name}`;
                if (mod.includes('left'))  return `Turn left onto ${name}`;
                return `Continue on ${name}`;
            } else if (step.maneuver.type === 'arrive') {
                return 'You have arrived';
            }
            return `Continue on ${name}`;
        };

        if (idx < steps.length) {
            const current = steps[idx];
            document.getElementById('guideCurrentText').textContent = formatStep(current, current.mode) + (current.distance ? ` (${formatDist(current.distance)})` : '');
            document.getElementById('guideCurrentStep').querySelector('ion-icon').setAttribute('name', getStepIcon(current, current.mode));
            
            if (idx + 1 < steps.length) {
                const nextS = steps[idx+1];
                document.getElementById('guideNextText').textContent = formatStep(nextS, nextS.mode) + (nextS.distance ? ` (${formatDist(nextS.distance)})` : '');
                let expandedHTML = '';
                for (let i = idx + 2; i < steps.length; i++) {
                    const s = steps[i];
                    expandedHTML += `<div class="expanded-step"><ion-icon name="${getStepIcon(s, s.mode)}"></ion-icon><span>${formatStep(s, s.mode)} ${s.distance ? `<span style="color:#64748b;font-size:0.85em;margin-left:4px;">(${formatDist(s.distance)})</span>` : ''}</span></div>`;
                }
                document.getElementById('guideExpandedSteps').innerHTML = expandedHTML;
            } else {
                document.getElementById('guideNextText').textContent = 'You have arrived';
                document.getElementById('guideExpandedSteps').innerHTML = '';
            }
        }
    };

    document.getElementById('startJourneyBtn').addEventListener('click', () => {
        if (!selectedCoords.origin || !selectedCoords.destination) return;
        
        // Hide Directions Card
        directionsCard.classList.add('journey-active-hidden');

        // Show Active Nav Overlays
        activeGuideCard.style.display = 'flex';
        bottomStatusPill.style.display = 'flex';
        
        document.getElementById('remindersPillBtn').style.display = 'none';
        document.getElementById('hamburgerBtn').style.display = 'none';

        // Clean map markers, center on origin
        map.setView(selectedCoords.origin, 17);
        mapAutoFollow = true;
        isTrackingArrival = true;
        document.getElementById('reCenterBtn').style.display = 'none';

        startLiveTracking();
        // Persist active journey state immediately
        saveJourneyState();
        map.invalidateSize();
    });

    document.getElementById('cancelRouteBtn').addEventListener('click', () => {
        stopLiveTracking();
        
        if (walkPolyline)             { map.removeLayer(walkPolyline);             walkPolyline = null; }
        if (transitPolyline)          { map.removeLayer(transitPolyline);          transitPolyline = null; }
        if (completedTransitPolyline) { map.removeLayer(completedTransitPolyline); completedTransitPolyline = null; }
        if (midpointBubbleMarker)     { map.removeLayer(midpointBubbleMarker);     midpointBubbleMarker = null; }
        if (boardingMarker)           { map.removeLayer(boardingMarker);           boardingMarker = null; }
        if (originMarker)             { map.removeLayer(originMarker);             originMarker = null; }
        if (destMarker)               { map.removeLayer(destMarker);               destMarker = null; }

        selectedCoords.origin = null;
        selectedCoords.destination = null;
        originPlaceName = '';
        destPlaceName = '';
        updateODDisplay();
        document.getElementById('transportModesBlock').style.display = 'none';
        document.getElementById('routeSummaryBlock').style.display = 'none';
        document.getElementById('startJourneyBtn').disabled = true;
        document.getElementById('closeDirectionsBtn').style.display = 'none';
        window._calzadaRouteContext = null;

        document.getElementById('pillItinerary').style.display = '';
        document.getElementById('pillItinerary').style.maxHeight = '';
        document.getElementById('pillItinerary').style.opacity = '';

        isTrackingArrival = false;
        mapAutoFollow = false;
        sessionStorage.removeItem('calzada_journey'); // user cancelled — clear state
        document.getElementById('reCenterBtn').style.display = 'none';

        // Explicitly remove user markers on cancel
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
        if (gpsCircle)  { map.removeLayer(gpsCircle);  gpsCircle = null; }
        // Restore origin marker if present
        if (originMarker) originMarker.addTo(map);

        // Reset map bearing to north
        if (typeof map.setBearing === 'function') map.setBearing(0);
        else map.getContainer().style.transform = '';
        
        // Hide Active
        activeGuideCard.style.display = 'none';
        bottomStatusPill.style.display = 'none';
        
        document.getElementById('remindersPillBtn').style.display = '';
        document.getElementById('hamburgerBtn').style.display = '';
        
        // Restore Directions
        directionsCard.classList.remove('journey-active-hidden');
        directionsCard.style.display = '';
        directionsCard.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
        directionsCard.style.transform  = 'translateY(0px)';
        directionsCard.classList.add('expanded');
        directionsCard.classList.remove('collapsed');
        document.getElementById('dsPeekInfo').style.display = 'none';
        updateMidpointBubbleVisibility(false);
        map.invalidateSize();
    });

    // Expand bottom pill to show cancel button — only when clicking the pill body, not mode buttons
    bottomStatusPill.addEventListener('click', (e) => {
        if (e.target.closest('.btn-cancel-route')) return;
        if (e.target.closest('#amtJeep') || e.target.closest('#amtMJeep')) return; // let mode buttons handle themselves
        bottomStatusPill.classList.toggle('expanded');
    });

    // ── BOTTOM PILL DRAG — Swipe up to expand, swipe down to collapse ────────
    let pillStartY   = 0;
    let pillLastY    = 0;
    let pillVelocity = 0;
    let pillLastTime = 0;
    let pillDragging = false;

    bottomStatusPill.addEventListener('touchstart', (e) => {
        // Only initiate from the drag handle or the pill header area
        if (!e.target.closest('.status-drag-handle') && !e.target.closest('.status-cols')) return;
        pillStartY   = e.touches[0].clientY;
        pillLastY    = pillStartY;
        pillLastTime = Date.now();
        pillVelocity = 0;
        pillDragging = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!pillDragging) return;
        const y   = e.touches[0].clientY;
        const now = Date.now();
        pillVelocity = (y - pillLastY) / Math.max(1, now - pillLastTime);
        pillLastY    = y;
        pillLastTime = now;
        // Give the pill a subtle visual nudge in the drag direction
        const delta   = Math.max(-60, Math.min(30, y - pillStartY));
        bottomStatusPill.style.transform = `translateX(-50%) translateY(${delta * 0.3}px)`;
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!pillDragging) return;
        pillDragging = false;
        // Snap back
        bottomStatusPill.style.transition = 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)';
        bottomStatusPill.style.transform  = 'translateX(-50%) translateY(0)';

        const swipedUp   = pillVelocity < -0.3 || (pillLastY - pillStartY < -30);
        const swipedDown = pillVelocity >  0.3 || (pillLastY - pillStartY >  30);

        if (swipedUp)        bottomStatusPill.classList.add('expanded');
        else if (swipedDown) bottomStatusPill.classList.remove('expanded');
        // else toggle (tap): handled by the click handler
    });

    // Panning disables auto-follow only during active navigation
    map.on('dragstart', () => {
        if (isTrackingArrival) {
            mapAutoFollow = false;
            document.getElementById('reCenterBtn').style.display = 'flex';
        }
    });

    document.getElementById('reCenterBtn').addEventListener('click', () => {
        if (!currentLocation) return;
        // Re-enable auto-follow and snap back to user location
        mapAutoFollow = true;
        map.flyTo([currentLocation.lat, currentLocation.lng], 17, { animate: true, duration: 0.6, easeLinearity: 0.5 });
        if (typeof map.setBearing === 'function') map.setBearing(0);
        document.getElementById('reCenterBtn').style.display = 'none';
    });

    // (Tracker variables declared at top of scope)

    const startLiveTracking = () => {
        if (!navigator.geolocation) return;
        
        activeLegIndex = 0;
        trackedCoordinates = walkRouteGeojson.coordinates.concat(transitRouteGeojson.coordinates);
        completedCoords = [];
        lastMovementTimestamp = Date.now();
        lastValidPosition = null;

        window.activeRouteSteps = [
            ...(walkRouteGeojson.steps || []).map(s => ({ ...s, mode: 'foot' })),
            ...(transitRouteGeojson.steps || []).map(s => ({ ...s, mode: 'driving' }))
        ];
        window.currentStepIndex = 0;
        updateGuideStepsUI();

        document.getElementById('pillPhp').textContent = selectedMode === 'walking' ? '🚶' : `₱${currentFare}`;
        cachedRemainingSeconds = (currentWalkDur + currentTransitDur) * 60;
        updateDynamicBottomPill();

        // FIX ∗4: Always clear before starting, prevents duplicate intervals on session recovery
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        
        countdownInterval = setInterval(() => {
            updateDynamicBottomPill(Date.now() - lastMovementTimestamp);
        }, 1000);
        document.getElementById('activeModeToggle').style.display = '';

        // FIX ∗10: geolocation error handler with retry
        let geoRetryTimer = null;
        const geoErrorHandler = (err) => {
            console.warn('Geolocation error:', err.message);
            showToast('GPS error — retrying…');
            geoRetryTimer = setTimeout(() => {
                if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
                watchId = navigator.geolocation.watchPosition(handleLocationUpdate, geoErrorHandler,
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 });
            }, 5000);
        };

        watchId = navigator.geolocation.watchPosition(handleLocationUpdate, geoErrorHandler, {
            enableHighAccuracy: true, maximumAge: 10000, timeout: 5000
        });

        if (userMarker) map.removeLayer(userMarker);
        if (gpsCircle) map.removeLayer(gpsCircle);
        if (originMarker) map.removeLayer(originMarker); // Hide origin circle so it doesn't sit under the pointer
        
        // ── NAV CURSOR SVG — flat chevron arrowhead, tip points UP at 0° ─────────
        const POINTER_SVG = `
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
          <defs>
            <filter id="nav-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(30,100,255,0.45)"/>
            </filter>
            <linearGradient id="nav-fill" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%"   stop-color="#60a5fa"/>
              <stop offset="100%" stop-color="#1d4ed8"/>
            </linearGradient>
          </defs>
          <!-- Accuracy pulse ring -->
          <circle cx="24" cy="24" r="20" fill="rgba(59,130,246,0.10)" class="nav-pulse-ring"/>
          <!--
            Flat-bottomed navigation arrowhead — tip at top (0°).
            Shape: sharp tip at top-center, two wings flare out at sides,
            flat base at bottom-center with a small notch cut in.
            This matches Google Maps / Apple Maps navigation cursor exactly.
          -->
          <polygon
            points="24,4 42,38 33,32 24,36 15,32 6,38"
            fill="url(#nav-fill)"
            filter="url(#nav-glow)"
          />
          <!-- White center dot at pivot -->
          <circle cx="24" cy="27" r="4" fill="white" opacity="0.9"/>
        </svg>`;

        userMarker = L.marker([currentLocation.lat, currentLocation.lng], {
            icon: L.divIcon({
                className: '',
                html: `<div class="nav-cursor-wrapper">${POINTER_SVG}</div>`,
                iconSize: [48, 48],
                iconAnchor: [24, 24]   // anchor at center (rotation pivot)
            }),
            zIndexOffset: 1000
        }).addTo(map);

        // compass rotated in handleLocationUpdate
        
        const pillLegs = document.getElementById('pillItineraryLegs');
        const mainLegs = document.getElementById('itineraryLegs');
        if (pillLegs && mainLegs) pillLegs.innerHTML = mainLegs.innerHTML;
    };

    const stopLiveTracking = () => {
        if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
        if (deviationTimer) { clearTimeout(deviationTimer); deviationTimer = null; }
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        // FIX ∗3: remainingTransitDurationStrRawTimer is declared but guard it safely
        if (remainingTransitDurationStrRawTimer) { clearInterval(remainingTransitDurationStrRawTimer); remainingTransitDurationStrRawTimer = null; }

        // Remove the user location marker when tracking stops
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
        if (gpsCircle)  { map.removeLayer(gpsCircle);  gpsCircle = null; }
    };

    const handleLocationUpdate = async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        currentLocation = { lat: latitude, lng: longitude };
        
        // Set location without transition on Leaflet's container to prevent drifting when panning
        userMarker.setLatLng([latitude, longitude]);
        // Auto-follow: fly smoothly to user location while mapAutoFollow is true
        if (mapAutoFollow) {
            map.flyTo([latitude, longitude], 17, { animate: true, duration: 0.8, easeLinearity: 0.5, noMoveStart: true });
        }

        // Keep step index current in session
        saveJourneyState();

        if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
            const heading = pos.coords.heading;
            const compass = document.getElementById('compassSvg');
            if (compass) compass.style.transform = `rotate(${-heading}deg)`;

            const pointerEl = userMarker.getElement()?.querySelector('.nav-cursor-wrapper');
            if (pointerEl) {
                if (typeof map.setBearing === 'function' && window.innerWidth <= 768) {
                    map.setBearing(heading);
                    // Map is rotating — counter-rotate marker to stay upright on screen
                    pointerEl.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
                    pointerEl.style.transform = `rotate(${-heading}deg)`;
                } else {
                    // Map is north-up — rotate marker to face heading direction
                    pointerEl.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
                    pointerEl.style.transform = `rotate(${heading}deg)`;
                }
            }
        }

        if (lastValidPosition) {
            const moveDist = getHaversineDist(latitude, longitude, lastValidPosition.lat, lastValidPosition.lng) * 1000;
            if (moveDist > 10) {
                lastMovementTimestamp = Date.now();
                lastValidPosition = { lat: latitude, lng: longitude };
            }
        } else {
            lastValidPosition = { lat: latitude, lng: longitude };
            lastMovementTimestamp = Date.now();
        }

        const destDist = getHaversineDist(latitude, longitude, selectedCoords.destination[0], selectedCoords.destination[1]) * 1000;
        if (destDist < 30) {
            triggerArrival();
            return;
        }

        const currentPath = activeLegIndex === 0 ? walkRouteGeojson.coordinates : transitRouteGeojson.coordinates;
        let minD = Infinity, closestIdx = 0;
        
        for (let i = 0; i < currentPath.length; i++) {
            const d = getHaversineDist(latitude, longitude, currentPath[i][0], currentPath[i][1]) * 1000;
            if (d < minD) { minD = d; closestIdx = i; }
        }

        if (window.activeRouteSteps && window.currentStepIndex < window.activeRouteSteps.length - 1) {
            const nextManeuver = window.activeRouteSteps[window.currentStepIndex + 1].maneuver;
            if (nextManeuver && nextManeuver.location) {
                const stepDist = getHaversineDist(latitude, longitude, nextManeuver.location[1], nextManeuver.location[0]) * 1000;
                if (stepDist < 30) {
                    window.currentStepIndex++;
                    updateGuideStepsUI();
                }
            }
        }
        
        if (activeLegIndex === 0 && minD < 50 && closestIdx >= currentPath.length - 3) {
            // Also switch legs when the user is within 40m of the snap/boarding point
            activeLegIndex = 1;
            // Dim the walk leg to show it's done
            if (walkPolyline) walkPolyline.setStyle({ color: '#9ca3af', opacity: 0.5, dashArray: '6, 8' });
        }
        // Extra guard: if user is within 40m of walk leg end (boarding point), switch legs
        if (activeLegIndex === 0 && walkRouteGeojson && walkRouteGeojson.coordinates.length > 0) {
            const walkEnd = walkRouteGeojson.coordinates[walkRouteGeojson.coordinates.length - 1];
            const distToBoard = getHaversineDist(latitude, longitude, walkEnd[0], walkEnd[1]) * 1000;
            if (distToBoard < 40) activeLegIndex = 1;
        }

        let remainingDist = 0;
        for (let i = closestIdx; i < currentPath.length - 1; i++) {
            remainingDist += getHaversineDist(currentPath[i][0], currentPath[i][1], currentPath[i+1][0], currentPath[i+1][1]);
        }
        
        let remainingTimeSecs = 0;
        if (activeLegIndex === 1) {
            // Transit leg: remaining distance on transit at 30 km/h
            const remFare = computeLTFRBFare(remainingDist, selectedMode);
            document.getElementById('pillPhp').textContent = `₱${remFare}`;

            const passCoords = transitRouteGeojson.coordinates.slice(0, closestIdx + 1);
            const remainCoords = transitRouteGeojson.coordinates.slice(closestIdx);
            
            if (completedTransitPolyline) map.removeLayer(completedTransitPolyline);
            if (transitPolyline) map.removeLayer(transitPolyline);

            // Sakay-style: completed = gray, remaining = mode color
            completedTransitPolyline = L.polyline(passCoords, {
                color: '#9ca3af', weight: 6, opacity: 0.7
            }).addTo(map);
            transitPolyline = L.polyline(remainCoords, {
                color: selectedMode === 'modern-jeepney' ? '#7c3aed' : '#1a8fff',
                weight: 6, opacity: 1
            }).addTo(map);

            remainingTimeSecs = (remainingDist / JEEPNEY_SPEED_KPH) * 3600; // jeepney ~20 km/h
        } else {
            // Walk leg: walk remaining + full transit time ahead
            const remFare = computeLTFRBFare(currentTransitDist, selectedMode);
            document.getElementById('pillPhp').textContent = selectedMode === 'walking' ? '🚶' : `₱${remFare}`;

            const walkRemainingSecs = (remainingDist / WALK_SPEED_KPH) * 3600;   // 4 km/h realistic walk
            const transitAheadSecs  = currentTransitDur * 60;        // full transit duration
            remainingTimeSecs = walkRemainingSecs + transitAheadSecs;

            // Dim the walk polyline as user progresses
            if (walkPolyline) {
                const walkCoords = walkRouteGeojson.coordinates;
                const doneCoords = walkCoords.slice(0, closestIdx + 1);
                const aheadCoords = walkCoords.slice(closestIdx);
                if (doneCoords.length > 1) {
                    if (!completedTransitPolyline) {
                        completedTransitPolyline = L.polyline(doneCoords, {
                            color: '#9ca3af', weight: 5, dashArray: '8,10', opacity: 0.5
                        }).addTo(map);
                    } else {
                        completedTransitPolyline.setLatLngs(doneCoords);
                    }
                }
                if (aheadCoords.length > 1) walkPolyline.setLatLngs(aheadCoords);
            }
        }

        const timeSinceLastMove = Date.now() - lastMovementTimestamp;
        let effectiveTime = remainingTimeSecs;
        if (timeSinceLastMove > 480000) {
            effectiveTime = remainingTimeSecs + (timeSinceLastMove / 1000);
        }
        
        cachedRemainingSeconds = effectiveTime;
        updateDynamicBottomPill(timeSinceLastMove);

        if (minD > 50) {
            if (!deviationTimer) {
                deviationTimer = setTimeout(async () => {
                    deviationTimer = null;
                    // During walk leg, reroute to the boarding point (walk leg end), not the destination
                    const legTarget = activeLegIndex === 0 && walkRouteGeojson && walkRouteGeojson.coordinates.length > 0
                        ? walkRouteGeojson.coordinates[walkRouteGeojson.coordinates.length - 1]
                        : selectedCoords.destination;
            const res = await fetchOSRMRouteCoords([latitude, longitude], legTarget, activeLegIndex === 0 ? 'foot' : 'car');
                    if (res) {
                        if (activeLegIndex === 0) {
                            walkRouteGeojson.coordinates = res.coordinates;
                            walkRouteGeojson.steps = res.steps;
                            if (walkPolyline) walkPolyline.setLatLngs(res.coordinates);
                        } else {
                            transitRouteGeojson.coordinates = res.coordinates;
                            transitRouteGeojson.steps = res.steps;
                            if (completedTransitPolyline) map.removeLayer(completedTransitPolyline);
                            if (transitPolyline) transitPolyline.setLatLngs(res.coordinates);
                        }
                        showToast('Route updated');
                    }
                }, 10000);
            }
        } else {
            if (deviationTimer) { clearTimeout(deviationTimer); deviationTimer = null; }
        }
    };

    const updateDynamicBottomPill = (timeSinceLastMove = 0) => {
        let mins = Math.ceil(cachedRemainingSeconds / 60);
        const pillMin = document.getElementById('pillMin');
        pillMin.textContent = mins < 1 ? "< 1" : mins;

        if (timeSinceLastMove > 900000) {
            pillMin.style.color = '#ef4444';
            pillMin.style.animation = 'pulse 2s infinite';
        } else if (timeSinceLastMove > 300000) {
            pillMin.style.color = '#f59e0b';
            pillMin.style.animation = 'pulse 2s infinite';
        } else {
            pillMin.style.color = 'var(--text)';
            pillMin.style.animation = 'none';
        }

        const d = new Date(Date.now() + cachedRemainingSeconds * 1000);
        document.getElementById('pillArrival').textContent = fmt24h(d);
    };




    const triggerArrival = () => {
        stopLiveTracking();
        sessionStorage.removeItem('calzada_journey');
        if (userMarker)  { map.removeLayer(userMarker);  userMarker = null; }
        if (gpsCircle)   { map.removeLayer(gpsCircle);   gpsCircle = null; }
        if (originMarker) originMarker.addTo(map);
        if (typeof map.setBearing === 'function') map.setBearing(0);
        else map.getContainer().style.transform = '';

        const now      = new Date();
        const startMs  = now.getTime() - ((currentWalkDur + currentTransitDur) * 60 * 1000);
        const dateStr  = now.toLocaleDateString('en-PH', { year:'numeric', month:'short', day:'numeric', weekday:'short' });

        document.getElementById('rcptDestination').textContent = (destPlaceName || 'Destination').toUpperCase();
        document.getElementById('rcptOrigin').textContent      = originPlaceName || 'Origin';
        document.getElementById('rcptDate').textContent        = dateStr;
        document.getElementById('rcptTimeOut').textContent     = fmt24h(new Date(startMs));
        document.getElementById('rcptTimeArrived').textContent = fmt24h(now);

        const itemsEl = document.getElementById('rcptItems');
        itemsEl.innerHTML = '';

        const walkItem = document.createElement('div');
        walkItem.className = 'receipt-item';
        walkItem.innerHTML = `
          <div class="receipt-item-left">
            <div class="receipt-item-name">🚶 WALK</div>
            <div class="receipt-item-sub">${(currentWalkDist).toFixed(2)} km · ${currentWalkDur} min</div>
          </div>
          <div class="receipt-item-price">FREE</div>`;
        itemsEl.appendChild(walkItem);

        if (selectedMode !== 'walking') {
          const modeLabel = selectedMode === 'modern-jeepney' ? 'MOD. JEEPNEY' : 'JEEPNEY';
          const modeEmoji = selectedMode === 'modern-jeepney' ? '🚌' : '🚐';
          const transitItem = document.createElement('div');
          transitItem.className = 'receipt-item';
          transitItem.innerHTML = `
            <div class="receipt-item-left">
              <div class="receipt-item-name">${modeEmoji} ${modeLabel}</div>
              <div class="receipt-item-sub">${currentTransitDist.toFixed(2)} km · ${currentTransitDur} min</div>
            </div>
            <div class="receipt-item-price">₱${currentFare}</div>`;
          itemsEl.appendChild(transitItem);
        }

        document.getElementById('rcptTotalFare').textContent  = selectedMode === 'walking' ? 'FREE' : `₱${currentFare}`;
        document.getElementById('rcptTotalDist').textContent  = `${(currentWalkDist + currentTransitDist).toFixed(1)} km`;
        document.getElementById('rcptTravelTime').textContent = `${currentWalkDur + currentTransitDur} min`;

        document.getElementById('arrivalOverlay').classList.add('visible');
        document.getElementById('arrivalScreen').classList.add('visible');
    };
    
    document.getElementById('arrivalCloseBtn').addEventListener('click', () => {
        document.getElementById('arrivalOverlay').classList.remove('visible');
        document.getElementById('arrivalScreen').classList.remove('visible');
        document.getElementById('cancelRouteBtn').click();
    });

    // =============================================
    // GET MY LOCATION (Initial)
    // Location permission is NOT requested on load.
    // It is only requested when the user explicitly picks
    // "My Location" as their origin inside the modal.
    // =============================================

    // =============================================
    // MAP PIN PICKER (Modals)
    // =============================================
    const mapCenterPin = document.getElementById('mapCenterPin');
    const mapPickerUI = document.getElementById('mapPickerUI');
    let isMapPicking = false;

    const triggerMapPicker = () => {
        isMapPicking = true;
        mapCenterPin.style.display = 'flex';
        mapPickerUI.style.display = 'flex';
        directionsCard.style.display = 'none';
        map.on('move', mapMovedHandler);
    };

    const mapMovedHandler = () => {
        if (!isMapPicking) return;
        const center = map.getCenter();
        document.getElementById('mapPickerAddress').textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
    };

    document.getElementById('mapPickerConfirmBtn').addEventListener('click', async () => {
        const c = map.getCenter();
        let placeName = 'Pinned Location';
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${c.lat}&lon=${c.lng}&format=json&addressdetails=1`);
            const data = await res.json();
            placeName = data.name || data.address?.road || data.address?.suburb || data.address?.village || data.address?.town || data.address?.city || 'Pinned Location';
        } catch(e) {}
        selectLocation(placeName, [c.lat, c.lng]);
        cancelMapPicking();
    });
    document.getElementById('mapPickerCancelBtn').addEventListener('click', cancelMapPicking);

    function cancelMapPicking() {
        isMapPicking = false;
        mapCenterPin.style.display = 'none';
        mapPickerUI.style.display = 'none';
        directionsCard.style.display = 'flex';
        map.off('move', mapMovedHandler);
    }

    // =============================================
    // UTILITIES & EXISTING UI RETAINMENTS
    // =============================================
    const showToast = (msg) => {
        const t = document.getElementById('toastNotification');
        document.getElementById('toastMessage').textContent = msg;
        t.classList.add('active');
        setTimeout(() => t.classList.remove('active'), 3000);
    };

    const toggleDrawer = (state) => {
        const sd = document.getElementById('sideDrawer');
        const so = document.getElementById('sideDrawerOverlay');
        sd.classList.toggle('open', state);
        so.classList.toggle('visible', state);
        // Reset any leftover inline transform/opacity from swipe gesture
        sd.style.transform = '';
        so.style.opacity = '';
    };
    document.getElementById('hamburgerBtn').addEventListener('click', () => toggleDrawer(true));
    document.getElementById('drawerCloseBtn').addEventListener('click', () => toggleDrawer(false));
    document.getElementById('sideDrawerOverlay').addEventListener('click', () => toggleDrawer(false));

    // ── SIDE DRAWER SWIPE-TO-CLOSE ────────────────────────────────────────────
    const sideDrawer        = document.getElementById('sideDrawer');
    const sideDrawerOverlay = document.getElementById('sideDrawerOverlay');

    let drawerTouchStartX = 0;
    let drawerTouchLastX  = 0;
    let drawerVelocityX   = 0;
    let drawerLastTime    = 0;
    let drawerDragging    = false;

    sideDrawer.addEventListener('touchstart', (e) => {
        drawerTouchStartX = e.touches[0].clientX;
        drawerTouchLastX  = drawerTouchStartX;
        drawerLastTime    = Date.now();
        drawerVelocityX   = 0;
        drawerDragging    = true;
        sideDrawer.style.transition = 'none';
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!drawerDragging || !sideDrawer.classList.contains('open')) return;
        const x   = e.touches[0].clientX;
        const now = Date.now();
        drawerVelocityX  = (x - drawerTouchLastX) / Math.max(1, now - drawerLastTime);
        drawerTouchLastX = x;
        drawerLastTime   = now;

        const delta = Math.max(0, x - drawerTouchStartX); // only rightward movement
        sideDrawer.style.transform = `translateX(${delta}px)`;

        // Dim overlay proportionally
        const drawerWidth = sideDrawer.offsetWidth;
        const progress    = delta / drawerWidth;
        sideDrawerOverlay.style.opacity = (0.4 * (1 - progress)).toString();
    }, { passive: true });

    document.addEventListener('touchend', () => {
        if (!drawerDragging) return;
        drawerDragging = false;

        const swipedFarRight = drawerTouchLastX - drawerTouchStartX > sideDrawer.offsetWidth * 0.4;
        const flingRight     = drawerVelocityX > 0.5;

        sideDrawer.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
        sideDrawerOverlay.style.transition = 'opacity 0.3s';

        if (swipedFarRight || flingRight) {
            // Close
            sideDrawer.classList.remove('open');
            sideDrawerOverlay.classList.remove('visible');
            sideDrawer.style.transform = '';
            sideDrawerOverlay.style.opacity = '';
        } else {
            // Snap back open
            sideDrawer.style.transform = 'translateX(0)';
            sideDrawerOverlay.style.opacity = '0.4';
        }
    });

    const toggleReminders = (state) => {
        document.getElementById('remindersModal').classList.toggle('visible', state);
        document.getElementById('remindersOverlay').classList.toggle('visible', state);
    };
    document.getElementById('remindersPillBtn').addEventListener('click', () => toggleReminders(true));
    document.getElementById('remindersCloseBtn').addEventListener('click', () => toggleReminders(false));
    document.getElementById('remindersOverlay').addEventListener('click', () => toggleReminders(false));

    // Schedule Dropdown Trigger
    const schedSelect = document.getElementById('scheduleSelected');
    const schedOpts = document.getElementById('scheduleOptions');
    schedSelect.addEventListener('click', () => schedOpts.classList.toggle('open'));
    schedOpts.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const val = e.target.dataset.value;
            // FIX ∗11: Depart/Arrive options not implemented — show toast instead of opening flatpickr
            if (val !== 'now') {
                showToast('Scheduled routing coming soon — using current time.');
                schedOpts.classList.remove('open');
                return;
            }
            document.getElementById('scheduleSelectedText').textContent = e.target.textContent;
            schedOpts.classList.remove('open');
            schedOpts.querySelectorAll('li').forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
        }
    });

    // Chatbot Trigger
    document.getElementById('drawerDyipTokLink').addEventListener('click', () => {
        toggleDrawer(false);
        document.getElementById('chatWindow').classList.add('open');
    });
    document.getElementById('closeChatBtn').addEventListener('click', () => {
        document.getElementById('chatWindow').classList.remove('open');
    });

    // =============================================
    // URL PARAMETERS LOGIC
    // =============================================
    // URL PARAMETERS — runs regardless of earlier errors
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const destName = urlParams.get('destName') || urlParams.get('dest') || '';
        const destLat  = parseFloat(urlParams.get('destLat')  || urlParams.get('dlat') || '');
        const destLng  = parseFloat(urlParams.get('destLng')  || urlParams.get('dlng') || '');

        if (destName && !isNaN(destLat) && !isNaN(destLng)) {
            selectedCoords.destination = [destLat, destLng];
            destPlaceName = destName;
            updateODDisplay();

            if (destMarker) map.removeLayer(destMarker);
            destMarker = L.marker([destLat, destLng], {
                icon: L.divIcon({
                    className: '',
                    html: `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 8.75 14 22 14 22S28 22.75 28 14C28 6.268 21.732 0 14 0z" fill="#ef4444"/>
            <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`,
                    iconSize: [28, 36],
                    iconAnchor: [14, 36]
                })
            }).addTo(map);

            map.setView([destLat, destLng], 16);
            setTimeout(() => map.invalidateSize(), 300);

            // Auto-open origin picker so user can complete the route
            setTimeout(() => openLocationModal('origin'), 400);
        }
    } catch (urlErr) {
        console.error('URL param error:', urlErr);
    }

    document.getElementById('amtJeep').addEventListener('click', () => switchActiveMode('jeepney'));
    document.getElementById('amtMJeep').addEventListener('click', () => switchActiveMode('modern-jeepney'));
    document.getElementById('amtWalk').addEventListener('click', () => switchActiveMode('walking'));

    const switchActiveMode = (newMode) => {
        if (selectedMode === newMode) return;
        selectedMode = newMode;
        
        ['amtWalk','amtJeep','amtMJeep'].forEach(id => {
            document.getElementById(id)?.classList.remove('active');
        });
        const activeId = newMode === 'walking' ? 'amtWalk' : newMode === 'jeepney' ? 'amtJeep' : 'amtMJeep';
        document.getElementById(activeId)?.classList.add('active');

        const remainingRatio = window.activeRouteSteps.length > 0
            ? 1 - (window.currentStepIndex / window.activeRouteSteps.length)
            : 1;
        const remainingDistKm = Math.max(0, currentTransitDist * remainingRatio);
        const newFare = newMode === 'walking' ? 0 : computeLTFRBFare(remainingDistKm, newMode);
        currentFare = newFare;

        // Update polyline color
        const modeColor = newMode === 'modern-jeepney' ? '#7c3aed' : newMode === 'walking' ? '#10b981' : '#1a8fff';
        if (transitPolyline) transitPolyline.setStyle({ color: modeColor });

        document.getElementById('pillPhp').textContent = newMode === 'walking' ? '🚶' : `₱${currentFare}`;
        
        renderItinerary();
    };

    // =============================================
    // SESSION RECOVERY — restore last journey on reload
    // =============================================
    (() => {
        const raw = sessionStorage.getItem('calzada_journey');
        if (!raw) return;
        let state;
        try { state = JSON.parse(raw); } catch(e) { return; }
        const ageMs = Date.now() - (state.savedAt || 0);
        if (ageMs > 7200000) { sessionStorage.removeItem('calzada_journey'); return; } // >2h old
        if (!state.origin || !state.destination) return;

        // Build recovery banner
        const banner = document.createElement('div');
        banner.id = 'recoveryBanner';
        const wasActive = state.isJourneyActive;
        const msg = wasActive
            ? `Resuming journey to <strong>${state.destName || 'destination'}</strong>…`
            : `Your last route was restored.`;
        banner.innerHTML = `
            <span>${msg}</span>
            <button id="recoveryDismissBtn" title="Start fresh">×</button>
        `;
        banner.style.cssText = [
            'position:fixed','bottom:90px','left:50%','transform:translateX(-50%)',
            'background:rgba(30,41,59,0.95)','color:#f8fafc','padding:10px 18px',
            'border-radius:12px','font-size:0.88rem','z-index:9999',
            'display:flex','align-items:center','gap:12px',
            'box-shadow:0 4px 20px rgba(0,0,0,0.3)','backdrop-filter:blur(8px)'
        ].join(';');
        banner.querySelector('#recoveryDismissBtn').style.cssText =
            'background:none;border:none;color:#94a3b8;font-size:1.1rem;cursor:pointer;padding:0 4px;line-height:1;';
        document.body.appendChild(banner);

        const dismissBanner = () => banner.remove();
        banner.querySelector('#recoveryDismissBtn').addEventListener('click', () => {
            sessionStorage.removeItem('calzada_journey');
            dismissBanner();
        });

        // Restore OD state
        selectedCoords.origin      = state.origin;
        selectedCoords.destination = state.destination;
        originPlaceName = state.originName || '';
        destPlaceName   = state.destName   || '';
        selectedMode    = state.selectedMode || 'modern-jeepney';
        updateODDisplay();

        // Re-fetch fresh OSRM route (never use stale saved polylines)
        executeRouteQuery().then(() => {
            dismissBanner();
            if (wasActive) {
                showToast(`Resuming journey to ${state.destName || 'destination'}…`);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        selectedCoords.origin = [pos.coords.latitude, pos.coords.longitude];
                        originPlaceName = 'My Location';
                        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        updateODDisplay();
                        executeRouteQuery().then(() => {
                            directionsCard.classList.add('journey-active-hidden');
                            activeGuideCard.style.display = 'flex';
                            bottomStatusPill.style.display = 'flex';
                            document.getElementById('remindersPillBtn').style.display = 'none';
                            document.getElementById('hamburgerBtn').style.display = 'none';
                            mapAutoFollow = true;
                            isTrackingArrival = true;
                            document.getElementById('reCenterBtn').style.display = 'none';
                            // FIX ∗9: clamp indices to valid range after fresh route fetch
                            activeLegIndex = Math.min(state.activeLegIndex || 0, 1);
                            window.currentStepIndex = 0; // always restart from step 0 on recovery
                            startLiveTracking();
                            map.invalidateSize();
                        });
                    },
                    () => {
                        showToast('Could not get current position. Tap Start Journey to resume.');
                    },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            } else {
                showToast('Your last route was restored.');
            }
        }).catch(() => {
            sessionStorage.removeItem(STORAGE_KEY);
            dismissBanner();
        });
    })();

    }, 0);
});
