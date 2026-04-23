// =============================================
// CALZADA PLANNER — REBUILT ROUTING ENGINE (INTER-CITY ONLY)
// =============================================

function t(key, context) {
    if (window.t) return window.t(key, context);
    return key;
}

document.addEventListener('DOMContentLoaded', () => {

    const map = L.map('map').setView([14.2045, 121.1641], 15);
    L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        attribution: '&copy; Google'
    }).addTo(map);

    // AH26 Maharlika Highway Corridor (San Pedro to Los Baños direction)
    const NATIONAL_HIGHWAY_COORDS = [
        [14.3504, 121.0285], // San Pedro, Laguna (north entry)
        [14.3200, 121.0420],
        [14.2900, 121.0580],
        [14.2600, 121.0850],
        [14.2400, 121.1100],
        [14.2200, 121.1350],
        [14.2045, 121.1641], // SM Calamba / Crossing area
        [14.1900, 121.1800],
        [14.1687, 121.2100], // Los Baños direction
    ];

    let currentLocation = { lat: 14.2045, lng: 121.1641 }; // Default
    let selectedCoords = { origin: null, destination: null };
    let originPlaceName = 'My Location';
    let destPlaceName = '';
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

    // Real-Time Tracking State
    let watchId = null;
    let lastOsrmFetchTime = 0;
    let remainingTransitDurationStrRawTimer = null;
    let cachedRemainingSeconds = 0;

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

    const renderModalDefaultOptions = () => {
        const isOrig = activeSelectingField === 'origin';
        locOptionsList.innerHTML = '';
        if (isOrig) {
            locOptionsList.innerHTML += `<div class="loc-row" id="optMyLoc"><div class="loc-icon bg-blue"><ion-icon name="locate"></ion-icon></div><div class="loc-text">My Location</div></div>`;
        }
        locOptionsList.innerHTML += `<div class="loc-row" id="optPinLoc"><div class="loc-icon pin-blue"><ion-icon name="location"></ion-icon></div><div class="loc-text">Pin Location</div></div>`;
        locAttribution.style.display = 'none';
        
        document.getElementById('optMyLoc')?.addEventListener('click', () => {
            selectLocation('My Location', [currentLocation.lat, currentLocation.lng]);
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
        if (originPlaceName) { origEl.textContent = originPlaceName; origEl.classList.remove('unfilled'); }
        else { origEl.textContent = 'My Location'; origEl.classList.remove('unfilled'); }
        
        if (destPlaceName) { destEl.textContent = destPlaceName; destEl.classList.remove('unfilled'); }
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
        executeRouteQuery();
    };

    // Mode Selection
    document.getElementById('modeJeepney').addEventListener('click', (e) => {
        selectedMode = 'jeepney';
        document.getElementById('modeJeepney').className = 'mode-pill selected-pill';
        document.getElementById('modeModernJeepney').className = 'mode-pill outline-pill';
        document.getElementById('modeJeepney').innerHTML = `Jeepney`;
        document.getElementById('modeModernJeepney').innerHTML = `<ion-icon name="bus"></ion-icon> M. Jeepney`;
        executeRouteQuery();
    });
    document.getElementById('modeModernJeepney').addEventListener('click', (e) => {
        selectedMode = 'modern-jeepney';
        document.getElementById('modeModernJeepney').className = 'mode-pill selected-pill';
        document.getElementById('modeJeepney').className = 'mode-pill outline-pill';
        document.getElementById('modeModernJeepney').innerHTML = `<ion-icon name="bus"></ion-icon> M. Jeepney`;
        document.getElementById('modeJeepney').innerHTML = `Jeepney`;
        executeRouteQuery();
    });

    // =============================================
    // GEOCODING (ESRI Primary, Nominatim Fallback)
    // =============================================
    let geocodeTimeout = null;
    locSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        clearTimeout(geocodeTimeout);
        if (val.length < 3) {
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
                })));
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
                })));
                return;
            }
        } catch(e) {}
        
        locOptionsList.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444; font-size: 0.9rem;">No results found.</div>`;
    };

    const renderSearchResults = (results) => {
        locOptionsList.innerHTML = '';
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
    // ROUTING EXECUTOR (OSRM)
    // =============================================

    const detectCorridor = (originCoords, destCoords) => {
        const isSanPedroArea = (c) => c[0] >= 14.28 && c[0] <= 14.37 && c[1] >= 121.01 && c[1] <= 121.07;
        const isStaCruzArea = (c) => c[0] >= 14.27 && c[0] <= 14.32 && c[1] >= 121.40 && c[1] <= 121.48;
        const isCaLambaArea = (c) => c[0] >= 14.17 && c[0] <= 14.25 && c[1] >= 121.10 && c[1] <= 121.22;
        const isSanIsidroArea = (c) => c[0] >= 14.20 && c[0] <= 14.30 && c[1] >= 121.05 && c[1] <= 121.12;

        const o = originCoords, d = destCoords;
        if ((isSanPedroArea(o) || isSanIsidroArea(o)) && isCaLambaArea(d)) return 'san-pedro-calamba';
        if ((isSanPedroArea(d) || isSanIsidroArea(d)) && isCaLambaArea(o)) return 'san-pedro-calamba';
        if (isStaCruzArea(o) && isCaLambaArea(d)) return 'sta-cruz-calamba';
        if (isStaCruzArea(d) && isCaLambaArea(o)) return 'sta-cruz-calamba';
        return 'unknown';
    };

    const getAvailableModes = (corridor) => {
        if (corridor === 'san-pedro-calamba') return ['jeepney', 'modern-jeepney'];
        if (corridor === 'sta-cruz-calamba') return ['jeepney'];
        return ['jeepney']; // default fallback
    };

    const executeRouteQuery = async () => {
        if (!selectedCoords.origin || !selectedCoords.destination) {
            document.getElementById('transportModesBlock').style.display = 'none';
            document.getElementById('routeSummaryBlock').style.display = 'none';
            document.getElementById('startJourneyBtn').disabled = true;
            return;
        }
        
        document.getElementById('startJourneyBtn').disabled = true;

        const oPt = selectedCoords.origin;
        const dPt = selectedCoords.destination;

        const corridor = detectCorridor(oPt, dPt);
        const modes = getAvailableModes(corridor);
        
        const jeepBtn = document.getElementById('modeJeepney');
        const mjeepBtn = document.getElementById('modeModernJeepney');
        
        jeepBtn.style.display = 'flex';
        mjeepBtn.style.display = modes.includes('modern-jeepney') ? 'flex' : 'none';
        
        if (!modes.includes(selectedMode)) {
            selectedMode = 'jeepney';
            jeepBtn.className = 'mode-pill selected-pill';
            mjeepBtn.className = 'mode-pill outline-pill';
        }

        // Draw Markers
        if (originMarker) map.removeLayer(originMarker);
        if (destMarker) map.removeLayer(destMarker);
        
        originMarker = L.marker([oPt[0], oPt[1]], {
            icon: L.divIcon({ className: 'custom-leaflet-marker', html: `<div class="origin-node"></div>`, iconSize: [14,14], iconAnchor: [7,7] })
        }).addTo(map);
        destMarker = L.marker([dPt[0], dPt[1]], {
            icon: L.divIcon({ className: 'custom-leaflet-marker', html: `<ion-icon name="location" class="pin red" style="font-size:2rem; margin-top:-32px;"></ion-icon>`, iconSize: [32,32], iconAnchor: [16,16] })
        }).addTo(map);

        // 1. Snap to highway
        let snapPt = null;
        try {
            snapPt = findNearestHighwayPoint(oPt);
        } catch (e) {
            console.error(e);
            snapPt = oPt;
        }

        // 2. Fetch OSRM Foot for Walk
        let wRes = null;
        try {
            wRes = await fetchOSRMRouteCoords(oPt, snapPt, 'foot');
        } catch (e) { console.error(e); }

        // 3. Fetch OSRM Driving for Transit
        let tRes = null;
        try {
            tRes = await fetchOSRMRouteCoords(snapPt, dPt, 'driving');
        } catch (e) { console.error(e); }

        if (!wRes) {
            wRes = {
                coordinates: [[oPt[0], oPt[1]], [snapPt[0], snapPt[1]]],
                distance: getHaversineDist(oPt[0], oPt[1], snapPt[0], snapPt[1]) * 1000,
                duration: (getHaversineDist(oPt[0], oPt[1], snapPt[0], snapPt[1]) / 5) * 3600
            };
        }
        if (!tRes) {
            tRes = {
                coordinates: [[snapPt[0], snapPt[1]], [dPt[0], dPt[1]]],
                distance: getHaversineDist(snapPt[0], snapPt[1], dPt[0], dPt[1]) * 1000,
                duration: (getHaversineDist(snapPt[0], snapPt[1], dPt[0], dPt[1]) / 30) * 3600
            };
        }

        walkRouteGeojson = wRes;
        transitRouteGeojson = tRes;
        
        currentWalkDist = wRes.distance / 1000;
        currentWalkDur = Math.ceil(wRes.duration / 60);
        
        currentTransitDist = tRes.distance / 1000;
        currentTransitDur = Math.ceil(tRes.duration / 60);

        // 4. Compute Fares (Transit ONLY)
        currentFare = computeLTFRBFare(currentTransitDist, selectedMode);

        drawRoutes(wRes.coordinates, tRes.coordinates);
        updateSummaryRow();
        
        document.getElementById('transportModesBlock').style.display = 'flex';
        document.getElementById('routeSummaryBlock').style.display = 'block';
    };

    const fetchOSRMRouteCoords = async (start, end, profile) => {
        const url = `https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson&alternatives=false`;
        try {
            const req = await fetch(url);
            const json = await req.json();
            if (json.routes && json.routes.length > 0) {
                const rt = json.routes[0];
                return {
                    coordinates: rt.geometry.coordinates.map(c => [c[1], c[0]]),
                    distance: rt.distance,
                    duration: rt.duration
                };
            }
        } catch(e) { console.error("OSRM Error:", e); }
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
        if (walkPolyline) map.removeLayer(walkPolyline);
        if (transitPolyline) map.removeLayer(transitPolyline);
        if (completedTransitPolyline) map.removeLayer(completedTransitPolyline);
        if (midpointBubbleMarker) map.removeLayer(midpointBubbleMarker);

        const modeColor = selectedMode === 'modern-jeepney' ? '#7c3aed' : '#1a8fff';

        walkPolyline = L.polyline(walkCoords, { color: '#64748b', weight: 4, dashArray: '5,5' }).addTo(map);
        transitPolyline = L.polyline(transitCoords, { color: modeColor, weight: 6 }).addTo(map);

        // Create Midpoint Bubble
        if (transitCoords.length > 0) {
            const midNode = transitCoords[Math.floor(transitCoords.length / 2)];
            midpointBubbleMarker = L.marker(midNode, {
                icon: L.divIcon({ className: 'custom-mid-bubble', html: `<div class="route-bubble">${currentWalkDur + currentTransitDur} min</div>`, iconSize: [0,0], iconAnchor: [0,0] })
            });
            if (directionsCard.classList.contains('collapsed')) midpointBubbleMarker.addTo(map);
        }

        const group = new L.featureGroup([walkPolyline, transitPolyline, originMarker, destMarker]);
        map.fitBounds(group.getBounds(), { padding: [40, 40] });

        // Enable button
        document.getElementById('startJourneyBtn').disabled = false;
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
        sf.textContent = `${currentFare}`;
        se.textContent = eta;
        sd.textContent = totalDist;

        document.getElementById('peekSummary').textContent = `${totalMin} min • ₱ ${currentFare}`;
        blk.style.visibility = 'visible';
    };


    // =============================================
    // ACTIVE NAVIGATION (Screen 3)
    // =============================================

    document.getElementById('startJourneyBtn').addEventListener('click', () => {
        if (!selectedCoords.origin || !selectedCoords.destination) return;
        
        // Hide Directions Card
        directionsCard.style.display = 'none';

        // Show Active Nav Overlays
        activeGuideCard.style.display = 'flex';
        bottomStatusPill.style.display = 'flex';

        // Clean map markers, center on origin
        map.setView(selectedCoords.origin, 17);
        mapAutoFollow = true;
        isTrackingArrival = true;
        document.getElementById('reCenterBtn').style.display = 'none';

        startLiveTracking();
    });

    document.getElementById('cancelRouteBtn').addEventListener('click', () => {
        stopLiveTracking();
        isTrackingArrival = false;
        
        // Hide Active
        activeGuideCard.style.display = 'none';
        bottomStatusPill.style.display = 'none';
        
        // Restore Directions
        directionsCard.style.display = 'flex';
        directionsCard.classList.add('expanded');
        directionsCard.classList.remove('collapsed');
        document.getElementById('dsPeekInfo').style.display = 'none';
        updateMidpointBubbleVisibility(false);
    });

    // Expand bottom pill to show cancel button
    bottomStatusPill.addEventListener('click', (e) => {
        if (e.target.closest('.btn-cancel-route')) return;
        bottomStatusPill.classList.toggle('expanded');
    });

    // Panning logic exposes recenter
    map.on('dragstart', () => {
        if (isTrackingArrival && mapAutoFollow) {
            mapAutoFollow = false;
            document.getElementById('reCenterBtn').style.display = 'flex';
        }
    });

    document.getElementById('reCenterBtn').addEventListener('click', () => {
        mapAutoFollow = true;
        if (currentLocation) map.setView([currentLocation.lat, currentLocation.lng], 17);
        document.getElementById('reCenterBtn').style.display = 'none';
    });


    // --- Tracker Variables --- //
    let trackedCoordinates = [];
    let completedCoords = [];
    let activeLegIndex = 0; // 0 = walk, 1 = transit

    const startLiveTracking = () => {
        if (!navigator.geolocation) return;
        
        activeLegIndex = 0;
        trackedCoordinates = walkRouteGeojson.coordinates.concat(transitRouteGeojson.coordinates);
        completedCoords = [];

        // Populate guide steps (current + next steps like the screenshot)
        document.getElementById('guideCurrentText').textContent = 'Walk to National Highway';
        document.getElementById('guideCurrentStep').querySelector('ion-icon').setAttribute('name', 'walk');
        document.getElementById('guideNextText').textContent = 'Turn right';
        document.getElementById('guideExpandedSteps').innerHTML = `
            <div class="expanded-step"><ion-icon name="arrow-redo-outline"></ion-icon><span>Turn right</span></div>
            <div class="expanded-step"><ion-icon name="arrow-redo-outline"></ion-icon><span>Turn right</span></div>
        `;

        // Set Bottom pill statics
        document.getElementById('pillPhp').textContent = `₱${currentFare}`;
        cachedRemainingSeconds = (currentWalkDur + currentTransitDur) * 60;
        updateDynamicBottomPill();

        // Simulate 1s countdown interpolator
        remainingTransitDurationStrRawTimer = setInterval(() => {
            if (cachedRemainingSeconds > 0) cachedRemainingSeconds -= 1;
            updateDynamicBottomPill();
        }, 1000);

        watchId = navigator.geolocation.watchPosition(handleLocationUpdate, (err) => console.log(err), {
            enableHighAccuracy: true, maximumAge: 10000, timeout: 5000
        });

        // Initialize user marker
        if (userMarker) map.removeLayer(userMarker);
        if (gpsCircle) map.removeLayer(gpsCircle);
        
        /* User Beacon Marker */
        userMarker = L.marker([currentLocation.lat, currentLocation.lng], {
            icon: L.divIcon({
                className: 'custom-leaflet-marker',
                html: `<div style="width: 20px; height: 20px; border-radius: 50%; background: #1a8fff; border: 3px solid white; box-shadow: 0 0 10px rgba(0,0,0,0.3);"></div>`,
                iconSize: [20,20], iconAnchor: [10,10]
            })
        }).addTo(map);
    };

    const stopLiveTracking = () => {
        if (watchId) navigator.geolocation.clearWatch(watchId);
        clearInterval(remainingTransitDurationStrRawTimer);
        watchId = null;
    };

    const handleLocationUpdate = async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        currentLocation = { lat: latitude, lng: longitude };
        
        userMarker.setLatLng([latitude, longitude]);
        if (mapAutoFollow) map.setView([latitude, longitude], 17);

        // Check if arrived at destination
        const destDist = getHaversineDist(latitude, longitude, selectedCoords.destination[0], selectedCoords.destination[1]) * 1000; // in meters
        if (destDist < 30) {
            triggerArrival();
            return;
        }

        // Logic 1: Find closest point on current active polyline
        // Merge remaining path for evaluation
        const currentPath = activeLegIndex === 0 ? walkRouteGeojson.coordinates : transitRouteGeojson.coordinates;
        let minD = Infinity, closestIdx = 0;
        
        for (let i = 0; i < currentPath.length; i++) {
            const d = getHaversineDist(latitude, longitude, currentPath[i][0], currentPath[i][1]) * 1000;
            if (d < minD) { minD = d; closestIdx = i; }
        }

        // Auto Advance Step (if within 30m of segment end, switch activeLeg to transit)
        if (activeLegIndex === 0 && minD < 50 && closestIdx > currentPath.length - 3) {
            activeLegIndex = 1; // switch to transit phase
            document.getElementById('guideCurrentText').textContent = "Wait for your ride";
            document.getElementById('guideCurrentStep').querySelector('ion-icon').name = "bus";
        }

        // Split polyline logic
        if (activeLegIndex === 1 && transitRouteGeojson) {
            const passCoords = transitRouteGeojson.coordinates.slice(0, closestIdx + 1);
            const remainCoords = transitRouteGeojson.coordinates.slice(closestIdx);
            
            if (completedTransitPolyline) map.removeLayer(completedTransitPolyline);
            if (transitPolyline) map.removeLayer(transitPolyline);

            completedTransitPolyline = L.polyline(passCoords, { color: '#9ca3af', weight: 6 }).addTo(map);
            transitPolyline = L.polyline(remainCoords, { color: selectedMode === 'modern-jeepney' ? '#7c3aed' : '#1a8fff', weight: 6 }).addTo(map);
        }

        // Re-route Logic (every 30 seconds if activeLeg = 1)
        const now = Date.now();
        if (activeLegIndex === 1 && (now - lastOsrmFetchTime > 30000 || minD > 50)) {
            // Refetch active transit duration
            lastOsrmFetchTime = now;
            const res = await fetchOSRMRouteCoords([latitude, longitude], selectedCoords.destination, 'driving');
            if (res) {
                if (minD > 50) {
                    // Full deviation reroute -> reset path coords completely
                    transitRouteGeojson.coordinates = res.coordinates;
                    if (completedTransitPolyline) map.removeLayer(completedTransitPolyline);
                    if (transitPolyline) transitPolyline.setLatLngs(res.coordinates);
                    showToast('Na-update ang ruta');
                }
                cachedRemainingSeconds = res.duration;
                updateDynamicBottomPill();
            }
        }
    };

    const updateDynamicBottomPill = () => {
        // Minutes display
        let mins = Math.ceil(cachedRemainingSeconds / 60);
        document.getElementById('pillMin').textContent = mins < 1 ? "< 1" : mins;

        // Arrival Time
        const d = new Date(Date.now() + cachedRemainingSeconds * 1000);
        document.getElementById('pillArrival').textContent = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
    };


    const triggerArrival = () => {
        stopLiveTracking();
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
    // =============================================
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                selectedCoords.origin = [currentLocation.lat, currentLocation.lng];
                map.setView([currentLocation.lat, currentLocation.lng], 15);
            },
            () => console.warn("Location disabled")
        );
    }

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

    document.getElementById('mapPickerConfirmBtn').addEventListener('click', () => {
        const c = map.getCenter();
        selectLocation('Pinned Location', [c.lat, c.lng]);
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
});
