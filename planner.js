// =============================================
// CALZADA PLANNER — REBUILT ROUTING ENGINE (INTER-CITY ONLY)
// =============================================

function t(key, context) {
    if (window.t) return window.t(key, context);
    return key;
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {

    const map = L.map('map', { rotate: true, rotateControl: false }).setView([14.2045, 121.1641], 13);
    L.tileLayer('https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(map);

    map.on('tileerror', function(error) {
        console.warn('Tile load error:', error);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);
    });

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

    // Real-Time Tracking State
    let watchId = null;
    let lastOsrmFetchTime = 0;
    let remainingTransitDurationStrRawTimer = null;
    let cachedRemainingSeconds = 0;
    let countdownInterval = null; // FIX: real-time countdown between GPS pings

    // =============================================
    // UI SHELL LOGIC (Modals, Panels, Breakpoints)
    // =============================================

    const directionsCard = document.getElementById('directionsCard');
    const bottomStatusPill = document.getElementById('bottomStatusPill');
    const activeGuideCard = document.getElementById('activeGuideCard');

    // Drag Bottom Sheet logic (Mobile)
    let startY = 0, isDraggingSheet = false;
    directionsCard.addEventListener('touchstart', (e) => {
        if (!e.target.closest('.ds-drag-handle')) {
            const scrollBody = e.target.closest('.ds-body');
            if (scrollBody && scrollBody.scrollTop > 0) return;
        }
        startY = e.touches[0].clientY;
        isDraggingSheet = true;
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
        if (!isDraggingSheet) return;
        const deltaY = e.touches[0].clientY - startY;
        if (deltaY > 60) {
            directionsCard.classList.remove('expanded');
            directionsCard.classList.add('collapsed');
            document.getElementById('dsPeekInfo').style.display = 'block';
            updateMidpointBubbleVisibility(true);
            isDraggingSheet = false;
        } else if (deltaY < -60) {
            directionsCard.classList.add('expanded');
            directionsCard.classList.remove('collapsed');
            document.getElementById('dsPeekInfo').style.display = 'none';
            updateMidpointBubbleVisibility(false);
            isDraggingSheet = false;
        }
    }, { passive: true });
    document.addEventListener('touchend', () => isDraggingSheet = false);
    document.getElementById('dsPeekInfo').addEventListener('click', () => {
        directionsCard.classList.add('expanded');
        directionsCard.classList.remove('collapsed');
        document.getElementById('dsPeekInfo').style.display = 'none';
        updateMidpointBubbleVisibility(false);
    });

    const guideDragHandle = document.querySelector('.guide-drag-handle');
    let guideStartY = 0, guideCurrentY = 0;
    if (guideDragHandle) {
        guideDragHandle.addEventListener('touchstart', (e) => guideStartY = e.touches[0].clientY, { passive: true });
        guideDragHandle.addEventListener('touchmove', (e) => guideCurrentY = e.touches[0].clientY, { passive: true });
        guideDragHandle.addEventListener('touchend', () => {
            if (guideCurrentY - guideStartY > 50) {
                document.getElementById('guideExpandedSteps').classList.add('visible');
            } else if (guideStartY - guideCurrentY > 50) {
                document.getElementById('guideExpandedSteps').classList.remove('visible');
            }
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
        ['modeWalking', 'modeJeepney', 'modeModernJeepney'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.className = 'mode-pill outline-pill';
        });
        const activeId = mode === 'walking' ? 'modeWalking' : mode === 'jeepney' ? 'modeJeepney' : 'modeModernJeepney';
        const activeEl = document.getElementById(activeId);
        if (activeEl) activeEl.className = 'mode-pill selected-pill';
    };

    document.getElementById('modeWalking').addEventListener('click', () => {
        selectedMode = 'walking';
        setModeUI('walking');
        executeRouteQuery();
    });
    document.getElementById('modeJeepney').addEventListener('click', (e) => {
        selectedMode = 'jeepney';
        setModeUI('jeepney');
        document.getElementById('modeJeepney').innerHTML = `<img src="assets/icons/jeepney-icon.png" alt="Jeepney" class="transit-icon"> Jeepney`;
        document.getElementById('modeModernJeepney').innerHTML = `<img src="assets/icons/bus-icon.png" alt="M. Jeepney" class="transit-icon"> M. Jeepney`;
        executeRouteQuery();
    });
    document.getElementById('modeModernJeepney').addEventListener('click', (e) => {
        selectedMode = 'modern-jeepney';
        setModeUI('modern-jeepney');
        document.getElementById('modeModernJeepney').innerHTML = `<img src="assets/icons/bus-icon.png" alt="M. Jeepney" class="transit-icon"> M. Jeepney`;
        document.getElementById('modeJeepney').innerHTML = `<img src="assets/icons/jeepney-icon.png" alt="Jeepney" class="transit-icon"> Jeepney`;
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
    // MATH & GEOMETRY (Point Snapping)
    // =============================================
    
    // Returns distance in KM
    const getHaversineDist = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    // Find nearest point on Maharlika Highway segments
    const findNearestHighwayPoint = (pt) => {
        let minD = Infinity;
        let snapLat = pt[0], snapLng = pt[1];
        // Closest point to line segment
        const distToSegmentSq = (p, v, w) => {
            const l2 = (w[0]-v[0])**2 + (w[1]-v[1])**2;
            if (l2 == 0) return (p[0]-v[0])**2 + (p[1]-v[1])**2;
            let t = ((p[0]-v[0])*(w[0]-v[0]) + (p[1]-v[1])*(w[1]-v[1])) / l2;
            t = Math.max(0, Math.min(1, t));
            const proj = [v[0] + t*(w[0]-v[0]), v[1] + t*(w[1]-v[1])];
            return (p[0]-proj[0])**2 + (p[1]-proj[1])**2;
        };

        for (let i=0; i<NATIONAL_HIGHWAY_COORDS.length-1; i++) {
            const v = NATIONAL_HIGHWAY_COORDS[i];
            const w = NATIONAL_HIGHWAY_COORDS[i+1];
            
            const l2 = (w[0]-v[0])**2 + (w[1]-v[1])**2;
            let t = ((pt[0]-v[0])*(w[0]-v[0]) + (pt[1]-v[1])*(w[1]-v[1])) / l2;
            t = Math.max(0, Math.min(1, t));
            const projLat = v[0] + t*(w[0]-v[0]);
            const projLng = v[1] + t*(w[1]-v[1]);
            
            const d = getHaversineDist(pt[0], pt[1], projLat, projLng);
            if (d < minD) {
                minD = d;
                snapLat = projLat;
                snapLng = projLng;
            }
        }
        return [snapLat, snapLng];
    };


    // =============================================
    // ROUTING EXECUTOR — UNIVERSAL 2-LEG (OSRM)
    // No corridor detection needed. OSRM handles all road routing.
    // Walk leg: origin → first road point of car route.
    // Transit leg: full car route origin → destination.
    // =============================================

    const executeRouteQuery = async () => {
        if (!selectedCoords.origin || !selectedCoords.destination) {
            document.getElementById('transportModesBlock').style.display = 'none';
            document.getElementById('routeSummaryBlock').style.display = 'none';
            document.getElementById('startJourneyBtn').disabled = true;
            return;
        }

        document.getElementById('startJourneyBtn').disabled = true;
        currentCorridor = 'universal';

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

            currentWalkDist    = wRes.distance / 1000;
            currentWalkDur     = Math.ceil((wRes.distance / 1000 / 4) * 60); // 4 km/h
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

        // Boarding point = first coord of car route (nearest road snap)
        const boardingPt = tRes.coordinates[0];
        const walkDistM  = getHaversineDist(oPt[0], oPt[1], boardingPt[0], boardingPt[1]) * 1000;

        let wRes = null;
        if (walkDistM > 15) {
            try {
                wRes = await fetchOSRMRouteCoords(oPt, boardingPt, 'foot');
            } catch (e) { console.error('Walk OSRM error:', e); }
        }

        if (!wRes) {
            wRes = {
                coordinates: [oPt, boardingPt],
                distance: walkDistM,
                duration: Math.max(30, (walkDistM / 1000 / 4) * 3600),
                steps: []
            };
        }

        walkRouteGeojson    = wRes;
        transitRouteGeojson = tRes;

        currentWalkDist    = wRes.distance / 1000;
        // Walking: 4 km/h realistic Filipino commute walk pace
        currentWalkDur     = Math.ceil((wRes.distance / 1000 / 4) * 60);
        currentTransitDist = tRes.distance / 1000;
        // Jeepney speed correction: real jeepney avg ≈ 20 km/h + 3-min boarding buffer
        const jeepneySpeedKmh = 20;
        const boardingBufferSec = 180;
        const correctedTransitDur = (currentTransitDist / jeepneySpeedKmh) * 3600 + boardingBufferSec;
        currentTransitDur  = Math.ceil(correctedTransitDur / 60);

        currentFare = computeLTFRBFare(currentTransitDist, selectedMode);

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
            sessionStorage.setItem('calzada_journey', JSON.stringify({
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
        } catch(e) { /* sessionStorage unavailable (private mode edge case) */ }
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
        return Math.round(total * 4) / 4; // Round to nearest 0.25
    };

    const drawRoutes = (walkCoords, transitCoords) => {
        if (walkPolyline) { map.removeLayer(walkPolyline); walkPolyline = null; }
        if (transitPolyline) { map.removeLayer(transitPolyline); transitPolyline = null; }
        if (completedTransitPolyline) { map.removeLayer(completedTransitPolyline); completedTransitPolyline = null; }
        if (midpointBubbleMarker) { map.removeLayer(midpointBubbleMarker); midpointBubbleMarker = null; }

        const modeColor = selectedMode === 'modern-jeepney' ? '#7c3aed' : selectedMode === 'walking' ? '#10b981' : '#1a8fff';

        // For walking mode: solid green walk line (no transit)
        const isWalkOnly = selectedMode === 'walking';

        walkPolyline = L.polyline(walkCoords, {
            color: isWalkOnly ? '#10b981' : '#64748b',
            weight: isWalkOnly ? 6 : 5,
            dashArray: isWalkOnly ? null : '8, 10',
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);

        if (!isWalkOnly && transitCoords && transitCoords.length > 1) {
            transitPolyline = L.polyline(transitCoords, {
                color: modeColor,
                weight: 6,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round'
            }).addTo(map);

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

    const updateSummaryRow = () => {
        const blk = document.getElementById('routeSummaryBlock');
        const st = document.getElementById('sumTime');
        const sf = document.getElementById('sumFare');
        const se = document.getElementById('sumETA');
        const sd = document.getElementById('sumDist');

        const totalMin = currentWalkDur + currentTransitDur;
        const totalDist = (currentWalkDist + currentTransitDist).toFixed(1);

        const d = new Date(Date.now() + totalMin * 60000);
        const eta = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase();

        st.textContent = `${totalMin} min`;
        sf.textContent = selectedMode === 'walking' ? 'Free' : `${currentFare}`;
        se.textContent = eta;
        sd.textContent = totalDist;

        document.getElementById('peekSummary').textContent = selectedMode === 'walking'
            ? `${totalMin} min • Walk`
            : `${totalMin} min • ₱ ${currentFare}`;
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
    };


    // =============================================
    // ACTIVE NAVIGATION (Screen 3)
    // =============================================

    window.activeRouteSteps = [];
    window.currentStepIndex = 0;

    const getStepIcon = (step, mode) => {
        const type = step.maneuver.type;
        const mod = step.maneuver.modifier || '';
        if (type === 'depart') return mode === 'foot' ? 'walk' : 'bus';
        if (type === 'arrive') return 'flag';
        if (type === 'turn' || mod.includes('right') || mod.includes('left')) {
            if (mod.includes('right')) return 'arrow-redo';
            if (mod.includes('left')) return 'arrow-undo';
            return 'arrow-forward';
        }
        if (type === 'new name' || mod.includes('straight')) return 'arrow-up';
        return 'arrow-forward';
    };

    const formatDist = (m) => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m';

    const updateGuideStepsUI = () => {
        if (!window.activeRouteSteps || window.activeRouteSteps.length === 0) return;
        const steps = window.activeRouteSteps;
        const idx = window.currentStepIndex;
        
        const formatStep = (step, mode) => {
            const name = step.name || 'route';
            if (step.maneuver.type === 'depart') {
                return mode === 'foot' ? `Walk to ${name}` : `Board jeepney towards ${name}`;
            } else if (step.maneuver.type === 'turn') {
                return step.maneuver.modifier && step.maneuver.modifier.includes('right') ? `Turn right onto ${name}` : `Turn left onto ${name}`;
            } else if (step.maneuver.type === 'arrive') {
                return `You have arrived`;
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
        directionsCard.style.display = 'none';

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
        directionsCard.style.display = 'flex';
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

    // --- Tracker Variables --- //
    let trackedCoordinates = [];
    let completedCoords = [];
    let activeLegIndex = 0; // 0 = walk, 1 = transit
    let lastMovementTimestamp = Date.now();
    let lastValidPosition = null;
    let deviationTimer = null;

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

        // FIX: tick every second so the time display updates even between GPS pings
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(() => {
            if (cachedRemainingSeconds > 0) {
                cachedRemainingSeconds -= 1;
                updateDynamicBottomPill(Date.now() - lastMovementTimestamp);
            }
        }, 1000);
        if (currentCorridor !== 'other') {
            document.getElementById('activeModeToggle').style.display = '';
        } else {
            document.getElementById('activeModeToggle').style.display = '';
        }

        watchId = navigator.geolocation.watchPosition(handleLocationUpdate, (err) => console.log(err), {
            enableHighAccuracy: true, maximumAge: 10000, timeout: 5000
        });

        if (userMarker) map.removeLayer(userMarker);
        if (gpsCircle) map.removeLayer(gpsCircle);
        if (originMarker) map.removeLayer(originMarker); // Hide origin circle so it doesn't sit under the pointer
        
        userMarker = L.marker([currentLocation.lat, currentLocation.lng], {
            icon: L.divIcon({
                className: '',
                html: `
                    <div class="realtime-pointer-wrapper">
                        <img src="assets/realtime-LocationPointer.png" class="pointer-img" alt="location">
                    </div>
                `,
                iconSize: [44, 44],
                iconAnchor: [22, 22]
            }),
            zIndexOffset: 1000
        }).addTo(map);

        // compass rotated in handleLocationUpdate
    };

    const stopLiveTracking = () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        if (deviationTimer) clearTimeout(deviationTimer);
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; } // FIX: stop countdown
        if (typeof remainingTransitDurationStrRawTimer !== 'undefined') clearInterval(remainingTransitDurationStrRawTimer);
        watchId = null;

        // ✅ FIX: Remove the user location marker when tracking stops
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

        if (pos.coords.heading !== null && !isNaN(pos.coords.heading) && isTrackingArrival) {
            const heading = pos.coords.heading;
            // Compass needle counter-rotates to always show true north
            const compass = document.getElementById('compassSvg');
            if (compass) compass.style.transform = `rotate(${-heading}deg)`;

            // Map rotation — mobile only, rotate map to face heading direction
            if (window.innerWidth <= 768) {
                if (typeof map.setBearing === 'function') {
                    map.setBearing(heading);
                    // With setBearing, the map rotates so user marker needs to stay upright
                    // Target the inner wrapper, NOT the Leaflet container, so we don't overwrite Leaflet's positioning!
                    const pointerEl = userMarker.getElement().querySelector('.realtime-pointer-wrapper');
                    if (pointerEl) {
                        // Counter-rotate the marker element so it always points up on screen
                        pointerEl.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
                        pointerEl.style.transform = `rotate(${-heading}deg)`;
                    }
                }
                // Note: we don't do the CSS container rotation fallback as it inverts pan gestures
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

            remainingTimeSecs = (remainingDist / 20) * 3600; // jeepney ~20 km/h
        } else {
            // Walk leg: walk remaining + full transit time ahead
            const remFare = computeLTFRBFare(currentTransitDist, selectedMode);
            document.getElementById('pillPhp').textContent = selectedMode === 'walking' ? '🚶' : `₱${remFare}`;

            const walkRemainingSecs = (remainingDist / 4) * 3600;   // 4 km/h realistic walk
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
                    const res = await fetchOSRMRouteCoords([latitude, longitude], legTarget, activeLegIndex === 0 ? 'foot' : 'driving');
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
        document.getElementById('pillArrival').textContent = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    };




    const triggerArrival = () => {
        stopLiveTracking();
        sessionStorage.removeItem('calzada_journey'); // journey complete — clear state
        // Explicitly remove user markers on arrival
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
        if (gpsCircle)  { map.removeLayer(gpsCircle);  gpsCircle = null; }
        // Restore origin marker if present
        if (originMarker) originMarker.addTo(map);
        // Reset map bearing to north on arrival
        if (typeof map.setBearing === 'function') map.setBearing(0);
        else map.getContainer().style.transform = '';
        document.getElementById('arrivalOverlay').style.display = 'block';
        document.getElementById('arrivalScreen').classList.add('visible');
    };
    document.getElementById('arrivalCloseBtn').addEventListener('click', () => {
        document.getElementById('arrivalOverlay').style.display = 'none';
        document.getElementById('arrivalScreen').classList.remove('visible');
        document.getElementById('cancelRouteBtn').click(); // reset everything
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
        document.getElementById('sideDrawer').classList.toggle('open', state);
        document.getElementById('sideDrawerOverlay').classList.toggle('visible', state);
    };
    document.getElementById('hamburgerBtn').addEventListener('click', () => toggleDrawer(true));
    document.getElementById('drawerCloseBtn').addEventListener('click', () => toggleDrawer(false));
    document.getElementById('sideDrawerOverlay').addEventListener('click', () => toggleDrawer(false));

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
            document.getElementById('scheduleSelectedText').textContent = e.target.textContent;
            schedOpts.classList.remove('open');
            schedOpts.querySelectorAll('li').forEach(l=>l.classList.remove('active'));
            e.target.classList.add('active');
            
            if (e.target.dataset.value !== 'now' && window.flatpickr) {
                // Initialize dtpicker trigger if external flatpickr attached
                const nDP = document.getElementById('nativeDatePicker');
                if(!nDP._fp) {
                    nDP._fp = flatpickr(nDP, {
                        enableTime: true, minDate: "today",
                        onChange: (sel, dateStr) => document.getElementById('scheduleSelectedText').textContent = dateStr
                    });
                }
                nDP._fp.open();
            }
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
    const urlParams = new URLSearchParams(window.location.search);
    // Accept both naming conventions: destName/destLat/destLng (new) and dest/dlat/dlng (old)
    const destName = decodeURIComponent(urlParams.get('destName') || urlParams.get('dest') || '');
    const destLat  = parseFloat(urlParams.get('destLat')  || urlParams.get('dlat') || '');
    const destLng  = parseFloat(urlParams.get('destLng')  || urlParams.get('dlng') || '');
    if (destName && !isNaN(destLat) && !isNaN(destLng)) {
        selectedCoords.destination = [destLat, destLng];
        destPlaceName = destName; // already decoded above
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
        
        map.fitBounds([[destLat, destLng], [destLat, destLng]], { padding: [60, 60], maxZoom: 16 });
    }

    document.getElementById('amtJeep').addEventListener('click', () => switchActiveMode('jeepney'));
    document.getElementById('amtMJeep').addEventListener('click', () => switchActiveMode('modern-jeepney'));
    document.getElementById('amtWalk').addEventListener('click', () => switchActiveMode('walking'));

    const switchActiveMode = (newMode) => {
        if (selectedMode === newMode) return;
        selectedMode = newMode;
        
        document.getElementById('amtJeep').classList.toggle('active', newMode === 'jeepney');
        document.getElementById('amtMJeep').classList.toggle('active', newMode === 'modern-jeepney');
        document.getElementById('amtWalk').classList.toggle('active', newMode === 'walking');

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
                // Get current GPS position then resume tracking from there
                showToast(`Resuming journey to ${state.destName || 'destination'}…`);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        // Update origin to current position so route starts from here
                        selectedCoords.origin = [pos.coords.latitude, pos.coords.longitude];
                        originPlaceName = 'My Location';
                        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        updateODDisplay();
                        executeRouteQuery().then(() => {
                            // Resume active navigation UI
                            directionsCard.style.display = 'none';
                            activeGuideCard.style.display = 'flex';
                            bottomStatusPill.style.display = 'flex';
                            document.getElementById('remindersPillBtn').style.display = 'none';
                            document.getElementById('hamburgerBtn').style.display = 'none';
                            mapAutoFollow = true;
                            isTrackingArrival = true;
                            document.getElementById('reCenterBtn').style.display = 'none';
                            activeLegIndex = state.activeLegIndex || 0;
                            window.currentStepIndex = state.currentStepIndex || 0;
                            startLiveTracking();
                            map.invalidateSize();
                        });
                    },
                    () => {
                        // GPS unavailable — just show the route, let user restart manually
                        showToast('Could not get current position. Tap Start Journey to resume.');
                    },
                    { enableHighAccuracy: true, timeout: 8000 }
                );
            } else {
                showToast('Your last route was restored.');
            }
        }).catch(() => {
            sessionStorage.removeItem('calzada_journey');
            dismissBanner();
        });
    })();

    }, 100);
});
