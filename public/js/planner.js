// =============================================
// CALZADA PLANNER — REBUILT ROUTING ENGINE (INTER-CITY ONLY)
// =============================================

function t(key, context) {
    if (window.t) return window.t(key, context);
    return key;
}

function resolvePlaceImageUrl(path) {
    if (!path || typeof path !== 'string') return '../assets/hero-places-bg.png';
    const trimmed = path.trim();
    if (!trimmed) return '../assets/hero-places-bg.png';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed;
    }
    if (trimmed.startsWith('../assets/')) {
        return trimmed;
    }
    if (trimmed.startsWith('/assets/')) {
        return '..' + trimmed;
    }
    if (trimmed.startsWith('assets/')) {
        return '../' + trimmed;
    }
    if (trimmed.startsWith('/public/assets/')) {
        return '..' + trimmed.slice('/public'.length);
    }
    if (trimmed.startsWith('public/assets/')) {
        return '../' + trimmed.slice('public'.length);
    }
    if (trimmed.startsWith('./assets/')) {
        return '.' + trimmed;
    }
    return trimmed;
}
window.resolvePlaceImageUrl = resolvePlaceImageUrl;

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


    // =============================================
    // MAP ENGINE (MapLibre GL JS + OpenFreeMap Liberty)
    // =============================================
    // NOTE ON BASEMAP VS. DATABASE LABELING:
    // OpenFreeMap Liberty provides vector basemap tiles with general road, highway,
    // neighborhood, and major OpenStreetMap landmark labeling. It does NOT automatically
    // render Calzada's own establishment database as basemap labels. Calzada's establishments
    // continue to be surfaced via the application's own custom marker pins and interactive
    // popups sourced from the database/API.

    // Coordinate Converters: MapLibre uses [lng, lat], standard LatLng uses [lat, lng]
    const toLngLat = (pt) => {
        if (!pt) return null;
        if (Array.isArray(pt)) {
            return [Number(pt[1]), Number(pt[0])];
        }
        if (typeof pt === 'object') {
            const lat = pt.lat !== undefined ? pt.lat : pt[1];
            const lng = pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt[0]);
            return [Number(lng), Number(lat)];
        }
        return null;
    };

    const toLatLng = (pt) => {
        if (!pt) return null;
        if (Array.isArray(pt)) {
            return [Number(pt[0]), Number(pt[1])];
        }
        if (typeof pt === 'object') {
            const lat = pt.lat !== undefined ? pt.lat : pt[0];
            const lng = pt.lng !== undefined ? pt.lng : (pt.lon !== undefined ? pt.lon : pt[1]);
            return [Number(lat), Number(lng)];
        }
        return null;
    };

    const map = new maplibregl.Map({
        container: 'map',
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [121.1652, 14.2117], // Calamba coordinates [lng, lat]
        zoom: 13
    });
    window._calzadaMap = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

    window.addEventListener('resize', () => map.resize());
    setTimeout(() => map.resize(), 0);
    setTimeout(() => map.resize(), 200);
    map.on('load', () => map.resize());

    // GeoJSON Route line layers setup
    let routeLayersInitialized = false;
    const initRouteLayers = () => {
        if (routeLayersInitialized || !map.isStyleLoaded()) return;

        if (!map.getSource('walk-route')) {
            map.addSource('walk-route', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
            map.addLayer({
                id: 'walk-route-layer',
                type: 'line',
                source: 'walk-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#3b82f6',
                    'line-width': 5,
                    'line-dasharray': [2, 2]
                }
            });
        }

        if (!map.getSource('transit-route')) {
            map.addSource('transit-route', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
            map.addLayer({
                id: 'transit-route-layer',
                type: 'line',
                source: 'transit-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#1a8fff',
                    'line-width': 6
                }
            });
        }

        if (!map.getSource('completed-route')) {
            map.addSource('completed-route', {
                type: 'geojson',
                data: { type: 'FeatureCollection', features: [] }
            });
            map.addLayer({
                id: 'completed-route-layer',
                type: 'line',
                source: 'completed-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': '#9ca3af',
                    'line-width': 5
                }
            });
        }

        routeLayersInitialized = true;
    };

    map.on('load', initRouteLayers);

    const updateRouteSource = (sourceId, coordsLngLat) => {
        initRouteLayers();
        const src = map.getSource(sourceId);
        if (!src) return;
        if (!coordsLngLat || coordsLngLat.length < 2) {
            src.setData({ type: 'FeatureCollection', features: [] });
        } else {
            src.setData({
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: coordsLngLat
                }
            });
        }
    };

    // NATIONAL_HIGHWAY_COORDS removed — OSRM handles road routing universally.

    let currentLocation = { lat: 14.2045, lng: 121.1641 }; // Default
    let selectedCoords = { origin: null, destination: null };
    let originPlaceName = '';
    let destPlaceName = '';

    // URL parameters parsed later
    let isTrackingArrival = false;
    let mapAutoFollow = true;
    let selectedMode = 'jeepney';
    let userExplicitMode = false;
    
    // Map objects
    let originMarker = null, destMarker = null, userMarker = null, gpsCircle = null;
    let walkPolyline = null, transitPolyline = null, completedTransitPolyline = null;
    let midpointBubbleMarker = null;

    // =============================================
    // CATEGORY FILTER PILLS & MAP PLACES CONTROLLER
    // =============================================

    // Category metadata: icon, color, label mappings
    const CATEGORY_META = {
        malls:          { icon: 'storefront-outline', color: '#2563EB', label: 'Mall' },
        eateries:       { icon: 'restaurant-outline', color: '#D97706', label: 'Eatery' },
        schools:        { icon: 'school-outline',     color: '#059669', label: 'School' },
        terminals:      { icon: 'bus-outline',        color: '#0284C7', label: 'Terminal' },
        Terminal:       { icon: 'bus-outline',        color: '#0284C7', label: 'Terminal' },
        Stop:           { icon: 'pin-outline',        color: '#64748B', label: 'Transit Stop' },
        coffee:         { icon: 'cafe-outline',       color: '#854D0E', label: 'Coffee Shop' },
        establishments: { icon: 'business-outline',   color: '#4F46E5', label: 'Establishment' },
        all:            { icon: 'location-outline',   color: '#378ADD', label: 'Place' },
    };

    // Fallback hardcoded data (used when API is unavailable or offline)
    const CALAMBA_PLACES_FALLBACK = [
        // Malls
        { id: 'sm-calamba', name: 'SM City Calamba', category: 'malls', lat: 14.203928, lng: 121.1545159, full_address: 'National Road, Brgy. Real, Calamba City Triangle, 4027 Laguna' },
        { id: 'citymall-calamba', name: 'CityMall Calamba', category: 'malls', lat: 14.1986374, lng: 121.1604888, full_address: 'National Highway, Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/citymall-calamba/citymall-calamba-1.jpg' },
        { id: 'puregold-halang', name: 'Puregold – Halang, Calamba', category: 'malls', lat: 14.1930, lng: 121.1625, full_address: 'National Highway, Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/puregold-halang-calamba/puregold-halang-calamba-1.jpg' },
        { id: 'south-supermarket', name: 'South Supermarket', category: 'malls', lat: 14.2030841, lng: 121.1584071, full_address: 'Manila S Rd, Calamba, 4027 Laguna' },
        // Schools
        { id: 'sti-calamba', name: 'STI College - Calamba', category: 'schools', lat: 14.2025089, lng: 121.1583962, full_address: 'Manila S Rd, Calamba, 4027 Laguna', image_path: '../assets/places/sti-college/sti-1.jpg' },
        { id: 'saint-benilde', name: 'Saint Benilde International School (Calamba), Inc.', category: 'schools', lat: 14.1987583, lng: 121.1519236, full_address: 'Real, Calamba, 4027 Laguna', image_path: '../assets/places/saint-benilde-international-school/saint-benilde-international-school-1.jpg' },
        { id: 'real-elementary', name: 'Real Elementary School', category: 'schools', lat: 14.1987874, lng: 121.1492457, full_address: '336 Real Rd, Real, Calamba, 4027 Laguna' },
        { id: 'pwu-cdcec', name: 'PWU CDCEC Calamba', category: 'schools', lat: 14.2052421, lng: 121.1562636, full_address: '6544+3HW, Bridge, Calamba, 4027 Laguna' },
        // Terminals
        { id: 'calamba-crossing-term', name: 'Calamba Crossing / Central Terminal', category: 'terminals', lat: 14.19821, lng: 121.16315, full_address: 'Calamba Crossing, Brgy. Real, Calamba City' },
        { id: 'sm-transport-term', name: 'SM City Calamba Transport Terminal', category: 'terminals', lat: 14.19895, lng: 121.16335, full_address: 'SM City Calamba Complex, Calamba City', image_path: '../assets/places/sm-city-calamba-transport-terminal/sm-city-calamba-transport-terminal-1.jpg' },
        { id: 'turbina-bus-term', name: 'Turbina Bus Terminal', category: 'terminals', lat: 14.18888, lng: 121.14444, full_address: 'Turbina, Calamba City' },
        // Eateries
        { id: 'rose-grace', name: 'Rose and Grace Restaurant', category: 'eateries', lat: 14.2012, lng: 121.1568, full_address: 'Maharlika Highway, Brgy. Real, Calamba City' },
        { id: 'ding-hao', name: 'Ding Hao', category: 'eateries', lat: 14.1925, lng: 121.1620, full_address: 'National Highway, Brgy. Halang, Calamba City', image_path: '../assets/places/ding-hao/ding-hao-1.jpg' },
        { id: 'uncle-johns', name: "Uncle John's", category: 'eateries', lat: 14.2035, lng: 121.1560, full_address: 'Manila S Rd, Calamba City, Laguna', image_path: '../assets/places/uncle-johns/uncle-johns-1.jpg' },
        { id: 'teng-tengs', name: "Teng-Teng's", category: 'eateries', lat: 14.2028, lng: 121.1565, full_address: 'Calamba City, Laguna', image_path: '../assets/places/teng-tengs/teng-tengs-1.jpg' },
        { id: 'mariz-food-town', name: 'Mariz Food Town', category: 'eateries', lat: 14.2018, lng: 121.1578, full_address: 'Calamba City, Laguna', image_path: '../assets/places/mariz-food-town/mariz-food-town-1.jpg' },
        { id: 'ton-tons-sisig', name: "Ton-Ton's Sisig", category: 'eateries', lat: 14.2020, lng: 121.1565, full_address: 'Calamba City, Laguna', image_path: '../assets/places/ton-tons-sisig/ton-tons-sisig-1.jpg' },
        // Coffee Shops
        { id: 'moonbucks', name: 'Moonbucks', category: 'coffee', lat: 14.2104, lng: 121.1648, full_address: 'Elepaño Subdivision, Brgy. 3 (Bayan), Calamba City' },
        { id: 'sample-coffee', name: 'Sample Coffee House', category: 'coffee', lat: 14.1843, lng: 121.1625, full_address: 'National Highway, Brgy. Bucal, Calamba City' },
        { id: 'starbucks-crossing', name: 'Starbucks Calamba Crossing', category: 'coffee', lat: 14.2040, lng: 121.1546, full_address: 'Crossing, Brgy. Real, Calamba City' },
        // Establishments
        { id: 'calamba-city-hall', name: 'Calamba City Hall', category: 'establishments', lat: 14.2115, lng: 121.1558, full_address: 'Bacnotan Rd, Brgy. Real, Calamba City' },
        { id: 'rizal-shrine', name: 'Bahay ni Rizal (Rizal Shrine)', category: 'establishments', lat: 14.2140, lng: 121.1670, full_address: 'J.P. Rizal St, Brgy. 5 Poblacion, Calamba City' },
        { id: 'calamba-plaza', name: 'Calamba Town Plaza', category: 'establishments', lat: 14.2135, lng: 121.1662, full_address: 'Rizal St, Poblacion, Calamba City' },
        { id: 'calamba-medical', name: 'Calamba Medical Center', category: 'establishments', lat: 14.2065, lng: 121.1575, full_address: 'National Highway, Crossing, Calamba City' },
        { id: 'card-sme-bank', name: 'CARD SME Bank – Calamba Branch', category: 'establishments', lat: 14.2020, lng: 121.1570, full_address: 'National Highway, Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/card-sme-bank/card-sme-bank-1.jpg' },
        { id: 'wilcon-depot', name: 'Wilcon Depot Calamba', category: 'establishments', lat: 14.1950, lng: 121.1550, full_address: 'National Highway, Calamba City, Laguna', image_path: '../assets/places/wilcon-depot-calamba/wilcon-depot-calamba-1.jpg' },
        { id: 'barangay-uno-hall', name: 'Barangay Uno Hall, Calamba City', category: 'establishments', lat: 14.1990, lng: 121.1595, full_address: 'Barangay 1 (Uno), Calamba City, Laguna', image_path: '../assets/places/barangay-uno-hall/barangay-uno-hall-1.jpg' },
        { id: 'laguna-logistics', name: 'Laguna Logistics', category: 'establishments', lat: 14.1960, lng: 121.1510, full_address: 'Calamba City, Laguna', image_path: '../assets/places/laguna-logistics/laguna-logistics-1.jpg' },
        { id: 'rj-auto-shop', name: 'RJ Auto Shop', category: 'establishments', lat: 14.2005, lng: 121.1540, full_address: 'Calamba City, Laguna', image_path: '../assets/places/rj-auto-shop/rj-auto-shop-1.jpg' },
        { id: 'news-star', name: 'News Star', category: 'establishments', lat: 14.2120, lng: 121.1650, full_address: 'Calamba City, Laguna', image_path: '../assets/places/news-star/news-star-1.jpg' },
        // Schools
        { id: 'letran-calamba', name: 'Colegio de San Juan de Letran – Calamba', category: 'schools', lat: 14.1880, lng: 121.1650, full_address: 'Ipil-ipil St., Bucal, Calamba City, Laguna', image_path: '../assets/places/letran-calamba/letran-calamba-1.jpg' },
        { id: 'halang-elementary', name: 'Halang Elementary School', category: 'schools', lat: 14.1910, lng: 121.1620, full_address: 'Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/halang-elementary-school/halang-elementary-school-1.jpg' },
        // Eateries
        { id: 'jollibee-real', name: 'Jollibee – Real, Calamba City', category: 'eateries', lat: 14.2025, lng: 121.1575, full_address: 'National Highway, Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/jollibee-real-calamba/jollibee-real-calamba-1.jpg' },
        { id: 'mang-inasal-halang', name: 'Mang Inasal – Halang, Calamba', category: 'eateries', lat: 14.1920, lng: 121.1625, full_address: 'National Highway, Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/mang-inasal-halang-calamba/mang-inasal-halang-calamba-1.jpg' },
        { id: 'creekside-halang', name: 'Creekside Halang', category: 'eateries', lat: 14.1905, lng: 121.1615, full_address: 'Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/creekside-halang/creekside-halang-1.jpg' },
        { id: 'dear-hotpot', name: 'Dear Hotpot – Unlimited Japanese Hotpot', category: 'eateries', lat: 14.2030, lng: 121.1570, full_address: 'Calamba City, Laguna', image_path: '../assets/places/dear-hotpot-unlimited-japanese-hotpot/dear-hotpot-unlimited-japanese-hotpot-1.jpg' },
        { id: 'd-fresco', name: "D' Fresco", category: 'eateries', lat: 14.2022, lng: 121.1555, full_address: 'Calamba City, Laguna', image_path: '../assets/places/d-fresco/d-fresco-1.jpg' },
        { id: 'rsm-lutong-bahay', name: 'RSM Lutong Bahay – Real, Calamba', category: 'eateries', lat: 14.2008, lng: 121.1562, full_address: 'Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/rsm-lutong-bahay-real-calamba/rsm-lutong-bahay-real-calamba-1.jpg' },
        // Coffee Shops
        { id: 'krav-cafe', name: 'Krav Cafe', category: 'coffee', lat: 14.2015, lng: 121.1560, full_address: 'Calamba City, Laguna', image_path: '../assets/places/krav-cafe/krav-cafe-1.jpg' },
        // Establishments
        { id: 'd-and-q', name: 'D & Q', category: 'establishments', lat: 14.2010, lng: 121.1580, full_address: 'Calamba City, Laguna', image_path: '../assets/places/d-and-q/d-and-q-1.jpg' },
        { id: 'morales-bercasio', name: 'Morales Bercasio', category: 'establishments', lat: 14.2045, lng: 121.1585, full_address: 'Calamba City, Laguna', image_path: '../assets/places/morales-bercasio/morales-bercasio-1.jpg' },
    ];

    let categoryMarkers = [];

    // 360 Photosphere Links Cache & Integration
    const place360LinksMap = new Map();
    const manifestNodesMap = new Map();
    // Reverse index: nodeId -> { placeId, placeName } (used by the category-independent
    // proximity click handler below, so we don't need a place record to show a 360 popup)
    const nodeIdToPlaceMap = new Map();
    let load360LinksPromise = null;

    function load360Links() {
        if (!load360LinksPromise) {
            load360LinksPromise = (async () => {
                try {
                    const [linksRes, manifestRes] = await Promise.allSettled([
                        fetch('../assets/360/place-links.json'),
                        fetch('../assets/360/manifest.json')
                    ]);
                    if (manifestRes.status === 'fulfilled' && manifestRes.value.ok) {
                        const mData = await manifestRes.value.json();
                        (mData.nodes || []).forEach(n => manifestNodesMap.set(n.id, n));
                    }
                    if (linksRes.status === 'fulfilled' && linksRes.value.ok) {
                        const lData = await linksRes.value.json();
                        (lData.links || []).forEach(link => {
                            if (link.placeId) {
                                place360LinksMap.set(String(link.placeId).trim(), link);
                            }
                            if (link.placeName) {
                                place360LinksMap.set(link.placeName.trim().toLowerCase(), link);
                            }
                            if (link.nodeId) {
                                nodeIdToPlaceMap.set(link.nodeId, { placeId: link.placeId, placeName: link.placeName });
                            }
                        });
                    }
                } catch (err) {
                    console.warn('[360 Links] Error loading 360 data in planner:', err);
                }

                // Once both datasets are in memory, wire up the always-on proximity click
                // handler so 360 popups no longer depend on a category tab being active.
                setupGlobal360ProximityClick();
            })();
        }
        return load360LinksPromise;
    }

    // Preload 360 links on startup
    load360Links();

    /**
     * ISSUE FIX: previously, the only way to see a "View 360°" popup was to
     * 1) click a category tab (e.g. "Schools") so its markers render, then
     * 2) click the exact marker.
     * This meant 360 points attached to Eateries/Terminals/etc. (or any spot the
     * user taps that is merely NEAR a 360 node, not exactly on it) were unreachable.
     *
     * This handler listens on the map itself, independent of any category filter,
     * finds the nearest 360 node/place within NEARBY_360_THRESHOLD_METERS of the
     * clicked point, and shows a lightweight popup with the same "View 360°" action.
     */
    const NEARBY_360_THRESHOLD_METERS = 35;
    let global360ClickBound = false;

    function findNearest360Node(lat, lng) {
        let nearest = null;
        let nearestDist = Infinity;
        manifestNodesMap.forEach((node) => {
            const d = getHaversineDist(lat, lng, node.lat, node.lng) * 1000; // km -> m
            if (d < nearestDist) {
                nearestDist = d;
                nearest = node;
            }
        });
        if (!nearest || nearestDist > NEARBY_360_THRESHOLD_METERS) return null;
        return { node: nearest, distance: nearestDist };
    }

    function build360OnlyPopupHtml(node, distance, placeInfo) {
        const photoUrl = `../assets/360/${encodeURIComponent(node.file)}`;
        const title = placeInfo && placeInfo.placeName ? placeInfo.placeName : 'Street-level 360° view';
        const subtitle = placeInfo && placeInfo.placeName
            ? `${Math.round(distance)}m away`
            : `Nearest 360° photo · ${Math.round(distance)}m away`;

        return `
            <div class="calzada-marker-popup calzada-360-only-popup">
                <div class="popup-360-container" style="margin-top:0;">
                    <div class="popup-360-thumb-wrap" onclick="window._open360Viewer('${node.id}')" title="Click to view 360° photo">
                        <img src="${photoUrl}" alt="360° view" class="popup-360-thumb" loading="lazy">
                        <span class="popup-360-badge">360°</span>
                    </div>
                    <div class="popup-body-content" style="padding-top:8px;">
                        <div class="popup-place-name">${title}</div>
                        <div class="popup-place-addr">${subtitle}</div>
                        <div class="popup-360-action-wrap">
                            <button type="button" class="popup-360-btn" onclick="window._open360Viewer('${node.id}')">
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
            </div>
        `;
    }

    function setupGlobal360ProximityClick() {
        if (global360ClickBound || !map) return;
        global360ClickBound = true;

        map.on('click', (e) => {
            // Don't hijack clicks that already landed on an existing marker/popup —
            // those already have their own (richer) popup with the 360 thumbnail.
            const targetEl = e.originalEvent && e.originalEvent.target;
            if (targetEl && targetEl.closest && (targetEl.closest('.calzada-custom-marker') || targetEl.closest('.maplibregl-popup'))) {
                return;
            }

            const { lat, lng } = e.lngLat;
            const match = findNearest360Node(lat, lng);
            if (!match) return; // nothing 360-capable close enough to this tap

            const placeInfo = nodeIdToPlaceMap.get(match.node.id);

            // Close any existing plain popups before opening this one
            document.querySelectorAll('.calzada-360-only-popup').forEach(p => {
                const wrap = p.closest('.maplibregl-popup');
                if (wrap) wrap.remove();
            });

            new maplibregl.Popup({
                offset: [0, 0],
                closeButton: true,
                className: 'calzada-maplibre-popup'
            })
                .setLngLat([match.node.lng, match.node.lat])
                .setHTML(build360OnlyPopupHtml(match.node, match.distance, placeInfo))
                .addTo(map);
        });
    }

    function getPlace360Link(place) {
        if (!place) return null;
        if (place.id && place360LinksMap.has(String(place.id).trim())) {
            return place360LinksMap.get(String(place.id).trim());
        }
        if (place.name && place360LinksMap.has(place.name.trim().toLowerCase())) {
            return place360LinksMap.get(place.name.trim().toLowerCase());
        }
        return null;
    }

    function renderPlacesOnMap(places) {
        // Clear existing markers
        categoryMarkers.forEach(m => m.remove());
        categoryMarkers = [];

        // TEMPORARY RESTRICTION: Only render markers for Malls and Schools categories.
        // Skip Eateries, Terminals, Coffee Shops, and Establishments entirely for now.
        // NOTE: This is a temporary data restriction; to re-enable other categories, remove this filter.
        const allowedCategories = ['malls', 'schools'];
        const filteredPlaces = (places || []).filter(place => {
            const cat = (place.category || '').trim().toLowerCase();
            return allowedCategories.includes(cat);
        });

        filteredPlaces.forEach(place => {
            const meta = CATEGORY_META[place.category] || { icon: 'location-outline', color: '#6366F1', label: place.category };
            const lat = parseFloat(place.lat);
            const lng = parseFloat(place.lng);
            if (isNaN(lat) || isNaN(lng)) return;

            const addr = place.full_address || place.barangay || '';

            const iconEl = document.createElement('div');
            iconEl.className = 'calzada-custom-marker';
            iconEl.innerHTML = `
                <div class="calzada-pin-wrapper" style="--pin-color: ${meta.color};">
                    <div class="calzada-pin-body">
                        <ion-icon name="${meta.icon}"></ion-icon>
                    </div>
                </div>
            `;

            const imageHtml = place.image_path
                ? `<div class="popup-img-container"><img src="${resolvePlaceImageUrl(place.image_path)}" alt="${place.name}" class="popup-place-img" onerror="this.parentElement.remove();"></div>`
                : '';

            // 360 Photosphere Thumbnail & "View 360°" Action (omitted if no link exists)
            const link360 = getPlace360Link(place);
            let place360Html = '';
            if (link360 && link360.nodeId) {
                const node = manifestNodesMap.get(link360.nodeId);
                const photoFilename = node ? node.file : `${link360.nodeId.replace('_', ', ')}.jpg`;
                const photoUrl = `../assets/360/${encodeURIComponent(photoFilename)}`;

                place360Html = `
                    <div class="popup-360-container">
                        <div class="popup-360-thumb-wrap" onclick="window._open360Viewer('${link360.nodeId}')" title="Click to view 360° photo">
                            <img src="${photoUrl}" alt="${place.name} 360°" class="popup-360-thumb" loading="lazy">
                            <span class="popup-360-badge">360°</span>
                        </div>
                        <div class="popup-360-action-wrap">
                            <button type="button" class="popup-360-btn" onclick="window._open360Viewer('${link360.nodeId}')">
                                <svg class="popup-360-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="9"/>
                                    <path d="M3.6 9h16.8M3.6 15h16.8"/>
                                    <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
                                </svg>
                                <span>View 360°</span>
                            </button>
                        </div>
                    </div>
                `;
            }

            const popupContent = `
                <div class="calzada-marker-popup">
                    ${imageHtml}
                    <div class="popup-body-content">
                        <div class="popup-cat-badge" style="color: ${meta.color};">${meta.label}</div>
                        <div class="popup-place-name">${place.name}</div>
                        <div class="popup-place-addr">${addr}</div>
                        ${place360Html}
                        <button type="button" class="popup-action-btn" onclick="window._setPlannerDestination('${place.name.replace(/'/g, "\\'")}', ${lat}, ${lng})">
                            <ion-icon name="navigate-outline"></ion-icon> Set as Destination
                        </button>
                    </div>
                </div>
            `;

            const popup = new maplibregl.Popup({
                offset: [0, -32],
                closeButton: true,
                className: 'calzada-maplibre-popup'
            }).setHTML(popupContent);

            const marker = new maplibregl.Marker({
                element: iconEl,
                anchor: 'bottom'
            })
                .setLngLat([lng, lat])
                .setPopup(popup)
                .addTo(map);

            categoryMarkers.push(marker);
        });
    }

    async function renderCategoryPlaces(selectedCategory = 'none') {
        categoryMarkers.forEach(m => m.remove());
        categoryMarkers = [];

        // If 'none' or empty: render NO markers (keep map clean)
        if (!selectedCategory || selectedCategory === 'none') {
            return;
        }

        // Ensure 360 link mappings are loaded
        await load360Links();

        let queryCat = selectedCategory;
        if (selectedCategory === 'terminals') {
            queryCat = 'terminal';
        }

        let endpoint = '/api/places';
        if (selectedCategory !== 'all') {
            endpoint += `?category=${encodeURIComponent(queryCat)}`;
        }

        try {
            const response = await fetch(endpoint);
            if (!response.ok) throw new Error('API error');
            let places = await response.json();
            if (Array.isArray(places) && places.length > 0) {
                if (selectedCategory === 'terminals') {
                    places = places.filter(p => (p.category || '').toLowerCase().includes('terminal') || (p.category || '').toLowerCase() === 'stop');
                }
                renderPlacesOnMap(places);
                return;
            }
        } catch (err) {
            console.warn('Failed to fetch places from API, using fallback data:', err.message);
        }

        // Fallback: use hardcoded data
        let fallback = CALAMBA_PLACES_FALLBACK;
        if (selectedCategory !== 'all') {
            fallback = CALAMBA_PLACES_FALLBACK.filter(p => {
                const c = (p.category || '').toLowerCase();
                if (selectedCategory === 'terminals') {
                    return c.includes('terminal');
                }
                return c === selectedCategory.toLowerCase();
            });
        }
        renderPlacesOnMap(fallback);
    }

    // Expose global helper for popup button
    window._setPlannerDestination = (name, lat, lng) => {
        const destInput = document.getElementById('destInput');
        if (destInput) {
            destInput.value = name;
        }
        destPlaceName = name;
        selectedCoords.destination = [lat, lng];
        const openPopups = document.querySelectorAll('.maplibregl-popup');
        openPopups.forEach(p => p.remove());
        if (typeof calculateAndDisplayRoute === 'function') {
            calculateAndDisplayRoute();
        }
    };

    // Global helper for opening full-screen 360 viewer starting at linked nodeId
    window._open360Viewer = function(nodeId) {
        if (!nodeId) return;
        console.log('[Calzada 360] Requesting 360° viewer at node:', nodeId);

        // Dispatch custom event for upcoming full-screen viewer module
        window.dispatchEvent(new CustomEvent('calzada:open-360', {
            detail: { nodeId }
        }));

        // If a dedicated full-screen viewer launcher function is mounted
        if (typeof window.launch360Viewer === 'function') {
            return window.launch360Viewer(nodeId);
        }

        // Build/display responsive modal preview shell
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
                                <path d="M11.5 3a17 17 0 0 1 0 18M12.5 3a17 17 0 0 1 0 18"/>
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
            if (closeBtn) {
                closeBtn.onclick = () => viewerModal.classList.remove('active');
            }
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
        const photoUrl = `../assets/360/${encodeURIComponent(photoFilename)}`;

        if (modalImg) modalImg.src = photoUrl;
        if (nodeText) nodeText.textContent = `360° Photosphere · ${nodeId}`;
        if (pillText) pillText.textContent = `Node: ${nodeId}`;

        viewerModal.classList.add('active');
    };


    // Category Filter Segmented Control & Contextual Clear Logic
    const categoryBar = document.getElementById('mapCategoryBar');
    const catClearBtn = document.getElementById('mapCatClearBtn');
    const catFadeOverlay = document.getElementById('categoryScrollFade');

    if (categoryBar) {
        const segments = categoryBar.querySelectorAll('.map-segment-btn');

        // Toggle fade overlay visibility based on horizontal scroll position
        const updateCategoryScrollFade = () => {
            if (!catFadeOverlay) return;
            const maxScroll = categoryBar.scrollWidth - categoryBar.clientWidth;
            // Disappear if contents fit or when fully scrolled to the right (within 2px tolerance)
            if (maxScroll <= 2 || categoryBar.scrollLeft >= maxScroll - 2) {
                catFadeOverlay.classList.remove('visible');
            } else {
                catFadeOverlay.classList.add('visible');
            }
        };

        // Standard scroll event listener (broadly supported across all browsers)
        categoryBar.addEventListener('scroll', updateCategoryScrollFade, { passive: true });
        window.addEventListener('resize', updateCategoryScrollFade, { passive: true });

        // Wheel handler: support trackpad and mouse-wheel horizontal scrolling in desktop/emulation mode
        categoryBar.addEventListener('wheel', (e) => {
            if (e.deltaX === 0 && Math.abs(e.deltaY) > 0) {
                const maxScroll = categoryBar.scrollWidth - categoryBar.clientWidth;
                if (maxScroll > 2) {
                    categoryBar.scrollLeft += e.deltaY;
                    e.preventDefault();
                }
            }
        }, { passive: false });

        // Initial check and deferred checks for layout/webfonts settling
        updateCategoryScrollFade();
        setTimeout(updateCategoryScrollFade, 100);
        setTimeout(updateCategoryScrollFade, 400);

        const setCategoryActive = (category) => {
            let activeFound = false;
            segments.forEach(btn => {
                const btnCat = btn.getAttribute('data-category');
                if (btnCat === category && category !== 'none') {
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                    activeFound = true;
                } else {
                    btn.classList.remove('active');
                    btn.setAttribute('aria-selected', 'false');
                }
            });

            if (catClearBtn) {
                if (activeFound) {
                    catClearBtn.classList.add('visible');
                } else {
                    catClearBtn.classList.remove('visible');
                }
            }

            // Recalculate fade overlay visibility in case Clear button appearing/disappearing resized the container
            requestAnimationFrame(updateCategoryScrollFade);

            renderCategoryPlaces(activeFound ? category : 'none');
        };

        segments.forEach(btn => {
            btn.addEventListener('click', () => {
                const wasActive = btn.classList.contains('active');
                if (wasActive) {
                    // Toggle off if already active
                    setCategoryActive('none');
                } else {
                    const cat = btn.getAttribute('data-category') || 'none';
                    setCategoryActive(cat);
                }
            });
        });

        if (catClearBtn) {
            catClearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                setCategoryActive('none');
            });
        }
    }

    // Initial load: do NOT render any category markers on the map
    renderCategoryPlaces('none');

    // Routing State
    let currentWalkDist = 0, currentWalkDur = 0, currentTransitDist = 0, currentTransitDur = 0;
    let currentFare = 0;
    let walkRouteGeojson = null, transitRouteGeojson = null;
    let currentCorridor = 'unknown'; // FIX: was referenced but never declared

    // ── CONSTANTS ──────────────────────────────────────────────────────────
    const WALK_SPEED_KPH      = 4.6;   // realistic commute walk pace (~13 min/km or ~4.6 km/h)
    const JEEPNEY_SPEED_KPH   = 20;    // avg jeepney speed (km/h)
    const BOARDING_BUFFER_SEC = 180;   // 3-min boarding buffer added to transit ETA
    const STORAGE_KEY         = 'calzada_journey';

    // Helper: compute realistic walking duration in minutes from kilometers (minimum 1 min)
        // Helper: deduplicate consecutive identical navigation steps and merge distances
    const deduplicateSteps = (steps) => {
        if (!steps || !steps.length) return [];
        const res = [];
        for (let i = 0; i < steps.length; i++) {
            const curr = steps[i];
            if (res.length > 0) {
                const prev = res[res.length - 1];
                const sameType = prev.maneuver?.type === curr.maneuver?.type;
                const sameMod  = (prev.maneuver?.modifier || '') === (curr.maneuver?.modifier || '');
                const sameName = (prev.name || '').trim().toLowerCase() === (curr.name || '').trim().toLowerCase();
                const sameMode = prev.mode === curr.mode;
                if (sameType && sameMod && sameName && sameMode) {
                    prev.distance = (prev.distance || 0) + (curr.distance || 0);
                    continue;
                }
            }
            res.push({ ...curr });
        }
        return res;
    };

    // Helper: update bottom pill fare display (shows "Free" with no PHP label in Walk mode)
    const updatePillFareUI = () => {
        const pillPhp = document.getElementById('pillPhp');
        const pillPhpLbl = document.getElementById('pillPhpLbl');
        if (!pillPhp) return;
        if (selectedMode === 'walking') {
            pillPhp.textContent = 'Free';
            if (pillPhpLbl) pillPhpLbl.textContent = '';
        } else {
            pillPhp.textContent = `₱${currentFare}`;
            if (pillPhpLbl) pillPhpLbl.textContent = 'php';
        }
    };

    const computeWalkDurationMin = (distKm) => {
        return Math.max(1, Math.round((distKm / WALK_SPEED_KPH) * 60));
    };

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
            if (midpointBubbleMarker) midpointBubbleMarker.addTo(map);
        } else {
            b.style.display = 'none';
            if (midpointBubbleMarker) midpointBubbleMarker.remove();
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
        userExplicitMode = false;
        selectedCoords.origin = null;
        selectedCoords.destination = null;
        originPlaceName = '';
        destPlaceName = '';
        updateODDisplay();
        
        if (originMarker) { originMarker.remove(); originMarker = null; }
        if (destMarker) { destMarker.remove(); destMarker = null; }
        updateRouteSource('walk-route', []);
        updateRouteSource('transit-route', []);
        updateRouteSource('completed-route', []);
        if (midpointBubbleMarker) { midpointBubbleMarker.remove(); midpointBubbleMarker = null; }
        if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }
        
        document.getElementById('transportModesBlock').style.display = 'none';
        document.getElementById('routeSummaryBlock').style.display = 'none';
        const walkHintEl = document.getElementById('walkableTripHint');
        if (walkHintEl) walkHintEl.style.display = 'none';
        document.getElementById('startJourneyBtn').disabled = true;
        document.getElementById('closeDirectionsBtn').style.display = 'none';
        
        // Clear chatbot context
        window._calzadaRouteContext = null;
        
        updateMidpointBubbleVisibility(false);
        
        if (currentLocation && currentLocation.lat && currentLocation.lng) {
            map.flyTo({ center: [currentLocation.lng, currentLocation.lat], zoom: 14 });
        } else {
            map.flyTo({ center: [121.1652, 14.2117], zoom: 13 });
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

    // Mode Selection (Single source of truth for all mode-toggle UI elements)
    const setModeUI = (mode) => {
        document.querySelectorAll('.segment-btn[data-mode]').forEach(btn => {
            const isActive = btn.dataset.mode === mode;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        const amtWalk = document.getElementById('amtWalk');
        const amtJeep = document.getElementById('amtJeep');
        if (amtWalk) {
            amtWalk.classList.toggle('active', mode === 'walking');
            amtWalk.setAttribute('aria-selected', mode === 'walking' ? 'true' : 'false');
        }
        if (amtJeep) {
            amtJeep.classList.toggle('active', mode === 'jeepney');
            amtJeep.setAttribute('aria-selected', mode === 'jeepney' ? 'true' : 'false');
        }
    };

    document.getElementById('modeWalking').addEventListener('click', () => {
        userExplicitMode = true;
        selectedMode = 'walking';
        setModeUI('walking');
        executeRouteQuery();
    });
    document.getElementById('modeJeepney').addEventListener('click', () => {
        userExplicitMode = true;
        selectedMode = 'jeepney';
        setModeUI('jeepney');
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
            const walkHintEl = document.getElementById('walkableTripHint');
            if (walkHintEl) walkHintEl.style.display = 'none';
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
        const straightDistM = getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000;

        // Intelligent default: for very short trips under ~800m, default to walking unless user explicitly chose a mode
        if (!userExplicitMode) {
            selectedMode = (straightDistM < 800) ? 'walking' : 'jeepney';
        }
        setModeUI(selectedMode);

        // Always show mode buttons
        document.getElementById('modeWalking').style.display  = 'inline-flex';
        document.getElementById('modeJeepney').style.display  = 'inline-flex';

        // Draw Markers
        if (originMarker) { originMarker.remove(); originMarker = null; }
        if (destMarker)   { destMarker.remove();   destMarker = null; }

        const oEl = document.createElement('div');
        oEl.innerHTML = `<div style="width:16px;height:16px;background:#1C6EF2;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(28,110,242,0.5);"></div>`;
        originMarker = new maplibregl.Marker({
            element: oEl.firstElementChild || oEl,
            anchor: 'center'
        }).setLngLat(toLngLat(oPt)).addTo(map);

        const dEl = document.createElement('div');
        dEl.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M14 0C6.268 0 0 6.268 0 14c0 8.75 14 22 14 22S28 22.75 28 14C28 6.268 21.732 0 14 0z" fill="#ef4444"/>
            <circle cx="14" cy="14" r="6" fill="white"/>
        </svg>`;
        destMarker = new maplibregl.Marker({
            element: dEl.firstElementChild || dEl,
            anchor: 'bottom'
        }).setLngLat(toLngLat(dPt)).addTo(map);

        // ── WALKING MODE: pure foot route from origin to destination ───────────
        if (selectedMode === 'walking') {
            if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }

            let wRes = null;
            try {
                wRes = await fetchOSRMRouteCoords(oPt, dPt, 'foot');
            } catch (e) { console.error('Walk OSRM error:', e); }

            if (!wRes || !wRes.coordinates || wRes.coordinates.length < 2) {
                const dist = getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000;
                wRes = { coordinates: [oPt, dPt], distance: dist, duration: (dist / 1000 / WALK_SPEED_KPH) * 3600, steps: [] };
            }

            walkRouteGeojson    = wRes;
            transitRouteGeojson = { coordinates: [], distance: 0, duration: 0, steps: [] };

            currentWalkDist    = wRes.distance / 1000;
            currentWalkDur     = computeWalkDurationMin(currentWalkDist);
            currentTransitDist = 0;
            currentTransitDur  = 0;
            currentFare        = 0;

            drawRoutes(wRes.coordinates, []);
            
            // Populate Guide turn-by-turn steps immediately for Walk mode
            window.activeRouteSteps = deduplicateSteps((wRes.steps || []).map(s => ({ ...s, mode: 'foot' })));
            window.currentStepIndex = 0;
            updateGuideStepsUI();

            updateSummaryRow();
            updatePillFareUI();
            saveJourneyState();

            // Subtle walkable distance indicator
            const walkHintEl = document.getElementById('walkableTripHint');
            if (walkHintEl) {
                const totalWalkM = Math.round(wRes.distance || straightDistM);
                if (totalWalkM < 800) {
                    walkHintEl.innerHTML = `<ion-icon name="walk-outline"></ion-icon><span>This distance is walkable (~${totalWalkM < 1000 ? totalWalkM + 'm' : (totalWalkM / 1000).toFixed(1) + 'km'})</span>`;
                    walkHintEl.style.display = 'inline-flex';
                } else {
                    walkHintEl.style.display = 'none';
                }
            }

            document.getElementById('startJourneyBtn').disabled = false;
            document.getElementById('transportModesBlock').style.display = 'flex';
            document.getElementById('routeSummaryBlock').style.display  = 'block';
            return;
        }

        // ── JEEPNEY MODE: walk to boarding point + transit on highway ───────────
        let fullCarRes = null;
        try {
            fullCarRes = await fetchOSRMRouteCoords(oPt, dPt, 'car');
        } catch (e) { console.error('Transit preliminary OSRM error:', e); }

        if (!fullCarRes) {
            fullCarRes = {
                coordinates: [oPt, dPt],
                distance: getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000,
                duration: (getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) / 20) * 3600,
                steps: []
            };
        }

        // Strategy: find step containing "Highway", "National", or "Maharlika"
        const HIGHWAY_KEYWORDS = ['national highway', 'maharlika', 'highway', 'diversion', 'road 1'];
        const findHighwayBoardingPoint = (routeResult) => {
            const steps = routeResult.steps || [];
            for (let i = 0; i < steps.length; i++) {
                const name = (steps[i].name || '').toLowerCase();
                if (HIGHWAY_KEYWORDS.some(k => name.includes(k))) {
                    const geom = steps[i].geometry?.coordinates;
                    if (geom && geom.length > 0) return [geom[0][1], geom[0][0]]; // [lat, lng]
                }
            }
            for (let i = 1; i < routeResult.coordinates.length; i++) {
                const d = getHaversineDist(oPt[0], oPt[1],
                    routeResult.coordinates[i][0], routeResult.coordinates[i][1]) * 1000;
                if (d > 80) return routeResult.coordinates[i];
            }
            return routeResult.coordinates[0];
        };

        const boardingPt = findHighwayBoardingPoint(fullCarRes);
        const walkDistM  = getHaversineDist(oPt[0], oPt[1], boardingPt[0], boardingPt[1]) * 1000;

        // Fetch walking leg from origin to highway boarding point
        let wRes = null;
        try {
            wRes = await fetchOSRMRouteCoords(oPt, boardingPt, 'foot');
        } catch (e) { console.error('Walk to boarding point OSRM error:', e); }

        if (!wRes || !wRes.coordinates || wRes.coordinates.length < 2) {
            wRes = {
                coordinates: [oPt, boardingPt],
                distance: Math.max(walkDistM, 50),
                duration: Math.max(30, (Math.max(walkDistM, 50) / 1000 / WALK_SPEED_KPH) * 3600),
                steps: []
            };
        }

        // Fetch transit leg directly from boarding point to destination (avoids duplicate walking steps)
        let tRes = null;
        try {
            tRes = await fetchOSRMRouteCoords(boardingPt, dPt, 'car');
        } catch (e) { console.error('Transit leg OSRM error:', e); }

        if (!tRes || !tRes.coordinates || tRes.coordinates.length < 2) {
            // Fallback: trim fullCarRes from boarding point
            let trimIdx = 0;
            let minTrimDist = Infinity;
            for (let i = 0; i < fullCarRes.coordinates.length; i++) {
                const d = getHaversineDist(boardingPt[0], boardingPt[1],
                    fullCarRes.coordinates[i][0], fullCarRes.coordinates[i][1]) * 1000;
                if (d < minTrimDist) { minTrimDist = d; trimIdx = i; }
            }
            tRes = {
                coordinates: fullCarRes.coordinates.slice(trimIdx),
                distance: Math.max(100, fullCarRes.distance - (wRes.distance || walkDistM || 0)),
                duration: Math.max(60, fullCarRes.duration),
                steps: fullCarRes.steps || []
            };
        }

        walkRouteGeojson    = wRes;
        transitRouteGeojson = tRes;

        currentWalkDist = wRes.distance / 1000;
        currentWalkDur  = computeWalkDurationMin(currentWalkDist);
        currentTransitDist = tRes.distance / 1000;

        // Jeepney speed correction: real jeepney avg (~20 km/h) + boarding buffer
        const correctedTransitDur = (currentTransitDist / JEEPNEY_SPEED_KPH) * 3600 + BOARDING_BUFFER_SEC;
        currentTransitDur = Math.ceil(correctedTransitDur / 60);

        // Single centralized fare calculation based on actual transit distance
        currentFare = computeLTFRBFare(currentTransitDist);

        drawRoutes(wRes.coordinates, tRes.coordinates);

        // Populate Guide turn-by-turn steps immediately for Jeepney multi-leg
        const walkStepsClean = (wRes.steps || []).filter(s => s.maneuver?.type !== 'arrive').map(s => ({ ...s, mode: 'foot' }));
        const transitStepsClean = (tRes.steps || []).map(s => ({ ...s, mode: 'driving' }));
        window.activeRouteSteps = deduplicateSteps([...walkStepsClean, ...transitStepsClean]);
        window.currentStepIndex = 0;
        updateGuideStepsUI();

        updateSummaryRow();
        updatePillFareUI();
        saveJourneyState();

        // Subtle note for short trips if Jeepney mode is selected
        const walkHintEl = document.getElementById('walkableTripHint');
        if (walkHintEl) {
            const totalTripM = Math.round((currentWalkDist + currentTransitDist) * 1000 || straightDistM);
            if (totalTripM < 800) {
                walkHintEl.innerHTML = `<ion-icon name="information-circle-outline"></ion-icon><span>Short trip (~${totalTripM < 1000 ? totalTripM + 'm' : (totalTripM / 1000).toFixed(1) + 'km'}) · Walk is walkable</span>`;
                walkHintEl.style.display = 'inline-flex';
            } else {
                walkHintEl.style.display = 'none';
            }
        }

        document.getElementById('startJourneyBtn').disabled = false;
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
                const distM = rt.distance;
                // Note: OSRM public demo server returns vehicle-speed durations (~22 km/h) for 'foot'.
                // For walking routes, compute realistic duration using WALK_SPEED_KPH (~4.6 km/h / ~13 min/km).
                const realisticDuration = profile === 'foot'
                    ? (distM / 1000 / WALK_SPEED_KPH) * 3600
                    : rt.duration;
                return {
                    coordinates: rt.geometry.coordinates.map(c => [c[1], c[0]]),
                    distance: distM,
                    duration: realisticDuration,
                    steps: rt.legs[0]?.steps || []
                };
            }
        } catch(e) { console.error('OSRM Error:', e); }
        return null;
    };

    const computeLTFRBFare = (distKm) => {
        const base = 14, perKm = 2.00; // Traditional Jeepney LTFRB fare: ₱14 for first 4 km, +₱2.00/km excess
        if (!distKm || distKm <= 4) return base;
        const total = base + (distKm - 4) * perKm;
        return Math.round(total); // rounded to nearest whole peso
    };

    const drawRoutes = (walkCoords, transitCoords) => {
        if (midpointBubbleMarker) { midpointBubbleMarker.remove(); midpointBubbleMarker = null; }
        if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }

        const modeColor = selectedMode === 'walking' ? '#10b981' : '#378ADD';
        const isWalkOnly = selectedMode === 'walking';

        const safeWalkCoords = (walkCoords && walkCoords.length >= 2) ? walkCoords : (walkCoords && walkCoords.length === 1 ? [walkCoords[0], walkCoords[0]] : []);
        const walkLngLat = safeWalkCoords.map(c => [c[1], c[0]]);
        const transitLngLat = (transitCoords && transitCoords.length > 0) ? transitCoords.map(c => [c[1], c[0]]) : [];

        updateRouteSource('walk-route', walkLngLat);
        updateRouteSource('transit-route', isWalkOnly ? [] : transitLngLat);
        updateRouteSource('completed-route', []);

        if (map.getLayer('walk-route-layer')) {
            map.setPaintProperty('walk-route-layer', 'line-color', isWalkOnly ? '#10b981' : '#3b82f6');
            map.setPaintProperty('walk-route-layer', 'line-dasharray', isWalkOnly ? [1, 0] : [2, 2]);
        }
        if (map.getLayer('transit-route-layer')) {
            map.setPaintProperty('transit-route-layer', 'line-color', modeColor);
        }

        if (!isWalkOnly && transitCoords && transitCoords.length > 1) {
            // Boarding point marker
            const bEl = document.createElement('div');
            bEl.innerHTML = `<div style="width:14px;height:14px;background:#ffffff;border:3px solid #3b82f6;border-radius:50%;box-shadow:0 1px 6px rgba(0,0,0,0.25);"></div>`;
            boardingMarker = new maplibregl.Marker({ element: bEl.firstElementChild || bEl, anchor: 'center' })
                .setLngLat(toLngLat(transitCoords[0]))
                .addTo(map);

            // Midpoint bubble
            const midNode = transitCoords[Math.floor(transitCoords.length / 2)];
            const bubbleEl = document.createElement('div');
            bubbleEl.className = 'custom-mid-bubble';
            bubbleEl.innerHTML = `<div class="route-bubble">${currentWalkDur + currentTransitDur} min</div>`;
            midpointBubbleMarker = new maplibregl.Marker({ element: bubbleEl, anchor: 'center' })
                .setLngLat(toLngLat(midNode));
            if (directionsCard.classList.contains('collapsed')) {
                midpointBubbleMarker.addTo(map);
            }
        }

        const bounds = new maplibregl.LngLatBounds();
        if (selectedCoords.origin) bounds.extend(toLngLat(selectedCoords.origin));
        if (selectedCoords.destination) bounds.extend(toLngLat(selectedCoords.destination));
        walkLngLat.forEach(pt => bounds.extend(pt));
        transitLngLat.forEach(pt => bounds.extend(pt));
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 60, maxZoom: 16 });
        }

        document.getElementById('startJourneyBtn').disabled = false;
        document.getElementById('closeDirectionsBtn').style.display = 'flex';
        setTimeout(() => map.resize(), 200);
    };

    const renderItinerary = () => {
        const container = document.getElementById('itineraryLegs');
        if (!container) return;
        container.innerHTML = '';

        const isWalkOnly = selectedMode === 'walking';

        // Helper: format meters
        const fmtM = (m) => m < 1000 ? `${Math.round(m / 50) * 50} m` : `${(m / 1000).toFixed(1)} km`;

        // ── WALK CARD ───────────────────────────────────────────────────────────
        const walkSteps  = walkRouteGeojson?.steps || [];
        const highwayName = walkSteps.length > 0
            ? (walkSteps[walkSteps.length - 1]?.name || 'National Highway')
            : 'National Highway';

        const walkTargetName = isWalkOnly ? (destPlaceName || 'Destination') : highwayName;
        const walkTitle = isWalkOnly
            ? `Walk to <strong>${walkTargetName}</strong>`
            : `Walk towards <strong>${walkTargetName}</strong>`;

        const walkCard = document.createElement('div');
        walkCard.className = 'leg-card';
        walkCard.innerHTML = `
            <div class="leg-icon-wrap">
                <div class="leg-icon-circle walk-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                    </svg>
                </div>
            </div>
            <div class="leg-content">
                <div class="leg-title">${walkTitle}</div>
                <div class="leg-sub">${fmtM(currentWalkDist * 1000)} · ${currentWalkDur} min</div>
            </div>`;
        container.appendChild(walkCard);

        if (isWalkOnly) return; // Walk-only mode: only one card

        // ── TRANSIT CARD ─────────────────────────────────────────────────────────
        const tSteps   = transitRouteGeojson?.steps || [];
        const boardAt  = tSteps.length > 0 ? (tSteps[0]?.name || highwayName) : highwayName;
        const alightStep = tSteps.length > 1
            ? tSteps.slice(0, -1).reverse().find(s => s.name && s.name !== '') : null;
        const alightAt = alightStep?.name || destPlaceName || 'Destination';

        const transitCard = document.createElement('div');
        transitCard.className = 'leg-card';
        transitCard.innerHTML = `
            <div class="leg-icon-wrap">
                <div class="leg-icon-circle jeep-icon">
                    <img src="../assets/icons/jeepney-icon.png" alt="Jeepney" class="leg-icon-img">
                </div>
            </div>
            <div class="leg-content">
                <div class="leg-title-row">
                    <span class="leg-title">Jeepney</span>
                    <span class="leg-fare-badge">₱${currentFare}</span>
                </div>
                <div class="leg-sub">${currentTransitDur} min · ${currentTransitDist.toFixed(1)} km</div>
                <div class="leg-route-stops">
                    <div class="leg-stop-line">
                        <div class="leg-stop-dot filled"></div>
                        <div class="leg-stop-connector"></div>
                        <div class="leg-stop-dot"></div>
                    </div>
                    <div class="leg-stop-details">
                        <div class="leg-stop-group">
                            <span class="leg-stop-tag">GET ON</span>
                            <span class="leg-stop-name">${boardAt}</span>
                        </div>
                        <div class="leg-stop-group">
                            <span class="leg-stop-tag">GET OFF</span>
                            <span class="leg-stop-name">${alightAt}</span>
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

        // Update chatbot context for Routie Assistant
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
                    : `Board Jeepney towards ${name}`;
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
        
        // Single source of truth: sync active mode UI and pill fare immediately
        setModeUI(selectedMode);
        updatePillFareUI();

        // Hide Directions Card
        directionsCard.classList.add('journey-active-hidden');

        // Show Active Nav Overlays
        activeGuideCard.style.display = 'flex';
        bottomStatusPill.style.display = 'flex';
        
        const elReminders = document.getElementById('remindersPillBtn');
        if (elReminders) elReminders.style.display = 'none';
        const elHamburger = document.getElementById('hamburgerBtn');
        if (elHamburger) elHamburger.style.display = 'none';
        const elCategoryBar = document.getElementById('mapCategoryBarWrapper');
        if (elCategoryBar) elCategoryBar.style.display = 'none';
        const elGoogleSignIn = document.getElementById('googleSignInBtn');
        if (elGoogleSignIn) elGoogleSignIn.style.display = 'none';
        const elUserProfileNav = document.getElementById('userProfileNav');
        if (elUserProfileNav) elUserProfileNav.style.display = 'none';
        const elAuthNavBtn = document.getElementById('authNavBtn');
        if (elAuthNavBtn) elAuthNavBtn.style.display = 'none';

        // Clean map markers, center on origin
        map.flyTo({ center: toLngLat(selectedCoords.origin), zoom: 17 });
        mapAutoFollow = true;
        isTrackingArrival = true;
        document.getElementById('reCenterBtn').style.display = 'none';

        startLiveTracking();
        // Persist active journey state immediately
        saveJourneyState();
        map.resize();
    });

    document.getElementById('cancelRouteBtn').addEventListener('click', () => {
        stopLiveTracking();
        
        updateRouteSource('walk-route', []);
        updateRouteSource('transit-route', []);
        updateRouteSource('completed-route', []);
        if (midpointBubbleMarker)     { midpointBubbleMarker.remove();     midpointBubbleMarker = null; }
        if (boardingMarker)           { boardingMarker.remove();           boardingMarker = null; }
        if (originMarker)             { originMarker.remove();             originMarker = null; }
        if (destMarker)               { destMarker.remove();               destMarker = null; }

        userExplicitMode = false;
        selectedCoords.origin = null;
        selectedCoords.destination = null;
        originPlaceName = '';
        destPlaceName = '';
        updateODDisplay();
        document.getElementById('transportModesBlock').style.display = 'none';
        document.getElementById('routeSummaryBlock').style.display = 'none';
        const walkHintEl = document.getElementById('walkableTripHint');
        if (walkHintEl) walkHintEl.style.display = 'none';
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
        if (userMarker) { userMarker.remove(); userMarker = null; }
        if (gpsCircle)  { gpsCircle = null; }
        // Restore origin marker if present
        if (originMarker) originMarker.addTo(map);

        // Reset map bearing to north
        map.setBearing(0);
        
        // Hide Active
        activeGuideCard.style.display = 'none';
        bottomStatusPill.style.display = 'none';
        
        const elReminders = document.getElementById('remindersPillBtn');
        if (elReminders) elReminders.style.display = '';
        const elHamburger = document.getElementById('hamburgerBtn');
        if (elHamburger) elHamburger.style.display = '';
        const elCategoryBar = document.getElementById('mapCategoryBarWrapper');
        if (elCategoryBar) elCategoryBar.style.display = '';
        const elGoogleSignIn = document.getElementById('googleSignInBtn');
        if (elGoogleSignIn) elGoogleSignIn.style.display = '';
        const elUserProfileNav = document.getElementById('userProfileNav');
        if (elUserProfileNav) elUserProfileNav.style.display = '';
        const elAuthNavBtn = document.getElementById('authNavBtn');
        if (elAuthNavBtn) elAuthNavBtn.style.display = '';
        
        // Restore Directions
        directionsCard.classList.remove('journey-active-hidden');
        directionsCard.style.display = '';
        directionsCard.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
        directionsCard.style.transform  = 'translateY(0px)';
        directionsCard.classList.add('expanded');
        directionsCard.classList.remove('collapsed');
        document.getElementById('dsPeekInfo').style.display = 'none';
        updateMidpointBubbleVisibility(false);
        map.resize();
    });

    // Expand bottom pill to show cancel button — only when clicking the pill body, not mode buttons
    bottomStatusPill.addEventListener('click', (e) => {
        if (e.target.closest('.btn-cancel-route')) return;
        if (e.target.closest('#amtJeep') || e.target.closest('#amtWalk')) return; // let mode buttons handle themselves
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
        map.flyTo({ center: [currentLocation.lng, currentLocation.lat], zoom: 17, duration: 600, essential: true });
        map.setBearing(0);
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

        updatePillFareUI();
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

        if (userMarker) { userMarker.remove(); userMarker = null; }
        if (originMarker) originMarker.remove(); // Hide origin circle so it doesn't sit under the pointer
        
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

        const uEl = document.createElement('div');
        uEl.innerHTML = `<div class="nav-cursor-wrapper">${POINTER_SVG}</div>`;
        userMarker = new maplibregl.Marker({
            element: uEl.firstElementChild || uEl,
            anchor: 'center',
            rotationAlignment: 'map'
        }).setLngLat([currentLocation.lng, currentLocation.lat]).addTo(map);

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
        if (userMarker) { userMarker.remove(); userMarker = null; }
        if (gpsCircle)  { gpsCircle = null; }
    };

    const handleLocationUpdate = async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        currentLocation = { lat: latitude, lng: longitude };
        
        userMarker.setLngLat([longitude, latitude]);
        // Auto-follow: fly smoothly to user location while mapAutoFollow is true
        if (mapAutoFollow) {
            map.flyTo({ center: [longitude, latitude], zoom: 17, duration: 800, essential: true });
        }

        // Keep step index current in session
        saveJourneyState();

        if (pos.coords.heading !== null && !isNaN(pos.coords.heading)) {
            const heading = pos.coords.heading;
            const compass = document.getElementById('compassSvg');
            if (compass) compass.style.transform = `rotate(${-heading}deg)`;

            const pointerEl = userMarker.getElement()?.querySelector('.nav-cursor-wrapper');
            if (pointerEl) {
                if (window.innerWidth <= 768) {
                    map.setBearing(heading);
                    // Map is rotating — counter-rotate marker to stay upright on screen
                    pointerEl.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
                    pointerEl.style.transform = `rotate(${-heading}deg)`;
                } else {
                    map.setBearing(0);
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

            const passCoords = transitRouteGeojson.coordinates.slice(0, closestIdx + 1).map(c => [c[1], c[0]]);
            const remainCoords = transitRouteGeojson.coordinates.slice(closestIdx).map(c => [c[1], c[0]]);
            
            // Sakay-style: completed = gray, remaining = mode color
            updateRouteSource('completed-route', passCoords);
            updateRouteSource('transit-route', remainCoords);

            remainingTimeSecs = (remainingDist / JEEPNEY_SPEED_KPH) * 3600; // jeepney ~20 km/h
        } else {
            // Walk leg: walk remaining + full transit time ahead
            const remFare = computeLTFRBFare(currentTransitDist, selectedMode);
            updatePillFareUI();

            const walkRemainingSecs = (remainingDist / WALK_SPEED_KPH) * 3600;   // 4 km/h realistic walk
            const transitAheadSecs  = currentTransitDur * 60;        // full transit duration
            remainingTimeSecs = walkRemainingSecs + transitAheadSecs;

            // Dim the walk polyline as user progresses
            const walkCoords = walkRouteGeojson.coordinates;
            const doneCoords = walkCoords.slice(0, closestIdx + 1).map(c => [c[1], c[0]]);
            const aheadCoords = walkCoords.slice(closestIdx).map(c => [c[1], c[0]]);
            if (doneCoords.length > 1) {
                updateRouteSource('completed-route', doneCoords);
            }
            if (aheadCoords.length > 1) {
                updateRouteSource('walk-route', aheadCoords);
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
                            updateRouteSource('walk-route', res.coordinates.map(c => [c[1], c[0]]));
                        } else {
                            transitRouteGeojson.coordinates = res.coordinates;
                            transitRouteGeojson.steps = res.steps;
                            updateRouteSource('completed-route', []);
                            updateRouteSource('transit-route', res.coordinates.map(c => [c[1], c[0]]));
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
        if (userMarker)  { userMarker.remove();  userMarker = null; }
        if (gpsCircle)   { gpsCircle = null; }
        if (originMarker) originMarker.addTo(map);
        map.setBearing(0);

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
          const modeLabel = 'JEEPNEY';
          const modeEmoji = '🚐';
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

        const menuIcon = document.querySelector('#hamburgerBtn .menu-toggle-icon');
        if (menuIcon) {
            menuIcon.classList.toggle('open', state);
        }
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
    const drawerRoutieBtn = document.getElementById('drawerRoutieLink');
    if (drawerRoutieBtn) {
        drawerRoutieBtn.addEventListener('click', () => {
            toggleDrawer(false);
            document.getElementById('chatWindow').classList.add('open');
        });
    }
    document.getElementById('closeChatBtn').addEventListener('click', () => {
        document.getElementById('chatWindow').classList.remove('open');
    });

    // =============================================
    // URL PARAMETERS LOGIC
    // =============================================
    // URL PARAMETERS — runs regardless of earlier errors
    try {
        const urlParams = new URLSearchParams(window.location.search);
        // URLSearchParams.get automatically decodes, so no decodeURIComponent needed
        const destName = urlParams.get('destName') || urlParams.get('dest') || '';
        const destLat  = parseFloat(urlParams.get('destLat')  || urlParams.get('dlat') || '');
        const destLng  = parseFloat(urlParams.get('destLng')  || urlParams.get('dlng') || '');

        if (destName) {
            destPlaceName = destName;
            updateODDisplay();

            if (!isNaN(destLat) && !isNaN(destLng)) {
                // Coordinates provided
                selectedCoords.destination = [destLat, destLng];
                if (destMarker) { destMarker.remove(); destMarker = null; }
                const dEl = document.createElement('div');
                dEl.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 0C6.268 0 0 6.268 0 14c0 8.75 14 22 14 22S28 22.75 28 14C28 6.268 21.732 0 14 0z" fill="#ef4444"/>
                    <circle cx="14" cy="14" r="6" fill="white"/>
                </svg>`;
                destMarker = new maplibregl.Marker({
                    element: dEl.firstElementChild || dEl,
                    anchor: 'bottom'
                }).setLngLat([destLng, destLat]).addTo(map);

                map.flyTo({ center: [destLng, destLat], zoom: 16 });
                setTimeout(() => map.resize(), 300);

                // Auto-open origin picker so user can complete the route
                setTimeout(() => openLocationModal('origin'), 400);
            } else {
                // Name only, no coordinates (e.g. from places.html)
                // Automatically geocode and set the destination, then ask for origin
                activeSelectingField = 'destination';
                
                // Hardcoded exact coordinates for all places in places.html for 100% reliability
                const PLACE_FINDER_COORDS = {
                    "calamba city hall": [14.20164, 121.16487],
                    "rizal shrine": [14.21415, 121.16664],
                    "sm city calamba": [14.19895, 121.16335],
                    "calamba central terminal": [14.19821, 121.16315],
                    "city college of calamba": [14.19502, 121.16104],
                    "sti college calamba": [14.19323, 121.16016],
                    "national museum": [14.58694, 120.98124],
                    "festival mall alabang": [14.41703, 121.04165],
                    "nuvali sta rosa": [14.23712, 121.05831],
                    "tagaytay": [14.10086, 120.93488]
                };

                const lowerName = destName.toLowerCase().trim();

                if (PLACE_FINDER_COORDS[lowerName]) {
                    // Exact match found in local dictionary
                    selectLocation(destName, PLACE_FINDER_COORDS[lowerName]);
                    setTimeout(() => openLocationModal('origin'), 500);
                } else {
                    // Fallback to ESRI geocoder if place name is custom/unknown
                    const fallbackCoords = [14.2045, 121.1641]; // Calamba center fallback
                    const esriUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(destName)}&location=121.1641,14.2045&distance=50000&countryCode=PHL&maxLocations=1&f=json`;
                    
                    fetch(esriUrl)
                        .then(res => res.json())
                        .then(data => {
                            if (data.candidates && data.candidates.length > 0) {
                                selectLocation(destName, [data.candidates[0].location.y, data.candidates[0].location.x]);
                            } else {
                                selectLocation(destName, fallbackCoords);
                            }
                            setTimeout(() => openLocationModal('origin'), 500);
                        })
                        .catch(() => {
                            selectLocation(destName, fallbackCoords);
                            setTimeout(() => openLocationModal('origin'), 500);
                        });
                }
            }
        }
    } catch (urlErr) {
        console.error('URL param error:', urlErr);
    }

    document.getElementById('amtJeep').addEventListener('click', () => switchActiveMode('jeepney'));
    document.getElementById('amtWalk').addEventListener('click', () => switchActiveMode('walking'));

    const switchActiveMode = async (newMode) => {
        if (selectedMode === newMode) return;
        userExplicitMode = true;
        selectedMode = newMode;
        setModeUI(newMode);

        // Trigger full route recalculation per mode
        await executeRouteQuery();
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
        selectedMode    = (state.selectedMode === 'walking' ? 'walking' : 'jeepney');
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
                            setModeUI(selectedMode);
                            const elReminders = document.getElementById('remindersPillBtn');
                            if (elReminders) elReminders.style.display = 'none';
                            const elHamburger = document.getElementById('hamburgerBtn');
                            if (elHamburger) elHamburger.style.display = 'none';
                            const elCategoryBar = document.getElementById('mapCategoryBarWrapper');
                            if (elCategoryBar) elCategoryBar.style.display = 'none';
                            const elGoogleSignIn = document.getElementById('googleSignInBtn');
                            if (elGoogleSignIn) elGoogleSignIn.style.display = 'none';
                            const elUserProfileNav = document.getElementById('userProfileNav');
                            if (elUserProfileNav) elUserProfileNav.style.display = 'none';
                            const elAuthNavBtn = document.getElementById('authNavBtn');
                            if (elAuthNavBtn) elAuthNavBtn.style.display = 'none';
                            mapAutoFollow = true;
                            isTrackingArrival = true;
                            document.getElementById('reCenterBtn').style.display = 'none';
                            // FIX ∗9: clamp indices to valid range after fresh route fetch
                            activeLegIndex = Math.min(state.activeLegIndex || 0, 1);
                            window.currentStepIndex = 0; // always restart from step 0 on recovery
                            startLiveTracking();
                            map.resize();
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
