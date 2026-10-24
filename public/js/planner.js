// =============================================
// CALZADA PLANNER — REBUILT ROUTING ENGINE (INTER-CITY ONLY)
// =============================================

function t(key, context) {
    let str = window.t ? window.t(key, context) : key;
    if (context && typeof context === 'object') {
        Object.entries(context).forEach(([k, v]) => {
            str = String(str).replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        });
    }
    return str;
}

function formatStepInstruction(step, mode, extra) {
    if (!step) return '';
    mode = mode || step.mode || 'foot';
    const rawName = (step.name || '').trim();
    const hasName = Boolean(rawName);
    const maneuverType = step.maneuver?.type || '';
    const mod = step.maneuver?.modifier || '';

    let isLastStep = undefined;
    let nextMode = undefined;
    let stopName = '';
    let getOffStop = '';
    let prevName = '';
    let prevText = '';
    let steps = null;
    let stepIndex = -1;
    let skipPrevCheck = false;

    if (typeof extra === 'boolean') {
        isLastStep = extra;
        nextMode = arguments[3] || undefined;
        stopName = (arguments[4] || '').trim();
    } else if (extra && typeof extra === 'object') {
        if (extra.isLastStep !== undefined) isLastStep = Boolean(extra.isLastStep);
        if (extra.nextMode !== undefined) nextMode = extra.nextMode;
        if (extra.stopName !== undefined) stopName = (extra.stopName || '').trim();
        if (extra.getOffStop !== undefined) getOffStop = (extra.getOffStop || '').trim();
        if (extra.prevName !== undefined) prevName = (extra.prevName || '').trim();
        if (extra.prevText !== undefined) prevText = (extra.prevText || '').trim();
        if (extra.steps && Array.isArray(extra.steps)) steps = extra.steps;
        if (extra.index !== undefined) stepIndex = extra.index;
        if (extra._skipPrevCheck !== undefined) skipPrevCheck = Boolean(extra._skipPrevCheck);
    }

    if (step.isLastStep !== undefined && isLastStep === undefined) isLastStep = Boolean(step.isLastStep);
    if (step.nextMode !== undefined && nextMode === undefined) nextMode = step.nextMode;
    if (step.stopName !== undefined && !stopName) stopName = (step.stopName || '').trim();
    if (step.getOffStop !== undefined && !getOffStop) getOffStop = (step.getOffStop || '').trim();
    if (step.prevName !== undefined && !prevName) prevName = (step.prevName || '').trim();
    if (step.prevText !== undefined && !prevText) prevText = (step.prevText || '').trim();

    if (!steps && window.activeRouteSteps && window.activeRouteSteps.length > 0) {
        steps = window.activeRouteSteps;
    }

    if (steps && steps.length > 0) {
        if (stepIndex === -1) {
            stepIndex = steps.indexOf(step);
        }
        if (stepIndex !== -1) {
            if (isLastStep === undefined) {
                isLastStep = (stepIndex === steps.length - 1);
            }
            if (nextMode === undefined && stepIndex + 1 < steps.length) {
                nextMode = steps[stepIndex + 1].mode;
            }
            if (!prevName && stepIndex > 0) {
                prevName = (steps[stepIndex - 1].name || '').trim();
            }
            if (!prevText && stepIndex > 0 && !skipPrevCheck) {
                const prevStep = steps[stepIndex - 1];
                prevText = formatStepInstruction(prevStep, prevStep.mode, {
                    steps,
                    index: stepIndex - 1,
                    isLastStep: (stepIndex - 1 === steps.length - 1),
                    _skipPrevCheck: true
                });
            }
        }
    }

    if (isLastStep === undefined) isLastStep = true;
    if (!stopName && rawName) stopName = rawName;

    // Alighting point calculation for jeepney legs
    if ((mode === 'driving' || mode === 'jeepney') && !getOffStop) {
        if (steps && steps.length > 0) {
            const startIdx = stepIndex !== -1 ? stepIndex : 0;
            let legEndIdx = startIdx;
            while (legEndIdx + 1 < steps.length && (steps[legEndIdx + 1].mode === 'driving' || steps[legEndIdx + 1].mode === 'jeepney')) {
                legEndIdx++;
            }
            for (let i = legEndIdx; i >= startIdx; i--) {
                const cand = (steps[i].stopName || steps[i].name || '').trim();
                if (cand && (!rawName || cand.toLowerCase() !== rawName.toLowerCase())) {
                    getOffStop = cand;
                    break;
                }
            }
        }
    }

    // Never use the street the user is boarding on as getOffStop
    if (getOffStop && rawName && getOffStop.trim().toLowerCase() === rawName.trim().toLowerCase()) {
        getOffStop = '';
    }

    if (maneuverType === 'depart') {
        if (mode === 'foot') {
            return hasName
                ? t('planner.step.depart_foot_name', { name: rawName, stop: rawName })
                : t('planner.step.depart_foot');
        } else {
            return getOffStop
                ? t('planner.step.ride_jeepney_towards', { getOffStop, name: getOffStop })
                : t('planner.step.ride_jeepney_stay');
        }
    }

    if (maneuverType === 'arrive') {
        // If the step belongs to a jeepney leg: always alight, never "You have arrived"
        if (mode === 'driving' || mode === 'jeepney') {
            return stopName
                ? t('planner.step.alight_jeepney_stop', { stop: stopName, name: stopName })
                : t('planner.step.alight_jeepney');
        }

        // If the step belongs to a walking leg:
        if (isLastStep) {
            return t('planner.step.arrive');
        }

        // Walking leg ending before a transit leg:
        return stopName
            ? t('planner.step.board_jeepney_stop', { stop: stopName, name: stopName })
            : t('planner.step.board_jeepney');
    }

    if (maneuverType === 'end of road') {
        const includeName = hasName && (!prevName || rawName.toLowerCase() !== prevName.toLowerCase());
        let res = '';
        if (mod.includes('right')) {
            res = includeName
                ? t('planner.step.end_of_road_right_name', { name: rawName, stop: rawName })
                : t('planner.step.end_of_road_right');
        } else if (mod.includes('left')) {
            res = includeName
                ? t('planner.step.end_of_road_left_name', { name: rawName, stop: rawName })
                : t('planner.step.end_of_road_left');
        } else {
            res = includeName
                ? t('planner.step.end_of_road_name', { name: rawName, stop: rawName })
                : t('planner.step.end_of_road');
        }

        // Deduplication against consecutive identical text
        if (prevText && res.trim().toLowerCase() === prevText.trim().toLowerCase()) {
            if (mod.includes('right')) {
                res = t('planner.step.end_of_road_right');
            } else if (mod.includes('left')) {
                res = t('planner.step.end_of_road_left');
            } else {
                res = t('planner.step.end_of_road');
            }
        }
        return res;
    }

    let result = '';
    let unnamedFallback = '';

    if (mod.includes('uturn')) {
        unnamedFallback = t('planner.step.uturn');
        result = hasName
            ? t('planner.step.uturn_name', { name: rawName, stop: rawName })
            : unnamedFallback;
    } else if (mod.includes('slight')) {
        if (mod.includes('right')) {
            unnamedFallback = t('planner.step.slight_right');
            result = hasName
                ? t('planner.step.slight_right_name', { name: rawName, stop: rawName })
                : unnamedFallback;
        } else if (mod.includes('left')) {
            unnamedFallback = t('planner.step.slight_left');
            result = hasName
                ? t('planner.step.slight_left_name', { name: rawName, stop: rawName })
                : unnamedFallback;
        }
    }

    if (!result && (maneuverType === 'turn' || mod.includes('right') || mod.includes('left'))) {
        if (mod.includes('right')) {
            unnamedFallback = t('planner.step.turn_right');
            result = hasName
                ? t('planner.step.turn_right_name', { name: rawName, stop: rawName })
                : unnamedFallback;
        } else if (mod.includes('left')) {
            unnamedFallback = t('planner.step.turn_left');
            result = hasName
                ? t('planner.step.turn_left_name', { name: rawName, stop: rawName })
                : unnamedFallback;
        }
    }

    if (!result) {
        unnamedFallback = t('planner.step.continue');
        result = hasName
            ? t('planner.step.continue_name', { name: rawName, stop: rawName })
            : unnamedFallback;
    }

    // General deduplication: never show two consecutive steps with identical text.
    // If that would happen, drop the "onto {name}" part of the second one.
    if (prevText && result.trim().toLowerCase() === prevText.trim().toLowerCase()) {
        if (unnamedFallback && unnamedFallback.trim().toLowerCase() !== prevText.trim().toLowerCase()) {
            result = unnamedFallback;
        } else {
            result = result.replace(/\s+(onto|towards|on)\s+.*$/i, '')
                           .replace(/\s+(sa|papunta\s+sa)\s+.*$/i, '')
                           .trim();
        }
    }

    return result;
}
window.formatStepInstruction = formatStepInstruction;

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

        try { localStorage.removeItem('calzada_mapstyle'); } catch (_) {}

        const map = new maplibregl.Map({
            container: 'map',
            style: 'https://tiles.openfreemap.org/styles/liberty',
            center: [121.1652, 14.2117], // Calamba coordinates [lng, lat]
            zoom: 13,
            dragRotate: true,
            touchPitch: false,
            pitchWithRotate: false,
            maxPitch: 0,
            preserveDrawingBuffer: true,
            canvasContextAttributes: {
                preserveDrawingBuffer: true
            },
            // Attribution is added below as a compact control at the bottom-left
            attributionControl: false,
            locale: {
                'NavigationControl.ResetBearing': (window.t ? window.t('planner.reset_north') : 'Reset map to north')
            }
        });
        window._calzadaMap = map;
        window.calzadaMap = map;
        window.map = map;
        map.touchZoomRotate.enableRotation();
        map.keyboard.enable();

        // Gracefully supply 1x1 transparent placeholder for icons missing from OpenFreeMap sprite
        map.on('styleimagemissing', (e) => {
            if (map.hasImage(e.id)) return;
            map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
        });

        // Zoom buttons (desktop only). The compass lives in the map buttons card with the locate button.
        const navControl = new maplibregl.NavigationControl({
            showZoom: true,
            showCompass: false,
            visualizePitch: false
        });
        map.addControl(navControl, 'bottom-right');

        // Attribution: a small round "i" at the bottom-left; tapping it opens the credits. The map style
        // credits OpenStreetMap; walking routes come from the FOSSGIS routing server, whose usage policy
        // also asks for a link that lets people report and fix map errors. The OSMF attribution guidelines
        // let the credits collapse after five seconds or on map interaction, so they show briefly when the
        // map opens, then fold into the "i" and only come back when the user taps it.
        const attributionControl = new maplibregl.AttributionControl({
            compact: true,
            customAttribution: '<a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener">Report a map error</a>'
        });
        map.addControl(attributionControl, 'bottom-left');
        const attribEl = () => document.querySelector('.maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib');
        let attribTimer = null;
        const collapseAttribution = () => {
            clearTimeout(attribTimer);
            const el = attribEl();
            if (el && el.classList.contains('maplibregl-compact-show')) {
                el.classList.remove('maplibregl-compact-show');
                el.removeAttribute('open');
            }
        };
        map.once('load', () => {
            const el = attribEl();
            if (!el) return;
            el.classList.add('maplibregl-compact-show');
            el.setAttribute('open', '');
            attribTimer = setTimeout(collapseAttribution, 5000);
            // Once the user works the "i" themselves, the timer no longer closes it for them
            const btn = el.querySelector('.maplibregl-ctrl-attrib-button');
            if (btn) btn.addEventListener('click', () => clearTimeout(attribTimer));
        });
        // Any real map interaction (pan, zoom, rotate, tap) folds the credits away, including after the user opened them
        map.on('movestart', (e) => { if (e && e.originalEvent) collapseAttribution(); });
        map.on('click', collapseAttribution);

        window.addEventListener('resize', () => map.resize());
        setTimeout(() => map.resize(), 0);
        setTimeout(() => map.resize(), 200);
        map.on('load', () => map.resize());

        // GeoJSON Route line layers setup
        const getRouteInsertionBeforeId = () => {
            if (!map || !map.isStyleLoaded()) return undefined;
            const layers = map.getStyle().layers;
            if (!layers) return undefined;
            let maxGroundIdx = -1;
            for (let i = 0; i < layers.length; i++) {
                const l = layers[i];
                if (l.id === 'building-3d' || l.id === 'building' || l.type === 'fill-extrusion' ||
                    l.id.startsWith('bridge_') || l.id.startsWith('boundary_')) {
                    maxGroundIdx = Math.max(maxGroundIdx, i);
                }
            }
            for (let i = maxGroundIdx + 1; i < layers.length; i++) {
                if (layers[i].type === 'symbol') {
                    return layers[i].id;
                }
            }
            return undefined;
        };

        let routeLayersInitialized = false;
        const initRouteLayers = () => {
            if (routeLayersInitialized || !map || !map.isStyleLoaded()) return;

            const beforeId = getRouteInsertionBeforeId();

            if (!map.getSource('completed-route')) {
                map.addSource('completed-route', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                map.addLayer({
                    id: 'completed-route-layer',
                    type: 'line',
                    source: 'completed-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#9ca3af',
                        'line-width': 6,
                        'line-opacity': 0.85
                    }
                }, beforeId);
            }

            // The next jeep of a trip with a transfer: solid, lighter blue (walks are the dashed lines)
            if (!map.getSource('next-transit-route')) {
                map.addSource('next-transit-route', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                // White edge under the line so it reads on top of roads and buildings
                map.addLayer({
                    id: 'next-transit-route-casing',
                    type: 'line',
                    source: 'next-transit-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#FFFFFF',
                        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 14, 7, 17, 10, 19, 14],
                        'line-opacity': 0.95
                    }
                }, beforeId);
                map.addLayer({
                    id: 'next-transit-route-layer',
                    type: 'line',
                    source: 'next-transit-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#8DB8E8',
                        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 14, 4.5, 17, 7, 19, 10],
                        'line-opacity': 1
                    }
                }, beforeId);
            }

            if (!map.getSource('transit-route')) {
                map.addSource('transit-route', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                // White edge under the jeepney line; both get thicker as the map zooms in
                map.addLayer({
                    id: 'transit-route-casing',
                    type: 'line',
                    source: 'transit-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#FFFFFF',
                        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 6, 14, 8.5, 17, 12, 19, 16],
                        'line-opacity': 0.95
                    }
                }, beforeId);
                map.addLayer({
                    id: 'transit-route-layer',
                    type: 'line',
                    source: 'transit-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#1a8fff',
                        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 14, 6, 17, 9, 19, 12],
                        'line-opacity': 1
                    }
                }, beforeId);
            }

            if (!map.getSource('walk-route')) {
                map.addSource('walk-route', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                map.addLayer({
                    id: 'walk-route-layer',
                    type: 'line',
                    source: 'walk-route',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#3b82f6',
                        'line-width': 6,
                        'line-dasharray': [2, 2],
                        'line-opacity': 1
                    }
                }, beforeId);
            }

            if (!map.getSource('route-connector')) {
                map.addSource('route-connector', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                map.addLayer({
                    id: 'route-connector-layer',
                    type: 'line',
                    source: 'route-connector',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'visible' },
                    paint: {
                        'line-color': '#94A3B8',
                        'line-width': 3,
                        'line-dasharray': [0, 2],
                        'line-opacity': 1
                    }
                }, beforeId);
            }

            routeLayersInitialized = true;

            // Replay route lines that were drawn before the style finished loading
            Object.keys(pendingRouteData).forEach(id => {
                const data = pendingRouteData[id];
                delete pendingRouteData[id];
                if (id === 'route-connector') updateRouteConnectors(data);
                else updateRouteSource(id, data);
            });
        };

        // A route can arrive before the map style has loaded (e.g. a route opened from URL parameters),
        // when the route sources do not exist yet. Its line data is kept here until initRouteLayers creates them.
        const pendingRouteData = {};

        map.on('load', initRouteLayers);
        map.on('style.load', () => {
            routeLayersInitialized = false;
            initRouteLayers();
        });

        const updateRouteSource = (sourceId, coordsLngLat) => {
            initRouteLayers();
            const src = map.getSource(sourceId);
            if (!src) {
                pendingRouteData[sourceId] = coordsLngLat;
                return;
            }
            if (!coordsLngLat || coordsLngLat.length === 0) {
                src.setData({ type: 'FeatureCollection', features: [] });
            } else if (coordsLngLat.type === 'FeatureCollection' || coordsLngLat.type === 'Feature') {
                src.setData(coordsLngLat);
            } else if (Array.isArray(coordsLngLat) && Array.isArray(coordsLngLat[0]) && Array.isArray(coordsLngLat[0][0])) {
                src.setData({
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'MultiLineString',
                        coordinates: coordsLngLat
                    }
                });
            } else if (coordsLngLat.length < 2) {
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

        const updateRouteConnectors = (features) => {
            initRouteLayers();
            const src = map.getSource('route-connector');
            if (!src) {
                pendingRouteData['route-connector'] = features;
                return;
            }
            src.setData({
                type: 'FeatureCollection',
                features: features || []
            });
            window._calzadaRouteConnectors = features || [];
        };

        // NATIONAL_HIGHWAY_COORDS removed — OSRM handles road routing universally.

        let currentLocation = { lat: 14.2045, lng: 121.1641 }; // Default
        let selectedCoords = { origin: null, destination: null };
        let originPlaceName = '';
        let destPlaceName = '';
        window.selectedCoords = selectedCoords;
        Object.defineProperty(window, 'originPlaceName', {
            get: () => originPlaceName,
            set: (v) => { originPlaceName = v; },
            configurable: true
        });
        Object.defineProperty(window, 'destPlaceName', {
            get: () => destPlaceName,
            set: (v) => { destPlaceName = v; },
            configurable: true
        });

        // URL parameters parsed later
        let isTrackingArrival = false;
        let mapAutoFollow = true;
        let displayLocation = null;
        let currentDisplayPosition = null;
        let markerAnimRaf = null;
        let lastFixTimestamp = 0;
        let currentNavHeading = null;
        let lastMatchedSegmentIndex = 0;

        // E: Compass & Heading tracking state
        let compassHeading = null;
        let lastCameraApplyAt = 0;
        let currentGpsSpeed = null;
        let currentGpsHeading = null;
        let activeCompassListener = null;
        let activeCompassAbsoluteListener = null;

        function prefersReducedMotion() {
            return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        }

        function setMapAutoFollow(val) {
            mapAutoFollow = Boolean(val);
            const btn = document.getElementById('reCenterBtn');
            if (btn) {
                const shouldShow = Boolean(isTrackingArrival && !mapAutoFollow);
                btn.classList.toggle('is-visible', shouldShow);
                btn.style.removeProperty('display');
            }
        }
        window.setMapAutoFollow = setMapAutoFollow;

        // G: Planner Auth UI Sync (exactly one of Sign in or Avatar may show)
        function syncPlannerAuthUI() {
            const authNavBtn = document.getElementById('authNavBtn');
            const userAvatarPill = document.getElementById('userAvatarPill');
            if (!authNavBtn || !userAvatarPill) return;

            const isUserLoggedIn = (userAvatarPill.style.display !== 'none' && userAvatarPill.style.display !== '') ||
                                   (window.firebase && window.firebase.auth && window.firebase.auth().currentUser !== null) ||
                                   (localStorage.getItem('calzada_user_logged_in') === 'true');

            if (isUserLoggedIn) {
                authNavBtn.style.setProperty('display', 'none', 'important');
                userAvatarPill.style.display = 'inline-flex';
            } else {
                authNavBtn.style.removeProperty('display');
                authNavBtn.style.display = 'inline-flex';
                userAvatarPill.style.display = 'none';
            }
        }
        window.syncPlannerAuthUI = syncPlannerAuthUI;

        setTimeout(() => {
            syncPlannerAuthUI();
            const avatarPillEl = document.getElementById('userAvatarPill');
            if (avatarPillEl) {
                new MutationObserver(() => syncPlannerAuthUI()).observe(avatarPillEl, { attributes: true, attributeFilter: ['style', 'class'] });
            }
        }, 50);

        // E3: Shortest angular difference and smoothing
        function getAngularDiff(target, current) {
            return ((target - current + 540) % 360) - 180;
        }

        function smoothHeading(current, target, thresholdDeg = 4, alpha = 0.3) {
            if (current === null || current === undefined || isNaN(current)) return target;
            if (target === null || target === undefined || isNaN(target)) return current;
            const diff = getAngularDiff(target, current);
            if (Math.abs(diff) < thresholdDeg) return current;
            let next = (current + diff * alpha) % 360;
            if (next < 0) next += 360;
            return next;
        }

        // E4: Single camera update path building one easeTo call
        function applyCamera(opts = {}) {
            if (!map || !mapAutoFollow || !isTrackingArrival) return;
            const now = performance.now();

            const center = opts.center || (displayLocation ? displayLocation.point : (currentLocation ? [currentLocation.lng, currentLocation.lat] : (selectedCoords.origin ? [selectedCoords.origin[1], selectedCoords.origin[0]] : null)));
            if (!center) return;

            const isPhone = window.innerWidth <= 768;
            const finalMapBearing = opts.bearing !== undefined ? opts.bearing : (isPhone ? (currentNavHeading || 0) : 0);
            const padding = opts.padding !== undefined ? opts.padding : computeCameraPadding();
            const zoom = opts.zoom !== undefined ? opts.zoom : 17;
            const duration = opts.duration !== undefined ? opts.duration : (prefersReducedMotion() ? 0 : 300);

            map.easeTo({
                center: center,
                bearing: finalMapBearing,
                zoom: zoom,
                pitch: 0,
                padding: padding,
                duration: duration,
                easing: t => t,
                essential: true
            });
            lastCameraApplyAt = now;
        }

        function startCompassListening() {
            if (activeCompassListener || activeCompassAbsoluteListener) return;

            const onOrientation = (event) => {
                let rawHeading = null;
                if (typeof event.webkitCompassHeading === 'number' && !isNaN(event.webkitCompassHeading)) {
                    rawHeading = event.webkitCompassHeading;
                } else if (typeof event.alpha === 'number' && !isNaN(event.alpha)) {
                    rawHeading = (360 - event.alpha) % 360;
                }

                if (rawHeading === null) return;

                const screenAngle = (window.screen?.orientation?.angle !== undefined)
                    ? window.screen.orientation.angle
                    : (typeof window.orientation === 'number' ? window.orientation : 0);
                rawHeading = (rawHeading + screenAngle) % 360;
                if (rawHeading < 0) rawHeading += 360;

                // E3: Smooth the compass: low-pass filter on shortest angular diff, ignore changes under 4 deg
                if (compassHeading === null) {
                    compassHeading = rawHeading;
                } else {
                    compassHeading = smoothHeading(compassHeading, rawHeading, 4, 0.25);
                }

                // E2: Heading source: speed >= 2 m/s and GPS heading valid -> GPS heading; else compass heading
                const isFastJeep = (currentGpsSpeed !== null && currentGpsSpeed >= 2.0 && currentGpsHeading !== null);
                if (!isFastJeep) {
                    currentNavHeading = compassHeading;

                    const isPhone = window.innerWidth <= 768;
                    const finalMapBearing = isPhone ? (currentNavHeading || 0) : 0;

                    const pointerEl = userMarker?.getElement()?.querySelector('.nav-cursor-wrapper');
                    if (pointerEl) {
                        pointerEl.style.transform = isPhone ? 'rotate(0deg)' : `rotate(${currentNavHeading || 0}deg)`;
                    }

                    const compass = document.getElementById('compassSvg');
                    if (compass) {
                        compass.style.transform = `rotate(${-finalMapBearing}deg)`;
                    }

                    // E4: Camera: compass may call applyCamera at most 4 times per second (>= 250ms interval)
                    const now = performance.now();
                    if (mapAutoFollow && isTrackingArrival && (now - lastCameraApplyAt >= 250)) {
                        applyCamera({ bearing: finalMapBearing, duration: 200 });
                    }
                }
            };

            activeCompassAbsoluteListener = onOrientation;
            activeCompassListener = onOrientation;
            window.addEventListener('deviceorientationabsolute', activeCompassAbsoluteListener, { passive: true });
            window.addEventListener('deviceorientation', activeCompassListener, { passive: true });
        }

        function stopCompassListening() {
            if (activeCompassListener) {
                window.removeEventListener('deviceorientation', activeCompassListener);
                activeCompassListener = null;
            }
            if (activeCompassAbsoluteListener) {
                window.removeEventListener('deviceorientationabsolute', activeCompassAbsoluteListener);
                activeCompassAbsoluteListener = null;
            }
            compassHeading = null;
        }

        function snapToRoute(lngLat, routeCoords, lastIdx = 0, threshold = 25) {
            if (!routeCoords || routeCoords.length < 2) {
                const pt = Array.isArray(lngLat)
                    ? ((lngLat[0] > 100) ? [lngLat[0], lngLat[1]] : [lngLat[1], lngLat[0]])
                    : [lngLat.lng, lngLat.lat];
                return { point: pt, distanceM: Infinity, segmentIndex: 0, segmentBearing: 0 };
            }

            const uLat = Array.isArray(lngLat) ? ((lngLat[0] > 100) ? lngLat[1] : lngLat[0]) : lngLat.lat;
            const uLng = Array.isArray(lngLat) ? ((lngLat[0] > 100) ? lngLat[0] : lngLat[1]) : lngLat.lng;

            const cosLat = Math.cos(uLat * Math.PI / 180);
            const mLat = 111195;
            const mLng = 111195 * cosLat;
            const numSegs = routeCoords.length - 1;

            function evalSegment(i) {
                const c1 = routeCoords[i];
                const c2 = routeCoords[i + 1];
                const latA = (c1[0] > 100) ? c1[1] : c1[0];
                const lngA = (c1[0] > 100) ? c1[0] : c1[1];
                const latB = (c2[0] > 100) ? c2[1] : c2[0];
                const lngB = (c2[0] > 100) ? c2[0] : c2[1];

                const ax = (lngA - uLng) * mLng;
                const ay = (latA - uLat) * mLat;
                const bx = (lngB - uLng) * mLng;
                const by = (latB - uLat) * mLat;

                const vx = bx - ax;
                const vy = by - ay;
                const vLenSq = vx * vx + vy * vy;

                let t = 0;
                if (vLenSq > 0) {
                    t = Math.max(0, Math.min(1, (-ax * vx - ay * vy) / vLenSq));
                }

                const projX = ax + t * vx;
                const projY = ay + t * vy;
                const distM = Math.sqrt(projX * projX + projY * projY);

                const projLng = uLng + projX / mLng;
                const projLat = uLat + projY / mLat;

                let bearing = (Math.atan2(vx, vy) * 180 / Math.PI);
                if (bearing < 0) bearing += 360;

                return {
                    point: [projLng, projLat],
                    distanceM: distM,
                    segmentIndex: i,
                    segmentBearing: bearing
                };
            }

            const wStart = Math.max(0, (lastIdx || 0) - 5);
            const wEnd = Math.min(numSegs - 1, (lastIdx || 0) + 40);

            let best = null;
            for (let i = wStart; i <= wEnd; i++) {
                const cand = evalSegment(i);
                if (!best || cand.distanceM < best.distanceM) {
                    best = cand;
                }
            }

            if (best && best.distanceM <= threshold) {
                return best;
            }

            let fullBest = null;
            for (let i = 0; i < numSegs; i++) {
                const cand = evalSegment(i);
                if (!fullBest || cand.distanceM < fullBest.distanceM) {
                    fullBest = cand;
                }
            }
            return fullBest || { point: [uLng, uLat], distanceM: Infinity, segmentIndex: 0, segmentBearing: 0 };
        }
        window.snapToRoute = snapToRoute;

        function stepHeading(current, target, maxStep = 45) {
            if (current === null || current === undefined || isNaN(current)) {
                return (target + 360) % 360;
            }
            let diff = (target - current) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            if (Math.abs(diff) <= maxStep) {
                return (target + 360) % 360;
            }
            const step = Math.sign(diff) * maxStep;
            return (current + step + 360) % 360;
        }
        window.stepHeading = stepHeading;

        function computeCameraPadding() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const guideCard = document.getElementById('activeGuideCard');
            const rGuide = (guideCard && getComputedStyle(guideCard).display !== 'none') ? guideCard.getBoundingClientRect() : null;
            let topEdge = (rGuide && rGuide.height > 0) ? rGuide.bottom : 0;

            const thenStrip = document.getElementById('mobileGuideFollowing');
            const rThen = (thenStrip && getComputedStyle(thenStrip).display !== 'none') ? thenStrip.getBoundingClientRect() : null;
            if (rThen && rThen.height > 0 && rThen.bottom > topEdge) {
                topEdge = rThen.bottom;
            }

            const sheet = (vw <= 768 && document.body.classList.contains('navigation-active'))
                ? document.getElementById('bottomStatusPill')
                : (document.getElementById('bottomStatusPill') || document.getElementById('directionsCard'));
            const rSheet = (sheet && getComputedStyle(sheet).display !== 'none') ? sheet.getBoundingClientRect() : null;
            const bottomEdge = (rSheet && rSheet.height > 0) ? rSheet.top : vh;

            if (vw <= 768) {
                // Visible height between bottom of banner (including Then strip) and top of bottom bar
                const visibleHeight = Math.max(100, bottomEdge - topEdge);
                // Center MapLibre pointer at 65% of visible map height:
                // padTop + (vh - padTop - padBottom)/2 = topEdge + 0.65 * visibleHeight
                const padTop = Math.round(topEdge + 0.30 * visibleHeight);
                const padBottom = Math.round(vh - bottomEdge);
                return { top: padTop, bottom: padBottom, left: 0, right: 0 };
            } else {
                const sidebar = document.getElementById('activeNavPanel') || document.querySelector('.active-nav-panel') || document.getElementById('plannerSidebar');
                let leftEdge = 0;
                if (sidebar && getComputedStyle(sidebar).display !== 'none') {
                    const rSidebar = sidebar.getBoundingClientRect();
                    if (rSidebar.width > 0) leftEdge = rSidebar.right;
                }
                const padLeft = Math.round(leftEdge);
                const padRight = 0;
                const baseTopPadding = topEdge + 16;
                const baseBottomPadding = (vh - bottomEdge) + 16;
                const padTop = Math.round(baseTopPadding);
                const padBottom = Math.round(baseBottomPadding);
                return { top: padTop, bottom: padBottom, left: padLeft, right: padRight };
            }
        }
        window.computeCameraPadding = computeCameraPadding;

        // Clear space kept around origin and destination in route preview. The destination
        // pin is anchored at its tip and stands 36px above the point, so the top edge also
        // reserves the pin height to keep its head out from under the top bar.
        const PREVIEW_EDGE_MARGIN = 28;
        const DEST_PIN_HEIGHT = 36;

        function computePreviewPadding() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            const topBar = document.getElementById('mapTopBar');
            const rTop = (topBar && getComputedStyle(topBar).display !== 'none') ? topBar.getBoundingClientRect() : null;
            const topEdge = (rTop && rTop.bottom > 0) ? rTop.bottom : 110;

            const sheet = document.getElementById('directionsCard');

            if (vw <= 768) {
                let sheetTop = vh;
                if (sheet && getComputedStyle(sheet).display !== 'none') {
                    let sheetY = 0;
                    const m = sheet.style.transform?.match(/translateY\(([-\d.]+)px\)/);
                    if (m) {
                        sheetY = parseFloat(m[1]);
                    } else if (typeof getSheetNaturalTranslate === 'function') {
                        sheetY = getSheetNaturalTranslate();
                    }
                    sheetTop = sheet.offsetTop + sheetY;
                }
                const visibleHeight = sheetTop - topEdge;
                const padTop = Math.round(topEdge) + PREVIEW_EDGE_MARGIN + DEST_PIN_HEIGHT;
                const padBottom = Math.round(vh - sheetTop) + PREVIEW_EDGE_MARGIN;
                return { top: padTop, bottom: padBottom, left: PREVIEW_EDGE_MARGIN, right: PREVIEW_EDGE_MARGIN, visibleHeight, sheetTop, topEdge };
            } else {
                const sheetRight = (sheet && getComputedStyle(sheet).display !== 'none') ? sheet.getBoundingClientRect().right : 340;
                return {
                    top: Math.round(topEdge) + PREVIEW_EDGE_MARGIN + DEST_PIN_HEIGHT,
                    bottom: 40,
                    left: Math.round(sheetRight) + PREVIEW_EDGE_MARGIN,
                    right: 40,
                    visibleHeight: vh - topEdge - 40,
                    sheetTop: vh,
                    topEdge
                };
            }
        }
        window.computePreviewPadding = computePreviewPadding;

        function fitRoutePreviewBounds(duration = 300) {
            // Requirement 4: Do not move the camera in navigation mode; this is preview only.
            if (!map || isTrackingArrival || document.body.classList.contains('navigation-active')) return;
            if (!selectedCoords.origin || !selectedCoords.destination) return;

            const bounds = new maplibregl.LngLatBounds();
            if (selectedCoords.origin) bounds.extend(toLngLat(selectedCoords.origin));
            if (selectedCoords.destination) bounds.extend(toLngLat(selectedCoords.destination));
            if (walkRouteGeojson && Array.isArray(walkRouteGeojson.coordinates)) {
                walkRouteGeojson.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
            }
            if (transitRouteGeojson && Array.isArray(transitRouteGeojson.coordinates)) {
                transitRouteGeojson.coordinates.forEach(c => bounds.extend([c[1], c[0]]));
            }
            if (bounds.isEmpty()) return;

            window._calzadaLastPreviewBounds = bounds;
            window._calzadaPreviewRouteBounds = bounds;

            const pad = computePreviewPadding();

            // Requirement 2: If the visible map height is under 160px (sheet fully expanded),
            // do not fit; refit when the user lowers the sheet.
            if (window.innerWidth <= 768 && pad.visibleHeight < 160) {
                return;
            }

            const cleanPadding = { top: pad.top, bottom: pad.bottom, left: pad.left, right: pad.right };
            window._calzadaPreviewPadding = cleanPadding;

            // Fit: ONE easeTo, 300 ms
            const camera = map.cameraForBounds(bounds, {
                padding: cleanPadding,
                maxZoom: 16,
                bearing: 0
            });
            if (camera) {
                map.easeTo({
                    center: camera.center,
                    zoom: camera.zoom,
                    bearing: 0,
                    pitch: 0,
                    duration: prefersReducedMotion() ? 0 : duration
                });
            }
        }
        window.fitRoutePreviewBounds = fitRoutePreviewBounds;

        let selectedMode = 'jeepney';
        let userExplicitMode = false;

        // Map objects
        let originMarker = null, destMarker = null, userMarker = null, gpsCircle = null;
        let walkPolyline = null, transitPolyline = null, completedTransitPolyline = null;
        let midpointBubbleMarker = null;

        function isMyLocationOrigin() {
            return originPlaceName === 'My Location';
        }

        function createOriginMarker(coords) {
            if (originMarker) { originMarker.remove(); originMarker = null; }
            const oEl = document.createElement('div');
            oEl.className = 'calzada-origin-marker';
            oEl.innerHTML = `<div style="width:16px;height:16px;background:#1C6EF2;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(28,110,242,0.5);"></div>`;
            originMarker = new maplibregl.Marker({
                element: oEl,
                anchor: 'center'
            }).setLngLat(toLngLat(coords)).addTo(map);
            return originMarker;
        }

        function createDestMarker(coords) {
            if (destMarker) { destMarker.remove(); destMarker = null; }
            const dEl = document.createElement('div');
            dEl.className = 'calzada-dest-marker';
            dEl.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 0C6.268 0 0 6.268 0 14c0 8.75 14 22 14 22S28 22.75 28 14C28 6.268 21.732 0 14 0z" fill="#ef4444"/>
                <circle cx="14" cy="14" r="6" fill="white"/>
            </svg>`;
            destMarker = new maplibregl.Marker({
                element: dEl,
                anchor: 'bottom'
            }).setLngLat(toLngLat(coords)).addTo(map);
            return destMarker;
        }

        function ensureOriginMarker() {
            if (isTrackingArrival) return;
            if (isMyLocationOrigin()) {
                if (originMarker) {
                    originMarker.remove();
                    originMarker = null;
                }
                return;
            }
            if (selectedCoords.origin && Array.isArray(selectedCoords.origin) && selectedCoords.origin.length >= 2) {
                if (!originMarker) {
                    createOriginMarker(selectedCoords.origin);
                } else {
                    originMarker.setLngLat(toLngLat(selectedCoords.origin));
                    if (!originMarker.getElement()?.parentNode) {
                        originMarker.addTo(map);
                    }
                }
            } else if (originMarker) {
                originMarker.remove();
                originMarker = null;
            }
        }

        function ensureDestMarker() {
            if (isTrackingArrival) return;
            if (selectedCoords.destination && Array.isArray(selectedCoords.destination) && selectedCoords.destination.length >= 2) {
                if (!destMarker) {
                    createDestMarker(selectedCoords.destination);
                } else {
                    destMarker.setLngLat(toLngLat(selectedCoords.destination));
                    if (!destMarker.getElement()?.parentNode) {
                        destMarker.addTo(map);
                    }
                }
            } else if (destMarker) {
                destMarker.remove();
                destMarker = null;
            }
        }

        // =============================================
        // CATEGORY FILTER PILLS & MAP PLACES CONTROLLER
        // =============================================

        // Category metadata: icon, color, label mappings
        const CATEGORY_META = {
            malls: { icon: 'storefront-outline', color: '#2563EB', label: 'Mall' },
            eateries: { icon: 'restaurant-outline', color: '#D97706', label: 'Eatery' },
            schools: { icon: 'school-outline', color: '#059669', label: 'School' },
            terminals: { icon: 'bus-outline', color: '#0284C7', label: 'Terminal' },
            Terminal: { icon: 'bus-outline', color: '#0284C7', label: 'Terminal' },
            Stop: { icon: 'pin-outline', color: '#64748B', label: 'Transit Stop' },
            coffee: { icon: 'cafe-outline', color: '#854D0E', label: 'Coffee Shop' },
            government: { icon: 'flag-outline', color: '#475569', label: 'Government & Landmark' },
            health: { icon: 'medkit-outline', color: '#DC2626', label: 'Health' },
            banks: { icon: 'cash-outline', color: '#0F766E', label: 'Bank' },
            hotels: { icon: 'bed-outline', color: '#7C3AED', label: 'Hotel' },
            establishments: { icon: 'bag-handle-outline', color: '#4F46E5', label: 'Shop & Service' },
            all: { icon: 'location-outline', color: '#378ADD', label: 'Place' },
        };

        // Dynamic place coordinates resolver: reads directly from the shared verified places data
        // (window.FALLBACK_PLACES from places-shared.js) by id/slug or name so places.json fixes apply everywhere.
        function resolveSharedCoords(idOrSlug, nameFallback, defaultLat, defaultLng) {
            const list = (typeof window !== 'undefined' && Array.isArray(window.FALLBACK_PLACES)) ? window.FALLBACK_PLACES : [];
            const key = String(idOrSlug || '').trim().toLowerCase();
            const normName = String(nameFallback || '').trim().toLowerCase();
            const found = list.find(p =>
                (p.slug && p.slug.toLowerCase() === key) ||
                (p.id && String(p.id).toLowerCase() === key) ||
                (normName && p.name && p.name.trim().toLowerCase() === normName)
            );
            if (found && found.lat != null && found.lng != null) {
                return { lat: Number(found.lat), lng: Number(found.lng), coord_source: found.coord_source || null };
            }
            return { lat: defaultLat, lng: defaultLng, coord_source: null };
        }

        const CALAMBA_PLACES_RAW = [
            // Malls
            { id: 'sm-calamba', name: 'SM City Calamba', category: 'malls', defaultLat: 14.203928, defaultLng: 121.1545159, full_address: 'National Road, Brgy. Real, Calamba City Triangle, 4027 Laguna' },
            { id: 'citymall-calamba', name: 'CityMall Calamba', category: 'malls', full_address: 'National Highway, Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/citymall-calamba/citymall-calamba-1.webp' },
            { id: 'puregold-halang', name: 'Puregold – Halang, Calamba', category: 'malls', full_address: 'National Highway, Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/puregold-halang-calamba/puregold-halang-calamba-1.webp' },
            { id: 'south-supermarket', name: 'South Supermarket', category: 'malls', full_address: 'Manila S Rd, Calamba, 4027 Laguna' },
            // Schools
            { id: 'sti-calamba', name: 'STI College - Calamba', category: 'schools', full_address: 'Manila S Rd, Calamba, 4027 Laguna', image_path: '../assets/places/sti-college/sti-1.webp' },
            { id: 'saint-benilde', name: 'Saint Benilde International School (Calamba), Inc.', category: 'schools', full_address: 'Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/saint-benilde-international-school/saint-benilde-international-school-1.webp' },
            { id: 'real-elementary', name: 'Real Elementary School', category: 'schools', defaultLat: 14.1987874, defaultLng: 121.1492457, full_address: '336 Real Rd, Brgy. Real, Calamba City, Laguna' },
            { id: 'pwu-cdcec', name: 'PWU CDCEC Calamba', category: 'schools', defaultLat: 14.2052421, defaultLng: 121.1562636, full_address: '6544+3HW, Bridge, Calamba, 4027 Laguna' },
            // Terminals
            { id: 'calamba-crossing-term', name: 'Calamba Crossing / Central Terminal', category: 'terminals', defaultLat: 14.19821, defaultLng: 121.16315, full_address: 'Calamba Crossing, Brgy. Real, Calamba City' },
            { id: 'sm-transport-term', name: 'SM City Calamba Transport Terminal', category: 'terminals', full_address: 'SM City Calamba Complex, Calamba City', image_path: '../assets/places/sm-city-calamba-transport-terminal/sm-city-calamba-transport-terminal-1.webp' },
            { id: 'turbina-bus-term', name: 'Turbina Bus Terminal', category: 'terminals', defaultLat: 14.18888, defaultLng: 121.14444, full_address: 'Turbina, Calamba City' },
            // Eateries
            { id: 'rose-grace', name: 'Rose and Grace Restaurant', category: 'eateries', defaultLat: 14.2012, defaultLng: 121.1568, full_address: 'Maharlika Highway, Brgy. Real, Calamba City' },
            { id: 'ding-hao', name: 'Ding Hao', category: 'eateries', full_address: 'National Highway, Brgy. Halang, Calamba City', image_path: '../assets/places/ding-hao/ding-hao-1.webp' },
            { id: 'uncle-johns', name: "Uncle John's", category: 'eateries', full_address: 'Manila S Rd, Calamba City, Laguna', image_path: '../assets/places/uncle-johns/uncle-johns-1.webp' },
            { id: 'teng-tengs', name: "Teng-Teng's", category: 'eateries', full_address: 'Calamba City, Laguna', image_path: '../assets/places/teng-tengs/teng-tengs-1.webp' },
            { id: 'mariz-food-town', name: 'Mariz Food Town', category: 'eateries', full_address: 'Calamba City, Laguna', image_path: '../assets/places/mariz-food-town/mariz-food-town-1.webp' },
            { id: 'ton-tons-sisig', name: "Ton-Ton's Sisig", category: 'eateries', full_address: 'Calamba City, Laguna', image_path: '../assets/places/ton-tons-sisig/ton-tons-sisig-1.webp' },
            // Coffee Shops
            { id: 'moonbucks', name: 'Moonbucks', category: 'coffee', defaultLat: 14.2104, defaultLng: 121.1648, full_address: 'Elepaño Subdivision, Brgy. 3 (Bayan), Calamba City' },
            { id: 'sample-coffee', name: 'Sample Coffee House', category: 'coffee', defaultLat: 14.1843, defaultLng: 121.1625, full_address: 'National Highway, Brgy. Bucal, Calamba City' },
            { id: 'starbucks-crossing', name: 'Starbucks Calamba Crossing', category: 'coffee', defaultLat: 14.2040, defaultLng: 121.1546, full_address: 'Crossing, Brgy. Real, Calamba City' },
            // Establishments
            { id: 'calamba-city-hall', name: 'Calamba City Hall', category: 'government', full_address: 'Bacnotan Rd, Brgy. Real, Calamba City' },
            { id: 'rizal-shrine', name: 'Bahay ni Rizal (Rizal Shrine)', category: 'government', defaultLat: 14.2140, defaultLng: 121.1670, full_address: 'J.P. Rizal St, Brgy. 5 Poblacion, Calamba City' },
            { id: 'calamba-plaza', name: 'Calamba Town Plaza', category: 'government', defaultLat: 14.2135, defaultLng: 121.1662, full_address: 'Rizal St, Poblacion, Calamba City' },
            { id: 'calamba-medical', name: 'Calamba Medical Center', category: 'health', defaultLat: 14.2065, defaultLng: 121.1575, full_address: 'National Highway, Crossing, Calamba City' },
            { id: 'card-sme-bank', name: 'CARD SME Bank – Calamba Branch', category: 'banks', full_address: 'National Highway, Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/card-sme-bank/card-sme-bank-1.webp' },
            { id: 'wilcon-depot', name: 'Wilcon Depot Calamba', category: 'establishments', full_address: 'National Highway, Calamba City, Laguna', image_path: '../assets/places/wilcon-depot-calamba/wilcon-depot-calamba-1.webp' },
            { id: 'barangay-uno-hall', name: 'Barangay Uno Hall, Calamba City', category: 'government', full_address: 'Barangay 1 (Uno), Calamba City, Laguna', image_path: '../assets/places/barangay-uno-hall/barangay-uno-hall-1.webp' },
            { id: 'rj-auto-shop', name: 'RJ Auto Shop', category: 'establishments', full_address: 'Calamba City, Laguna', image_path: '../assets/places/rj-auto-shop/rj-auto-shop-1.webp' },
            { id: 'news-star', name: 'News Star', category: 'establishments', full_address: 'Calamba City, Laguna', image_path: '../assets/places/news-star/news-star-1.webp' },
            // Schools
            { id: 'letran-calamba', name: 'Colegio de San Juan de Letran – Calamba', category: 'schools', full_address: 'Ipil-ipil St., Brgy. Bucal, Calamba City, Laguna', image_path: '../assets/places/letran-calamba/letran-calamba-1.webp' },
            { id: 'halang-elementary', name: 'Halang Elementary School', category: 'schools', full_address: 'Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/halang-elementary-school/halang-elementary-school-1.webp' },
            // Eateries
            { id: 'jollibee-real', name: 'Jollibee – Real, Calamba City', category: 'eateries', full_address: 'National Highway, Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/jollibee-real-calamba/jollibee-real-calamba-1.webp' },
            { id: 'mang-inasal-halang', name: 'Mang Inasal – Halang, Calamba', category: 'eateries', full_address: 'National Highway, Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/mang-inasal-halang-calamba/mang-inasal-halang-calamba-1.webp' },
            { id: 'creekside-halang', name: 'Creekside Halang', category: 'eateries', full_address: 'Brgy. Halang, Calamba City, Laguna', image_path: '../assets/places/creekside-halang/creekside-halang-1.webp' },
            { id: 'dear-hotpot', name: 'Dear Hotpot – Unlimited Japanese Hotpot', category: 'eateries', full_address: 'Calamba City, Laguna', image_path: '../assets/places/dear-hotpot-unlimited-japanese-hotpot/dear-hotpot-unlimited-japanese-hotpot-1.webp' },
            { id: 'd-fresco', name: "D' Fresco", category: 'eateries', full_address: 'Calamba City, Laguna', image_path: '../assets/places/d-fresco/d-fresco-1.webp' },
            { id: 'rsm-lutong-bahay', name: 'RSM Lutong Bahay – Real, Calamba', category: 'eateries', full_address: 'Brgy. Real, Calamba City, Laguna', image_path: '../assets/places/rsm-lutong-bahay-real-calamba/rsm-lutong-bahay-real-calamba-1.webp' },
            // Coffee Shops
            { id: 'krav-cafe', name: 'Krav Cafe', category: 'coffee', full_address: 'Calamba City, Laguna', image_path: '../assets/places/krav-cafe/krav-cafe-1.webp' },
            // Establishments
            { id: 'd-and-q', name: 'D & A', category: 'establishments', full_address: 'Calamba City, Laguna', image_path: '../assets/places/d-and-q/d-and-q-1.webp' },
            { id: 'morales-bercasio', name: 'Morales Bercasio', category: 'establishments', full_address: 'Calamba City, Laguna', image_path: '../assets/places/morales-bercasio/morales-bercasio-1.webp' },
        ];

        const CALAMBA_PLACES_FALLBACK = CALAMBA_PLACES_RAW.map(p => {
            const sc = resolveSharedCoords(p.id, p.name, p.defaultLat, p.defaultLng);
            return {
                ...p,
                lat: sc.lat,
                lng: sc.lng,
                ...(sc.coord_source ? { coord_source: sc.coord_source } : {})
            };
        });

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
            const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
            const photoUrl = `../assets/360/${encodeURIComponent(node.file)}`;
            const placeName = placeInfo && placeInfo.placeName ? placeInfo.placeName : '';
            const title = placeName || node.street || 'Street view';
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const m = /_(\d{4})(\d{2})\d{2}_/.exec(node.source || '');
            const captured = m && months[parseInt(m[2], 10) - 1] ? `${months[parseInt(m[2], 10) - 1]} ${m[1]}` : '';
            const subParts = [];
            if (placeName && node.street) subParts.push(node.street);
            subParts.push(node.area ? `${node.area}, Calamba` : 'Calamba');
            if (captured) subParts.push(captured);
            const open = `window._open360Viewer('${esc(node.id)}')`;

            return `
            <div class="sv-pop calzada-360-only-popup">
                <button type="button" class="sv-pop-photo" onclick="${open}" aria-label="Open street view">
                    <img src="${photoUrl}" alt="" loading="lazy">
                </button>
                <div class="sv-pop-body">
                    <div class="sv-pop-title">${esc(title)}</div>
                    <div class="sv-pop-sub">${esc(subParts.join(' · '))}</div>
                    <button type="button" class="sv-pop-btn" onclick="${open}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="9"/>
                            <path d="M3.6 9h16.8M3.6 15h16.8"/>
                            <path d="M11.5 3a17 17 0 0 0 0 18M12.5 3a17 17 0 0 1 0 18"/>
                        </svg>
                        <span>Open street view</span>
                    </button>
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
                    offset: [0, -4],
                    closeButton: true,
                    maxWidth: '280px',
                    className: 'calzada-maplibre-popup calzada-sv-popup'
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

        // Builds one category pin (existing pin design). Tapping it selects the place in the
        // category results (planner-category.js); no MapLibre popup anymore.
        function buildCategoryPlaceMarker(place) {
            if (!place) return null;
            const meta = CATEGORY_META[place.category] || { icon: 'location-outline', color: '#6366F1', label: place.category };
            const lat = parseFloat(place.lat);
            const lng = parseFloat(place.lng);
            if (isNaN(lat) || isNaN(lng)) return null;

            const iconEl = document.createElement('div');
            iconEl.className = 'calzada-custom-marker';
            iconEl.setAttribute('role', 'button');
            iconEl.setAttribute('tabindex', '0');
            iconEl.setAttribute('aria-label', place.name || 'Place');
            if (place.slug) iconEl.dataset.slug = place.slug;

            const wrapper = document.createElement('div');
            wrapper.className = 'calzada-pin-wrapper';
            wrapper.style.setProperty('--pin-color', meta.color);
            const ring = document.createElement('span');
            ring.className = 'czc-ring';
            ring.setAttribute('aria-hidden', 'true');
            const body = document.createElement('div');
            body.className = 'calzada-pin-body';
            const ion = document.createElement('ion-icon');
            ion.setAttribute('name', meta.icon);
            body.appendChild(ion);
            wrapper.appendChild(ring);
            wrapper.appendChild(body);
            iconEl.appendChild(wrapper);

            const onPinTap = (e) => {
                if (e && e.stopPropagation) e.stopPropagation();
                // A pin standing in for nearby pins (shows a count): zoom in to separate them first
                if (pinDeclutter.zoomIntoGroup(iconEl)) return;
                if (window.CalzadaPlannerCategory && place.slug) window.CalzadaPlannerCategory.select(place.slug);
            };
            iconEl.addEventListener('click', onPinTap);
            iconEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPinTap(e); }
            });
            if (typeof window.bindTap === 'function') window.bindTap(iconEl, onPinTap);

            const marker = new maplibregl.Marker({ element: iconEl, anchor: 'bottom' })
                .setLngLat([lng, lat])
                .addTo(map);
            pinDeclutter.add(marker, iconEl, place.slug || place.name || '');
            return { marker, el: iconEl };
        }
        window._calzadaBuildPlaceMarker = buildCategoryPlaceMarker;

        /**
         * Category pins overlap where places sit close together (very visible on phones,
         * where the map is zoomed out). Pins closer than a pin's width on screen are grouped:
         * one pin stays visible with a count and tapping it zooms in. When zoomed in far and
         * pins still share a spot (same building), they fan out in a small circle instead.
         * Recomputed on every map move/zoom; the selected pin always stays visible.
         */
        const pinDeclutter = (() => {
            const items = new Set();
            const GROUP_W = 28, GROUP_H = 32;   // pin is 32x38 px
            const FAN_ZOOM = 17.5;    // from here on, fan out instead of grouping
            let raf = 0;

            function add(marker, el, key) {
                const it = { marker, el, key };
                el._declutterItem = it;
                items.add(it);
                schedule();
            }
            function live() {
                const out = [];
                items.forEach(it => {
                    if (!it.el.isConnected) { items.delete(it); return; }
                    out.push(it);
                });
                return out;
            }
            function schedule() {
                if (raf) return;
                raf = requestAnimationFrame(() => { raf = 0; run(); });
            }
            function setCount(el, n) {
                let b = el.querySelector('.czc-pin-count');
                if (n > 1) {
                    if (!b) {
                        b = document.createElement('span');
                        b.className = 'czc-pin-count';
                        b.setAttribute('aria-hidden', 'true');
                        el.appendChild(b);
                    }
                    b.textContent = n > 99 ? '99+' : String(n);
                } else if (b) {
                    b.remove();
                }
            }
            function run() {
                if (!map) return;
                const list = live();
                if (!list.length) return;
                const zoom = map.getZoom();
                const rank = (it) => it.el.classList.contains('czc-pin-selected') ? 0 : 1;
                list.sort((a, b) => rank(a) - rank(b) || String(a.key).localeCompare(String(b.key)));

                const groups = [];
                for (const it of list) {
                    const p = map.project(it.marker.getLngLat());
                    it.pt = p;
                    let g = null;
                    for (const cand of groups) {
                        // pins are 32x38: group when their boxes would visibly overlap
                        if (Math.abs(cand.pt.x - p.x) < GROUP_W && Math.abs(cand.pt.y - p.y) < GROUP_H) { g = cand; break; }
                    }
                    if (g) g.members.push(it);
                    else groups.push({ pt: p, members: [it] });
                }

                const fan = zoom >= FAN_ZOOM;
                for (const g of groups) {
                    const n = g.members.length;
                    g.members.forEach((it, i) => {
                        it.group = g;
                        const leader = i === 0;
                        if (n === 1) {
                            it.marker.setOffset([0, 0]);
                            it.el.classList.remove('czc-pin-grouped', 'czc-pin-hidden');
                            setCount(it.el, 1);
                        } else if (fan) {
                            // Fan out around the shared spot, offset from where each pin actually is
                            const ang = (-Math.PI / 2) + (2 * Math.PI * i) / n;
                            const r = 26 + Math.max(0, n - 3) * 5;
                            const tx = g.pt.x + Math.cos(ang) * r, ty = g.pt.y + Math.sin(ang) * r;
                            it.marker.setOffset([Math.round(tx - it.pt.x), Math.round(ty - it.pt.y)]);
                            it.el.classList.remove('czc-pin-grouped', 'czc-pin-hidden');
                            setCount(it.el, 1);
                        } else {
                            it.marker.setOffset([0, 0]);
                            it.el.classList.toggle('czc-pin-hidden', !leader);
                            it.el.classList.toggle('czc-pin-grouped', leader);
                            setCount(it.el, leader ? n : 1);
                        }
                    });
                }
            }
            // Returns true when the tap was used to zoom into a group
            function zoomIntoGroup(el) {
                const it = el && el._declutterItem;
                if (!it || !it.group || it.group.members.length < 2 || !el.classList.contains('czc-pin-grouped')) return false;
                const b = new maplibregl.LngLatBounds();
                it.group.members.forEach(m => b.extend(m.marker.getLngLat()));
                const sheetH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--czc-sheet-h')) || 0;
                const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                try {
                    map.fitBounds(b, {
                        padding: { top: 150, bottom: Math.max(60, sheetH + 40), left: 60, right: 80 },
                        maxZoom: Math.max(FAN_ZOOM + 0.5, Math.min(19, map.getZoom() + 2)),
                        duration: reduced ? 0 : 450
                    });
                } catch (_) {}
                return true;
            }
            return { add, schedule, zoomIntoGroup };
        })();
        window._calzadaPinDeclutter = pinDeclutter;
        if (map) {
            map.on('move', pinDeclutter.schedule);
            map.on('zoom', pinDeclutter.schedule);
            map.on('resize', pinDeclutter.schedule);
        }

        function renderPlacesOnMap(places) {
            categoryMarkers.forEach(m => m.remove());
            categoryMarkers = [];
            const bySlug = {};
            (places || []).forEach(place => {
                const entry = buildCategoryPlaceMarker(place);
                if (!entry) return;
                categoryMarkers.push(entry.marker);
                if (place.slug) bySlug[place.slug] = entry;
            });
            return bySlug;
        }

        // Places of a category from the shared data (places-shared.js mirrors places.json): no network.
        function getCategoryPlaces(category) {
            if (!category || category === 'none') return [];
            const shared = Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length
                ? window.FALLBACK_PLACES
                : (typeof CALAMBA_PLACES_FALLBACK !== 'undefined' ? CALAMBA_PLACES_FALLBACK : []);
            const cat = String(category).toLowerCase();
            return shared.filter(p => {
                const c = String(p.category || '').toLowerCase();
                if (cat === 'all') return true;
                if (cat === 'terminals') return c === 'terminals' || c.includes('terminal');
                return c === cat;
            });
        }

        function renderCategoryPlaces(selectedCategory = 'none') {
            categoryMarkers.forEach(m => m.remove());
            categoryMarkers = [];
            if (!selectedCategory || selectedCategory === 'none') {
                if (window.CalzadaPlannerCategory) window.CalzadaPlannerCategory.hide();
                return;
            }
            const places = getCategoryPlaces(selectedCategory);
            const bySlug = renderPlacesOnMap(places);
            if (window.CalzadaPlannerCategory) window.CalzadaPlannerCategory.show(selectedCategory, places, bySlug);
        }

        // Category Filter Segmented Control & Contextual Clear Logic
        const categoryBar = document.getElementById('mapCategoryBar');
        const categoryScrollWrapper = document.getElementById('categoryScrollWrapper');
        const catClearBtn = document.getElementById('mapCatClearBtn');
        const catFadeOverlay = document.getElementById('categoryScrollFade');
        const chipHighlight = document.getElementById('chipHighlight');

        if (categoryBar) {
            const segments = categoryBar.querySelectorAll('.map-segment-btn');

            // ── Single Sliding Highlight Element ──────────────────────────────────
            function moveHighlightTo(chipElement) {
                if (!chipHighlight || !chipElement) return;
                chipHighlight.style.left = chipElement.offsetLeft + 'px';
                chipHighlight.style.width = chipElement.offsetWidth + 'px';
                chipHighlight.style.opacity = '1';
            }

            function hideHighlight() {
                if (!chipHighlight) return;
                chipHighlight.style.opacity = '0';
            }

            // Dynamic mask edge fade based on scroll position (only on sides with more content)
            const updateCategoryScrollFade = () => {
                if (!categoryScrollWrapper || !categoryBar) return;
                const maxScroll = categoryBar.scrollWidth - categoryBar.clientWidth;
                if (maxScroll <= 2) {
                    categoryScrollWrapper.classList.remove('has-more-start', 'has-more-end');
                    updateCatNav();
                    return;
                }
                const scrollLeft = categoryBar.scrollLeft;
                const hasStart = scrollLeft > 3;
                const hasEnd = scrollLeft < maxScroll - 3;
                categoryScrollWrapper.classList.toggle('has-more-start', hasStart);
                categoryScrollWrapper.classList.toggle('has-more-end', hasEnd);
                updateCatNav();
            };

            // ‹ › arrows: move the strip one category back/forward
            const catPrevBtn = document.getElementById('catPrevBtn');
            const catNextBtn = document.getElementById('catNextBtn');
            function updateCatNav() {
                if (!catPrevBtn || !catNextBtn) return;
                const maxScroll = categoryBar.scrollWidth - categoryBar.clientWidth;
                const overflow = maxScroll > 2;
                catPrevBtn.hidden = !overflow;
                catNextBtn.hidden = !overflow;
                catPrevBtn.disabled = categoryBar.scrollLeft <= 3;
                catNextBtn.disabled = categoryBar.scrollLeft >= maxScroll - 3;
            }
            const stepCategories = (dir) => {
                const chips = [...categoryBar.querySelectorAll('.map-segment-btn')];
                const left = categoryBar.scrollLeft;
                const right = left + categoryBar.clientWidth;
                let target = null;
                if (dir > 0) {
                    // first chip that is cut off on the right: bring it fully in view
                    target = chips.find(c => c.offsetLeft + c.offsetWidth > right + 2);
                    if (target) categoryBar.scrollTo({ left: target.offsetLeft + target.offsetWidth - categoryBar.clientWidth + 4, behavior: 'smooth' });
                } else {
                    target = [...chips].reverse().find(c => c.offsetLeft < left - 2);
                    if (target) categoryBar.scrollTo({ left: Math.max(0, target.offsetLeft - 4), behavior: 'smooth' });
                }
            };
            if (catPrevBtn) catPrevBtn.addEventListener('click', () => stepCategories(-1));
            if (catNextBtn) catNextBtn.addEventListener('click', () => stepCategories(1));

            // Standard scroll event listener
            categoryBar.addEventListener('scroll', updateCategoryScrollFade, { passive: true });
            if (window.ResizeObserver) {
                new ResizeObserver(updateCategoryScrollFade).observe(categoryBar);
            }
            window.addEventListener('resize', () => {
                updateCategoryScrollFade();
                const activeBtn = categoryBar.querySelector('.map-segment-btn.active');
                if (activeBtn) {
                    moveHighlightTo(activeBtn);
                }
            }, { passive: true });

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
            const initialActive = categoryBar.querySelector('.map-segment-btn.active');
            if (initialActive) {
                moveHighlightTo(initialActive);
            } else {
                hideHighlight();
            }

            const setCategoryActive = (category) => {
                let activeChip = null;
                segments.forEach(btn => {
                    const btnCat = btn.getAttribute('data-category');
                    if (btnCat === category && category !== 'none') {
                        btn.classList.add('active');
                        btn.setAttribute('aria-selected', 'true');
                        activeChip = btn;
                    } else {
                        btn.classList.remove('active');
                        btn.setAttribute('aria-selected', 'false');
                    }
                });

                // Count badge on the active chip ("Malls 3")
                segments.forEach(btn => {
                    const badge = btn.querySelector('.czc-count');
                    if (badge && btn !== activeChip) badge.remove();
                });
                if (activeChip) {
                    let badge = activeChip.querySelector('.czc-count');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'czc-count';
                        activeChip.appendChild(badge);
                    }
                    badge.textContent = String(getCategoryPlaces(category).length);
                }

                if (activeChip) {
                    moveHighlightTo(activeChip);
                    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    activeChip.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
                } else {
                    hideHighlight();
                }

                if (catClearBtn) {
                    if (activeChip) {
                        catClearBtn.classList.add('visible');
                    } else {
                        catClearBtn.classList.remove('visible');
                    }
                }

                // Recalculate fade overlay visibility in case Clear button appearing/disappearing resized the container
                requestAnimationFrame(updateCategoryScrollFade);

                renderCategoryPlaces(activeChip ? category : 'none');
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
            window._calzadaClearCategory = () => setCategoryActive('none');
        }

        // Initial load: do NOT render any category markers on the map
        renderCategoryPlaces('none');

        // Routing State
        let currentWalkDist = 0, currentWalkDur = 0, currentTransitDist = 0, currentTransitDur = 0;
        let currentFare = 0;
        let walkRouteGeojson = null, transitRouteGeojson = null;
        // Curated jeepney routes (js/transit-engine.js): the options shown, the one picked, and for a
        // trip with a transfer the part after the first jeep (pendingTransfer). The planner routes one
        // jeep at a time; at the transfer stop the trip is re-computed from there (priorTrip keeps the
        // legs already done, so the saved trip has them all).
        let transitOptions = [];
        let transitSelected = 0;
        let transitODKey = null;
        let pendingTransfer = null;
        let priorTrip = null;
        let transferPreferred = null;
        let transferRecomputing = false;
        let routeLoading = false;    // a route is being computed (the panel shows a skeleton)
        let lastPeekTripKey = null;  // phones: the trip the sheet last opened at half height for
        let journeyStartedAt = null; // epoch ms of START JOURNEY; null outside a journey
        let journeyId = null;        // one id per journey, so its trip is saved to the account once
        // 20 characters from the Firestore auto-ID alphabet
        const newJourneyId = () => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            const bytes = new Uint8Array(20);
            crypto.getRandomValues(bytes);
            return Array.from(bytes, b => chars[b % chars.length]).join('');
        };
        let currentCorridor = 'unknown'; // FIX: was referenced but never declared

        // ── CONSTANTS ──────────────────────────────────────────────────────────
        const WALK_SPEED_KPH = 4.6;   // realistic commute walk pace (~13 min/km or ~4.6 km/h)
        const JEEPNEY_SPEED_KPH = 20;    // avg jeepney speed (km/h)
        const BOARDING_BUFFER_SEC = 180;   // 3-min boarding buffer added to transit ETA
        const STORAGE_KEY = 'calzada_journey';

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
                    const sameMod = (prev.maneuver?.modifier || '') === (curr.maneuver?.modifier || '');
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

        // Peso amount as shown everywhere in the planner: "₱16", or "₱16.25" when there are centavos
        // One distance format for every label (summary, legs, hints, nav): under 1 km to the
        // nearest 10 m (582 -> 580 m), from 1 km with one decimal (1540 -> 1.5 km)
        function formatDistanceM(m) {
            const v = Math.max(0, Number(m) || 0);
            return v < 1000 ? `${Math.round(v / 10) * 10} m` : `${(v / 1000).toFixed(1)} km`;
        }

        function formatPeso(amount) {
            return window.CalzadaFare ? window.CalzadaFare.formatPeso(amount) : `₱${amount}`;
        }

        // Fare rates: fetch /data/jeepney-fares.json once, early, so the first route already has them
        if (window.CalzadaFare) window.CalzadaFare.load();

        // Helper: update fare display across desktop and mobile navigation cards
        function updatePillFareUI(remFare = null) {
            const fare = (remFare !== null ? remFare : currentFare) + (pendingTransfer ? pendingTransfer.jeep.fare : 0);
            const fareText = selectedMode === 'walking' ? 'Free' : formatPeso(fare);
            const lblText = selectedMode === 'walking' ? 'MODE' : 'PHP';

            document.querySelectorAll('.nav-stat-php, #navPanelFare, #dNavPhp, #pillPhp').forEach(el => {
                el.textContent = fareText;
            });
            document.querySelectorAll('.nav-stat-php-lbl, #navPanelFareLbl, #dNavPhpLbl, #pillPhpLbl').forEach(el => {
                el.textContent = lblText;
            });
        }

        // ── 24-HOUR TIME FORMATTER — no AM/PM ────────────────────────────────────
        function fmt24h(date) {
            if (!date || isNaN(date.getTime())) return '--:--';
            const h = date.getHours().toString().padStart(2, '0');
            const m = date.getMinutes().toString().padStart(2, '0');
            return `${h}:${m}`;
        }

        let currentRemainingDistanceMeters = 0;

        function updateDynamicBottomPill(timeSinceLastMove = 0) {
            let mins = Math.ceil(cachedRemainingSeconds / 60);
            const minText = mins < 1 ? "< 1" : `${mins}`;

            let minColor = '#16181d';
            let minAnim = 'none';
            if (timeSinceLastMove > 900000) {
                minColor = '#ef4444';
                minAnim = 'pulse 2s infinite';
            } else if (timeSinceLastMove > 300000) {
                minColor = '#f59e0b';
                minAnim = 'pulse 2s infinite';
            }

            document.querySelectorAll('.nav-stat-min, #navPanelDuration, #dNavMin, #pillMin').forEach(el => {
                el.textContent = minText;
                el.style.color = minColor;
                el.style.animation = minAnim;
            });

            const d = new Date(Date.now() + cachedRemainingSeconds * 1000);
            const arrivalText = fmt24h(d);
            document.querySelectorAll('.nav-stat-arrival, #navPanelArrival, #dNavArrival, #pillArrival').forEach(el => {
                el.textContent = arrivalText;
            });

            // ── B3 Collapsed Row Elements ──
            const pillRemTime = document.getElementById('pillRemTime');
            if (pillRemTime) {
                pillRemTime.textContent = `${mins} min`;
            }

            const pillRemDist = document.getElementById('pillRemDist');
            if (pillRemDist) {
                let totalRemM = 0;
                if (currentRemainingDistanceMeters > 0) {
                    totalRemM = currentRemainingDistanceMeters;
                } else {
                    totalRemM = (currentWalkDist + currentTransitDist) * 1000;
                }
                pillRemDist.textContent = formatDistanceM(totalRemM);
            }

            // Left line 2: "Arrive 20:24 · Walking · Free" or "Arrive 19:06 · Jeepney · ₱16"
            const arriveLabel = t('planner.arrive_time', { time: arrivalText }) || `Arrive ${arrivalText}`;
            const isWalkOnly = selectedMode === 'walking';
            const modeName = isWalkOnly
                ? (t('planner.nav_walking') || 'Walking')
                : (t('planner.nav_jeepney') || 'Jeepney');
            const fareLabel = isWalkOnly
                ? (t('planner.free') || 'Free')
                : formatPeso(currentFare + (pendingTransfer ? pendingTransfer.jeep.fare : 0));

            const pillSubLine = document.getElementById('pillSubLine');
            if (pillSubLine) {
                pillSubLine.textContent = `${arriveLabel} · ${modeName} · ${fareLabel}`;
            }
            const pillArrivalText = document.getElementById('pillArrivalText');
            if (pillArrivalText) pillArrivalText.textContent = arriveLabel;
            const pillModeText = document.getElementById('pillModeText');
            if (pillModeText) pillModeText.textContent = modeName;
            const pillFareText = document.getElementById('pillFareText');
            if (pillFareText) pillFareText.textContent = fareLabel;

            const endBtn = document.getElementById('navEndRouteBtn');
            if (endBtn) {
                const endLabel = t('planner.end_route') || 'End route';
                endBtn.setAttribute('aria-label', endLabel);
                endBtn.setAttribute('title', endLabel);
            }

            const swipeHint = document.getElementById('navSwipeHint');
            if (swipeHint) {
                swipeHint.textContent = t('planner.swipe_up_all_steps') || 'Swipe up for all steps';
            }

            const recenterLabel = document.querySelector('#reCenterBtn .recenter-label');
            if (recenterLabel) {
                recenterLabel.textContent = t('planner.recenter') || 'Re-center';
            }

            // Update CSS variable --bottom-nav-height so Re-center pill sits exactly 12px above bottom bar
            const bottomPill = document.getElementById('bottomStatusPill');
            if (bottomPill && getComputedStyle(bottomPill).display !== 'none') {
                const h = bottomPill.offsetHeight || 108;
                document.documentElement.style.setProperty('--bottom-nav-height', `${h}px`);
            }
        }

        function syncNavDisplays(timeSinceLastMove = 0) {
            updateDynamicBottomPill(timeSinceLastMove);
            updatePillFareUI();
        }

        const computeWalkDurationMin = (distKm) => {
            return Math.max(1, Math.round((distKm / WALK_SPEED_KPH) * 60));
        };

        // Real-Time Tracking State
        const GEO_NAV_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 };
        let watchId = null;
        let geoRetryTimer = null;
        let geoHealthTimer = null;
        let lastFixAt = 0;
        let lastWatchRestartAt = 0;
        let consecutiveFailures = 0;
        let weakGpsToastHandle = null;
        let hasShownWeakGpsToast = false;
        let hasShownGpsDeniedToast = false;
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
        const activeNavPanel = document.getElementById('activeNavPanel');
        const reCenterBtn = document.getElementById('reCenterBtn');
        if (reCenterBtn) {
            reCenterBtn.style.removeProperty('display');
            reCenterBtn.classList.remove('is-visible');
        }

        // Strict viewport gating: exactly ONE navigation UI visible matching window width
        function updateNavLayoutForViewport() {
            if (!isTrackingArrival) {
                if (activeNavPanel) activeNavPanel.style.setProperty('display', 'none', 'important');
                if (activeGuideCard) activeGuideCard.style.setProperty('display', 'none', 'important');
                if (bottomStatusPill) bottomStatusPill.style.setProperty('display', 'none', 'important');
                return;
            }

            const isDesktop = window.matchMedia('(min-width: 769px)').matches;
            if (isDesktop) {
                if (activeNavPanel) activeNavPanel.style.setProperty('display', 'flex', 'important');
                if (activeGuideCard) activeGuideCard.style.setProperty('display', 'none', 'important');
                if (bottomStatusPill) bottomStatusPill.style.setProperty('display', 'none', 'important');
            } else {
                if (activeNavPanel) activeNavPanel.style.setProperty('display', 'none', 'important');
                if (activeGuideCard) activeGuideCard.style.setProperty('display', 'flex', 'important');
                if (bottomStatusPill) bottomStatusPill.style.setProperty('display', 'flex', 'important');
            }
            if (directionsCard) {
                directionsCard.classList.add('journey-active-hidden');
                directionsCard.style.setProperty('display', 'none', 'important');
            }
        }
        window.addEventListener('resize', updateNavLayoutForViewport);
        window.addEventListener('orientationchange', () => setTimeout(updateNavLayoutForViewport, 100));

        // ── BOTTOM SHEET DRAG — Physics-based with live follow ───────────────────
        let sheetStartY = 0;
        let sheetLastY = 0;
        let sheetVelocity = 0;
        let sheetDragging = false;
        let sheetLastTime = 0;
        let sheetBaseTranslateY = 0; // The translateY at drag start (0 = expanded, positive = collapsed peek)

        const SHEET_PEEK_HEIGHT = 80; // px exposed when collapsed

        const getSheetPositions = () => {
            const isMobile = window.innerWidth <= 768;
            if (!isMobile) {
                return { expanded: 0, peek: 0, collapsed: 0 };
            }
            const sheetH = directionsCard ? directionsCard.offsetHeight : 592;
            const collapseAt = Math.max(0, sheetH - SHEET_PEEK_HEIGHT);
            // Peek: the sheet's top at about half the screen, so the route on the map stays visible
            // above it (review #04). offsetTop is the sheet's top without the drag transform.
            const naturalTop = directionsCard ? directionsCard.offsetTop : 0;
            const peekAt = Math.min(collapseAt, Math.max(0, Math.round(window.innerHeight * 0.5 - naturalTop)));
            return {
                expanded: 0,
                peek: peekAt,
                collapsed: collapseAt
            };
        };

        const getSheetNaturalTranslate = () => {
            const pos = getSheetPositions();
            if (directionsCard.classList.contains('collapsed')) return pos.collapsed;
            if (directionsCard.classList.contains('peek')) return pos.peek;
            return pos.expanded;
        };

        // Review #04: with the sheet at peek (half the screen), the Start Journey footer would sit below
        // the screen. Lift it by the sheet's offset so it stays at the bottom of the screen; when the
        // sheet is collapsed it goes back down with the sheet.
        const dsFooterEl = directionsCard ? directionsCard.querySelector('.ds-footer') : null;
        const syncFooterToSheet = (y, animate) => {
            if (!dsFooterEl) return;
            const isMobile = window.innerWidth <= 768;
            const pos = isMobile ? getSheetPositions() : null;
            const lift = isMobile ? Math.max(0, Math.min(y, pos.peek)) : 0;
            dsFooterEl.style.transition = animate ? 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
            dsFooterEl.style.transform = lift ? `translateY(${-lift}px)` : '';
            // The scrolling content ends where the lifted footer starts, so nothing scrolls
            // out below the Start Journey button and the last item can be reached.
            directionsCard.style.setProperty('--sheet-lift', `${Math.round(lift)}px`);
        };

        const setSheetState = (state, animate = true) => {
            if (!directionsCard) return;
            const isMobile = window.innerWidth <= 768;
            if (!isMobile) { syncFooterToSheet(0, false); return; }

            const pos = getSheetPositions();
            const targetY = pos[state] ?? 0;
            const prevState = ['expanded', 'peek', 'collapsed'].find(s => directionsCard.classList.contains(s)) || 'expanded';

            directionsCard.style.transition = animate ? 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)' : 'none';
            directionsCard.style.transform = `translateY(${targetY}px)`;
            syncFooterToSheet(state === 'collapsed' ? 0 : targetY, animate);

            directionsCard.classList.remove('expanded', 'peek', 'collapsed');
            directionsCard.classList.add(state);
            if (state === 'collapsed') {
                const sc = document.getElementById('dsScrollContainer');
                if (sc) sc.scrollTop = 0;
            }

            const dsPeekInfo = document.getElementById('dsPeekInfo');
            if (dsPeekInfo) {
                dsPeekInfo.style.display = state === 'collapsed' ? 'block' : 'none';
            }

            if (typeof updateMidpointBubbleVisibility === 'function') {
                updateMidpointBubbleVisibility(state === 'collapsed');
            }
            if (typeof updateCategoryBarVisibility === 'function') {
                updateCategoryBarVisibility();
            }

            // Refit route preview (one easeTo, 300 ms) when the sheet changes between expanded,
            // peek and collapsed. A snap back to the same state leaves the user's panning alone.
            if (state !== prevState) fitRoutePreviewBounds(300);
        };
        window._calzadaSetSheetState = setSheetState;

        const setSheetTranslate = (y) => {
            directionsCard.style.transition = 'none';
            directionsCard.style.transform = `translateY(${y}px)`;
            syncFooterToSheet(y, false);
        };

        const updateCategoryBarVisibility = () => {
            const catWrapper = document.getElementById('mapCategoryBarWrapper');
            if (!catWrapper) return;
            const isMobile = window.innerWidth <= 768;
            if (!isMobile) {
                catWrapper.style.opacity = '1';
                catWrapper.style.pointerEvents = 'auto';
                return;
            }
            const routeSummary = document.getElementById('routeSummaryBlock');
            const hasRoute = routeSummary && routeSummary.style.display !== 'none';
            const isCollapsed = directionsCard.classList.contains('collapsed');
            const isHidden = directionsCard.classList.contains('journey-active-hidden');
            const isExpanded = !isCollapsed && !isHidden && !directionsCard.classList.contains('peek');
            const isTallerThanHalf = directionsCard.offsetHeight > (window.innerHeight / 2);

            // The sheet now always stops below the top bar (--planner-top-room), so the
            // category bar can stay visible without covering the sheet.
            if (false && hasRoute && isExpanded && isTallerThanHalf) {
                catWrapper.style.opacity = '0';
                catWrapper.style.pointerEvents = 'none';
            } else {
                catWrapper.style.opacity = '1';
                catWrapper.style.pointerEvents = 'auto';
            }
        };

        window.addEventListener('resize', updateCategoryBarVisibility);

        // Phones: the tallest the Directions sheet may be is the screen minus the top bar
        // (buttons + category pills), so the sheet never slides under the category bar.
        const syncPlannerTopRoom = () => {
            const bar = document.getElementById('mapTopBar');
            if (!bar) return;
            const b = bar.getBoundingClientRect().bottom;
            if (b > 0) document.documentElement.style.setProperty('--planner-top-room', `${Math.round(b + 8)}px`);
        };
        syncPlannerTopRoom();
        window.addEventListener('resize', syncPlannerTopRoom);
        if (window.ResizeObserver && document.getElementById('mapTopBar')) {
            new ResizeObserver(syncPlannerTopRoom).observe(document.getElementById('mapTopBar'));
        }

        const snapSheet = (velocity) => {
            const pos = getSheetPositions();
            const current = parseFloat(
                directionsCard.style.transform?.match(/translateY\(([^)]+)px\)/)?.[1]
                ?? getSheetNaturalTranslate()
            );

            let targetState = 'expanded';
            if (velocity > 0.4) {
                targetState = current < pos.peek ? 'peek' : 'collapsed';
            } else if (velocity < -0.4) {
                targetState = current > pos.peek ? 'peek' : 'expanded';
            } else {
                const dExpanded = Math.abs(current - pos.expanded);
                const dPeek = Math.abs(current - pos.peek);
                const dCollapsed = Math.abs(current - pos.collapsed);
                if (dExpanded <= dPeek && dExpanded <= dCollapsed) {
                    targetState = 'expanded';
                } else if (dPeek <= dCollapsed) {
                    targetState = 'peek';
                } else {
                    targetState = 'collapsed';
                }
            }

            setSheetState(targetState, true);
        };

        let sheetCandidateDrag = false;
        let sheetStartX = 0;

        directionsCard.addEventListener('touchstart', (e) => {
            const isMobile = window.innerWidth <= 768;
            if (!isMobile || e.touches.length !== 1) return;

            const isInteractive = !!e.target.closest('button, input, select, textarea, a, .share-btn');
            const isHandle = !!e.target.closest('.ds-drag-handle');
            const isCollapsed = directionsCard.classList.contains('collapsed');
            const isPeek = directionsCard.classList.contains('peek');

            const touch = e.touches[0];
            sheetStartY = touch.clientY;
            sheetStartX = touch.clientX;
            sheetLastY = sheetStartY;
            sheetLastTime = Date.now();
            sheetVelocity = 0;

            sheetBaseTranslateY = parseFloat(
                directionsCard.style.transform?.match(/translateY\(([^)]+)px\)/)?.[1]
                ?? getSheetNaturalTranslate()
            );

            if (isHandle) {
                sheetDragging = true;
                sheetCandidateDrag = false;
                directionsCard.style.transition = 'none';
            } else if (isCollapsed || isPeek) {
                // In collapsed or peek states, non-interactive touches can drag the sheet
                sheetDragging = false;
                sheetCandidateDrag = !isInteractive;
            } else {
                // Expanded sheet: only initiate drag if user pulls down at top of scroll container
                sheetDragging = false;
                if (!isInteractive) {
                    const scrollContainer = document.getElementById('dsScrollContainer');
                    sheetCandidateDrag = !scrollContainer || scrollContainer.scrollTop <= 0;
                } else {
                    sheetCandidateDrag = false;
                }
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!sheetDragging && !sheetCandidateDrag) return;
            if (e.touches.length !== 1) return;

            const touch = e.touches[0];
            const y = touch.clientY;
            const x = touch.clientX;
            const dy = y - sheetStartY;
            const dx = x - sheetStartX;

            if (!sheetDragging && sheetCandidateDrag) {
                const isCollapsed = directionsCard.classList.contains('collapsed');
                const isPeek = directionsCard.classList.contains('peek');
                const isExpanded = !isCollapsed && !isPeek;

                if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
                    if (isExpanded) {
                        const scrollContainer = document.getElementById('dsScrollContainer');
                        const atTop = !scrollContainer || scrollContainer.scrollTop <= 0;
                        if (atTop && dy > 8) {
                            // User is at the top of scroll container and pulling down -> drag sheet
                            sheetDragging = true;
                            sheetCandidateDrag = false;
                            directionsCard.style.transition = 'none';
                            sheetStartY = y;
                            sheetLastY = y;
                            sheetLastTime = Date.now();
                            sheetBaseTranslateY = parseFloat(
                                directionsCard.style.transform?.match(/translateY\(([^)]+)px\)/)?.[1]
                                ?? getSheetNaturalTranslate()
                            );
                        } else {
                            // Swiping up (scrolling content) or not at top
                            sheetCandidateDrag = false;
                            return;
                        }
                    } else if (isPeek) {
                        // In peek/half state, pulling up or down drags sheet
                        sheetDragging = true;
                        sheetCandidateDrag = false;
                        directionsCard.style.transition = 'none';
                        sheetStartY = y;
                        sheetLastY = y;
                        sheetLastTime = Date.now();
                    } else if (isCollapsed) {
                        // In collapsed state, swiping up drags sheet
                        if (dy < -8) {
                            sheetDragging = true;
                            sheetCandidateDrag = false;
                            directionsCard.style.transition = 'none';
                            sheetStartY = y;
                            sheetLastY = y;
                            sheetLastTime = Date.now();
                        } else {
                            sheetCandidateDrag = false;
                            return;
                        }
                    }
                } else if (Math.abs(dx) > 8) {
                    sheetCandidateDrag = false;
                    return;
                } else {
                    return;
                }
            }

            if (sheetDragging) {
                if (e.cancelable) e.preventDefault();

                const now = Date.now();
                const dt = Math.max(1, now - sheetLastTime);
                const stepDy = y - sheetLastY;
                sheetVelocity = stepDy / dt; // px/ms
                sheetLastY = y;
                sheetLastTime = now;

                const pos = getSheetPositions();
                const collapseAt = pos.collapsed;
                const raw = sheetBaseTranslateY + (y - sheetStartY);

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
            }
        }, { passive: false });

        document.addEventListener('touchend', () => {
            if (sheetDragging) {
                sheetDragging = false;
                snapSheet(sheetVelocity);
            }
            sheetCandidateDrag = false;
        });

        document.addEventListener('touchcancel', () => {
            if (sheetDragging) {
                sheetDragging = false;
                snapSheet(sheetVelocity);
            }
            sheetCandidateDrag = false;
        });

        document.getElementById('dsPeekInfo').addEventListener('click', () => {
            setSheetState('expanded', true);
        });

        // ── MOBILE MAP CONTROLS FOLLOW THE SHEET ─────────────────────────────────
        // The controls live in the map layer (below the GUI layer), so they must sit
        // above the sheet's top edge or they end up hidden behind it. Every sheet move
        // (drag, snap, programmatic expand) goes through its inline transform, so we
        // mirror that transform's *target* plus its transition onto the controls: same
        // easing, same start frame, and live tracking while the transition is 'none'
        // during a drag. Desktop keeps the CSS position untouched.
        (() => {
            const CTRL_GAP = 12;        // px between the sheet's top edge and the lowest control
            const mobileMq = window.matchMedia('(max-width: 767px)');
            const ctrlCorner = document.querySelector('.maplibregl-ctrl-bottom-right');
            // The attribution "i" at the bottom-left rides on the same lift
            const attribCorner = document.querySelector('.maplibregl-ctrl-bottom-left');
            const corners = [ctrlCorner, attribCorner].filter(Boolean);
            if (!ctrlCorner || !directionsCard) return;

            const sheetTargetY = () => {
                const m = directionsCard.style.transform.match(/translateY\(([-\d.]+)px\)/);
                return m ? parseFloat(m[1]) : 0;
            };

            // Everything below is measured live, so it holds for any screen size:
            // no per-device offsets, only the gap itself is a constant.
            const measureStack = () => {
                const box = ctrlCorner.getBoundingClientRect();
                const rects = [...ctrlCorner.children]
                    .map(el => el.getBoundingClientRect())
                    .filter(r => r.height > 0);
                if (!rects.length) return { trailing: 0, height: 0 };
                const visBottom = Math.max(...rects.map(r => r.bottom));
                const visTop = Math.min(...rects.map(r => r.top));
                // MapLibre puts a margin under the last control; the gap must be measured
                // from what is actually visible, not from the container box.
                return { trailing: box.bottom - visBottom, height: visBottom - visTop };
            };

            // Highest point the stack may reach: just under the category bar (or the
            // top of the screen if that bar is hidden).
            const topLimit = () => {
                const bar = document.getElementById('mapCategoryBarWrapper');
                const r = bar && bar.offsetParent !== null ? bar.getBoundingClientRect() : null;
                return (r && r.height ? r.bottom : 0) + CTRL_GAP;
            };

            const sync = () => {
                const sheetShown = directionsCard.offsetParent !== null && directionsCard.offsetHeight > 0;
                if (!mobileMq.matches || !sheetShown) {
                    // Desktop, or journey mode with the sheet hidden: fall back to CSS.
                    corners.forEach(c => {
                        c.style.removeProperty('--ctrl-lift');
                        c.style.removeProperty('transition');
                        c.classList.remove('ctrl-no-room');
                    });
                    return;
                }
                // offsetTop ignores transforms, so this is the sheet's resting top edge;
                // adding the inline translateY gives where the sheet is (or is heading).
                const sheetTop = directionsCard.offsetTop + sheetTargetY();
                const mapH = map.getContainer().clientHeight;
                const stack = measureStack();
                const visBottom = sheetTop - CTRL_GAP;
                corners.forEach(c => c.style.setProperty('--ctrl-lift', `${Math.round(visBottom + stack.trailing - mapH)}px`));
                // If a tall/expanded sheet leaves no room above it, fade the stack out
                // rather than overlap the sheet or the category bar.
                const noRoom = visBottom - stack.height < topLimit();
                corners.forEach(c => c.classList.toggle('ctrl-no-room', noRoom));
                // visibility flips after the fade when hiding, immediately when showing.
                const fade = `opacity 0.2s ease, visibility 0s linear ${noRoom ? '0.2s' : '0s'}`;
                const transition = directionsCard.style.transition === 'none'
                    ? fade
                    : `transform var(--sheet-dur) var(--sheet-spring), ${fade}`;
                corners.forEach(c => { c.style.transition = transition; });
            };

            new MutationObserver(sync).observe(directionsCard, { attributes: true, attributeFilter: ['style', 'class'] });
            if (window.ResizeObserver) {
                // Sheet height and stack size (e.g. the attribution expanding) both matter.
                const ro = new ResizeObserver(sync);
                ro.observe(directionsCard);
                ro.observe(ctrlCorner);
            }
            mobileMq.addEventListener ? mobileMq.addEventListener('change', sync) : mobileMq.addListener(sync);
            window.addEventListener('resize', sync);
            sync();
        })();

        // ── GUIDE CARD DRAG — Swipe up to expand steps, down to minimize ─────────
        const guideCard = document.getElementById('activeGuideCard');
        const guideDragHandle = document.querySelector('.guide-drag-handle');
        const guideStepsEl = document.getElementById('guideExpandedSteps');

        let guideStartY = 0;
        let guideLastY = 0;
        let guideVelocity = 0;
        let guideLastTime = 0;
        let guideDragging = false;
        let guideExpanded = false; // tracks expanded state

        if (guideDragHandle) {
            guideDragHandle.addEventListener('touchstart', (e) => {
                guideStartY = e.touches[0].clientY;
                guideLastY = guideStartY;
                guideLastTime = Date.now();
                guideVelocity = 0;
                guideDragging = true;
                guideCard.style.transition = 'none';
            }, { passive: true });

            document.addEventListener('touchmove', (e) => {
                if (!guideDragging) return;
                const y = e.touches[0].clientY;
                const now = Date.now();
                const dt = Math.max(1, now - guideLastTime);
                guideVelocity = (y - guideLastY) / dt;
                guideLastY = y;
                guideLastTime = now;
                // Visual feedback: translate the card slightly with the finger
                const delta = y - guideStartY;
                const clamped = delta < 0 ? delta * 0.35 : delta * 0.5; // softer downward
                guideCard.style.transform = `translateY(${Math.max(-80, Math.min(40, clamped))}px)`;
            }, { passive: true });

            document.addEventListener('touchend', () => {
                if (!guideDragging) return;
                guideDragging = false;
                guideCard.style.transition = 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)';
                guideCard.style.transform = 'translateY(0)';

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

        // "Where from?" / "Where to?": the place search (js/place-search.js). Mobile: full-screen
        // page; desktop: dropdown under the field. Not during a journey (the fields are hidden then).
        let activeSelectingField = 'origin';

        const openLocationModal = (type) => {
            activeSelectingField = type;
            if (document.body.classList.contains('navigation-active') || !window.CalzadaPlaceSearch) return;
            window.CalzadaPlaceSearch.open({
                field: type,
                anchor: document.getElementById(type === 'origin' ? 'openOriginModal' : 'openDestModal'),
                places: () => (pickerKnownPlaces.length ? pickerKnownPlaces : CALAMBA_PLACES_FALLBACK),
                userFix: () => (typeof window._calzadaGetUserFix === 'function' ? window._calzadaGetUserFix() : null),
                onSelect: (name, coords) => { pendingField[type] = null; selectLocation(name, coords); },
                onPending: (name) => setFieldPending(type, name),
                onPendingFail: () => setFieldPending(type, null),
                onMyLocation: () => requestMyLocationOrigin(),
                onPin: () => triggerMapPicker()
            });
        };
        const closeLocationModal = () => {
            if (window.CalzadaPlaceSearch) window.CalzadaPlaceSearch.close({ restoreFocus: false });
        };
        ['openOriginModal', 'openDestModal'].forEach((id) => {
            const field = document.getElementById(id);
            if (!field) return;
            const type = id === 'openOriginModal' ? 'origin' : 'destination';
            field.addEventListener('click', () => openLocationModal(type));
            field.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLocationModal(type); }
            });
        });

        // B3: Centralized single function that every path calls to control planner state & visibility
        // A field whose place was picked but whose coordinates are still being looked up
        // (search result geocode) shows the name with a loading shimmer.
        const pendingField = { origin: null, destination: null };
        const setFieldPending = (field, name) => {
            pendingField[field] = name || null;
            renderPlannerState();
        };
        window._calzadaSetFieldPending = setFieldPending;

        const renderPlannerState = () => {
            const hasOrigin = Boolean(selectedCoords.origin && originPlaceName);
            const hasDest = Boolean(selectedCoords.destination && destPlaceName);
            const hasBothFields = hasOrigin && hasDest;
            const hasRoute = hasBothFields && (
                (walkRouteGeojson && Array.isArray(walkRouteGeojson.coordinates) && walkRouteGeojson.coordinates.length >= 2) ||
                (transitRouteGeojson && Array.isArray(transitRouteGeojson.coordinates) && transitRouteGeojson.coordinates.length >= 2)
            );

            // 0. Ensure single-location or route markers stay consistent with field values
            ensureOriginMarker();
            ensureDestMarker();

            // 1. Origin & Destination text and clear (×) buttons (B2)
            const origEl = document.getElementById('openOriginModal');
            const destEl = document.getElementById('openDestModal');
            const clearOriginBtn = document.getElementById('clearOriginBtn');
            const clearDestBtn = document.getElementById('clearDestBtn');

            if (origEl) {
                if (isLocatingOrigin) {
                    const isFil = (localStorage.getItem('calzada_lang') || 'en').toLowerCase() === 'tl';
                    origEl.textContent = isFil ? 'Hinahanap ang lokasyon mo...' : 'Finding your location...';
                    origEl.classList.remove('unfilled');
                } else if (hasOrigin) {
                    origEl.textContent = originPlaceName;
                    origEl.classList.remove('unfilled');
                } else {
                    origEl.textContent = (window.t ? window.t('planner.where_from') : 'Where from?');
                    origEl.classList.add('unfilled');
                }
            }
            if (clearOriginBtn) {
                clearOriginBtn.style.display = hasOrigin ? 'inline-flex' : 'none';
            }

            if (destEl) {
                if (hasDest) {
                    destEl.textContent = destPlaceName;
                    destEl.classList.remove('unfilled');
                } else {
                    destEl.textContent = (window.t ? window.t('planner.where_to') : 'Where to?');
                    destEl.classList.add('unfilled');
                }
            }
            if (clearDestBtn) {
                clearDestBtn.style.display = hasDest ? 'inline-flex' : 'none';
            }
            if (origEl && pendingField.origin) { origEl.textContent = pendingField.origin; origEl.classList.remove('unfilled'); }
            if (destEl && pendingField.destination) { destEl.textContent = pendingField.destination; destEl.classList.remove('unfilled'); }
            if (origEl) origEl.classList.toggle('is-loading', isLocatingOrigin || !!pendingField.origin);
            if (destEl) destEl.classList.toggle('is-loading', !!pendingField.destination);
            const odBlock = document.querySelector('.od-input-block');
            if (odBlock) odBlock.classList.toggle('is-routing', !!(routeLoading && hasBothFields));

            // 2. Directions sheet header X button (B1)
            const closeDirectionsBtn = document.getElementById('closeDirectionsBtn');
            if (closeDirectionsBtn) {
                closeDirectionsBtn.style.display = (hasRoute || hasOrigin || hasDest) ? 'flex' : 'none';
            }

            // 3. Summary and itinerary are visible ONLY when both fields have a value and route computed (B3)
            const transportModesBlock = document.getElementById('transportModesBlock');
            const routeSummaryBlock = document.getElementById('routeSummaryBlock');
            const itineraryLegs = document.getElementById('itineraryLegs');
            const walkHintEl = document.getElementById('walkableTripHint');
            const startBtn = document.getElementById('startJourneyBtn');
            const savePdfBtn = document.getElementById('headerSavePdfBtn') || document.getElementById('saveRoutePdfBtn');
            const startHelper = document.getElementById('startJourneyHelper');

            if (hasRoute) {
                if (directionsCard) directionsCard.classList.add('has-route');
                if (transportModesBlock) {
                    transportModesBlock.style.removeProperty('display');
                    transportModesBlock.style.display = 'flex';
                }
                if (routeSummaryBlock) {
                    routeSummaryBlock.style.removeProperty('display');
                    routeSummaryBlock.style.display = '';
                    routeSummaryBlock.classList.remove('hidden');
                    const summaryBanner = routeSummaryBlock.querySelector('.route-summary-banner');
                    if (summaryBanner) {
                        summaryBanner.style.removeProperty('display');
                        summaryBanner.style.display = '';
                    }
                }
                if (startBtn) startBtn.disabled = false;
                if (savePdfBtn) savePdfBtn.style.display = 'inline-flex';
                if (startHelper) startHelper.style.display = 'none';
            } else if (routeLoading && hasBothFields) {
                // Route being computed: keep the skeleton and the "Finding routes…" line
                if (startBtn) startBtn.disabled = true;
                if (startHelper) {
                    startHelper.style.display = '';
                    startHelper.textContent = routeLoadingText();
                }
            } else {
                if (directionsCard) directionsCard.classList.remove('has-route');
                if (transportModesBlock) {
                    transportModesBlock.style.setProperty('display', 'none', 'important');
                }
                if (routeSummaryBlock) {
                    routeSummaryBlock.style.setProperty('display', 'none', 'important');
                    routeSummaryBlock.classList.add('hidden');
                    const summaryBanner = routeSummaryBlock.querySelector('.route-summary-banner');
                    if (summaryBanner) {
                        summaryBanner.style.setProperty('display', 'none', 'important');
                    }
                }
                if (itineraryLegs) itineraryLegs.innerHTML = '';
                if (!hasBothFields && window.CalzadaTransitUI) window.CalzadaTransitUI.hideOptions();
                if (walkHintEl) walkHintEl.style.display = 'none';
                if (savePdfBtn) savePdfBtn.style.display = 'none';
                const peekSummary = document.getElementById('peekSummary');
                if (peekSummary) peekSummary.textContent = '-- min • ₱ --';
                const dsPeekInfo = document.getElementById('dsPeekInfo');
                if (dsPeekInfo) dsPeekInfo.style.display = 'none';
                const sumTime = document.getElementById('sumTime');
                if (sumTime) sumTime.textContent = '-- min';
                const sumFare = document.getElementById('sumFare');
                if (sumFare) sumFare.textContent = '₱ --';
                const sumETA = document.getElementById('sumETA') || document.getElementById('sumEta');
                if (sumETA) sumETA.textContent = '--:--';
                const sumDist = document.getElementById('sumDist');
                if (sumDist) sumDist.textContent = '--';
                const sumArriveText = document.getElementById('sumArriveText');
                if (sumArriveText) sumArriveText.innerHTML = 'Arrive <span id="sumETA">--:--</span>';
                if (startBtn) startBtn.disabled = true;
                if (startHelper) {
                    startHelper.style.display = '';
                    if (!hasDest) {
                        startHelper.textContent = (window.t ? window.t('planner.enter_destination') : 'Enter a destination to continue');
                    } else if (!hasOrigin) {
                        startHelper.textContent = (window.t ? window.t('planner.enter_origin') : 'Enter an origin to continue');
                    } else {
                        startHelper.textContent = (window.t ? window.t('planner.enter_destination') : 'Enter a destination to continue');
                    }
                }
            }

            updateCategoryBarVisibility();
        };

        // B2: Clear origin only
        const clearOriginField = () => {
            if (myLocWatchTimer) { clearTimeout(myLocWatchTimer); myLocWatchTimer = null; }
            if (myLocWatchId !== null && navigator.geolocation) {
                try { navigator.geolocation.clearWatch(myLocWatchId); } catch (_) {}
                myLocWatchId = null;
            }
            isLocatingOrigin = false;

            selectedCoords.origin = null;
            originPlaceName = '';
            if (originMarker) { originMarker.remove(); originMarker = null; }
            if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }
            if (midpointBubbleMarker) { midpointBubbleMarker.remove(); midpointBubbleMarker = null; }

            walkRouteGeojson = null;
            transitRouteGeojson = null;
            window.activeRouteSteps = [];
            window.currentStepIndex = 0;

            updateRouteSource('walk-route', []);
            updateRouteSource('transit-route', []);
            updateRouteSource('completed-route', []);
            updateRouteConnectors([]);
            window._calzadaRouteContext = null;
            // The route options list ("Route" + option cards) belongs to the old trip
            clearTransitPlan();
            transitODKey = null;
            priorTrip = null;
            try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}

            ensureDestMarker();
            renderPlannerState();

            if (selectedCoords.destination && destMarker) {
                map.flyTo({ center: toLngLat(selectedCoords.destination), zoom: 15 });
            }
        };

        // B2: Clear destination only
        const clearDestField = () => {
            selectedCoords.destination = null;
            destPlaceName = '';
            if (destMarker) { destMarker.remove(); destMarker = null; }
            if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }
            if (midpointBubbleMarker) { midpointBubbleMarker.remove(); midpointBubbleMarker = null; }

            walkRouteGeojson = null;
            transitRouteGeojson = null;
            window.activeRouteSteps = [];
            window.currentStepIndex = 0;

            updateRouteSource('walk-route', []);
            updateRouteSource('transit-route', []);
            updateRouteSource('completed-route', []);
            updateRouteConnectors([]);
            window._calzadaRouteContext = null;
            // The route options list ("Route" + option cards) belongs to the old trip
            clearTransitPlan();
            transitODKey = null;
            priorTrip = null;
            try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) {}

            ensureOriginMarker();
            renderPlannerState();

            if (selectedCoords.origin && originMarker) {
                map.flyTo({ center: toLngLat(selectedCoords.origin), zoom: 15 });
            }
        };

        // B1: Clear EVERYTHING (header X button)
        const clearAllPlannerState = () => {
            if (myLocWatchTimer) { clearTimeout(myLocWatchTimer); myLocWatchTimer = null; }
            if (myLocWatchId !== null && navigator.geolocation) {
                try { navigator.geolocation.clearWatch(myLocWatchId); } catch (_) {}
                myLocWatchId = null;
            }
            isLocatingOrigin = false;

            userExplicitMode = false;
            selectedMode = 'jeepney';
            setModeUI('jeepney');

            selectedCoords.origin = null;
            selectedCoords.destination = null;
            originPlaceName = '';
            destPlaceName = '';

            if (originMarker) { originMarker.remove(); originMarker = null; }
            if (destMarker) { destMarker.remove(); destMarker = null; }
            if (midpointBubbleMarker) { midpointBubbleMarker.remove(); midpointBubbleMarker = null; }
            if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }

            walkRouteGeojson = null;
            transitRouteGeojson = null;
            window.walkRouteGeojson = null;
            window.transitRouteGeojson = null;
            window.finalWalkRouteGeojson = null;
            window.activeRouteSteps = [];
            window.currentStepIndex = 0;

            updateRouteSource('walk-route', []);
            updateRouteSource('transit-route', []);
            updateRouteSource('completed-route', []);
            updateRouteConnectors([]);

            window._calzadaRouteContext = null;
            clearTransitPlan();
            priorTrip = null;
            transitODKey = null;
            try {
                sessionStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem('calzada_journey');
            } catch (e) {}

            updateMidpointBubbleVisibility(false);
            const sc = document.getElementById('dsScrollContainer');
            if (sc) sc.scrollTop = 0;
            renderPlannerState();

            if (currentLocation && currentLocation.lat && currentLocation.lng) {
                map.flyTo({ center: [currentLocation.lng, currentLocation.lat], zoom: 14 });
            } else {
                map.flyTo({ center: [121.1652, 14.2117], zoom: 13 });
            }
        };

        document.getElementById('clearOriginBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearOriginField();
        });

        document.getElementById('clearDestBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            clearDestField();
        });

        // Link parameters that open the planner with a route (see URL PARAMETERS below)
        const ROUTE_URL_PARAMS = ['destName', 'dest', 'destLat', 'dlat', 'destLng', 'dlng',
            'originName', 'origName', 'origin', 'originLat', 'origLat', 'olat', 'originLng', 'origLng', 'olng'];
        const clearRouteUrlParams = () => {
            try {
                const url = new URL(window.location.href);
                const had = ROUTE_URL_PARAMS.filter(k => url.searchParams.has(k));
                if (!had.length) return;
                had.forEach(k => url.searchParams.delete(k));
                history.replaceState(history.state, '', url.pathname + url.search + url.hash);
            } catch (_) { /* URL API unavailable: the route may come back on reload */ }
        };

        document.getElementById('closeDirectionsBtn')?.addEventListener('click', () => {
            clearAllPlannerState();
            // Back to the open, empty sheet a fresh /planner starts with. A collapsed sheet keeps the
            // offset worked out for its taller route content, which would push the now shorter sheet
            // off the screen.
            setSheetState('expanded');
            // The link the planner was opened with would bring the route back on reload
            clearRouteUrlParams();
        });

        const updateODDisplay = () => {
            renderPlannerState();
        };

        let isLocatingOrigin = false;
        let myLocWatchId = null;
        let myLocWatchTimer = null;
        let lastPreviewReplanTime = 0;
        let previewReplanTimer = null;
        let pendingReplanCoords = null;

        function triggerPreviewReplan(lat, lng) {
            pendingReplanCoords = [lat, lng];
            if (previewReplanTimer) {
                clearTimeout(previewReplanTimer);
                previewReplanTimer = null;
            }

            const executeReplanIfAllowed = () => {
                const now = Date.now();
                const elapsed = now - lastPreviewReplanTime;
                if (elapsed >= 15000) {
                    lastPreviewReplanTime = now;
                    const coords = pendingReplanCoords;
                    pendingReplanCoords = null;
                    if (coords && isMyLocationOrigin() && !isTrackingArrival && !document.body.classList.contains('navigation-active') && selectedCoords.destination) {
                        window.__calzadaPreviewReplanCount = (window.__calzadaPreviewReplanCount || 0) + 1;
                        selectedCoords.origin = coords;
                        currentLocation = { lat: coords[0], lng: coords[1] };
                        executeRouteQuery();
                    }
                } else {
                    const delay = Math.max(100, 15000 - elapsed);
                    previewReplanTimer = setTimeout(executeReplanIfAllowed, delay);
                }
            };

            previewReplanTimer = setTimeout(executeReplanIfAllowed, 300);
        }

        function requestMyLocationOrigin() {
            closeLocationModal();

            isLocatingOrigin = true;
            const isFil = (localStorage.getItem('calzada_lang') || 'en').toLowerCase() === 'tl';
            const waitingText = isFil ? 'Hinahanap ang lokasyon mo...' : 'Finding your location...';

            const origEl = document.getElementById('openOriginModal');
            if (origEl) {
                origEl.textContent = waitingText;
                origEl.classList.remove('unfilled');
                origEl.classList.add('is-loading');
            }
            originPlaceName = waitingText;

            // Drop any earlier origin while waiting, so a destination picked during the
            // wait cannot route from a stale point.
            selectedCoords.origin = null;
            if (originMarker) { originMarker.remove(); originMarker = null; }

            let bestFix = null;
            let resolved = false;

            if (myLocWatchTimer) { clearTimeout(myLocWatchTimer); myLocWatchTimer = null; }
            if (myLocWatchId !== null && navigator.geolocation) {
                try { navigator.geolocation.clearWatch(myLocWatchId); } catch (_) {}
                myLocWatchId = null;
            }

            const finalizeFix = (pos) => {
                if (resolved) return;
                resolved = true;
                isLocatingOrigin = false;

                if (myLocWatchTimer) { clearTimeout(myLocWatchTimer); myLocWatchTimer = null; }
                if (myLocWatchId !== null && navigator.geolocation) {
                    try { navigator.geolocation.clearWatch(myLocWatchId); } catch (_) {}
                    myLocWatchId = null;
                }

                if (pos && pos.coords) {
                    currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    selectedCoords.origin = [pos.coords.latitude, pos.coords.longitude];
                    originPlaceName = 'My Location';
                    window.__calzadaMyLocOriginFix = {
                        lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy
                    };
                    updateODDisplay();

                    if (typeof window._calzadaSetUserFix === 'function') {
                        window._calzadaSetUserFix(pos.coords.longitude, pos.coords.latitude);
                    }

                    if (selectedCoords.destination) {
                        executeRouteQuery();
                    }
                } else {
                    showToast(t('planner.toast_locate_failed'), 'error');
                    originPlaceName = '';
                    selectedCoords.origin = null;
                    updateODDisplay();
                }
            };

            if (!navigator.geolocation) {
                finalizeFix(null);
                return;
            }

            const accuracyOf = (p) => (p && p.coords && typeof p.coords.accuracy === 'number')
                ? p.coords.accuracy
                : Infinity;

            // 1. The map already knows where you are (location dot, last 20 s, good to 80 m): use it now.
            const recent = typeof window._calzadaGetRecentFix === 'function' ? window._calzadaGetRecentFix(20000) : null;
            if (recent && recent.acc <= 80) {
                finalizeFix({ coords: { latitude: recent.lat, longitude: recent.lng, accuracy: recent.acc } });
                return;
            }

            // 2. Otherwise ask for GPS. Take the first reading good to 50 m; after 5 s take the best one
            //    seen. A quick network/cached reading runs alongside so there is something to fall back on.
            //    A rough first fix is refined later by the location watch (see onPosition).
            const consider = (pos) => {
                if (resolved || !pos) return;
                if (!bestFix || accuracyOf(pos) < accuracyOf(bestFix)) bestFix = pos;
                if (accuracyOf(pos) <= 50) finalizeFix(pos);
            };
            myLocWatchId = navigator.geolocation.watchPosition(
                consider,
                (err) => {
                    if (resolved) return;
                    // Permission denied will not recover; timeouts wait for the 5 s cap.
                    if (err && err.code === 1) finalizeFix(null);
                },
                { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
            );
            try {
                navigator.geolocation.getCurrentPosition(consider, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 4000 });
            } catch (_) { /* ignore */ }
            myLocWatchTimer = setTimeout(() => finalizeFix(bestFix), 5000);
        }

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
        window.selectLocation = selectLocation;

        // Mode Selection (Single source of truth for all mode-toggle UI elements)
        const setModeUI = (mode) => {
            document.querySelectorAll('.segment-btn[data-mode]').forEach(btn => {
                const isActive = btn.dataset.mode === mode;
                btn.classList.toggle('active', isActive);
                btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            document.querySelectorAll('.nav-panel-mode-btn[data-mode]').forEach(btn => {
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
        // MATH & GEOMETRY
        // =============================================

        // Returns distance in KM
        const getHaversineDist = (lat1, lon1, lat2, lon2) => {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };
        window.getHaversineDist = getHaversineDist;

        // =============================================
        // ROUTING EXECUTOR — UNIVERSAL 2-LEG (OSRM)
        // =============================================

        // (fmt24h declared earlier in scope)

        // Straight-line metres between a point and a route end (0 if either is missing).
        const gapToRouteM = (a, b) => (a && b) ? getHaversineDist(a[0], a[1], b[0], b[1]) * 1000 : 0;

        // =============================================
        // CURATED JEEPNEY ROUTES (js/transit-engine.js + js/planner-transit.js)
        // =============================================
        // Function declarations (hoisted): executeRouteQuery can run before this part of the file.
        let transitApplyToken = 0;

        function transitLang() {
            try { return (window.getCurrentLang && window.getCurrentLang()) === 'tl' ? 'tl' : 'en'; } catch (_) { return 'en'; }
        }

        function clearTransitPlan() {
            transitOptions = [];
            pendingTransfer = null;
            transitApplyToken++;
            if (window.CalzadaTransitUI) {
                window.CalzadaTransitUI.hideOptions();
                window.CalzadaTransitUI.hideTransfer();
            }
            try { updateRouteSource('next-transit-route', []); } catch (_) { /* map not ready */ }
            clearTransitMarkers();
        }

        // Name of a known place near a point (stop and alighting labels), or null
        function transitPlaceNear(pt, maxM) {
            if (!pt) return null;
            const lists = [window.FALLBACK_PLACES || [], typeof CALAMBA_PLACES_FALLBACK !== 'undefined' ? CALAMBA_PLACES_FALLBACK : []];
            let best = null;
            lists.forEach((list) => list.forEach((p) => {
                const lat = Number(p.lat), lng = Number(p.lng);
                if (!p.name || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
                const d = getHaversineDist(pt[0], pt[1], lat, lng) * 1000;
                if (d <= maxM && (!best || d < best.d)) best = { name: p.name, d };
            }));
            return best ? best.name : null;
        }

        function transitStopName(ref) {
            if (!ref || !ref.stopId) return null;
            return (transitLang() === 'tl' && ref.name_tl) ? ref.name_tl : (ref.name || null);
        }

        function transitHeadsign(leg) {
            return window.CalzadaTransitUI ? window.CalzadaTransitUI.headsignText(leg) : leg.headsign;
        }

        function renderTransitOptionsUI() {
            if (!window.CalzadaTransitUI) return;
            window.CalzadaTransitUI.renderOptions(transitOptions, transitSelected, (i) => {
                if (isTrackingArrival || !transitOptions[i]) return;
                transitSelected = i;
                renderTransitOptionsUI();
                const o = selectedCoords.origin, d = selectedCoords.destination;
                const straight = (o && d) ? getHaversineDist(o[0], o[1], d[0], d[1]) * 1000 : 0;
                applyTransitOption(transitOptions[i], straight).catch((e) => console.error('Option failed:', e));
            });
        }

        // true when curated routes handled the trip (options shown, first jeep routed)
        async function planWithTransitRoutes(oPt, dPt, straightDistM) {
            const T = window.CalzadaTransit;
            if (!T) return false;
            try {
                await Promise.race([T.load(), new Promise(r => setTimeout(r, 2500))]);
                if (window.CalzadaFare) await Promise.race([window.CalzadaFare.load(), new Promise(r => setTimeout(r, 2000))]);
                if (!T.isReady()) { clearTransitPlan(); return false; }
                const opts = T.plan(oPt, dPt);
                if (!opts.length) { clearTransitPlan(); return false; }

                // Same trip again (e.g. a live origin moved a little): keep the option the user picked
                const key = [oPt, dPt].map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('|');
                let sel = 0;
                if (transferPreferred) {
                    const i = opts.findIndex(o => {
                        const j = o.legs.find(l => l.type === 'jeep');
                        return j && (j.routeId === transferPreferred || (j.alsoRoutes || []).includes(transferPreferred));
                    });
                    if (i >= 0) sel = i;
                } else if (key === transitODKey) {
                    const prevKey = transitOptions[transitSelected] && transitOptions[transitSelected].key;
                    const i = opts.findIndex(o => o.key === prevKey);
                    if (i >= 0) sel = i;
                }
                transferPreferred = null;
                transitOptions = opts;
                transitODKey = key;
                transitSelected = sel;
                renderTransitOptionsUI();
                await applyTransitOption(opts[sel], straightDistM);
                return true;
            } catch (e) {
                console.error('Curated routes failed; using the highway route:', e);
                clearTransitPlan();
                return false;
            }
        }

        // Route the first jeep of an option with the planner's usual walk / jeep / walk legs.
        // A second jeep becomes pendingTransfer: shown in the itinerary and on the map, and
        // re-computed from its stop when the user gets there.
        async function applyTransitOption(opt, straightDistM) {
            const token = ++transitApplyToken;
            const oPt = selectedCoords.origin, dPt = selectedCoords.destination;
            if (!opt || !oPt || !dPt) return;
            const legs = opt.legs;
            const ji = legs.findIndex(l => l.type === 'jeep');
            const j1 = legs[ji];
            const rest = legs.slice(ji + 1);
            const j2 = rest.find(l => l.type === 'jeep') || null;
            const boardPt = j1.coords[0];
            const alightPt = j1.coords[j1.coords.length - 1];

            const footOrLine = async (a, b) => {
                let r = null;
                try { r = await fetchOSRMRouteCoords(a, b, 'foot'); } catch (e) { console.error('Walk OSRM error:', e); }
                if (!r || !r.coordinates || r.coordinates.length < 2) {
                    const d = Math.max(1, getHaversineDist(a[0], a[1], b[0], b[1]) * 1000 * 1.25);
                    r = { coordinates: [a, b], distance: d, duration: (d / 1000 / WALK_SPEED_KPH) * 3600, approximate: true, steps: [] };
                }
                return r;
            };

            const wRes = await footOrLine(oPt, boardPt);
            if (token !== transitApplyToken) return;
            const walkNames = (wRes.steps || []).map(s => (s.name || '').trim()).filter(Boolean);
            const roadName = walkNames.length ? walkNames[walkNames.length - 1] : null;
            const boardName = transitStopName(j1.board) || transitPlaceNear(boardPt, 150) || roadName || 'National Highway';

            const afterTarget = j2 ? j2.coords[0] : dPt;
            const xferWalk = j2 && rest[0] && rest[0].type === 'walk' ? rest[0] : null;
            let fwRes = null;
            if (xferWalk && xferWalk.via && xferWalk.distM > 0) {
                // A walk the route data describes (e.g. along SM City Calamba): its own walking line
                // when it has one, else a straight line between the two stops
                const d = xferWalk.distM;
                const nextName = transitStopName(j2.board) || 'Terminal';
                let line = Array.isArray(xferWalk.path) && xferWalk.path.length >= 2 ? xferWalk.path.map(p => [p[0], p[1]]) : [alightPt, afterTarget];
                if (getHaversineDist(alightPt[0], alightPt[1], line[0][0], line[0][1]) * 1000 > 3) line.unshift(alightPt);
                const lastPt = line[line.length - 1];
                if (getHaversineDist(lastPt[0], lastPt[1], afterTarget[0], afterTarget[1]) * 1000 > 3) line.push(afterTarget);
                fwRes = {
                    coordinates: line,
                    distance: d,
                    duration: (d / 1000 / WALK_SPEED_KPH) * 3600,
                    viaText: transitLang() === 'tl' ? (xferWalk.via_tl || xferWalk.via) : xferWalk.via,
                    steps: [
                        { name: nextName, distance: d, duration: (d / 1000 / WALK_SPEED_KPH) * 3600, maneuver: { type: 'depart', modifier: '', location: [alightPt[1], alightPt[0]] }, mode: 'foot' },
                        { name: nextName, distance: 0, duration: 0, maneuver: { type: 'arrive', modifier: '', location: [afterTarget[1], afterTarget[0]] }, mode: 'foot' }
                    ]
                };
            } else if (getHaversineDist(alightPt[0], alightPt[1], afterTarget[0], afterTarget[1]) * 1000 > 25) {
                fwRes = await footOrLine(alightPt, afterTarget);
                if (token !== transitApplyToken) return;
            }
            const fwFirst = fwRes ? (fwRes.steps || []).map(s => (s.name || '').trim()).find(Boolean) : null;
            let alightName = transitStopName(j1.alight) || transitPlaceNear(alightPt, 200) || fwFirst || roadName || 'National Highway';
            if (alightName === boardName) alightName = `${alightName} · ${(j1.distM / 1000).toFixed(1)} km`;

            const durSec = (j1.distM / 1000 / JEEPNEY_SPEED_KPH) * 3600;
            const tRes = {
                coordinates: j1.coords.map(c => [c[0], c[1]]),
                distance: j1.distM,
                duration: durSec,
                steps: [
                    { name: boardName, stopName: boardName, distance: j1.distM, duration: durSec, maneuver: { type: 'depart', modifier: '', location: [boardPt[1], boardPt[0]] }, mode: 'driving' },
                    { name: alightName, stopName: alightName, distance: 0, duration: 0, maneuver: { type: 'arrive', modifier: '', location: [alightPt[1], alightPt[0]] }, mode: 'driving' }
                ],
                curated: true,
                routeId: j1.routeId,
                headsign: transitHeadsign(j1),
                signboard: j1.signboard || null,
                boardName,
                alightName,
                finalWalk: fwRes
            };
            window.finalWalkRouteGeojson = fwRes;

            if (j2) {
                const last = legs[legs.length - 1];
                const xWalk = rest[0] && rest[0].type === 'walk' ? rest[0] : null;
                const j2End = j2.coords[j2.coords.length - 1];
                const finalWalkM = last.type === 'walk' ? last.distM : 0;
                const finalWalkMin = finalWalkM > 0 ? last.min : 0;
                const waitMin = (window.CalzadaTransit && window.CalzadaTransit.constants.TRANSFER_EXTRA_MIN) || 2;
                pendingTransfer = {
                    hubName: alightName,
                    boardName: transitStopName(j2.board) || alightName,
                    hubPt: alightPt,
                    boardPt: j2.coords[0],
                    via: xWalk ? (xWalk.via || null) : null,
                    via_tl: xWalk ? (xWalk.via_tl || null) : null,
                    jeep: {
                        routeId: j2.routeId,
                        headsign: transitHeadsign(j2),
                        signboard: j2.signboard || null,
                        distM: j2.distM,
                        min: j2.min,
                        fare: j2.fare,
                        fareDisc: j2.fareDisc,
                        coords: j2.coords,
                        alightName: transitStopName(j2.alight) || transitPlaceNear(j2End, 200) || null,
                        alightPt: j2End
                    },
                    finalWalkM,
                    finalWalkMin,
                    waitMin,
                    extraMin: waitMin + j2.min + finalWalkMin
                };
            } else {
                pendingTransfer = null;
            }
            updateRouteSource('next-transit-route', j2 ? j2.coords.map(c => [c[1], c[0]]) : []);

            await finalizeJeepneyRoute(wRes, tRes, straightDistM);
            if (token !== transitApplyToken) return;
            drawTransitMarkers();

            // The selected card shows the same total as the summary (real walks instead of estimates)
            const fw = getFinalWalkInfo();
            const total = currentWalkDur + currentTransitDur + (fw.finalWalkMin || 0) + (pendingTransfer ? pendingTransfer.extraMin : 0);
            const walkM = currentWalkDist * 1000 + (fw.finalWalkM || 0) + (pendingTransfer ? pendingTransfer.finalWalkM : 0);
            if (window.CalzadaTransitUI) window.CalzadaTransitUI.setOptionActual(transitSelected, total, walkM);
        }

        // ── Labelled stops on the map: where to get on, off, and on the next jeep ──
        let transitStopMarkers = [];
        function clearTransitMarkers() {
            transitStopMarkers.forEach(m => { try { m.remove(); } catch (_) { /* gone */ } });
            transitStopMarkers = [];
        }
        function drawTransitMarkers() {
            clearTransitMarkers();
            const tr = transitRouteGeojson;
            if (!tr || !tr.curated || selectedMode === 'walking' || !Array.isArray(tr.coordinates) || tr.coordinates.length < 2) return;
            const tl = transitLang() === 'tl';
            const L = tl
                ? { board: 'Sakay', off: 'Baba', change: 'Baba at lipat', next: 'Susunod na sakay' }
                : { board: 'Board', off: 'Get off', change: 'Get off & change', next: 'Next jeep' };
            const add = (pt, kind, verb, name) => {
                if (!pt) return;
                const el = document.createElement('div');
                el.className = `czt-stop czt-stop--${kind}`;
                const dot = document.createElement('span');
                dot.className = 'czt-stop-dot';
                const chip = document.createElement('span');
                chip.className = 'czt-stop-chip';
                const b = document.createElement('b');
                b.textContent = verb;
                chip.appendChild(b);
                chip.appendChild(document.createTextNode(name ? ` · ${name}` : ''));
                el.appendChild(dot);
                el.appendChild(chip);
                // Label above the dot; the dot's centre sits on the stop
                const m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, 8] })
                    .setLngLat([pt[1], pt[0]])
                    .addTo(map);
                transitStopMarkers.push(m);
            };
            // The plain boarding dot of drawRoutes is replaced by the labelled one
            if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }
            const c = tr.coordinates;
            const boardPt = c[0], alightPt = c[c.length - 1];
            add(boardPt, 'board', L.board, tr.boardName);
            const x = pendingTransfer;
            if (x) {
                const together = getHaversineDist(alightPt[0], alightPt[1], x.boardPt[0], x.boardPt[1]) * 1000 <= 40;
                if (together) {
                    add(x.boardPt, 'change', L.change, x.boardName);
                } else {
                    add(alightPt, 'off', L.off, tr.alightName);
                    add(x.boardPt, 'next', L.next, x.boardName);
                }
            } else {
                add(alightPt, 'off', L.off, tr.alightName);
            }
        }

        // ── Transfer stop: prompt and re-compute during a journey ──
        let transferAutoDone = false;

        function transferPromptState() {
            if (!pendingTransfer) return null;
            return {
                hubName: pendingTransfer.hubName,
                boardName: pendingTransfer.boardName !== pendingTransfer.hubName ? pendingTransfer.boardName : null,
                nextName: pendingTransfer.jeep.headsign
            };
        }

        function updateTransferPrompt(lat, lng) {
            if (!pendingTransfer || !isTrackingArrival || !window.CalzadaTransitUI) {
                if (window.CalzadaTransitUI) window.CalzadaTransitUI.hideTransfer();
                return;
            }
            const st = transferPromptState();
            let near = false;
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                const dHub = getHaversineDist(lat, lng, pendingTransfer.hubPt[0], pendingTransfer.hubPt[1]) * 1000;
                const dBoard = getHaversineDist(lat, lng, pendingTransfer.boardPt[0], pendingTransfer.boardPt[1]) * 1000;
                near = dHub <= 150 || dBoard <= 150;
                // At the next jeep's stop: re-compute without asking
                if (dBoard <= 40 && !transferAutoDone && !transferRecomputing) {
                    transferAutoDone = true;
                    recomputeFromTransfer([lat, lng]);
                    return;
                }
            }
            st.near = near;
            window.CalzadaTransitUI.showTransfer(st, () => {
                const here = currentLocation && Number.isFinite(currentLocation.lat) ? [currentLocation.lat, currentLocation.lng] : null;
                recomputeFromTransfer(here);
            });
        }

        // The user is at the transfer stop: keep the legs done so far, then plan from here
        async function recomputeFromTransfer(herePt) {
            if (!pendingTransfer || transferRecomputing) return;
            transferRecomputing = true;
            const xfer = pendingTransfer;
            try {
                const stops = lastItineraryStops || {};
                const doneLegs = [];
                if (currentWalkDist * 1000 >= 10) doneLegs.push({ type: 'walk', durationMin: Math.round(currentWalkDur), distanceKm: Math.round(currentWalkDist * 100) / 100, fare: 0, boardStop: null, alightStop: null });
                doneLegs.push({
                    type: 'jeepney',
                    durationMin: Math.round(currentTransitDur),
                    distanceKm: Math.round(currentTransitDist * 100) / 100,
                    fare: Math.round(currentFare * 100) / 100,
                    boardStop: String(stops.boardAt || transitRouteGeojson?.boardName || 'National Highway').slice(0, 120),
                    alightStop: String(stops.alightAt || xfer.hubName || '').slice(0, 120) || null
                });
                if ((stops.finalWalkM || 0) >= 10) doneLegs.push({ type: 'walk', durationMin: Math.round(stops.finalWalkMin || 0), distanceKm: Math.round(stops.finalWalkM / 10) / 100, fare: 0, boardStop: null, alightStop: null });
                priorTrip = {
                    originName: (priorTrip && priorTrip.originName) || originPlaceName,
                    legs: [...((priorTrip && priorTrip.legs) || []), ...doneLegs],
                    estimatedMin: ((priorTrip && priorTrip.estimatedMin) || 0) + currentWalkDur + currentTransitDur + (stops.finalWalkMin || 0)
                };

                // From where the user is, when that is at the stop; else from the stop itself
                const useHere = herePt && getHaversineDist(herePt[0], herePt[1], xfer.boardPt[0], xfer.boardPt[1]) * 1000 <= 300;
                selectedCoords.origin = useHere ? herePt : xfer.boardPt.slice();
                originPlaceName = xfer.boardName;
                transferPreferred = xfer.jeep.routeId;
                pendingTransfer = null;
                // A short last part must stay a jeep ride, not switch to walking
                userExplicitMode = true;
                selectedMode = 'jeepney';
                if (window.CalzadaTransitUI) window.CalzadaTransitUI.hideTransfer();
                updateRouteSource('completed-route', []);
                ensureOriginMarker();
                updateODDisplay();

                await executeRouteQuery();

                activeLegIndex = 0;
                lastMatchedSegmentIndex = 0;
                transferAutoDone = false;
                startActiveJourneyUI();
                saveJourneyState();
                const msg = transitLang() === 'tl' ? `Na-recompute mula sa ${xfer.boardName}` : `Route updated from ${xfer.boardName}`;
                showToast(msg, 'success');
            } catch (e) {
                console.error('Re-compute at the transfer stop failed:', e);
            } finally {
                transferRecomputing = false;
            }
        }

        const executeRouteQueryCore = async () => {
            if (!selectedCoords.origin || !selectedCoords.destination) {
                renderPlannerState();
                return;
            }

            // FIX ∗13: Loading indicator
            document.getElementById('startJourneyBtn').disabled = true;
            const sumTime = document.getElementById('sumTime');
            const sumFare = document.getElementById('sumFare');
            // Shaped placeholder using the shared skeleton token - this was the one pending-fetch
            // state on the site that still used a brand-blue spinner. Both values are stubbed so
            // the summary banner keeps its height while route calculation is underway.
            if (sumTime) sumTime.innerHTML = '<span class="skeleton sk-route-val" role="status" aria-label="Calculating route"></span>';
            if (sumFare) sumFare.innerHTML = '<span class="skeleton sk-route-val sk-route-fare"></span>';

            const oPt = selectedCoords.origin;
            const dPt = selectedCoords.destination;
            const straightDistM = getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000;

            // Intelligent default: for very short trips under ~800m, default to walking unless user explicitly chose a mode
            if (!userExplicitMode) {
                selectedMode = (straightDistM < 800) ? 'walking' : 'jeepney';
            }
            setModeUI(selectedMode);

            // Always show mode buttons
            document.getElementById('modeWalking').style.display = 'inline-flex';
            document.getElementById('modeJeepney').style.display = 'inline-flex';

            // Draw Markers
            ensureOriginMarker();
            ensureDestMarker();

            // ── WALKING MODE: pure foot route from origin to destination ───────────
            if (selectedMode === 'walking') {
                clearTransitPlan();
                if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }

                let wRes = null;
                try {
                    wRes = await fetchOSRMRouteCoords(oPt, dPt, 'foot');
                } catch (e) { console.error('Walk OSRM error:', e); }

                if (!wRes || !wRes.coordinates || wRes.coordinates.length < 2) {
                    const dist = getHaversineDist(oPt[0], oPt[1], dPt[0], dPt[1]) * 1000;
                    wRes = { coordinates: [oPt, dPt], distance: dist, duration: (dist / 1000 / WALK_SPEED_KPH) * 3600, steps: [] };
                }

                walkRouteGeojson = wRes;
                transitRouteGeojson = { coordinates: [], distance: 0, duration: 0, steps: [] };
                window.walkRouteGeojson = walkRouteGeojson;
                window.transitRouteGeojson = transitRouteGeojson;
                window.finalWalkRouteGeojson = null;

                // OSRM measures from the road points it snapped to, so add the on-foot gaps
                // from the origin to the route start and from the route end to the destination.
                const walkCoordsW = wRes.coordinates || [];
                const walkGapsM = gapToRouteM(oPt, walkCoordsW[0]) + gapToRouteM(walkCoordsW[walkCoordsW.length - 1], dPt);
                currentWalkDist = (wRes.distance + walkGapsM) / 1000;
                currentWalkDur = computeWalkDurationMin(currentWalkDist);
                currentTransitDist = 0;
                currentTransitDur = 0;
                currentFare = 0;

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
                    // Same walk distance as the leg and the summary
                    const totalWalkM = Math.round(currentWalkDist * 1000 || straightDistM);
                    if (totalWalkM < 800) {
                        walkHintEl.innerHTML = `<ion-icon name="walk-outline"></ion-icon><span>This distance is walkable (${formatDistanceM(totalWalkM)})</span>`;
                        walkHintEl.style.display = 'inline-flex';
                    } else {
                        walkHintEl.style.display = 'none';
                    }
                }

                renderItinerary();
                renderPlannerState();
                return;
            }

            // ── JEEPNEY MODE: curated routes first (options, transfers), else the highway heuristic ──
            if (await planWithTransitRoutes(oPt, dPt, straightDistM)) return;

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
            const HIGHWAY_KEYWORDS = ['national highway', 'maharlika', 'highway', 'diversion'];
            // "Road 1" is the national road only when OSM gives it a route number (ref); subdivisions
            // have their own streets named Road 1, Road 10, Road 11...
            const isJeepneyRoadStep = (step) => {
                const name = (step.name || '').toLowerCase();
                return HIGHWAY_KEYWORDS.some(k => name.includes(k)) || (/\broad 1\b/.test(name) && !!step.ref);
            };
            const findHighwayBoardingPoint = (routeResult) => {
                const steps = routeResult.steps || [];
                for (let i = 0; i < steps.length; i++) {
                    if (isJeepneyRoadStep(steps[i])) {
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
            const walkDistM = getHaversineDist(oPt[0], oPt[1], boardingPt[0], boardingPt[1]) * 1000;

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

            // The boarding point above is where the car route joins the highway. The walk can reach the
            // jeepney's road earlier (e.g. from a subdivision exit further up) and then follow it to that
            // point. Board where the walk reaches the road instead, so nobody walks along the jeepney's
            // own route for more than ~150 m, provided the jeepney from there passes the old boarding
            // point (right direction, no detour). The fare follows the new, longer ride.
            const earlierBoarding = await boardWhereWalkReachesJeepneyRoad(wRes, tRes, boardingPt, dPt, isJeepneyRoadStep);
            if (earlierBoarding) {
                wRes = earlierBoarding.walk;
                tRes = earlierBoarding.transit;
            }

            // ALIGHTING POINT + FINAL WALK
            // Jeepneys stay on their road. Find the LAST step of tRes for which isJeepneyRoadStep(step) is true.
            // The alighting point = the last coordinate of that step's geometry (where the car route leaves the jeepney road).
            const tSteps = tRes.steps || [];
            let lastJeepIdx = -1;
            for (let i = tSteps.length - 1; i >= 0; i--) {
                if (isJeepneyRoadStep(tSteps[i])) {
                    lastJeepIdx = i;
                    break;
                }
            }

            let alightPt = null;
            if (lastJeepIdx >= 0) {
                const geom = tSteps[lastJeepIdx].geometry?.coordinates;
                if (geom && geom.length > 0) {
                    const lastC = geom[geom.length - 1]; // [lng, lat]
                    alightPt = [lastC[1], lastC[0]];
                } else if (tSteps[lastJeepIdx].maneuver?.location) {
                    const loc = tSteps[lastJeepIdx].maneuver.location;
                    alightPt = [loc[1], loc[0]];
                }
            }

            // Distance along tRes after the alighting point to destination
            let remainingDistM = 0;
            if (lastJeepIdx >= 0) {
                for (let i = lastJeepIdx + 1; i < tSteps.length; i++) {
                    remainingDistM += (tSteps[i].distance || 0);
                }
                if (lastJeepIdx === tSteps.length - 1 && alightPt) {
                    remainingDistM = getHaversineDist(alightPt[0], alightPt[1], dPt[0], dPt[1]) * 1000;
                }
            }

            // If remaining distance along tRes <= 60 m, or no jeepney-road step exists after boarding,
            // keep today's behavior (no final walk).
            if (lastJeepIdx < 0 || !alightPt || remainingDistM <= 60) {
                tRes.finalWalk = null;
                window.finalWalkRouteGeojson = null;
            } else {
                // Trim tRes to end at the alighting point: coordinates, steps (drop steps after it),
                // distance and duration recomputed from the kept part.
                let cutIdx = 0;
                let minD = Infinity;
                for (let i = 0; i < tRes.coordinates.length; i++) {
                    const d = getHaversineDist(alightPt[0], alightPt[1], tRes.coordinates[i][0], tRes.coordinates[i][1]) * 1000;
                    if (d < minD) {
                        minD = d;
                        cutIdx = i;
                    }
                }
                const trimmedCoords = tRes.coordinates.slice(0, cutIdx + 1);
                if (trimmedCoords.length === 0 || getHaversineDist(trimmedCoords[trimmedCoords.length - 1][0], trimmedCoords[trimmedCoords.length - 1][1], alightPt[0], alightPt[1]) * 1000 > 1) {
                    trimmedCoords.push(alightPt);
                } else {
                    trimmedCoords[trimmedCoords.length - 1] = alightPt;
                }

                const keptSteps = tSteps.slice(0, lastJeepIdx + 1);
                const alightRoadName = (keptSteps[lastJeepIdx]?.name || 'National Highway').trim() || 'National Highway';
                keptSteps.push({
                    name: alightRoadName,
                    stopName: alightRoadName,
                    distance: 0,
                    duration: 0,
                    maneuver: {
                        type: 'arrive',
                        modifier: '',
                        location: [alightPt[1], alightPt[0]]
                    },
                    mode: 'driving'
                });

                let keptDist = 0;
                let keptDur = 0;
                let hasStepDur = true;
                for (let i = 0; i <= lastJeepIdx; i++) {
                    keptDist += (tSteps[i].distance || 0);
                    if (typeof tSteps[i].duration === 'number' && tSteps[i].duration > 0) {
                        keptDur += tSteps[i].duration;
                    } else {
                        hasStepDur = false;
                    }
                }
                if (!hasStepDur || keptDur <= 0) {
                    const origDist = tRes.distance || keptDist || 1;
                    keptDur = (keptDist / origDist) * (tRes.duration || 60);
                }

                tRes.coordinates = trimmedCoords;
                tRes.steps = keptSteps;
                tRes.distance = Math.max(50, keptDist);
                tRes.duration = Math.max(30, keptDur);

                // Fetch foot route alighting point -> destination with fetchOSRMRouteCoords(..., 'foot')
                let fwRes = null;
                try {
                    fwRes = await fetchOSRMRouteCoords(alightPt, dPt, 'foot');
                } catch (e) {
                    console.error('Final walk OSRM error:', e);
                }

                if (!fwRes || !fwRes.coordinates || fwRes.coordinates.length < 2) {
                    const haversineM = getHaversineDist(alightPt[0], alightPt[1], dPt[0], dPt[1]) * 1000;
                    const fwDistM = Math.max(10, Math.round(haversineM * 1.3));
                    const fwDurSec = Math.max(30, (fwDistM / 1000 / WALK_SPEED_KPH) * 3600);
                    fwRes = {
                        coordinates: [alightPt, dPt],
                        distance: fwDistM,
                        duration: fwDurSec,
                        approximate: true,
                        steps: [
                            {
                                name: destPlaceName || 'Destination',
                                distance: fwDistM,
                                duration: fwDurSec,
                                maneuver: { type: 'depart', modifier: '', location: [alightPt[1], alightPt[0]] },
                                mode: 'foot'
                            },
                            {
                                name: destPlaceName || 'Destination',
                                distance: 0,
                                duration: 0,
                                maneuver: { type: 'arrive', modifier: '', location: [dPt[1], dPt[0]] },
                                mode: 'foot'
                            }
                        ]
                    };
                }

                tRes.finalWalk = fwRes;
                window.finalWalkRouteGeojson = fwRes;
            }

            // The heuristic route is one jeep: no options list, no transfer
            clearTransitPlan();
            await finalizeJeepneyRoute(wRes, tRes, straightDistM);
        };

        // Route loading: as soon as both places are set the panel says "Finding routes…" with a
        // skeleton result, and says so plainly if no route could be made.
        // While a route is computed, an animated dashed line joins the two places on the map,
        // so the map itself shows that something is happening.
        let routeSearchAnim = 0;
        const ROUTE_SEARCH_SRC = 'calzada-route-search';
        function showRouteSearchLine(on) {
            if (!map || !map.getStyle) return;
            const clear = () => {
                if (routeSearchAnim) { cancelAnimationFrame(routeSearchAnim); routeSearchAnim = 0; }
                try { if (map.getLayer(ROUTE_SEARCH_SRC)) map.removeLayer(ROUTE_SEARCH_SRC); } catch (_) {}
                try { if (map.getSource(ROUTE_SEARCH_SRC)) map.removeSource(ROUTE_SEARCH_SRC); } catch (_) {}
            };
            if (!on || !selectedCoords.origin || !selectedCoords.destination) { clear(); return; }
            const o = selectedCoords.origin, d = selectedCoords.destination;
            // gentle arc so it does not read as a real route
            const pts = [];
            const mx = (o[1] + d[1]) / 2, my = (o[0] + d[0]) / 2;
            const dx = d[1] - o[1], dy = d[0] - o[0];
            const cx = mx - dy * 0.18, cy = my + dx * 0.18;
            for (let i = 0; i <= 32; i++) {
                const u = i / 32;
                const lng = (1 - u) * (1 - u) * o[1] + 2 * (1 - u) * u * cx + u * u * d[1];
                const lat = (1 - u) * (1 - u) * o[0] + 2 * (1 - u) * u * cy + u * u * d[0];
                pts.push([lng, lat]);
            }
            const data = { type: 'Feature', geometry: { type: 'LineString', coordinates: pts } };
            try {
                if (map.getSource(ROUTE_SEARCH_SRC)) map.getSource(ROUTE_SEARCH_SRC).setData(data);
                else {
                    map.addSource(ROUTE_SEARCH_SRC, { type: 'geojson', data });
                    map.addLayer({
                        id: ROUTE_SEARCH_SRC, type: 'line', source: ROUTE_SEARCH_SRC,
                        layout: { 'line-cap': 'round', 'line-join': 'round' },
                        paint: { 'line-color': '#378ADD', 'line-width': 4, 'line-opacity': 0.85, 'line-dasharray': [0, 2, 2] }
                    });
                }
            } catch (_) { return; }
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            // March the dashes along the line
            const seq = [[0, 2, 2], [0.5, 2, 1.5], [1, 2, 1], [1.5, 2, 0.5], [2, 2, 0], [0, 0.5, 2, 1.5], [0, 1, 2, 1], [0, 1.5, 2, 0.5]];
            let step = 0, last = 0;
            const tick = (ts) => {
                if (!routeLoading) { clear(); return; }
                if (ts - last > 70) {
                    last = ts;
                    step = (step + 1) % seq.length;
                    try { map.setPaintProperty(ROUTE_SEARCH_SRC, 'line-dasharray', seq[step]); } catch (_) {}
                }
                routeSearchAnim = requestAnimationFrame(tick);
            };
            if (routeSearchAnim) cancelAnimationFrame(routeSearchAnim);
            routeSearchAnim = requestAnimationFrame(tick);
        }

        function routeLoadingText() { return transitLang() === 'tl' ? 'Hinahanap ang mga ruta' : 'Finding routes'; }
        const setRouteLoading = (on) => {
            routeLoading = on;
            const odBlock = document.querySelector('.od-input-block');
            if (odBlock) odBlock.classList.toggle('is-routing', !!on);
            if (directionsCard) directionsCard.classList.toggle('is-route-loading', !!on);
            showRouteSearchLine(!!on);
            const peek = document.getElementById('peekSummary');
            if (on && peek) peek.textContent = routeLoadingText();
            const blk = document.getElementById('routeSummaryBlock');
            const legs = document.getElementById('itineraryLegs');
            const helper = document.getElementById('startJourneyHelper');
            const startBtn = document.getElementById('startJourneyBtn');
            if (startBtn) startBtn.classList.toggle('is-loading', on);
            if (!on) return;
            if (startBtn) startBtn.disabled = true;
            if (helper) {
                helper.style.display = '';
                helper.textContent = routeLoadingText();
                helper.setAttribute('role', 'status');
            }
            if (blk) {
                blk.style.removeProperty('display');
                blk.classList.remove('hidden');
                const banner = blk.querySelector('.route-summary-banner');
                if (banner) banner.style.removeProperty('display');
            }
            const st = document.getElementById('sumTime');
            const sf = document.getElementById('sumFare');
            if (st) st.innerHTML = '<span class="skeleton sk-route-val" role="status" aria-label="Calculating route"></span>';
            if (sf) sf.innerHTML = '<span class="skeleton sk-route-val sk-route-fare"></span>';
            if (legs && !legs.querySelector('.sk-leg-row')) {
                const ICON_WALK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="1.6"/><path d="M7 21l3-4M16 21l-2-4-3-3 1-6M6 12l2-3 4-1 3 3 3 1"/></svg>';
                const ICON_JEEP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="10" rx="2"/><path d="M3 11h18M7 16v2M17 16v2M7 6V4h10v2"/></svg>';
                const ICON_FLAG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>';
                const row = (icon, w1, w2, last) => `<div class="sk-leg-row${last ? ' is-last' : ''}" aria-hidden="true"><span class="sk-leg-time skeleton"></span><span class="sk-leg-node"></span><span class="sk-leg-text"><span class="skeleton sk-leg-line" style="width:${w1}%"></span><span class="skeleton sk-leg-line sk-leg-line--sub" style="width:${w2}%"></span></span></div>`;
                legs.innerHTML = '<div class="sk-legs">' + row(ICON_WALK, 62, 38) + row(ICON_JEEP, 80, 52) + row(ICON_WALK, 55, 30) + row(ICON_FLAG, 48, 0, true) + '</div>';
            }
        };
        const executeRouteQuery = async () => {
            if (!selectedCoords.origin || !selectedCoords.destination) return executeRouteQueryCore();
            let failed = false;
            setRouteLoading(true);
            try {
                await executeRouteQueryCore();
            } catch (e) {
                console.error('Route failed:', e);
                failed = true;
            } finally {
                setRouteLoading(false);
            }
            const hasRoute = !!((walkRouteGeojson && walkRouteGeojson.coordinates?.length >= 2) || (transitRouteGeojson && transitRouteGeojson.coordinates?.length >= 2));
            // Phones: a new route opens the sheet at half height so the route on the map is seen
            // (review #04). Only for a new trip, not for the live origin's quiet replans.
            if (hasRoute && !failed && !isTrackingArrival && window.innerWidth <= 768) {
                const o = selectedCoords.origin, d = selectedCoords.destination;
                const tripKey = `${o[0].toFixed(3)},${o[1].toFixed(3)}|${d[0].toFixed(3)},${d[1].toFixed(3)}|${selectedMode}`;
                if (tripKey !== lastPeekTripKey && !directionsCard.classList.contains('collapsed')) {
                    lastPeekTripKey = tripKey;
                    requestAnimationFrame(() => setSheetState('peek', true));
                }
            }
            if (failed || !hasRoute) {
                renderPlannerState();
                const helper = document.getElementById('startJourneyHelper');
                if (helper) {
                    helper.style.display = '';
                    helper.textContent = transitLang() === 'tl'
                        ? 'Walang nahanap na ruta. Subukan ulit o pumili ng ibang lugar.'
                        : 'No route found. Try again or pick another place.';
                }
            }
        };
        window.executeRouteQuery = executeRouteQuery;

        // Shared end of a jeepney route (heuristic or curated): stats, fare, map, steps, panel.
        const finalizeJeepneyRoute = async (wRes, tRes, straightDistM) => {
            walkRouteGeojson = wRes;
            transitRouteGeojson = tRes;
            window.walkRouteGeojson = walkRouteGeojson;
            window.transitRouteGeojson = transitRouteGeojson;

            // When the origin is on (or snaps to) the highway, the boarding point is the origin's
            // own snap point and OSRM returns a 0 m walk. The walk from the origin to that point
            // is real, so count it.
            currentWalkDist = (wRes.distance + gapToRouteM(selectedCoords.origin, (wRes.coordinates || [])[0])) / 1000;
            currentWalkDur = computeWalkDurationMin(currentWalkDist);
            currentTransitDist = tRes.distance / 1000;

            // Jeepney speed correction: real jeepney avg (~20 km/h) + boarding buffer
            const correctedTransitDur = (currentTransitDist / JEEPNEY_SPEED_KPH) * 3600 + BOARDING_BUFFER_SEC;
            currentTransitDur = Math.ceil(correctedTransitDur / 60);

            // Single centralized fare calculation based on actual transit distance (fare rates loaded
            // once; waits at most 2 s for them, then uses the built-in copy)
            if (window.CalzadaFare) {
                await Promise.race([window.CalzadaFare.load(), new Promise(r => setTimeout(r, 2000))]);
            }
            currentFare = computeLTFRBFare(currentTransitDist);

            drawRoutes(wRes.coordinates, tRes.coordinates, tRes.finalWalk?.coordinates);

            // Populate Guide turn-by-turn steps immediately for Jeepney multi-leg
            const walkStepsClean = (wRes.steps || []).map(s => ({ ...s, mode: 'foot' }));
            const transitStepsClean = (tRes.steps || []).map(s => ({ ...s, mode: 'driving' }));
            const finalWalkClean = (tRes.finalWalk?.steps || []).map(s => ({ ...s, mode: 'foot' }));
            window.activeRouteSteps = deduplicateSteps([...walkStepsClean, ...transitStepsClean, ...finalWalkClean]);
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
                    walkHintEl.innerHTML = `<ion-icon name="information-circle-outline"></ion-icon><span>Short trip (${formatDistanceM(totalTripM)}) · Walk is walkable</span>`;
                    walkHintEl.style.display = 'inline-flex';
                } else {
                    walkHintEl.style.display = 'none';
                }
            }

            renderItinerary();
            renderPlannerState();
            fitRoutePreviewBounds();
        };

        // =============================================
        // SESSION PERSISTENCE HELPER
        // =============================================
        // The route (legs with geometry and steps) is saved with the journey, so a reload redraws it
        // without asking the routing servers again. It is serialised only when it changes: this runs on
        // every location fix, and a live reroute replaces a leg's coordinates and steps in place.
        let savedRouteRefs = null;
        let savedRouteJson = 'null';
        const routeJsonForSave = () => {
            const w = walkRouteGeojson, tr = transitRouteGeojson;
            const refs = [w, w && w.coordinates, w && w.steps, tr, tr && tr.coordinates, tr && tr.steps];
            if (!savedRouteRefs || refs.some((r, i) => r !== savedRouteRefs[i])) {
                savedRouteRefs = refs;
                savedRouteJson = (w || tr) ? JSON.stringify({ walk: w, transit: tr }) : 'null';
            }
            return savedRouteJson;
        };
        let arrivedJourneyId = null; // set on arrival, so nothing saves that journey as active again

        // sessionStorage only (this tab on this device): the origin coordinates never go to
        // localStorage or Firestore; the trip saved on arrival keeps only the origin label.
        const saveJourneyState = () => {
            if (isTrackingArrival && journeyId && journeyId === arrivedJourneyId) return;
            try {
                const state = JSON.stringify({
                    origin: selectedCoords.origin,
                    destination: selectedCoords.destination,
                    originName: originPlaceName,
                    destName: destPlaceName,
                    selectedMode: selectedMode,
                    activeLegIndex: activeLegIndex,
                    currentStepIndex: window.currentStepIndex || 0,
                    isJourneyActive: isTrackingArrival,
                    startedAt: journeyStartedAt,
                    journeyId,
                    savedAt: Date.now(),
                    // Route figures as shown (walk includes the gaps to the road; fare from the jeepney leg)
                    stats: {
                        walkDist: currentWalkDist, walkDur: currentWalkDur,
                        transitDist: currentTransitDist, transitDur: currentTransitDur,
                        fare: currentFare
                    },
                    // Trip with a transfer: the next jeep, and the legs done before a re-compute
                    transfer: pendingTransfer || null,
                    prior: priorTrip || null
                });
                sessionStorage.setItem(STORAGE_KEY, `${state.slice(0, -1)},"route":${routeJsonForSave()}}`);
            } catch (e) { /* sessionStorage unavailable or full */ }
        };

        // Routing servers. The public OSRM demo server only has the car profile and ignores "foot", so walks there
        // follow one-ways and car detours (a ~400 m walk came out ~1.1 km). Walking legs therefore use the FOSSGIS
        // foot server (routing.openstreetmap.de: OpenStreetMap data, real pedestrian profile); jeepney legs, and so the
        // fare, stay on the demo server. If the foot server fails, takes over 5 s or finds no route, the walk falls
        // back to the demo server, so routing never breaks. FOSSGIS usage policy: OSM attribution plus a "fix the map"
        // link on the map (see the map's attributionControl), max 1 request per second.
        const OSRM_DEMO_URL = 'https://router.project-osrm.org/route/v1';
        const OSRM_FOOT_URL = 'https://routing.openstreetmap.de/routed-foot/route/v1';
        const FOOT_ROUTE_TIMEOUT_MS = 5000;

        // OSRM response JSON, or null (HTTP error, timeout, code other than Ok).
        const requestOsrmJson = async (url, timeoutMs = 0) => {
            const controller = timeoutMs ? new AbortController() : null;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
            try {
                const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
                if (!res.ok) return null;
                const json = await res.json();
                return json.code === 'Ok' ? json : null;
            } finally {
                if (timer) clearTimeout(timer);
            }
        };

        // First route of an OSRM response with the response's waypoints attached, or null.
        const requestOsrmRoute = async (url, timeoutMs = 0) => {
            const json = await requestOsrmJson(url, timeoutMs);
            return (json && json.routes && json.routes.length > 0) ? { ...json.routes[0], waypoints: json.waypoints || [] } : null;
        };

        // Walks that start or end inside a gated subdivision. Its roads are tagged access=private in
        // OpenStreetMap and the FOSSGIS foot router will not use them at all, so it moves the start (or
        // end) onto the nearest public street, often across houses and through the wrong exit. The demo
        // server's profile does use private roads at the start and end of a route, and so leaves through
        // the subdivision's own gate. Such a walk takes the demo route inside the private area and the
        // FOSSGIS foot route from the first public road on; if the two cannot be joined reliably, the
        // whole walk uses the demo route.
        const PRIVATE_SNAP_M = 30;  // FOSSGIS moved the point further than this: it is on a private road
        const PUBLIC_SNAP_M = 10;   // a point this close to a FOSSGIS foot path is on a public road
        const walkThroughPrivateArea = async (coords, query, footRoute) => {
            const wps = footRoute.waypoints || [];
            const startPrivate = wps.length > 0 && (wps[0].distance || 0) > PRIVATE_SNAP_M;
            const endPrivate = wps.length > 1 && (wps[wps.length - 1].distance || 0) > PRIVATE_SNAP_M;
            if (!startPrivate && !endPrivate) return null;

            const demo = await requestOsrmRoute(`${OSRM_DEMO_URL}/foot/${coords}?${query}`);
            if (!demo) return null; // keep the FOSSGIS route
            const whole = { route: demo, source: 'OSRM demo server (whole walk, private area)' };
            const steps = (demo.legs && demo.legs[0] && demo.legs[0].steps) || [];
            if (steps.length < 2) return whole;

            try {
                // Which turns of the demo route are on public roads: one FOSSGIS table request gives
                // the distance from each to the nearest foot path.
                const turnPts = steps.map(s => s.maneuver.location);
                const table = await requestOsrmJson(`${OSRM_FOOT_URL.replace('/route/v1', '/table/v1')}/foot/${turnPts.map(p => `${p[0]},${p[1]}`).join(';')}?destinations=0`, FOOT_ROUTE_TIMEOUT_MS);
                if (!table || !table.sources || table.sources.length !== turnPts.length) return whole;
                const isPublic = table.sources.map(w => (w.distance || 0) <= PUBLIC_SNAP_M);
                const last = steps.length - 1;
                let from = 0, to = last;
                if (startPrivate) { from = isPublic.findIndex((p, i) => i > 0 && p); if (from < 0) return whole; }
                if (endPrivate) { to = -1; for (let i = last - 1; i > from; i--) if (isPublic[i]) { to = i; break; } if (to < 0) return whole; }
                if (to <= from) return whole;

                const a = turnPts[from], b = turnPts[to];
                const mid = await requestOsrmRoute(`${OSRM_FOOT_URL}/foot/${a[0]},${a[1]};${b[0]},${b[1]}?${query}`, FOOT_ROUTE_TIMEOUT_MS);
                const midWps = mid ? mid.waypoints : [];
                if (!mid || midWps.length < 2 || midWps.some(w => (w.distance || 0) > PUBLIC_SNAP_M)) return whole;

                // Demo route up to the join turn, FOSSGIS between the joins, demo route after the end join
                const demoCoords = demo.geometry.coordinates;
                const nearestIdx = (pt) => {
                    let idx = 0, best = Infinity;
                    demoCoords.forEach((c, i) => { const d = (c[0] - pt[0]) ** 2 + (c[1] - pt[1]) ** 2; if (d < best) { best = d; idx = i; } });
                    return idx;
                };
                const iA = from > 0 ? nearestIdx(a) : 0;
                const iB = to < last ? nearestIdx(b) : demoCoords.length - 1;
                if (iB < iA) return whole;
                const geometry = [
                    ...demoCoords.slice(0, from > 0 ? iA + 1 : 0),
                    ...mid.geometry.coordinates,
                    ...demoCoords.slice(to < last ? iB : demoCoords.length)
                ];
                let midSteps = (mid.legs[0].steps || []).slice();
                // The join keeps the demo route's own turn there instead of a second "Walk towards"
                if (from > 0 && midSteps.length) midSteps[0] = { ...midSteps[0], maneuver: { ...steps[from].maneuver } };
                if (to < last) midSteps = midSteps.filter(s => s.maneuver.type !== 'arrive');
                const joinedSteps = [...steps.slice(0, from), ...midSteps, ...(to < last ? steps.slice(to) : [])];
                const sum = (list) => list.reduce((m, s) => m + (s.distance || 0), 0);
                const distance = sum(steps.slice(0, from)) + mid.distance + (to < last ? sum(steps.slice(to)) : 0);
                return {
                    route: { geometry: { type: 'LineString', coordinates: geometry }, distance, duration: demo.duration, legs: [{ steps: joinedSteps }], waypoints: demo.waypoints },
                    source: `OSRM demo server inside the private area${startPrivate ? ' (start)' : ''}${endPrivate ? ' (end)' : ''}, FOSSGIS foot server for the rest`
                };
            } catch (_) {
                return whole;
            }
        };

        const fetchOSRMRouteCoords = async (start, end, profile) => {
            const coords = `${start[1]},${start[0]};${end[1]},${end[0]}`;
            const query = 'overview=full&geometries=geojson&steps=true&alternatives=false';
            try {
                let rt = null;
                let walkSource = null;
                if (profile === 'foot') {
                    try {
                        rt = await requestOsrmRoute(`${OSRM_FOOT_URL}/foot/${coords}?${query}`, FOOT_ROUTE_TIMEOUT_MS);
                        if (rt) walkSource = 'FOSSGIS foot server';
                    } catch (_) { rt = null; /* failed or timed out: fall back below */ }
                    if (rt) {
                        const viaGate = await walkThroughPrivateArea(coords, query, rt);
                        if (viaGate) { rt = viaGate.route; walkSource = viaGate.source; }
                    }
                }
                if (!rt) {
                    // OSRM public instance supports: foot, car (not 'driving')
                    const osrmProfile = profile === 'foot' ? 'foot' : 'car';
                    rt = await requestOsrmRoute(`${OSRM_DEMO_URL}/${osrmProfile}/${coords}?${query}`);
                    if (rt && profile === 'foot') walkSource = 'OSRM demo server (fallback)';
                }
                if (profile === 'foot') {
                    console.info(`Walk route: ${walkSource || 'no route from either server'}`);
                }
                if (rt) {
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
            } catch (e) { console.error('OSRM Error:', e); }
            return null;
        };

        // Jeepney trips: if the walk to the boarding point ends with more than this much walking along the
        // jeepney's own roads, the user boards where the walk first reaches them instead.
        const MAX_WALK_ALONG_JEEPNEY_M = 150;

        // Returns { walk, transit } with the earlier boarding point, or null to keep the trip as it is.
        // One extra car route request, only when the walk does follow the jeepney's road for long.
        const boardWhereWalkReachesJeepneyRoad = async (walk, transit, boardPt, destPt, isJeepneyRoadStep) => {
            const steps = walk && walk.steps ? walk.steps : [];
            if (steps.length < 2 || !transit || !transit.steps || !transit.steps.length) return null;
            const jeepRoads = new Set(transit.steps.map(s => (s.name || '').trim().toLowerCase()).filter(Boolean));
            const onJeepRoad = (s) => {
                const name = (s.name || '').trim().toLowerCase();
                return !!name && (jeepRoads.has(name) || isJeepneyRoadStep(s));
            };
            // The walk's last stretch on the jeepney's roads (steps tailStart..end)
            let tailStart = steps.length;
            while (tailStart > 0 && (steps[tailStart - 1].maneuver?.type === 'arrive' || onJeepRoad(steps[tailStart - 1]))) tailStart--;
            const tail = steps.slice(tailStart).filter(s => s.maneuver?.type !== 'arrive');
            const alongM = tail.reduce((m, s) => m + (s.distance || 0), 0);
            if (!tail.length || tailStart === 0 || alongM <= MAX_WALK_ALONG_JEEPNEY_M) return null;

            const loc = tail[0].maneuver && tail[0].maneuver.location;
            if (!loc) return null;
            const newBoard = [loc[1], loc[0]];
            const newTransit = await fetchOSRMRouteCoords(newBoard, destPt, 'car');
            if (!newTransit || !newTransit.coordinates || newTransit.coordinates.length < 2) return null;
            // Right direction: the jeepney from the new point runs through the old boarding point and the
            // ride is longer only by about the stretch the walk would have covered.
            const passesOldBoarding = newTransit.coordinates.some(c => getHaversineDist(c[0], c[1], boardPt[0], boardPt[1]) * 1000 <= 40);
            if (!passesOldBoarding || newTransit.distance > transit.distance + alongM + 300) return null;

            // Walk up to where it reaches the jeepney's road
            let cut = 0, best = Infinity;
            walk.coordinates.forEach((c, i) => {
                const d = getHaversineDist(c[0], c[1], newBoard[0], newBoard[1]);
                if (d < best) { best = d; cut = i; }
            });
            const coordinates = walk.coordinates.slice(0, cut + 1);
            if (best * 1000 > 1) coordinates.push(newBoard);
            const kept = steps.slice(0, tailStart);
            const distance = kept.reduce((m, s) => m + (s.distance || 0), 0);
            const arrive = { ...tail[0], distance: 0, duration: 0, maneuver: { ...tail[0].maneuver, type: 'arrive', modifier: undefined } };
            return {
                walk: { coordinates, distance, duration: (distance / 1000 / WALK_SPEED_KPH) * 3600, steps: [...kept, arrive] },
                transit: newTransit
            };
        };

        // Regular traditional jeepney fare for a distance, from /data/jeepney-fares.json via the shared
        // formula in js/fare-calc.js (same as the Fares page and Routie): whole km with any part of a
        // km rounded up, then rounded to the nearest 0.25. Until the file has loaded (or if it cannot
        // load) the built-in copy of the current rates is used, so routing never waits or breaks.
        const computeLTFRBFare = (distKm) => {
            const F = window.CalzadaFare;
            if (!F) return 14; // fare-calc.js missing: the minimum fare rather than no fare
            return F.fareFor(distKm, 'regular', F.current());
        };

        // Walking routes: solid green line; jeepney routes: dashed blue walk legs and an accent jeepney line.
        const applyRouteLineColors = () => {
            const isWalkOnly = selectedMode === 'walking';
            if (map.getLayer('walk-route-layer')) {
                map.setPaintProperty('walk-route-layer', 'line-color', isWalkOnly ? '#10b981' : '#3b82f6');
                map.setPaintProperty('walk-route-layer', 'line-dasharray', isWalkOnly ? [1, 0] : [2, 2]);
            }
            if (map.getLayer('transit-route-layer')) {
                map.setPaintProperty('transit-route-layer', 'line-color', isWalkOnly ? '#10b981' : '#378ADD');
            }
        };
        // The route layers are created on load, after a route that arrived early was drawn
        map.on('load', applyRouteLineColors);

        const drawRoutes = (walkCoords, transitCoords, finalWalkCoords) => {
            if (midpointBubbleMarker) { midpointBubbleMarker.remove(); midpointBubbleMarker = null; }
            if (boardingMarker) { boardingMarker.remove(); boardingMarker = null; }

            const isWalkOnly = selectedMode === 'walking';
            if (!finalWalkCoords && !isWalkOnly && (transitRouteGeojson?.finalWalk?.coordinates || window.finalWalkRouteGeojson?.coordinates)) {
                finalWalkCoords = transitRouteGeojson?.finalWalk?.coordinates || window.finalWalkRouteGeojson?.coordinates;
            }

            const safeWalkCoords = (walkCoords && walkCoords.length >= 2) ? walkCoords : (walkCoords && walkCoords.length === 1 ? [walkCoords[0], walkCoords[0]] : []);
            const walkLngLat = safeWalkCoords.map(c => [c[1], c[0]]);
            const transitLngLat = (transitCoords && transitCoords.length > 0) ? transitCoords.map(c => [c[1], c[0]]) : [];
            const finalWalkLngLat = (finalWalkCoords && finalWalkCoords.length >= 2 && !isWalkOnly)
                ? finalWalkCoords.map(c => [c[1], c[0]])
                : [];

            let walkRouteData = walkLngLat;
            if (finalWalkLngLat.length >= 2) {
                if (walkLngLat.length >= 2) {
                    walkRouteData = [walkLngLat, finalWalkLngLat];
                } else {
                    walkRouteData = finalWalkLngLat;
                }
            }

            updateRouteSource('walk-route', walkRouteData);
            updateRouteSource('transit-route', isWalkOnly ? [] : transitLngLat);
            updateRouteSource('completed-route', []);
            applyRouteLineColors();

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
                const fwInfo = getFinalWalkInfo();
                const totalBubbleMin = currentWalkDur + currentTransitDur + (fwInfo.finalWalkMin || 0) + (pendingTransfer ? pendingTransfer.extraMin : 0);
                bubbleEl.innerHTML = `<div class="route-bubble">${totalBubbleMin} min</div>`;
                midpointBubbleMarker = new maplibregl.Marker({ element: bubbleEl, anchor: 'center' })
                    .setLngLat(toLngLat(midNode));
                if (directionsCard.classList.contains('collapsed')) {
                    midpointBubbleMarker.addTo(map);
                }
            }

            // ── Connectors from origin to route start and route end to destination ──
            const connectorFeatures = [];
            const pathStartPt = (safeWalkCoords && safeWalkCoords.length > 0) ? safeWalkCoords[0] : (transitCoords && transitCoords.length > 0 ? transitCoords[0] : null);
            if (selectedCoords.origin && pathStartPt) {
                const startDistM = getHaversineDist(selectedCoords.origin[0], selectedCoords.origin[1], pathStartPt[0], pathStartPt[1]) * 1000;
                if (startDistM > 10) {
                    connectorFeatures.push({
                        type: 'Feature',
                        properties: { role: 'origin-connector', distanceM: startDistM },
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [selectedCoords.origin[1], selectedCoords.origin[0]],
                                [pathStartPt[1], pathStartPt[0]]
                            ]
                        }
                    });
                }
            }

            const pathEndPt = (finalWalkCoords && finalWalkCoords.length > 0)
                ? finalWalkCoords[finalWalkCoords.length - 1]
                : ((transitCoords && transitCoords.length > 0) ? transitCoords[transitCoords.length - 1] : (safeWalkCoords && safeWalkCoords.length > 0 ? safeWalkCoords[safeWalkCoords.length - 1] : null));
            // With a transfer the drawn part ends at the next jeep's stop, not near the destination
            if (selectedCoords.destination && pathEndPt && !pendingTransfer) {
                const endDistM = getHaversineDist(pathEndPt[0], pathEndPt[1], selectedCoords.destination[0], selectedCoords.destination[1]) * 1000;
                if (endDistM > 10) {
                    connectorFeatures.push({
                        type: 'Feature',
                        properties: { role: 'dest-connector', distanceM: endDistM },
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [pathEndPt[1], pathEndPt[0]],
                                [selectedCoords.destination[1], selectedCoords.destination[0]]
                            ]
                        }
                    });
                }
            }

            updateRouteConnectors(connectorFeatures);

            const bounds = new maplibregl.LngLatBounds();
            if (selectedCoords.origin) bounds.extend(toLngLat(selectedCoords.origin));
            if (selectedCoords.destination) bounds.extend(toLngLat(selectedCoords.destination));
            walkLngLat.forEach(pt => bounds.extend(pt));
            if (finalWalkLngLat.length) finalWalkLngLat.forEach(pt => bounds.extend(pt));
            transitLngLat.forEach(pt => bounds.extend(pt));
            if (!bounds.isEmpty()) {
                fitRoutePreviewBounds(300);
            }

            document.getElementById('startJourneyBtn').disabled = false;
            document.getElementById('closeDirectionsBtn').style.display = 'flex';
            setTimeout(() => map.resize(), 200);
        };

        // Stop names from the last rendered itinerary, reused by the arrival ticket so both agree.
        let lastItineraryStops = null;

        const getFinalWalkInfo = () => {
            if (selectedMode === 'walking') {
                return { finalWalkM: 0, finalWalkMin: 0, finalWalkCoordinates: null };
            }
            const transitCoords = transitRouteGeojson?.coordinates || [];
            const lastTransitCoord = transitCoords.length > 0 ? transitCoords[transitCoords.length - 1] : null;
            const destCoord = selectedCoords.destination;
            // Curated routes know their last walk: none when there is no finalWalk (e.g. the next jeep
            // of a transfer leaves from the same stop)
            if (transitRouteGeojson?.curated && !(transitRouteGeojson.finalWalk && transitRouteGeojson.finalWalk.coordinates?.length >= 2)) {
                return { finalWalkM: 0, finalWalkMin: 0, finalWalkCoordinates: null };
            }

            if (window.finalWalkRouteGeojson && window.finalWalkRouteGeojson.coordinates?.length >= 2) {
                const finalWalkM = window.finalWalkRouteGeojson.distance || 0;
                const finalWalkMin = Math.ceil((finalWalkM / 1000 / WALK_SPEED_KPH) * 60) || 1;
                return { finalWalkM, finalWalkMin, finalWalkCoordinates: window.finalWalkRouteGeojson.coordinates };
            }
            if (transitRouteGeojson?.finalWalk && transitRouteGeojson.finalWalk.distance > 0) {
                const finalWalkM = transitRouteGeojson.finalWalk.distance;
                const finalWalkMin = Math.ceil((finalWalkM / 1000 / WALK_SPEED_KPH) * 60) || 1;
                return { finalWalkM, finalWalkMin, finalWalkCoordinates: transitRouteGeojson.finalWalk.coordinates || (lastTransitCoord && destCoord ? [lastTransitCoord, destCoord] : null) };
            }
            if (lastTransitCoord && destCoord) {
                const haversineDistM = getHaversineDist(lastTransitCoord[0], lastTransitCoord[1], destCoord[0], destCoord[1]) * 1000;
                if (haversineDistM > 30) {
                    const finalWalkM = Math.round(haversineDistM * 1.3);
                    const finalWalkMin = Math.max(1, Math.ceil((finalWalkM / 1000 / WALK_SPEED_KPH) * 60));
                    return { finalWalkM, finalWalkMin, finalWalkCoordinates: [lastTransitCoord, destCoord] };
                }
            }
            return { finalWalkM: 0, finalWalkMin: 0, finalWalkCoordinates: null };
        };

        const renderItinerary = () => {
            const container = document.getElementById('itineraryLegs');
            if (!container) return;
            container.innerHTML = '';
            lastItineraryStops = null;

            const isWalkOnly = selectedMode === 'walking';
            const t = (k, p) => (window.t ? window.t(k, p) : null);

            // Helper: format meters
            const fmtM = formatDistanceM;

            // Base departure time and arrival time
            const hasSchedule = !!(window._calzadaLeaveCalculation && window._calzadaLeaveCalculation.leaveAt);
            const depTime = hasSchedule ? new Date(window._calzadaLeaveCalculation.leaveAt) : new Date();
            const finalWalkInfo = getFinalWalkInfo();
            const xferExtraMin = (!isWalkOnly && pendingTransfer) ? pendingTransfer.extraMin : 0;
            const totalDurationMin = isWalkOnly ? currentWalkDur : (currentWalkDur + currentTransitDur + finalWalkInfo.finalWalkMin + xferExtraMin);
            const totalSecs = totalDurationMin * 60;
            if (!hasSchedule && !isTrackingArrival) cachedRemainingSeconds = totalSecs;
            const arrTime = hasSchedule
                ? new Date(depTime.getTime() + totalSecs * 1000)
                : new Date(Date.now() + cachedRemainingSeconds * 1000);

            // Stop row factory: [time column 44px] [rail 22px] [content]
            const createStopRow = ({ time, ringClass, name, subText }) => {
                const row = document.createElement('div');
                row.className = 'timeline-row timeline-stop-row';
                row.innerHTML = `
                    <div class="timeline-time">${escapeHtml(time)}</div>
                    <div class="timeline-rail">
                        <span class="timeline-ring ${ringClass}"></span>
                    </div>
                    <div class="timeline-content">
                        <div class="timeline-stop-name">${escapeHtml(name)}</div>
                        ${subText ? `<div class="timeline-sub-line">${escapeHtml(subText)}</div>` : ''}
                    </div>
                `;
                return row;
            };

            // Leg row factory: [time column 44px] [rail 22px] [content]
            const createLegRow = ({ type, contentHtml }) => {
                const row = document.createElement('div');
                row.className = `timeline-row timeline-leg-row timeline-leg-row--${type}`;
                const lineClass = type === 'walk' ? 'timeline-line--walk' : 'timeline-line--jeepney';
                row.innerHTML = `
                    <div class="timeline-time"></div>
                    <div class="timeline-rail">
                        <div class="timeline-line ${lineClass}"></div>
                    </div>
                    <div class="timeline-content">
                        ${contentHtml}
                    </div>
                `;
                return row;
            };

            const originName = originPlaceName || (window.t ? window.t('planner.origin') : 'Origin');
            const destName = destPlaceName || (window.t ? window.t('planner.destination') : 'Destination');

            if (isWalkOnly) {
                // ── WALK-ONLY ROUTE: origin → walk → destination ────────────────────
                // 1. Origin Stop
                container.appendChild(createStopRow({
                    time: fmt24h(depTime),
                    ringClass: 'timeline-ring--origin',
                    name: originName,
                    subText: null
                }));

                // 2. Walk Leg
                const walkLegLabel = t('planner.walk_leg', {
                    dist: fmtM(currentWalkDist * 1000),
                    time: `${currentWalkDur} min`
                }) || `Walk ${fmtM(currentWalkDist * 1000)} · ${currentWalkDur} min`;

                const walkHtml = `
                    <div class="timeline-walk-content">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#475569">
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                        </svg>
                        <span>${escapeHtml(walkLegLabel)}</span>
                    </div>
                `;
                container.appendChild(createLegRow({ type: 'walk', contentHtml: walkHtml }));

                // 3. Destination Stop (time must equal summary arrival)
                container.appendChild(createStopRow({
                    time: fmt24h(arrTime),
                    ringClass: 'timeline-ring--dest',
                    name: destName,
                    subText: null
                }));

                renderActiveNavLegs();
                return;
            }

            // ── JEEPNEY ROUTE ───────────────────────────────────────────────────────
            // Stop names extraction:
            const walkSteps = walkRouteGeojson?.steps || [];
            const highwayName = walkSteps.length > 0
                ? (walkSteps[walkSteps.length - 1]?.name || 'National Highway')
                : 'National Highway';
            const tSteps = transitRouteGeojson?.steps || [];
            let boardAt = tSteps.length > 0 ? (tSteps[0]?.name || highwayName) : highwayName;
            const alightStep = tSteps.length > 1
                ? tSteps.slice(0, -1).reverse().find(s => s.name && s.name !== '') : null;
            let alightAt = (finalWalkInfo.finalWalkM > 0)
                ? (alightStep?.name || tSteps[0]?.name || highwayName)
                : (alightStep?.name || destName);
            // Curated routes name their stops
            if (transitRouteGeojson?.curated) {
                boardAt = transitRouteGeojson.boardName || boardAt;
                alightAt = transitRouteGeojson.alightName || alightAt;
            }

            // Route signboard (ONLY if route data has one; never invent one)
            const signboardName = transitRouteGeojson?.signboard
                || transitRouteGeojson?.routeName
                || transitRouteGeojson?.route_name
                || null;

            // Times:
            // Stop 1: depTime
            // Stop 2: depTime + currentWalkDur (rounded to min)
            // Stop 3 / last: previous + currentTransitDur = arrTime
            const boardTime = new Date(depTime.getTime() + currentWalkDur * 60 * 1000);

            // Identical stop name deduplication:
            // "If boarding and alighting names are identical (e.g. both 'National Highway 1'),
            // append the nearest named cross street or landmark to the alighting stop if the
            // data has one; otherwise append '· {distance} later'. Never show two identical stop names in a row."
            const norm = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (norm(boardAt) === norm(alightAt)) {
                let modifier = null;
                // Check if any intermediate step in tSteps has a named street
                const otherStep = tSteps.find(s => s.name && norm(s.name) !== norm(boardAt));
                if (otherStep && otherStep.name) {
                    modifier = otherStep.name;
                }
                // Check if CALAMBA_PLACES_FALLBACK has a place near alighting coordinates
                if (!modifier && transitRouteGeojson?.coordinates?.length) {
                    const lastCoord = transitRouteGeojson.coordinates[transitRouteGeojson.coordinates.length - 1];
                    if (lastCoord) {
                        const nearby = CALAMBA_PLACES_FALLBACK.find(p => {
                            const d = getHaversineDist(lastCoord[0], lastCoord[1], p.lat, p.lng) * 1000;
                            return d <= 350 && norm(p.name) !== norm(boardAt);
                        });
                        if (nearby) modifier = nearby.name;
                    }
                }
                if (modifier) {
                    alightAt = `${alightAt}, ${modifier}`;
                } else {
                    const distStr = `${currentTransitDist.toFixed(1)} km`;
                    const laterStr = t('planner.dist_later', { dist: distStr }) || `${distStr} later`;
                    alightAt = `${alightAt} · ${laterStr}`;
                }
            }

            // Also ensure origin and boardAt are not identical in a row:
            if (norm(originName) === norm(boardAt)) {
                boardAt = `${boardAt} (${t('planner.board_here') || 'Boarding point'})`;
            }

            // Check if route has a separate final walk leg
            const hasFinalWalk = finalWalkInfo.finalWalkM > 0;

            // 1. Origin Stop
            container.appendChild(createStopRow({
                time: fmt24h(depTime),
                ringClass: 'timeline-ring--origin',
                name: originName,
                subText: null
            }));

            // 2. Initial Walk Leg
            const walk1Label = t('planner.walk_leg', {
                dist: fmtM(currentWalkDist * 1000),
                time: `${currentWalkDur} min`
            }) || `Walk ${fmtM(currentWalkDist * 1000)} · ${currentWalkDur} min`;

            const walk1Html = `
                <div class="timeline-walk-content">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#475569">
                        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                    </svg>
                    <span>${escapeHtml(walk1Label)}</span>
                </div>
            `;
            container.appendChild(createLegRow({ type: 'walk', contentHtml: walk1Html }));

            // 3. Boarding Stop Row
            const boardSub = t('planner.board_here') || 'Board here';
            container.appendChild(createStopRow({
                time: fmt24h(boardTime),
                ringClass: 'timeline-ring--intermediate',
                name: boardAt,
                subText: boardSub
            }));

            // 4. Jeepney Leg Row
            // Signboard only when the route data has one; a curated route without one shows where it goes
            const isTl = transitLang() === 'tl';
            const jeepContentHtml = (min, km, fare, signboard, headsign, noteText) => {
                const signLine = signboard
                    ? `<div class="timeline-signboard">${escapeHtml((t('planner.signboard') || 'Signboard') + ': ' + signboard)}</div>`
                    : '';
                const headLine = (headsign && !signboard)
                    ? `<div class="timeline-headsign">${escapeHtml((isTl ? 'Jeep papuntang ' : 'Jeep to ') + headsign)}</div>`
                    : '';
                const noteLine = noteText ? `<div class="timeline-via">${escapeHtml(noteText)}</div>` : '';
                return `
                <div class="timeline-jeep-content">
                    <div class="timeline-jeep-header">
                        <div class="timeline-jeep-left">
                            <span class="timeline-jeep-badge">
                                <img src="../assets/icons/jeepney-icon.png" alt="Jeepney">
                                <span>Jeepney</span>
                            </span>
                            <span class="timeline-jeep-meta">${min} min · ${km.toFixed(1)} km</span>
                        </div>
                        <span class="timeline-jeep-fare">${formatPeso(fare)}</span>
                    </div>
                    ${signLine}${headLine}${noteLine}
                </div>
            `;
            };
            const curatedHeadsign = transitRouteGeojson?.curated ? transitRouteGeojson.headsign : null;
            const jeepHtml = jeepContentHtml(currentTransitDur, currentTransitDist, currentFare, signboardName, curatedHeadsign, null);
            container.appendChild(createLegRow({ type: 'jeepney', contentHtml: jeepHtml }));

            // Trip with a transfer: get off, (walk), next jeep, (walk), destination
            if (pendingTransfer) {
                const x = pendingTransfer;
                const walkRowHtml = (label) => `
                    <div class="timeline-walk-content">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#475569">
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                        </svg>
                        <span>${escapeHtml(label)}</span>
                    </div>
                `;
                const walkLabel = (m, min) => t('planner.walk_leg', { dist: fmtM(m), time: `${min} min` }) || `Walk ${fmtM(m)} · ${min} min`;
                const alightTime = new Date(boardTime.getTime() + currentTransitDur * 60 * 1000);
                const xWalkM = finalWalkInfo.finalWalkM;
                const xWalkMin = finalWalkInfo.finalWalkMin;
                const sameStop = !(xWalkM > 0);
                const sameName = (x.boardName || '').trim().toLowerCase() === (alightAt || '').trim().toLowerCase();
                lastItineraryStops = {
                    boardAt,
                    alightAt,
                    finalWalkM: sameStop ? 0 : xWalkM,
                    finalWalkMin: sameStop ? 0 : xWalkMin,
                    finalWalkCoordinates: sameStop ? null : finalWalkInfo.finalWalkCoordinates
                };
                container.appendChild(createStopRow({
                    time: fmt24h(alightTime),
                    ringClass: 'timeline-ring--intermediate',
                    name: alightAt,
                    subText: (sameStop && sameName) ? (isTl ? 'Bumaba at sumakay ng susunod na jeep dito' : 'Get off and change jeeps here') : (t('planner.get_off_here') || 'Get off here')
                }));
                let changeTime = alightTime;
                if (sameStop && !sameName) {
                    container.appendChild(createStopRow({
                        time: fmt24h(alightTime),
                        ringClass: 'timeline-ring--intermediate',
                        name: x.boardName,
                        subText: isTl ? 'Sumakay ng susunod na jeep dito' : 'Take the next jeep here'
                    }));
                }
                if (!sameStop) {
                    const via = (isTl ? (x.via_tl || x.via) : x.via) || window.finalWalkRouteGeojson?.viaText || null;
                    container.appendChild(createLegRow({
                        type: 'walk',
                        contentHtml: walkRowHtml(walkLabel(xWalkM, xWalkMin)) + (via ? `<div class="timeline-via">${escapeHtml(via)}</div>` : '')
                    }));
                    changeTime = new Date(alightTime.getTime() + xWalkMin * 60 * 1000);
                    container.appendChild(createStopRow({
                        time: fmt24h(changeTime),
                        ringClass: 'timeline-ring--intermediate',
                        name: x.boardName,
                        subText: isTl ? 'Sumakay ng susunod na jeep dito' : 'Take the next jeep here'
                    }));
                }
                const recomputeNote = isTl ? `Ire-recompute ang ruta pagdating mo rito` : `The route is re-computed when you get here`;
                container.appendChild(createLegRow({
                    type: 'jeepney',
                    contentHtml: jeepContentHtml(x.jeep.min, x.jeep.distM / 1000, x.jeep.fare, x.jeep.signboard, x.jeep.headsign, recomputeNote)
                }));
                const alight2 = new Date(changeTime.getTime() + (x.waitMin + x.jeep.min) * 60 * 1000);
                if (x.finalWalkM > 0) {
                    container.appendChild(createStopRow({
                        time: fmt24h(alight2),
                        ringClass: 'timeline-ring--intermediate',
                        name: x.jeep.alightName || (isTl ? 'Babaan' : 'Stop'),
                        subText: t('planner.get_off_here') || 'Get off here'
                    }));
                    container.appendChild(createLegRow({ type: 'walk', contentHtml: walkRowHtml(walkLabel(x.finalWalkM, x.finalWalkMin)) }));
                }
                container.appendChild(createStopRow({
                    time: fmt24h(arrTime),
                    ringClass: 'timeline-ring--dest',
                    name: destName,
                    subText: x.finalWalkM > 0 ? null : (t('planner.get_off_here') || 'Get off here')
                }));

                if (window.activeRouteSteps && window.activeRouteSteps.length > 0) {
                    for (let i = 0; i < window.activeRouteSteps.length; i++) {
                        const curr = window.activeRouteSteps[i];
                        const next = (i + 1 < window.activeRouteSteps.length) ? window.activeRouteSteps[i + 1] : null;
                        if (curr.mode === 'foot' && next && (next.mode === 'driving' || next.mode === 'jeepney')) {
                            curr.stopName = boardAt;
                            curr.boardAt = boardAt;
                        }
                    }
                }
                renderActiveNavLegs();
                return;
            }

            if (hasFinalWalk) {
                // Route with final walk: Alighting stop -> Walk leg -> Destination
                const finalWalkDist = finalWalkInfo.finalWalkM;
                const finalWalkDur = finalWalkInfo.finalWalkMin;
                const finalAlightTime = new Date(boardTime.getTime() + currentTransitDur * 60 * 1000);
                const finalDestTime = new Date(finalAlightTime.getTime() + finalWalkDur * 60 * 1000);

                const getOffSub = t('planner.get_off_here') || 'Get off here';
                lastItineraryStops = {
                    boardAt,
                    alightAt,
                    finalWalkM: finalWalkDist,
                    finalWalkMin: finalWalkDur,
                    finalWalkCoordinates: finalWalkInfo.finalWalkCoordinates
                };
                container.appendChild(createStopRow({
                    time: fmt24h(finalAlightTime),
                    ringClass: 'timeline-ring--intermediate',
                    name: alightAt,
                    subText: getOffSub
                }));

                const walk2Label = t('planner.walk_leg', {
                    dist: fmtM(finalWalkDist),
                    time: `${finalWalkDur} min`
                }) || `Walk ${fmtM(finalWalkDist)} · ${finalWalkDur} min`;

                const walk2Html = `
                    <div class="timeline-walk-content">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#475569">
                            <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                        </svg>
                        <span>${escapeHtml(walk2Label)}</span>
                    </div>
                `;
                container.appendChild(createLegRow({ type: 'walk', contentHtml: walk2Html }));

                container.appendChild(createStopRow({
                    time: fmt24h(finalDestTime),
                    ringClass: 'timeline-ring--dest',
                    name: destName,
                    subText: null
                }));
            } else {
                // Jeepney drops user directly at destination:
                // "If the jeepney drops the user at the destination, the alighting stop row is the destination row."
                // Destination ring #E5484D, time = summary arrival time
                // B0: Make the sub line name the actual alighting point when it differs from the destination name:
                // "Get off at Elejorde Street" / "Bumaba sa Elejorde Street". Keep "Get off here" only when the names match.
                let finalDestName = destName || alightAt;
                if (norm(finalDestName) === norm(boardAt)) {
                    finalDestName = alightAt;
                }

                const lastTransitStep = (tSteps || []).slice().reverse().find(s => (s.stopName || s.name || '').trim() !== '');
                const alightingPointName = (lastTransitStep?.stopName || lastTransitStep?.name || alightAt || '').trim();

                const resolvedAlightAt = (alightingPointName && norm(alightingPointName) !== norm(finalDestName))
                    ? alightingPointName
                    : finalDestName;

                lastItineraryStops = {
                    boardAt,
                    alightAt: resolvedAlightAt,
                    finalWalkM: 0,
                    finalWalkMin: 0,
                    finalWalkCoordinates: null
                };

                let getOffSub;
                if (alightingPointName && norm(alightingPointName) !== norm(finalDestName)) {
                    getOffSub = t('planner.get_off_at', { stop: alightingPointName, name: alightingPointName })
                        || `Get off at ${alightingPointName}`;
                } else {
                    getOffSub = t('planner.get_off_here') || 'Get off here';
                }

                container.appendChild(createStopRow({
                    time: fmt24h(arrTime),
                    ringClass: 'timeline-ring--dest',
                    name: finalDestName,
                    subText: getOffSub
                }));
            }

            // Ensure step instructions and timeline share identical boarding and alighting stop names
            if (window.activeRouteSteps && window.activeRouteSteps.length > 0 && lastItineraryStops) {
                const targetBoard = lastItineraryStops.boardAt || boardAt;
                const targetAlight = lastItineraryStops.alightAt || alightAt || destName;
                for (let i = 0; i < window.activeRouteSteps.length; i++) {
                    const curr = window.activeRouteSteps[i];
                    const next = (i + 1 < window.activeRouteSteps.length) ? window.activeRouteSteps[i + 1] : null;
                    if (curr.mode === 'foot' && next && (next.mode === 'driving' || next.mode === 'jeepney')) {
                        curr.stopName = targetBoard;
                        curr.boardAt = targetBoard;
                    }
                    if ((curr.mode === 'driving' || curr.mode === 'jeepney') && (!next || next.mode === 'foot')) {
                        curr.stopName = targetAlight;
                        curr.getOffStop = targetAlight;
                        curr.alightAt = targetAlight;
                    }
                }
            }

            renderActiveNavLegs();
        };

        const updateSummaryRow = () => {
            const blk = document.getElementById('routeSummaryBlock');
            const st = document.getElementById('sumTime');
            const sf = document.getElementById('sumFare');
            const se = document.getElementById('sumETA') || document.getElementById('sumEta');
            const sd = document.getElementById('sumDist');
            const arriveTextEl = document.getElementById('sumArriveText');

            const isWalkOnly = selectedMode === 'walking';
            const finalWalkInfo = getFinalWalkInfo();
            const xfer = isWalkOnly ? null : pendingTransfer;
            const totalMin = isWalkOnly ? currentWalkDur : (currentWalkDur + currentTransitDur + finalWalkInfo.finalWalkMin + (xfer ? xfer.extraMin : 0));
            const extraWalkDistKm = isWalkOnly ? 0 : (finalWalkInfo.finalWalkM / 1000) + (xfer ? (xfer.jeep.distM + xfer.finalWalkM) / 1000 : 0);
            const totalDistRaw = (currentWalkDist + currentTransitDist + extraWalkDistKm).toFixed(1);
            const tripFare = currentFare + (xfer ? xfer.jeep.fare : 0);
            const totalDist = String(totalDistRaw).replace(/\s*km/gi, '').trim();
            const totalSecs = totalMin * 60;

            // Leave-time calculation for planned schedule (rule-based)
            const hintBanner = document.getElementById('leaveTimeHintBanner');
            const hintText = document.getElementById('leaveTimeHintText');
            const remindBtn = document.getElementById('remindMeBtn');

            const formatManila = (d) => {
                if (!d) return '--:--';
                const date = d instanceof Date ? d : new Date(d);
                return new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Manila',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }).format(date);
            };

            let scheduledArriveAt = null;

            if (hintBanner && hintText) {
                if (window._calzadaPlannedSchedule && window._calzadaPlannedSchedule.targetTime) {
                    const sched = window._calzadaPlannedSchedule;
                    const bufferMin = isWalkOnly ? 0 : 10;
                    let leaveAt, arriveAt;

                    if (sched.mode === 'arrive') {
                        leaveAt = new Date(sched.targetTime.getTime() - (totalMin + bufferMin) * 60 * 1000);
                        arriveAt = new Date(sched.targetTime.getTime());
                    } else {
                        leaveAt = new Date(sched.targetTime.getTime());
                        arriveAt = new Date(sched.targetTime.getTime() + (totalMin + bufferMin) * 60 * 1000);
                    }

                    // 1. Depart at T in the past: treat as Leave now and notify
                    if (sched.mode === 'depart' && sched.targetTime.getTime() <= Date.now()) {
                        window._calzadaPlannedSchedule = null;
                        window._calzadaLeaveCalculation = null;
                        const schedTextEl = document.getElementById('scheduleSelectedText');
                        if (schedTextEl) {
                            schedTextEl.textContent = window.t ? window.t('planner.leave_now') : 'Leave now';
                        }
                        const schedOpts = document.getElementById('scheduleOptions');
                        if (schedOpts) {
                            schedOpts.querySelectorAll('li').forEach(l => l.classList.toggle('active', l.dataset.value === 'now'));
                        }
                        hintBanner.classList.remove('warning');
                        hintBanner.style.display = 'none';
                        if (typeof window.showToast === 'function') {
                            const msg = (window.t ? window.t('reminders.depart_passed') : null)
                                || 'That departure time has already passed. Showing route for leaving now.';
                            window.showToast(msg, 'warning');
                        }
                    }
                    // 2. Arrive by T: if leaveAt is already in the past, show warning instead of leave-by hint
                    else if (sched.mode === 'arrive' && leaveAt.getTime() <= Date.now()) {
                        const targetStr = formatManila(sched.targetTime);
                        const estArriveWhenLeavingNow = new Date(Date.now() + (totalMin + bufferMin) * 60 * 1000);
                        const estArriveStr = formatManila(estArriveWhenLeavingNow);
                        const warnMsg = window.t
                            ? window.t('reminders.cant_make_it', { targetTime: targetStr, arriveTime: estArriveStr })
                            : `You can't make it by ${targetStr}. Leave now to arrive around ${estArriveStr}.`;

                        hintText.textContent = warnMsg;
                        hintBanner.classList.add('warning');
                        hintBanner.style.removeProperty('display');
                        hintBanner.style.display = 'flex';

                        if (remindBtn) remindBtn.style.display = 'none';
                        window._calzadaLeaveCalculation = null;
                    }
                    // 3. Valid future schedule
                    else {
                        scheduledArriveAt = arriveAt;
                        const leaveStr = formatManila(leaveAt);
                        const arriveStr = formatManila(arriveAt);
                        const hintMsg = window.t
                            ? window.t('reminders.leave_by_arrive', { leaveTime: leaveStr, arriveTime: arriveStr })
                            : `Leave by ${leaveStr} to arrive by ${arriveStr}`;

                        hintText.textContent = hintMsg;
                        hintBanner.classList.remove('warning');
                        hintBanner.style.removeProperty('display');
                        hintBanner.style.display = 'flex';

                        let regFare = 0;
                        let discFare = 0;
                        if (!isWalkOnly) {
                            if (window.CalzadaFare) {
                                const f = window.CalzadaFare.fares(currentTransitDist);
                                regFare = (Number(f.regular) || 0) + (xfer ? xfer.jeep.fare : 0);
                                discFare = (Number(f.discounted) || 0) + (xfer ? xfer.jeep.fareDisc : 0);
                            } else {
                                regFare = Number(currentFare) || 14;
                                discFare = Math.round(regFare * 0.8 * 4) / 4;
                            }
                        }

                        window._calzadaLeaveCalculation = {
                            leaveAt,
                            arriveAt,
                            mode: isWalkOnly ? 'walk' : 'jeepney',
                            totalMin,
                            bufferMin,
                            targetTime: sched.targetTime,
                            fare: tripFare,
                            fareRegular: regFare,
                            fareDiscounted: discFare,
                            destName: destPlaceName,
                            destCoords: selectedCoords ? selectedCoords.destination : null,
                            originLabel: originPlaceName
                        };

                        if (remindBtn) {
                            remindBtn.style.display = leaveAt.getTime() > Date.now() ? 'inline-flex' : 'none';
                        }
                    }
                } else {
                    hintBanner.classList.remove('warning');
                    hintBanner.style.display = 'none';
                    window._calzadaLeaveCalculation = null;
                }
            }

            // ETA: use scheduled arrival when a future schedule is set; otherwise use now + remaining
            let etaDate;
            if (scheduledArriveAt) {
                etaDate = scheduledArriveAt;
            } else {
                if (!isTrackingArrival) cachedRemainingSeconds = totalSecs;
                etaDate = new Date(Date.now() + cachedRemainingSeconds * 1000);
            }
            const eta = fmt24h(etaDate);

            const freeLabel = window.t ? (window.t('planner.fare_free') || window.t('planner.free') || 'Free') : 'Free';
            const fareLabel = isWalkOnly ? freeLabel : formatPeso(tripFare);

            if (st) st.textContent = `${totalMin} min`;
            if (sf) sf.textContent = fareLabel;
            if (se) se.textContent = eta;
            if (sd) sd.textContent = formatDistanceM((currentWalkDist + currentTransitDist + extraWalkDistKm) * 1000);

            const etaHtml = `<span id="sumETA">${eta}</span>`;
            const arriveStr = window.t
                ? window.t('planner.arrive_time', { time: etaHtml })
                : `Arrive ${etaHtml}`;
            if (arriveTextEl) {
                arriveTextEl.innerHTML = `${arriveStr}`;
            }

            const peek = document.getElementById('peekSummary');
            if (peek) {
                peek.textContent = selectedMode === 'walking'
                    ? `${totalMin} min • Walk`
                    : `${totalMin} min • ${formatPeso(tripFare)}`;
            }
            if (blk) {
                blk.style.removeProperty('display');
                blk.style.display = '';
                blk.style.visibility = 'visible';
                blk.classList.remove('hidden');
                const banner = blk.querySelector('.route-summary-banner');
                if (banner) {
                    banner.style.removeProperty('display');
                    banner.style.display = '';
                }
            }

            // Update chatbot context for Routie Assistant
            window._calzadaRouteContext = {
                origin: originPlaceName,
                destination: destPlaceName,
                totalTime: totalMin,
                totalFare: tripFare,
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

        const getStepIcon = (step, mode, isLastStep = true) => {
            const type = step?.maneuver?.type || '';
            const mod = step?.maneuver?.modifier || '';

            if (type === 'depart') {
                return mode === 'foot' ? 'walk-outline' : 'bus-outline';
            }
            if (type === 'arrive') {
                if (!isLastStep) {
                    return mode === 'foot' ? 'bus-outline' : 'walk-outline';
                }
                return 'flag-outline';
            }

            if (type === 'turn' || type === 'end of road') {
                if (mod.includes('right')) return 'arrow-forward-outline';
                if (mod.includes('left')) return 'arrow-back-outline';
                return 'arrow-up-outline';
            }

            if (type === 'new name' || mod.includes('straight')) return 'arrow-up-outline';

            return 'arrow-forward-outline';
        };

        const formatDist = (m) => m >= 1000 ? (m / 1000).toFixed(1) + ' ' + t('planner.unit_km') : (Math.round(m / 10) * 10) + ' ' + t('planner.unit_m');

        // ── ACTIVE NAVIGATION ITINERARY LEGS RENDERER (Full Route Section) ──
        function renderActiveNavLegs() {
            const listEl = document.getElementById('navPanelLegsList');
            const countEl = document.getElementById('navPanelLegsCount');
            if (!listEl) return;

            const isWalkOnly = selectedMode === 'walking';
            const walkSteps = walkRouteGeojson?.steps || [];
            const highwayName = walkSteps.length > 0
                ? (walkSteps[walkSteps.length - 1]?.name || 'National Highway')
                : 'National Highway';
            const walkTargetName = isWalkOnly ? (destPlaceName || 'Destination') : highwayName;
            const fmtM = formatDistanceM;

            let html = `
            <div class="nav-leg-item">
                <div class="nav-leg-icon-circle">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                    </svg>
                </div>
                <div class="nav-leg-info">
                    <div class="nav-leg-title">Walk to ${escapeHtml(walkTargetName)}</div>
                    <div class="nav-leg-meta">${fmtM(currentWalkDist * 1000)} · ${currentWalkDur} min</div>
                </div>
                <div class="nav-leg-fare">Free</div>
            </div>
        `;

            let legCount = 1;

            if (!isWalkOnly) {
                const tSteps = transitRouteGeojson?.steps || [];
                const boardAt = lastItineraryStops?.boardAt || (tSteps.length > 0 ? (tSteps[0]?.name || highwayName) : highwayName);
                const alightStep = tSteps.length > 1
                    ? tSteps.slice(0, -1).reverse().find(s => s.name && s.name !== '') : null;
                const alightAt = lastItineraryStops?.alightAt || alightStep?.name || destPlaceName || 'Destination';

                html += `
                <div class="nav-leg-item">
                    <div class="nav-leg-icon-circle">
                        <img src="../assets/icons/jeepney-icon.png" alt="Jeep" width="14" height="14">
                    </div>
                    <div class="nav-leg-info">
                        <div class="nav-leg-title">Jeepney towards ${escapeHtml(alightAt)}</div>
                        <div class="nav-leg-meta">${currentTransitDur} min · ${currentTransitDist.toFixed(1)} km (Board: ${escapeHtml(boardAt)})</div>
                    </div>
                    <div class="nav-leg-fare">${formatPeso(currentFare)}</div>
                </div>
            `;
                legCount = 2;

                if (lastItineraryStops?.finalWalkM > 0) {
                    const fwM = lastItineraryStops.finalWalkM;
                    const fwMin = lastItineraryStops.finalWalkMin;
                    html += `
                    <div class="nav-leg-item">
                        <div class="nav-leg-icon-circle">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                            </svg>
                        </div>
                        <div class="nav-leg-info">
                            <div class="nav-leg-title">Walk to ${escapeHtml(pendingTransfer ? pendingTransfer.boardName : (destPlaceName || 'Destination'))}</div>
                            <div class="nav-leg-meta">${fmtM(fwM)} · ${fwMin} min</div>
                        </div>
                        <div class="nav-leg-fare">Free</div>
                    </div>
                    `;
                    legCount = 3;
                }

                // Trip with a transfer: the next jeep and the last walk (re-computed at the stop)
                if (pendingTransfer) {
                    const x = pendingTransfer;
                    html += `
                    <div class="nav-leg-item">
                        <div class="nav-leg-icon-circle">
                            <img src="../assets/icons/jeepney-icon.png" alt="Jeep" width="14" height="14">
                        </div>
                        <div class="nav-leg-info">
                            <div class="nav-leg-title">Jeepney towards ${escapeHtml(x.jeep.headsign || x.jeep.alightName || destPlaceName || 'Destination')}</div>
                            <div class="nav-leg-meta">${x.jeep.min} min · ${(x.jeep.distM / 1000).toFixed(1)} km (Board: ${escapeHtml(x.boardName)})</div>
                        </div>
                        <div class="nav-leg-fare">${formatPeso(x.jeep.fare)}</div>
                    </div>
                    `;
                    legCount += 1;
                    if (x.finalWalkM > 0) {
                        html += `
                        <div class="nav-leg-item">
                            <div class="nav-leg-icon-circle">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/>
                                </svg>
                            </div>
                            <div class="nav-leg-info">
                                <div class="nav-leg-title">Walk to ${escapeHtml(destPlaceName || 'Destination')}</div>
                                <div class="nav-leg-meta">${fmtM(x.finalWalkM)} · ${x.finalWalkMin} min</div>
                            </div>
                            <div class="nav-leg-fare">Free</div>
                        </div>
                        `;
                        legCount += 1;
                    }
                }
            }

            listEl.innerHTML = html;
            if (countEl) countEl.textContent = `(${legCount} ${legCount === 1 ? 'leg' : 'legs'})`;
        }

        function updateGuideStepsUI() {
            if (!window.activeRouteSteps || window.activeRouteSteps.length === 0) return;
            const steps = window.activeRouteSteps;
            const idx = window.currentStepIndex || 0;

            if (idx < steps.length) {
                const current = steps[idx];
                const isLast = (idx === steps.length - 1);
                const nextMode = (idx + 1 < steps.length) ? steps[idx + 1].mode : null;
                const prevStep = idx > 0 ? steps[idx - 1] : null;
                const prevName = prevStep ? (prevStep.name || '').trim() : '';
                const instructionText = formatStepInstruction(current, current.mode, {
                    isLastStep: isLast,
                    nextMode,
                    steps,
                    index: idx,
                    prevName
                });
                const distText = current.distance ? formatDist(current.distance) : '';
                const hasDist = Boolean(current.distance && Number(current.distance) > 0 && distText);
                const iconName = getStepIcon(current, current.mode, isLast);

                // Localize "NEXT STEP" badge on both desktop and mobile
                const nextStepLabel = t('planner.next_step');
                document.querySelectorAll('#navPanelNextBlock .nav-panel-next-tag, #activeGuideCard .nav-panel-next-tag').forEach(tag => {
                    tag.textContent = nextStepLabel;
                    tag.setAttribute('data-i18n', 'planner.next_step');
                });

                // Desktop Next Step block
                const dInstr = document.getElementById('dNavNextInstruction');
                const dDist = document.getElementById('dNavNextDist');
                const dIcon = document.getElementById('dNavNextIcon');
                if (dInstr) dInstr.textContent = instructionText;
                if (dDist) {
                    if (hasDist) {
                        dDist.textContent = distText;
                        dDist.style.display = '';
                    } else {
                        dDist.textContent = '';
                        dDist.style.display = 'none';
                    }
                }
                if (dIcon) dIcon.setAttribute('name', iconName);

                // Mobile Current/Next Step
                const mInstr = document.getElementById('guideCurrentText');
                const mDist = document.getElementById('mNavNextDist');
                const mIcon = document.getElementById('mNavNextIcon');
                if (mInstr) {
                    const rawStreetName = (current.name || '').trim();
                    if (rawStreetName && instructionText.includes(rawStreetName)) {
                        const escName = escapeHtml(rawStreetName);
                        const escInstr = escapeHtml(instructionText);
                        mInstr.innerHTML = escInstr.replace(escName, `<span class="step-street-name">${escName}</span>`);
                    } else {
                        mInstr.textContent = instructionText;
                    }
                }
                if (mDist) {
                    if (hasDist) {
                        mDist.textContent = distText;
                        mDist.style.display = '';
                    } else {
                        mDist.textContent = '';
                        mDist.style.display = 'none';
                    }
                }
                if (mIcon) mIcon.setAttribute('name', iconName);

                // Following step preview on mobile ("Then" strip attached under the banner)
                const mobileFollowing = document.getElementById('mobileGuideFollowing');
                const mobileNextText = document.getElementById('guideNextText');
                const mobileFollowingIcon = document.getElementById('mFollowingIcon');
                const thenLabel = document.querySelector('#mobileGuideFollowing .mobile-guide-then-label');
                if (thenLabel) thenLabel.textContent = t('planner.nav_then') || 'Then';

                if (idx + 1 < steps.length) {
                    const nextS = steps[idx + 1];
                    const nextIsLast = (idx + 1 === steps.length - 1);
                    const afterNextMode = (idx + 2 < steps.length) ? steps[idx + 2].mode : null;

                    // If nextS is the final arrival step of a walking leg, do not preview "You have arrived" prematurely
                    if (nextIsLast && nextS.maneuver?.type === 'arrive' && nextS.mode === 'foot') {
                        if (mobileFollowing) mobileFollowing.style.display = 'none';
                    } else {
                        const nextInstr = formatStepInstruction(nextS, nextS.mode, {
                            isLastStep: nextIsLast,
                            nextMode: afterNextMode,
                            steps,
                            index: idx + 1,
                            prevName: (current.name || '').trim(),
                            prevText: instructionText
                        });
                        const cleanNextInstr = (nextInstr || '')
                            .replace(/\s*\(--\)\s*/g, ' ')
                            .replace(/\s*\(0\s*m\)\s*/gi, ' ')
                            .trim();
                        if (mobileNextText) mobileNextText.textContent = cleanNextInstr;
                        if (mobileFollowingIcon) mobileFollowingIcon.setAttribute('name', getStepIcon(nextS, nextS.mode, nextIsLast));
                        if (mobileFollowing) mobileFollowing.style.display = 'flex';
                    }
                } else {
                    if (mobileFollowing) mobileFollowing.style.display = 'none';
                }

                if (bottomStatusPill && bottomStatusPill.classList.contains('expanded')) {
                    renderExpandedNavTimeline();
                }
            }
        }

        function startActiveJourneyUI() {
            isTrackingArrival = true;
            document.body.classList.add('navigation-active');

            // Everything below this point renders route-dependent content (legs,
            // steps, stats). If any of it throws — e.g. a step from the routing
            // API missing an expected field — the old Directions panel must still
            // get hidden and the new nav panel must still get its layout pass,
            // otherwise both panels stay visible at once. Each risky step is
            // isolated so one failure doesn't skip the ones after it.
            try {
                // Single source of truth: sync active mode UI and legs
                setModeUI(selectedMode);
            } catch (err) { console.error('[startActiveJourneyUI] setModeUI failed:', err); }

            try {
                renderActiveNavLegs();
            } catch (err) { console.error('[startActiveJourneyUI] renderActiveNavLegs failed:', err); }

            try {
                // Populate route steps immediately (desktop Next Step + mobile Guide)
                const walkStepsClean = (walkRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'foot' }));
                const transitStepsClean = (transitRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'driving' }));
                const finalWalkClean = ((transitRouteGeojson?.finalWalk?.steps || window.finalWalkRouteGeojson?.steps) || []).map(s => ({ ...s, mode: 'foot' }));
                const combinedSteps = [...walkStepsClean, ...transitStepsClean, ...finalWalkClean];
                if (combinedSteps.length > 0) {
                    window.activeRouteSteps = deduplicateSteps(combinedSteps);
                }
                window.currentStepIndex = 0;
                updateGuideStepsUI();
            } catch (err) { console.error('[startActiveJourneyUI] updateGuideStepsUI failed:', err); }

            try {
                // Ensure ETA, duration, and fare displays are populated IMMEDIATELY
                const fwInfo = getFinalWalkInfo();
                cachedRemainingSeconds = (currentWalkDur + currentTransitDur + (fwInfo.finalWalkMin || 0) + (pendingTransfer ? pendingTransfer.extraMin : 0)) * 60;
                syncNavDisplays();
            } catch (err) { console.error('[startActiveJourneyUI] syncNavDisplays failed:', err); }

            // Clear existing interval and start fresh 1s countdown timer
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            countdownInterval = setInterval(() => {
                try {
                    syncNavDisplays(Date.now() - lastMovementTimestamp);
                } catch (err) { console.error('[countdownInterval] syncNavDisplays failed:', err); }
            }, 1000);

            // Ensure Full Route is COLLAPSED by default
            const fullRouteCard = document.getElementById('navPanelFullRoute');
            const fullRouteToggle = document.getElementById('navPanelFullRouteToggle');
            if (fullRouteCard) fullRouteCard.classList.remove('expanded');
            if (fullRouteToggle) fullRouteToggle.setAttribute('aria-expanded', 'false');

            // Explicitly hide pre-navigation Directions Card — guaranteed to run
            // regardless of anything that failed above.
            directionsCard.classList.add('journey-active-hidden');
            directionsCard.style.setProperty('display', 'none', 'important');
            updateCategoryBarVisibility();

            // Viewport-based show/hide toggle (desktop vs mobile)
            updateNavLayoutForViewport();

            // Auto-follow starts ON, hide Re-center button
            setMapAutoFollow(true);

            // Explicitly hide MapLibre zoom controls during active navigation
            const zoomControlGroup = document.querySelector('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-group');
            if (zoomControlGroup) zoomControlGroup.style.setProperty('display', 'none', 'important');

            const elReminders = document.getElementById('remindersPillBtn');
            if (elReminders) elReminders.style.display = 'none';
            const elCategoryBar = document.getElementById('mapCategoryBarWrapper');
            if (elCategoryBar) elCategoryBar.style.display = 'none';
            const elGoogleSignIn = document.getElementById('googleSignInBtn');
            if (elGoogleSignIn) elGoogleSignIn.style.display = 'none';
            const elUserProfileNav = document.getElementById('userProfileNav');
            if (elUserProfileNav) elUserProfileNav.style.display = 'none';
            const elAuthNavBtn = document.getElementById('authNavBtn');
            if (elAuthNavBtn) elAuthNavBtn.style.display = 'none';
            const elHamburger = document.getElementById('hamburgerBtn');
            if (elHamburger) elHamburger.style.display = 'none';
            const elMapTopBar = document.getElementById('mapTopBar');
            if (elMapTopBar) elMapTopBar.style.display = 'none';

            if (bottomStatusPill) {
                bottomStatusPill.classList.remove('expanded');
                const exp = document.getElementById('navExpandedContent');
                if (exp) exp.style.display = 'none';
            }

            // Trip with a transfer: the "I'm here" button is there from the start
            try {
                updateTransferPrompt(currentLocation ? currentLocation.lat : NaN, currentLocation ? currentLocation.lng : NaN);
            } catch (err) { console.error('[startActiveJourneyUI] transfer prompt failed:', err); }
        }

        function cancelActiveJourney() {
            stopLiveTracking();
            stopCompassListening();
            document.body.classList.remove('navigation-active');

            isTrackingArrival = false;
            journeyStartedAt = null;
            journeyId = null;
            priorTrip = null;
            transferAutoDone = false;
            if (window.CalzadaTransitUI) window.CalzadaTransitUI.hideTransfer();
            setMapAutoFollow(false);
            if (reCenterBtn) {
                reCenterBtn.classList.remove('is-visible');
                reCenterBtn.style.removeProperty('display');
            }

            // A2: Remove navigation-only user pointers on cancel
            if (userMarker) { userMarker.remove(); userMarker = null; }
            if (gpsCircle) { gpsCircle = null; }

            // Clear completed route line progress
            updateRouteSource('completed-route', []);

            // A3: Reset progress to first step
            window.currentStepIndex = 0;
            activeLegIndex = 0;
            updateGuideStepsUI();

            // A4: Clear saved journey state so a reload shows preview or empty state, never navigation mode
            try {
                sessionStorage.removeItem(STORAGE_KEY);
                sessionStorage.removeItem('calzada_journey');
            } catch (e) {}

            // Explicitly restore MapLibre zoom controls when navigation ends
            const zoomControlGroup = document.querySelector('.maplibregl-ctrl-bottom-right .maplibregl-ctrl-group');
            if (zoomControlGroup) zoomControlGroup.style.removeProperty('display');

            // Reset map bearing to north
            map.easeTo({ bearing: 0, duration: 300 });

            // Hide Active nav overlays
            if (activeNavPanel) activeNavPanel.style.setProperty('display', 'none', 'important');
            if (activeGuideCard) activeGuideCard.style.setProperty('display', 'none', 'important');
            if (bottomStatusPill) {
                bottomStatusPill.style.setProperty('display', 'none', 'important');
                bottomStatusPill.classList.remove('expanded');
                const exp = document.getElementById('navExpandedContent');
                if (exp) exp.style.display = 'none';
            }

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
            const elMapTopBar = document.getElementById('mapTopBar');
            if (elMapTopBar) elMapTopBar.style.display = '';

            // Auth UI: ensure only one of authNavBtn or userAvatarPill shows (G)
            syncPlannerAuthUI();

            // A1: Return to the same route preview the user saw before starting:
            // origin and destination fields filled, route line and origin/destination markers drawn,
            // summary and itinerary shown, mode unchanged, START JOURNEY enabled.
            if (selectedCoords.origin && selectedCoords.destination && (walkRouteGeojson || transitRouteGeojson)) {
                drawRoutes(walkRouteGeojson?.coordinates || [], transitRouteGeojson?.coordinates || []);
                renderItinerary();
                updateSummaryRow();
                updatePillFareUI();
            }

            renderPlannerState();

            // Restore Directions Card
            directionsCard.classList.remove('journey-active-hidden');
            directionsCard.style.removeProperty('display');
            directionsCard.style.display = '';
            directionsCard.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
            directionsCard.style.transform = 'translateY(0px)';
            directionsCard.classList.remove('collapsed', 'peek');
            directionsCard.classList.add('expanded');
            document.getElementById('dsPeekInfo').style.display = 'none';
            updateMidpointBubbleVisibility(false);
            updateCategoryBarVisibility();
            map.resize();
            // drawRoutes above fitted while the sheet was hidden; refit for the restored sheet
            // (skipped on phones when the expanded sheet leaves under 160px of map).
            fitRoutePreviewBounds(300);
        }

        window._calzadaStartJourney = startActiveJourneyUI;
        window._calzadaCancelJourney = cancelActiveJourney;
        window._calzadaStartLiveTracking = startLiveTracking;
        window._calzadaStopLiveTracking = stopLiveTracking;
        window.updateGuideStepsUI = updateGuideStepsUI;
        window._calzadaSetRouteGeojson = (walk, transit, legIdx = 1) => {
            walkRouteGeojson = walk;
            transitRouteGeojson = transit;
            activeLegIndex = legIdx;
        };
        window._calzadaSetLastFixAt = (t) => { lastFixAt = t; };
        window._calzadaSetNavHeading = (h) => { currentNavHeading = h; };
        window._calzadaHandleLocationUpdate = handleLocationUpdate;
        window._calzadaGetLiveTrackingState = () => ({
            geoRetryTimer,
            geoHealthTimer,
            lastFixAt,
            lastWatchRestartAt,
            consecutiveFailures,
            hasShownWeakGpsToast,
            hasShownGpsDeniedToast,
            watchId,
            displayLocation,
            currentDisplayPosition,
            markerAnimRaf,
            currentNavHeading,
            mapAutoFollow,
            userMarker
        });

        window._calzadaExecuteRouteQuery = executeRouteQuery;
        window._calzadaUpdateSummaryRow = updateSummaryRow;
        window._calzadaRenderItinerary = renderItinerary;

        window._calzadaGetRouteExportData = () => {
            const walkStepsClean = (walkRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'foot' }));
            const transitStepsClean = (transitRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'driving' }));
            const finalWalkClean = (window.finalWalkRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'foot' }));
            const steps = window.activeRouteSteps && window.activeRouteSteps.length > 0
                ? window.activeRouteSteps
                : (typeof deduplicateSteps === 'function'
                    ? deduplicateSteps([...walkStepsClean, ...transitStepsClean, ...finalWalkClean])
                    : [...walkStepsClean, ...transitStepsClean, ...finalWalkClean]);

            return {
                originName: originPlaceName,
                destName: destPlaceName,
                originCoords: selectedCoords.origin,
                destCoords: selectedCoords.destination,
                selectedMode,
                walkDur: currentWalkDur,
                walkDist: currentWalkDist,
                transitDur: currentTransitDur,
                transitDist: currentTransitDist,
                fare: currentFare,
                journeyStartedAt,
                isTrackingArrival,
                leaveAt: (window._calzadaLeaveCalculation && window._calzadaLeaveCalculation.leaveAt) ? window._calzadaLeaveCalculation.leaveAt : null,
                arriveAt: (window._calzadaLeaveCalculation && window._calzadaLeaveCalculation.arriveAt) ? window._calzadaLeaveCalculation.arriveAt : null,
                plannedSchedule: window._calzadaPlannedSchedule,
                walkRouteGeojson,
                transitRouteGeojson,
                finalWalkRouteGeojson: window.finalWalkRouteGeojson,
                finalWalkCoordinates: lastItineraryStops?.finalWalkCoordinates || (window.finalWalkRouteGeojson?.coordinates) || null,
                activeRouteSteps: steps,
                lastItineraryStops,
                map
            };
        };
        window._calzadaRenderPlannerState = renderPlannerState;
        window._calzadaClearAllPlannerState = clearAllPlannerState;
        window._calzadaClearOriginField = clearOriginField;
        window._calzadaClearDestField = clearDestField;
        window._calzadaSelectLocation = selectLocation;
        window._calzadaSetDestination = (name, coords) => {
            if (!coords) return;
            const lat = Number(coords[0]);
            const lng = Number(coords[1]);
            selectedCoords.destination = [lat, lng];
            destPlaceName = name || 'Selected Destination';
            if (destMarker) { destMarker.remove(); destMarker = null; }
            createDestMarker(selectedCoords.destination);
            updateODDisplay();
            map.flyTo({ center: [lng, lat], zoom: 16 });
            if (selectedCoords.origin && selectedCoords.destination) {
                executeRouteQuery();
            } else {
                setTimeout(() => {
                    const origField = document.getElementById('openOriginModal');
                    if (origField) origField.focus();
                    openLocationModal('origin');
                }, 400);
            }
        };
        window._calzadaApplyCamera = applyCamera;
        window._calzadaSmoothHeading = smoothHeading;
        window._calzadaSetCompassHeading = (h) => { compassHeading = h; };
        window._calzadaSetOD = (originName, originCoords, destName, destCoords, mode = 'jeepney') => {
            originPlaceName = originName;
            selectedCoords.origin = originCoords;
            destPlaceName = destName;
            selectedCoords.destination = destCoords;
            selectedMode = mode;
            userExplicitMode = true;
            setModeUI(mode);
            renderPlannerState();
        };
        window._calzadaGetRouteGeojson = () => ({
            walkRouteGeojson,
            transitRouteGeojson
        });
        window._calzadaSimulateIdenticalStops = () => {
            destPlaceName = 'National Highway 1';
            if (transitRouteGeojson) {
                transitRouteGeojson.steps = [
                    { name: 'National Highway 1', distance: 100 },
                    { name: 'National Highway 1', distance: 4300 }
                ];
                updateSummaryRow();
            }
        };

        document.getElementById('startJourneyBtn').addEventListener('click', () => {
            if (!selectedCoords.origin || !selectedCoords.destination) return;

            // E1: iOS DeviceOrientationEvent.requestPermission() inside user gesture
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    DeviceOrientationEvent.requestPermission().catch(e => console.warn('DeviceOrientation error:', e));
                } catch (e) {
                    console.warn('DeviceOrientation permission error:', e);
                }
            }

            // A3: Reset progress to first step (currentStepIndex = 0)
            window.currentStepIndex = 0;
            activeLegIndex = 0;
            updateGuideStepsUI();

            isTrackingArrival = true;
            journeyStartedAt = Date.now();
            journeyId = newJourneyId();
            saveJourneyState();
            if (window.CalzadaTicket) window.CalzadaTicket.preload();
            setMapAutoFollow(true);
            if (reCenterBtn) {
                reCenterBtn.classList.remove('is-visible');
                reCenterBtn.style.removeProperty('display');
            }

            startActiveJourneyUI();

            const initPadding = computeCameraPadding();
            map.easeTo({
                center: toLngLat(selectedCoords.origin),
                zoom: 17,
                bearing: 0,
                pitch: 0,
                padding: initPadding,
                duration: prefersReducedMotion() ? 0 : 600,
                easing: t => t,
                essential: true
            });

            startCompassListening();
            startLiveTracking();
            // Persist active journey state immediately
            saveJourneyState();
            map.resize();
        });

        // Delegated Cancel Route handler: works cleanly on desktop and mobile buttons without double firing
        document.addEventListener('click', (e) => {
            const cancelBtn = e.target.closest('.btn-cancel-route');
            if (cancelBtn) {
                e.preventDefault();
                cancelActiveJourney();
            }
        });

        // Delegated click handler for Save as PDF buttons
        document.addEventListener('click', (e) => {
            const pdfBtn = e.target.closest('.save-route-pdf-btn');
            if (pdfBtn) {
                e.preventDefault();
                e.stopPropagation();
                if (window.CalzadaRoutePdf && typeof window.CalzadaRoutePdf.exportCurrentRoute === 'function') {
                    window.CalzadaRoutePdf.exportCurrentRoute();
                }
            }
        });

        // Delegated Mode Toggle handler for active navigation
        document.addEventListener('click', (e) => {
            const modeBtn = e.target.closest('.nav-panel-mode-btn');
            if (modeBtn) {
                e.preventDefault();
                const m = modeBtn.dataset.mode;
                if (m && m !== selectedMode) {
                    switchActiveMode(m);
                }
            }
        });

        // Delegated Full Route Accordion toggle (Desktop panel)
        document.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('#navPanelFullRouteToggle');
            if (toggleBtn) {
                e.preventDefault();
                const fullRouteCard = document.getElementById('navPanelFullRoute');
                if (fullRouteCard) {
                    const isExp = fullRouteCard.classList.toggle('expanded');
                    toggleBtn.setAttribute('aria-expanded', isExp ? 'true' : 'false');
                }
            }
        });

        // B3: Navigation Bottom Sheet Drag Handle and Swipe Gesture
        function renderExpandedNavTimeline() {
            const pillLegs = document.getElementById('pillItineraryLegs');
            const mainLegs = document.getElementById('itineraryLegs');
            if (!pillLegs || !mainLegs) return;
            pillLegs.innerHTML = mainLegs.innerHTML;

            const rows = pillLegs.querySelectorAll('.timeline-row');
            rows.forEach(r => r.classList.remove('timeline-row--active'));

            const stepIdx = window.currentStepIndex || 0;
            const steps = window.activeRouteSteps || [];
            const currentStep = steps[stepIdx];

            let targetRow = null;
            if (currentStep) {
                if (currentStep.mode === 'driving' || currentStep.mode === 'jeepney') {
                    targetRow = pillLegs.querySelector('.timeline-leg-row--jeepney');
                } else if (currentStep.maneuver?.type === 'arrive') {
                    const stops = pillLegs.querySelectorAll('.timeline-stop-row');
                    targetRow = stops[stops.length - 1];
                } else {
                    targetRow = pillLegs.querySelector('.timeline-leg-row--walk');
                }
            }
            if (!targetRow && rows.length > 0) {
                targetRow = rows[0];
            }
            if (targetRow) {
                targetRow.classList.add('timeline-row--active');
            }
        }
        window._calzadaRenderExpandedNavTimeline = renderExpandedNavTimeline;

        function toggleNavExpanded(force) {
            if (!bottomStatusPill) return;
            const isExp = force !== undefined ? Boolean(force) : !bottomStatusPill.classList.contains('expanded');
            bottomStatusPill.classList.toggle('expanded', isExp);
            const expandedContent = document.getElementById('navExpandedContent');
            if (expandedContent) {
                expandedContent.style.display = isExp ? 'flex' : 'none';
                if (isExp) {
                    renderExpandedNavTimeline();
                }
            }
            setTimeout(() => {
                const h = bottomStatusPill.offsetHeight || 108;
                document.documentElement.style.setProperty('--bottom-nav-height', `${h}px`);
            }, 100);
        }
        window._calzadaExpandNavSheet = toggleNavExpanded;

        const dragHandle = document.getElementById('navSheetDragHandle');
        if (dragHandle) {
            dragHandle.addEventListener('click', (e) => {
                e.preventDefault();
                toggleNavExpanded();
            });
        }

        let navTouchStartY = 0;
        if (bottomStatusPill) {
            bottomStatusPill.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches[0]) navTouchStartY = e.touches[0].clientY;
            }, { passive: true });

            bottomStatusPill.addEventListener('touchend', (e) => {
                if (e.changedTouches && e.changedTouches[0]) {
                    const diff = navTouchStartY - e.changedTouches[0].clientY;
                    if (diff > 40 && !bottomStatusPill.classList.contains('expanded')) {
                        toggleNavExpanded(true);
                    } else if (diff < -40 && bottomStatusPill.classList.contains('expanded')) {
                        toggleNavExpanded(false);
                    }
                }
            }, { passive: true });
        }

        // User map gestures disable auto-follow only during active navigation (F1)
        ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart'].forEach(evtName => {
            map.on(evtName, (e) => {
                if (isTrackingArrival && e && e.originalEvent) {
                    setMapAutoFollow(false);
                }
            });
        });

        if (reCenterBtn) {
            reCenterBtn.addEventListener('click', () => {
                setMapAutoFollow(true);
                const targetPt = displayLocation ? displayLocation.point : (currentLocation ? [currentLocation.lng, currentLocation.lat] : (selectedCoords?.origin ? toLngLat(selectedCoords.origin) : null));
                if (!targetPt) return;
                const padding = computeCameraPadding();
                const bearing = window.innerWidth <= 768 ? (currentNavHeading || 0) : 0;
                const dur = prefersReducedMotion() ? 0 : 600;
                map.easeTo({
                    center: targetPt,
                    bearing: bearing,
                    zoom: 17,
                    pitch: 0,
                    padding: padding,
                    duration: dur,
                    easing: t => t,
                    essential: true
                });
            });
        }

        window.addEventListener('resize', () => {
            if (isTrackingArrival && mapAutoFollow && displayLocation) {
                const padding = computeCameraPadding();
                const bearing = window.innerWidth <= 768 ? (currentNavHeading || 0) : 0;
                map.easeTo({
                    center: displayLocation.point,
                    bearing: bearing,
                    zoom: 17,
                    pitch: 0,
                    padding: padding,
                    duration: 0,
                    easing: t => t,
                    essential: true
                });
            }
        });
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                if (isTrackingArrival && mapAutoFollow && displayLocation) {
                    const padding = computeCameraPadding();
                    const bearing = window.innerWidth <= 768 ? (currentNavHeading || 0) : 0;
                    map.easeTo({
                        center: displayLocation.point,
                        bearing: bearing,
                        zoom: 17,
                        pitch: 0,
                        padding: padding,
                        duration: 0,
                        easing: t => t,
                        essential: true
                    });
                }
            }, 100);
        });

        // (Tracker variables declared at top of scope)

        function startLiveTracking() {
            if (!navigator.geolocation) return;

            activeLegIndex = 0;
            const fwCoords = transitRouteGeojson?.finalWalk?.coordinates || window.finalWalkRouteGeojson?.coordinates || [];
            trackedCoordinates = (walkRouteGeojson?.coordinates || []).concat(transitRouteGeojson?.coordinates || []).concat(fwCoords);
            completedCoords = [];
            lastMovementTimestamp = Date.now();
            lastValidPosition = null;
            lastMatchedSegmentIndex = 0;
            currentDisplayPosition = null;
            displayLocation = null;
            lastFixTimestamp = 0;
            currentNavHeading = null;
            setMapAutoFollow(true);

            const walkStepsClean = (walkRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'foot' }));
            const transitStepsClean = (transitRouteGeojson?.steps || []).map(s => ({ ...s, mode: 'driving' }));
            const finalWalkClean = ((transitRouteGeojson?.finalWalk?.steps || window.finalWalkRouteGeojson?.steps) || []).map(s => ({ ...s, mode: 'foot' }));
            const combinedSteps = [...walkStepsClean, ...transitStepsClean, ...finalWalkClean];
            if (combinedSteps.length > 0) {
                window.activeRouteSteps = deduplicateSteps(combinedSteps);
            }
            window.currentStepIndex = 0;
            updateGuideStepsUI();

            const fwInfo = getFinalWalkInfo();
            cachedRemainingSeconds = (currentWalkDur + currentTransitDur + (fwInfo.finalWalkMin || 0) + (pendingTransfer ? pendingTransfer.extraMin : 0)) * 60;
            syncNavDisplays();

            // FIX ∗4: Always clear before starting, prevents duplicate intervals on session recovery
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

            countdownInterval = setInterval(() => {
                syncNavDisplays(Date.now() - lastMovementTimestamp);
            }, 1000);
            const elActiveModeToggle = document.getElementById('activeModeToggle');
            if (elActiveModeToggle) elActiveModeToggle.style.display = '';

            // FIX ∗10: geolocation error handler with retry
            if (geoRetryTimer) { clearTimeout(geoRetryTimer); geoRetryTimer = null; }
            if (geoHealthTimer) { clearInterval(geoHealthTimer); geoHealthTimer = null; }
            if (weakGpsToastHandle) {
                weakGpsToastHandle.dismiss();
                weakGpsToastHandle = null;
            }
            lastFixAt = Date.now();
            lastWatchRestartAt = Date.now();
            consecutiveFailures = 0;
            hasShownWeakGpsToast = false;
            hasShownGpsDeniedToast = false;

            const checkGpsHealth = () => {
                if (!watchId) return;
                const now = Date.now();
                const elapsedSinceFix = now - (lastFixAt || now);

                // A3: Show weak signal toast only when:
                // - no successful fix for 20 seconds or more, and
                // - it is not already showing
                if (elapsedSinceFix >= 20000 && !hasShownWeakGpsToast) {
                    hasShownWeakGpsToast = true;
                    weakGpsToastHandle = (window.showToast || showToast)(t('planner.toast_gps_weak'), 'info');
                }

                // A4: Restart the watch only when no fix for 30s, and at most once every 30s
                if (elapsedSinceFix >= 30000 && (now - lastWatchRestartAt >= 30000)) {
                    lastWatchRestartAt = now;
                    if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
                    watchId = navigator.geolocation.watchPosition(handleLocationUpdate, geoErrorHandler, GEO_NAV_OPTIONS);
                }
            };

            const geoErrorHandler = (err) => {
                console.warn('Geolocation error:', err?.message, 'code:', err?.code);

                if (err && err.code === 1) { // PERMISSION_DENIED
                    if (!hasShownGpsDeniedToast) {
                        hasShownGpsDeniedToast = true;
                        (window.showToast || showToast)(t('planner.toast_gps_denied'), 'location');
                    }
                    // Do NOT restart the watch. Stop health checking interval so zero restarts occur over 60s.
                    if (geoHealthTimer) { clearInterval(geoHealthTimer); geoHealthTimer = null; }
                    if (geoRetryTimer) { clearTimeout(geoRetryTimer); geoRetryTimer = null; }
                    return;
                }

                if (err && err.code === 3) { // TIMEOUT
                    // Do NOT show a toast and do NOT restart the watch.
                    // watchPosition keeps running by itself after a timeout.
                    return;
                }

                if (err && err.code === 2) { // POSITION_UNAVAILABLE
                    // No toast on the first one. Count consecutive failures.
                    consecutiveFailures++;
                    checkGpsHealth();
                    return;
                }

                checkGpsHealth();
            };

            geoHealthTimer = setInterval(checkGpsHealth, 1000);
            window._calzadaGeoErrorHandler = geoErrorHandler;
            window._calzadaCheckGpsHealth = checkGpsHealth;

            watchId = navigator.geolocation.watchPosition(handleLocationUpdate, geoErrorHandler, GEO_NAV_OPTIONS);

            if (userMarker) { userMarker.remove(); userMarker = null; }
            if (originMarker) originMarker.remove(); // Hide origin circle so it doesn't sit under the pointer

            // ── NAV CURSOR SVG — disc + hairline + blue arrow, tip points UP at 0° ─────────
            const POINTER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 56 56" aria-hidden="true">
  <circle cx="28" cy="28" r="22" fill="#FFFFFF"/>
  <circle cx="28" cy="28" r="22" fill="none" stroke="#E2E8F0" stroke-width="1"/>
  <path d="M28 13.5 L38.5 39.5 L28 34 L17.5 39.5 Z"
        fill="#378ADD" stroke="#378ADD" stroke-width="2.5" stroke-linejoin="round"/>
</svg>`;

            const uEl = document.createElement('div');
            uEl.className = 'calzada-nav-marker-root';
            uEl.innerHTML = `<div class="nav-marker-shadow-layer"><div class="nav-cursor-wrapper">${POINTER_SVG}</div></div>`;
            const initLngLat = displayLocation ? displayLocation.point : (currentLocation ? [currentLocation.lng, currentLocation.lat] : (selectedCoords.origin ? [selectedCoords.origin[1], selectedCoords.origin[0]] : [121.165, 14.212]));
            currentDisplayPosition = [...initLngLat];
            userMarker = new maplibregl.Marker({
                element: uEl,
                anchor: 'center',
                rotationAlignment: 'viewport'
            }).setLngLat(initLngLat).addTo(map);

            // compass rotated in handleLocationUpdate

            const pillLegs = document.getElementById('pillItineraryLegs');
            const mainLegs = document.getElementById('itineraryLegs');
            if (pillLegs && mainLegs) pillLegs.innerHTML = mainLegs.innerHTML;
        };

        function stopLiveTracking() {
            stopCompassListening();
            if (watchId) { navigator.geolocation.clearWatch(watchId); watchId = null; }
            if (geoRetryTimer) { clearTimeout(geoRetryTimer); geoRetryTimer = null; }
            if (geoHealthTimer) { clearInterval(geoHealthTimer); geoHealthTimer = null; }
            if (weakGpsToastHandle) {
                weakGpsToastHandle.dismiss();
                weakGpsToastHandle = null;
            }
            hasShownWeakGpsToast = false;
            hasShownGpsDeniedToast = false;
            consecutiveFailures = 0;
            lastFixAt = 0;
            lastWatchRestartAt = 0;

            if (deviationTimer) { clearTimeout(deviationTimer); deviationTimer = null; }
            if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
            // FIX ∗3: remainingTransitDurationStrRawTimer is declared but guard it safely
            if (remainingTransitDurationStrRawTimer) { clearInterval(remainingTransitDurationStrRawTimer); remainingTransitDurationStrRawTimer = null; }

            // Cancel running marker rAF animation loop (C3)
            if (markerAnimRaf) {
                cancelAnimationFrame(markerAnimRaf);
                markerAnimRaf = null;
            }
            currentDisplayPosition = null;
            displayLocation = null;
            lastFixTimestamp = 0;
            currentNavHeading = null;
            compassHeading = null;
            currentGpsSpeed = null;
            currentGpsHeading = null;
            lastMatchedSegmentIndex = 0;

            // Remove the user location marker when tracking stops
            if (userMarker) { userMarker.remove(); userMarker = null; }
            if (gpsCircle) { gpsCircle = null; }
        }

        async function handleLocationUpdate(pos) {
            lastFixAt = Date.now();
            consecutiveFailures = 0;
            if (weakGpsToastHandle) {
                weakGpsToastHandle.dismiss();
                weakGpsToastHandle = null;
            }
            hasShownWeakGpsToast = false;

            const { latitude, longitude, accuracy, speed } = pos.coords;
            // B3: Keep currentLocation as the RAW position for everything that already depends on it
            currentLocation = { lat: latitude, lng: longitude };

            // A2: duration = time since the previous fix, clamped to 300..1200 ms. 0 if prefers-reduced-motion.
            const now = performance.now();
            const rawDt = lastFixTimestamp ? (now - lastFixTimestamp) : 800;
            lastFixTimestamp = now;
            const isReducedMotion = prefersReducedMotion();
            const updateDuration = isReducedMotion ? 0 : Math.min(1200, Math.max(300, Math.round(rawDt)));

            // B1: Active route polyline geometry for snapping
            const currentPath = (activeLegIndex === 0 ? walkRouteGeojson?.coordinates : transitRouteGeojson?.coordinates) || [];

            // B2: Threshold = max(25, min(accuracy, 50)) meters
            const effAccuracy = (typeof accuracy === 'number' && !isNaN(accuracy)) ? accuracy : 25;
            const threshold = Math.max(25, Math.min(effAccuracy, 50));

            // B4: When accuracy > 100 m, keep previous display position, but still update lastFixAt
            let targetPt = [longitude, latitude];
            let isSnapped = false;
            let matchedSegmentBearing = 0;

            if (effAccuracy > 100 && displayLocation) {
                targetPt = displayLocation.point;
                isSnapped = displayLocation.isSnapped;
                matchedSegmentBearing = displayLocation.segmentBearing;
            } else {
                if (currentPath && currentPath.length >= 2) {
                    const snapRes = snapToRoute([longitude, latitude], currentPath, lastMatchedSegmentIndex, threshold);
                    if (snapRes && snapRes.distanceM <= threshold) {
                        targetPt = snapRes.point;
                        isSnapped = true;
                        lastMatchedSegmentIndex = snapRes.segmentIndex;
                        matchedSegmentBearing = snapRes.segmentBearing;
                    }
                }
                displayLocation = {
                    lng: targetPt[0],
                    lat: targetPt[1],
                    point: targetPt,
                    isSnapped,
                    segmentBearing: matchedSegmentBearing
                };
            }

            // Determine if the user is moving (speed > 0.5 m/s or position moved > 1m)
            let isMoving = false;
            if (typeof speed === 'number' && !isNaN(speed)) {
                isMoving = speed > 0.5;
            } else if (lastValidPosition) {
                const moveDist = getHaversineDist(latitude, longitude, lastValidPosition.lat, lastValidPosition.lng) * 1000;
                isMoving = moveDist > 1.0;
            }

            // E2: Heading source while navigating:
            // - speed >= 2 m/s and GPS heading is a number (riding the jeep): GPS heading.
            // - otherwise: compass heading.
            // - neither available or permission denied: keep current behavior (route segment bearing when snapped and moving, else keep last heading). No error toast.
            currentGpsSpeed = (typeof speed === 'number' && !isNaN(speed)) ? speed : null;
            currentGpsHeading = (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading)) ? pos.coords.heading : null;

            let targetHeading;
            const isFastJeep = (currentGpsSpeed !== null && currentGpsSpeed >= 2.0 && currentGpsHeading !== null);

            if (isFastJeep) {
                targetHeading = currentGpsHeading;
                currentNavHeading = currentGpsHeading;
            } else if (compassHeading !== null && !isNaN(compassHeading)) {
                targetHeading = compassHeading;
                currentNavHeading = compassHeading;
            } else if (isSnapped && isMoving) {
                targetHeading = matchedSegmentBearing;
                currentNavHeading = smoothHeading(currentNavHeading, targetHeading, 4, 0.3);
            } else if (!isSnapped && (typeof speed === 'number' && speed >= 1.5) && currentGpsHeading !== null) {
                targetHeading = currentGpsHeading;
                currentNavHeading = currentGpsHeading;
            } else {
                targetHeading = (currentNavHeading !== null) ? currentNavHeading : (currentGpsHeading !== null ? currentGpsHeading : 0);
                currentNavHeading = smoothHeading(currentNavHeading, targetHeading, 4, 0.3);
            }

            // Phone (max-width 768px): heading-up. Map bearing = heading, arrow points straight up.
            // Desktop: north-up. Map bearing 0, arrow rotates to the heading.
            const isPhone = window.innerWidth <= 768;
            const finalMapBearing = isPhone ? (currentNavHeading || 0) : 0;

            const pointerEl = userMarker?.getElement()?.querySelector('.nav-cursor-wrapper');
            if (pointerEl) {
                if (isPhone) {
                    pointerEl.style.transform = 'rotate(0deg)';
                } else {
                    pointerEl.style.transform = `rotate(${currentNavHeading || 0}deg)`;
                }
            }

            // Keep #compassSvg in sync with the final map bearing
            const compass = document.getElementById('compassSvg');
            if (compass) {
                compass.style.transform = `rotate(${-finalMapBearing}deg)`;
            }

            // Smooth marker movement with requestAnimationFrame over updateDuration
            if (markerAnimRaf) {
                cancelAnimationFrame(markerAnimRaf);
                markerAnimRaf = null;
            }

            if (!currentDisplayPosition) {
                currentDisplayPosition = [targetPt[0], targetPt[1]];
                if (userMarker) userMarker.setLngLat(currentDisplayPosition);
            } else {
                const prevLng = currentDisplayPosition[0];
                const prevLat = currentDisplayPosition[1];
                const jumpDist = getHaversineDist(prevLat, prevLng, targetPt[1], targetPt[0]) * 1000;

                if (jumpDist > 150 || isReducedMotion || updateDuration <= 0) {
                    currentDisplayPosition = [targetPt[0], targetPt[1]];
                    if (userMarker) userMarker.setLngLat(currentDisplayPosition);
                } else if (jumpDist > 0.001) {
                    const startLng = prevLng;
                    const startLat = prevLat;
                    const destLng = targetPt[0];
                    const destLat = targetPt[1];
                    const startTime = performance.now();
                    const dur = updateDuration;

                    function stepMarker(currentTime) {
                        const elapsed = currentTime - startTime;
                        const progress = Math.min(1, Math.max(0, elapsed / dur));
                        const curLng = startLng + (destLng - startLng) * progress;
                        const curLat = startLat + (destLat - startLat) * progress;
                        currentDisplayPosition = [curLng, curLat];
                        if (userMarker) userMarker.setLngLat(currentDisplayPosition);

                        if (progress < 1) {
                            markerAnimRaf = requestAnimationFrame(stepMarker);
                        } else {
                            markerAnimRaf = null;
                            currentDisplayPosition = [destLng, destLat];
                        }
                    }
                    markerAnimRaf = requestAnimationFrame(stepMarker);
                }
            }

            // E4: Camera: keep ONE camera update path via applyCamera
            if (mapAutoFollow) {
                applyCamera({
                    center: [displayLocation.lng, displayLocation.lat],
                    bearing: finalMapBearing,
                    duration: updateDuration
                });
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

            const destDist = (selectedCoords && selectedCoords.destination) ? getHaversineDist(latitude, longitude, selectedCoords.destination[0], selectedCoords.destination[1]) * 1000 : Infinity;
            if (destDist < 30) {
                triggerArrival();
                return;
            }

            // Trip with a transfer: prompt near the stop; at the next jeep's stop the route is re-computed
            if (pendingTransfer) {
                updateTransferPrompt(latitude, longitude);
                if (transferRecomputing) return;
            }

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
                activeLegIndex = 1;
            }
            if (activeLegIndex === 0 && walkRouteGeojson && walkRouteGeojson.coordinates.length > 0) {
                const walkEnd = walkRouteGeojson.coordinates[walkRouteGeojson.coordinates.length - 1];
                const distToBoard = getHaversineDist(latitude, longitude, walkEnd[0], walkEnd[1]) * 1000;
                if (distToBoard < 40) activeLegIndex = 1;
            }

            // Keep the step and leg current in session (after this fix moved them), for a reload
            saveJourneyState();

            let remainingDist = 0;
            for (let i = closestIdx; i < currentPath.length - 1; i++) {
                remainingDist += getHaversineDist(currentPath[i][0], currentPath[i][1], currentPath[i + 1][0], currentPath[i + 1][1]);
            }

            let remainingTimeSecs = 0;
            if (activeLegIndex === 1) {
                // Transit leg: remaining distance on transit at 30 km/h
                const remFare = computeLTFRBFare(remainingDist, selectedMode);
                updatePillFareUI(remFare);

                const transitCoords = transitRouteGeojson?.coordinates || [];
                const passCoords = transitCoords.slice(0, closestIdx + 1).map(c => [c[1], c[0]]);
                const remainCoords = transitCoords.slice(closestIdx).map(c => [c[1], c[0]]);

                // Sakay-style: completed = gray, remaining = mode color
                const walkCoords = walkRouteGeojson?.coordinates || [];
                const fullCompleted = walkCoords.map(c => [c[1], c[0]]).concat(passCoords);
                updateRouteSource('completed-route', fullCompleted.length > 1 ? fullCompleted : passCoords);
                updateRouteSource('transit-route', remainCoords);
                updateRouteSource('walk-route', []);

                remainingTimeSecs = (remainingDist / JEEPNEY_SPEED_KPH) * 3600; // jeepney ~20 km/h
            } else {
                // Walk leg: walk remaining + full transit time ahead
                const remFare = computeLTFRBFare(currentTransitDist, selectedMode);
                updatePillFareUI();

                const walkRemainingSecs = (remainingDist / WALK_SPEED_KPH) * 3600;   // 4 km/h realistic walk
                const transitAheadSecs = currentTransitDur * 60;        // full transit duration
                remainingTimeSecs = walkRemainingSecs + transitAheadSecs;

                // Dim the walk polyline as user progresses
                const walkCoords = walkRouteGeojson?.coordinates || [];
                const doneCoords = walkCoords.slice(0, closestIdx + 1).map(c => [c[1], c[0]]);
                const aheadCoords = walkCoords.slice(closestIdx).map(c => [c[1], c[0]]);
                if (doneCoords.length > 1) {
                    updateRouteSource('completed-route', doneCoords);
                }
                if (aheadCoords.length > 1) {
                    updateRouteSource('walk-route', aheadCoords);
                }
                // D1: Always ensure transit route line is drawn ahead
                if (transitRouteGeojson && transitRouteGeojson.coordinates && transitRouteGeojson.coordinates.length > 0) {
                    updateRouteSource('transit-route', transitRouteGeojson.coordinates.map(c => [c[1], c[0]]));
                }
            }

            if (pendingTransfer) remainingTimeSecs += pendingTransfer.extraMin * 60;

            const timeSinceLastMove = Date.now() - lastMovementTimestamp;
            let effectiveTime = remainingTimeSecs;
            if (timeSinceLastMove > 480000) {
                effectiveTime = remainingTimeSecs + (timeSinceLastMove / 1000);
            }

            cachedRemainingSeconds = effectiveTime;
            updateDynamicBottomPill(timeSinceLastMove);

            // Walking from the first jeep's stop to the next one is not a deviation
            const nearTransferStop = !!pendingTransfer && Math.min(
                getHaversineDist(latitude, longitude, pendingTransfer.hubPt[0], pendingTransfer.hubPt[1]),
                getHaversineDist(latitude, longitude, pendingTransfer.boardPt[0], pendingTransfer.boardPt[1])
            ) * 1000 <= 400;

            if (minD > 50 && !nearTransferStop) {
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
                            showToast(t('planner.toast_route_updated'), 'success');
                        }
                    }, 10000);
                }
            } else {
                if (deviationTimer) { clearTimeout(deviationTimer); deviationTimer = null; }
            }
        };

        // (updateDynamicBottomPill and syncNavDisplays declared earlier in scope)




        // =============================================
        // ARRIVAL TICKET + TRIP HISTORY
        // The ticket itself is js/trip-ticket.js (window.CalzadaTicket); saving to the
        // account is js/user-stats.js (window.CalzadaTrips).
        // =============================================
        const PLACE_CATEGORY_LABELS = {
            malls: 'Mall', eateries: 'Eatery', coffee: 'Coffee', schools: 'School',
            terminals: 'Terminal', government: 'Government & Landmark', health: 'Health', banks: 'Bank',
            hotels: 'Hotel', establishments: 'Shop & Service'
        };
        const clip = (s, max) => (s == null ? null : String(s).trim().slice(0, max));
        const roundTo = (n, decimals) => {
            const f = Math.pow(10, decimals);
            return Math.round((Number(n) || 0) * f) / f;
        };

        // Destination category for visits and badges: the known place with the same name,
        // else one within 80 m of the destination; badge rules match these singular labels.
        // null when the destination is not a known place.
        const destinationCategory = () => {
            const dest = selectedCoords.destination;
            const places = [...(pickerKnownPlaces || []), ...CALAMBA_PLACES_FALLBACK];
            const name = (destPlaceName || '').trim().toLowerCase();
            let place = name ? places.find(p => (p.name || '').trim().toLowerCase() === name) : null;
            if (!place && dest) {
                place = places.find(p => p.lat && p.lng && getHaversineDist(dest[0], dest[1], p.lat, p.lng) * 1000 <= 80);
            }
            const raw = String(place?.category || '').toLowerCase();
            return PLACE_CATEGORY_LABELS[raw] || null;
        };

        // The origin is stored as a label only, never as coordinates. Any label that could hold
        // coordinates (map-picker pins, URL params, search text, restored or swapped names) is
        // saved as the language-neutral "Pinned location", translated where it is shown. The
        // pattern matches the one the Firestore rules reject (a number with 3+ decimals).
        const COORDINATE_LIKE = /[0-9]+\.[0-9]{3,}/;
        const isPinnedLabel = (label) => {
            const l = label.toLowerCase();
            const known = ['pinned location', 'naka-pin na lokasyon', String(t('planner.pinned_location')).toLowerCase()];
            return known.includes(l) || l.startsWith('pinned location (');
        };
        const originLabelForTrip = () => {
            const label = ((priorTrip && priorTrip.originName) || originPlaceName || '').trim();
            if (!label || label === 'My Location') return 'My Location';
            if (COORDINATE_LIKE.test(label) || isPinnedLabel(label)) return 'Pinned location';
            return clip(label, 120);
        };

        // Snapshot of the finished trip in the users/{uid}/trips shape (times as epoch ms).
        // Times are real when START JOURNEY recorded journeyStartedAt; leg durations only
        // exist as the planner's estimates.
        const buildTrip = () => {
            const arrivedAt = Date.now();
            const startedAt = Number.isFinite(journeyStartedAt) && journeyStartedAt <= arrivedAt ? journeyStartedAt : null;
            const walkOnly = selectedMode === 'walking';
            const stops = (!walkOnly && lastItineraryStops) || {};
            // Legs done before a re-compute at a transfer stop come first
            const legs = (!walkOnly && priorTrip && Array.isArray(priorTrip.legs)) ? priorTrip.legs.map(l => ({ ...l })) : [];
            // A walk under 10 m means the origin is on the route itself: no leg to show.
            if (currentWalkDist * 1000 >= 10) {
                legs.push({ type: 'walk', durationMin: Math.round(currentWalkDur), distanceKm: roundTo(currentWalkDist, 2), fare: 0, boardStop: null, alightStop: null });
            }
            if (!walkOnly) {
                legs.push({
                    type: 'jeepney',
                    durationMin: Math.round(currentTransitDur),
                    distanceKm: roundTo(currentTransitDist, 2),
                    fare: roundTo(currentFare, 2), // keeps centavos (e.g. 16.25), as the ticket shows
                    boardStop: clip(stops.boardAt || 'National Highway', 120),
                    alightStop: clip(stops.alightAt, 120)
                });
                if (stops.finalWalkM >= 10) {
                    legs.push({ type: 'walk', durationMin: Math.round(stops.finalWalkMin), distanceKm: roundTo(stops.finalWalkM / 1000, 2), fare: 0, boardStop: null, alightStop: null });
                }
            }
            return {
                destName: clip(destPlaceName || 'Destination', 120),
                originLabel: originLabelForTrip(),
                startedAt,
                arrivedAt,
                durationMin: startedAt != null ? Math.max(1, Math.round((arrivedAt - startedAt) / 60000)) : null,
                estimatedMin: Math.round(currentWalkDur + currentTransitDur + (stops.finalWalkMin || 0) + ((!walkOnly && priorTrip && priorTrip.estimatedMin) || 0)),
                distanceKm: roundTo(legs.reduce((sum, l) => sum + l.distanceKm, 0), 1),
                fare: legs.reduce((sum, l) => sum + l.fare, 0),
                mode: walkOnly ? 'walk' : 'jeepney',
                legs: legs.slice(0, 10)
            };
        };

        const triggerArrival = () => {
            stopLiveTracking();
            if (window.CalzadaTransitUI) window.CalzadaTransitUI.hideTransfer();
            sessionStorage.removeItem('calzada_journey');
            if (userMarker) { userMarker.remove(); userMarker = null; }
            if (gpsCircle) { gpsCircle = null; }
            if (originMarker) originMarker.addTo(map);
            map.setBearing(0);

            const trip = buildTrip();
            // States saved before journeyId existed have none: one id for this arrival is enough.
            if (!journeyId) journeyId = newJourneyId();
            // The saved journey was removed above; keep it removed while the ticket is open
            arrivedJourneyId = journeyId;

            // Signed-in accounts keep the trip (once per journey, not awaited so the ticket is
            // never delayed); guests and anonymous users keep nothing.
            const trips = window.CalzadaTrips;
            if (trips && trips.canSave()) {
                const dest = selectedCoords.destination || [];
                trips.saveTrip(trip, journeyId, { lat: dest[0], lng: dest[1], category: destinationCategory() });
            }

            if (!window.CalzadaTicket) { cancelActiveJourney(); return; }
            window.CalzadaTicket.open(trip, { onClose: () => cancelActiveJourney() });
        };
        window._calzadaTriggerArrival = triggerArrival;

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

        // ── PIN DROP LOCATION RESOLUTION (Nearest Mapped Place + Reverse Geocode) ──
        let pickerKnownPlaces = [];
        const BANNED_PICKER_PLACES = ['moonbucks', 'bahay ni rizal', 'nuvali', 'city college'];

        const isBannedPickerPlace = (name) => {
            if (!name) return false;
            const lower = name.toLowerCase();
            return BANNED_PICKER_PLACES.some(b => lower.includes(b));
        };

        const loadPickerPlaces = async () => {
            if (pickerKnownPlaces.length > 0) return;
            try {
                const res = await fetch('/api/places');
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        pickerKnownPlaces = data.filter(p => p.lat && p.lng && !isBannedPickerPlace(p.name));
                        if (typeof window !== 'undefined' && Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length > pickerKnownPlaces.length) {
                            const knownIds = new Set(pickerKnownPlaces.map(p => p.id || p.name));
                            for (const fp of window.FALLBACK_PLACES) {
                                if (fp.lat && fp.lng && !isBannedPickerPlace(fp.name) && !knownIds.has(fp.id) && !knownIds.has(fp.name)) {
                                    pickerKnownPlaces.push(fp);
                                }
                            }
                        }
                        return;
                    }
                }
            } catch (_) { }

            const fallback = (typeof window !== 'undefined' && Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length > 0)
                ? window.FALLBACK_PLACES
                : ((typeof CALAMBA_PLACES_FALLBACK !== 'undefined') ? CALAMBA_PLACES_FALLBACK : []);
            pickerKnownPlaces = fallback.filter(p => p.lat && p.lng && !isBannedPickerPlace(p.name));
        };
        loadPickerPlaces();

        const findNearestKnownPlace = (lat, lng, maxRadiusM = 450) => {
            if (!pickerKnownPlaces || !pickerKnownPlaces.length) return null;
            let closest = null;
            let minDistance = Infinity;

            for (const p of pickerKnownPlaces) {
                const pLat = parseFloat(p.lat);
                const pLng = parseFloat(p.lng);
                if (isNaN(pLat) || isNaN(pLng)) continue;

                const distM = getHaversineDist(lat, lng, pLat, pLng) * 1000;
                if (distM < minDistance) {
                    minDistance = distM;
                    closest = p;
                }
            }

            if (closest && minDistance <= maxRadiusM) {
                return {
                    place: closest,
                    distance: minDistance
                };
            }
            return null;
        };

        const formatReverseAddress = (addr) => {
            if (!addr) return null;
            const street = addr.road || addr.pedestrian || addr.highway || addr.path;
            const area = addr.quarter || addr.suburb || addr.village || addr.neighbourhood || addr.city_district || addr.barangay;
            const town = addr.city || addr.town || addr.municipality || 'Calamba';

            if (street && area && street !== area) {
                return `${street}, ${area}`;
            }
            if (street && town) {
                return `${street}, ${town}`;
            }
            if (area && town) {
                return `${area}, ${town}`;
            }
            return street || area || town || null;
        };

        let currentPickerLabel = 'Move map to select location...';
        let reverseGeocodeTimer = null;
        let reverseGeocodeAbort = null;
        let pickerField = 'destination';
        // The pin counts as "on" a Calzada place only this close; otherwise the street is used
        const PIN_ON_PLACE_M = 35;
        const reverseCache = new Map();
        const placeLabel = (p) => {
            const area = p.barangay ? p.barangay : (p.municipality || 'Calamba');
            return `${p.name}, ${area}`;
        };
        let pickerSettleTimer = null;

        // The spot under the pin tip (screen centre). Not map.getCenter(): the map can carry
        // camera padding from fitBounds/easeTo, which moves its "centre" away from the pin.
        const getPinLngLat = () => {
            const rect = map.getContainer().getBoundingClientRect();
            const x = window.innerWidth / 2 - rect.left;
            const y = window.innerHeight / 2 - rect.top;
            return map.unproject([x, y]);
        };

        const setPickerResolving = (on) => {
            mapPickerUI.classList.toggle('is-resolving', !!on);
            if (mapCenterPin) mapCenterPin.classList.toggle('is-resolving', !!on);
        };

        const updatePickerDisplay = (primaryText, coordsText) => {
            currentPickerLabel = primaryText;
            const primaryEl = document.getElementById('mapPickerPrimaryLabel');
            const coordsEl = document.getElementById('mapPickerCoordsLabel');
            const bubbleEl = document.getElementById('mapPinBubbleText');
            if (primaryEl) primaryEl.textContent = primaryText;
            if (bubbleEl) bubbleEl.textContent = String(primaryText).split(',')[0];
            if (coordsEl && coordsText) coordsEl.textContent = coordsText;
            setPickerResolving(false);
        };

        const mapMovedHandler = () => {
            if (!isMapPicking) return;
            const center = getPinLngLat();
            const coordsStr = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;

            // 1. Coordinates follow the pin with no delay
            const coordsEl = document.getElementById('mapPickerCoordsLabel');
            if (coordsEl) coordsEl.textContent = coordsStr;

            // 2. Pin right on a Calzada place (within ~35 m): use its name (instant)
            const nearest = findNearestKnownPlace(center.lat, center.lng, PIN_ON_PLACE_M);
            if (nearest) {
                if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);
                if (reverseGeocodeAbort) reverseGeocodeAbort.abort();
                updatePickerDisplay(placeLabel(nearest.place), coordsStr);
                return;
            }
            const cacheKey = `${center.lat.toFixed(4)},${center.lng.toFixed(4)}`;
            if (reverseCache.has(cacheKey)) {
                if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);
                if (reverseGeocodeAbort) reverseGeocodeAbort.abort();
                updatePickerDisplay(reverseCache.get(cacheKey), coordsStr);
                return;
            }

            // 3. No mapped place within 450 m: look the address up (debounced), showing that it is loading
            setPickerResolving(true);
            if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);

            reverseGeocodeTimer = setTimeout(async () => {
                if (!isMapPicking) return;
                const currentCenter = getPinLngLat();
                const checkNear = findNearestKnownPlace(currentCenter.lat, currentCenter.lng, PIN_ON_PLACE_M);
                if (checkNear) {
                    updatePickerDisplay(placeLabel(checkNear.place), `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`);
                    return;
                }
                const key = `${currentCenter.lat.toFixed(4)},${currentCenter.lng.toFixed(4)}`;

                try {
                    if (reverseGeocodeAbort) reverseGeocodeAbort.abort();
                    reverseGeocodeAbort = new AbortController();

                    const url = `https://nominatim.openstreetmap.org/reverse?lat=${currentCenter.lat}&lon=${currentCenter.lng}&format=json&addressdetails=1&zoom=18`;
                    const res = await fetch(url, {
                        signal: reverseGeocodeAbort.signal,
                        headers: { 'Accept-Language': 'en', 'User-Agent': 'Calambiyahe-App/1.0' }
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    const readableAddr = formatReverseAddress(data.address);
                    // A named building/shop/landmark right at the pin comes first ("Name, Street")
                    const a = data.address || {};
                    const poi = data.name && data.name !== (a.road || '') && /^(amenity|shop|building|tourism|office|leisure|healthcare|place_of_worship|craft)$/.test(data.class || data.category || '')
                        ? data.name : '';
                    const street = a.road || a.pedestrian || a.footway || '';
                    const finalLabel = poi
                        ? (street ? `${poi}, ${street}` : `${poi}, ${(a.quarter || a.suburb || a.village || 'Calamba')}`)
                        : (readableAddr || data.name || t('planner.pinned_location'));
                    reverseCache.set(key, finalLabel);

                    if (isMapPicking) {
                        updatePickerDisplay(finalLabel, `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`);
                    }
                } catch (err) {
                    if (err.name !== 'AbortError' && isMapPicking) {
                        updatePickerDisplay(t('planner.pinned_location'), `${currentCenter.lat.toFixed(4)}, ${currentCenter.lng.toFixed(4)}`);
                    }
                }
            }, 350);
        };

        // The pin lifts while the map is moving and drops (with a ripple) when it stops
        const pickerMoveStart = () => {
            if (!isMapPicking || !mapCenterPin) return;
            if (pickerSettleTimer) { clearTimeout(pickerSettleTimer); pickerSettleTimer = null; }
            mapCenterPin.classList.remove('is-dropped');
            mapCenterPin.classList.add('is-lifted');
        };
        const pickerMoveEnd = () => {
            if (!isMapPicking || !mapCenterPin) return;
            mapCenterPin.classList.remove('is-lifted');
            void mapCenterPin.offsetWidth; // restart the drop animation
            mapCenterPin.classList.add('is-dropped');
            pickerSettleTimer = setTimeout(() => mapCenterPin.classList.remove('is-dropped'), 700);
        };

        const pickerText = (key, fallback) => {
            const v = t(key);
            return (v && v !== key) ? v : fallback;
        };

        const triggerMapPicker = () => {
            isMapPicking = true;
            pickerField = activeSelectingField === 'origin' ? 'origin' : 'destination';
            loadPickerPlaces();

            const isFrom = pickerField === 'origin';
            document.body.classList.add('is-map-picking');
            document.body.classList.toggle('pick-origin', isFrom);
            document.body.classList.toggle('pick-destination', !isFrom);
            const roleEl = document.getElementById('mapPickerRole');
            if (roleEl) roleEl.textContent = isFrom ? pickerText('planner.pick_from_role', 'Starting point') : pickerText('planner.pick_to_role', 'Destination');
            const hintEl = document.getElementById('mapPickerHintText');
            if (hintEl) hintEl.textContent = isFrom ? pickerText('planner.pick_from_hint', 'Move the map to set where you start') : pickerText('planner.pick_to_hint', 'Move the map to set where you are going');
            const confirmEl = document.getElementById('mapPickerConfirmBtn');
            if (confirmEl) confirmEl.textContent = isFrom ? pickerText('planner.pick_from_confirm', 'Set as starting point') : pickerText('planner.pick_to_confirm', 'Set as destination');
            const cancelEl = document.getElementById('mapPickerCancelBtn');
            if (cancelEl) cancelEl.textContent = pickerText('planner.pick_cancel', 'Cancel');

            mapCenterPin.style.display = '';
            mapPickerUI.style.display = '';
            const hint = document.getElementById('mapPickerHint');
            if (hint) { hint.style.display = ''; hint.classList.remove('is-gone'); }

            // Pin enters with a drop
            mapCenterPin.classList.remove('is-lifted');
            pickerMoveEnd();

            mapMovedHandler();
            map.on('move', mapMovedHandler);
            map.on('movestart', pickerMoveStart);
            map.on('moveend', pickerMoveEnd);
            map.once('movestart', () => { if (hint) hint.classList.add('is-gone'); });
        };

        document.getElementById('mapPickerConfirmBtn').addEventListener('click', () => {
            const c = getPinLngLat();
            const selectedLabel = (currentPickerLabel && currentPickerLabel !== 'Move map to select location...')
                ? currentPickerLabel
                : t('planner.pinned_location'); // coordinates stay in the picker, never in the label
            activeSelectingField = pickerField;
            cancelMapPicking();
            selectLocation(selectedLabel, [c.lat, c.lng]);
        });

        document.getElementById('mapPickerCancelBtn').addEventListener('click', cancelMapPicking);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && isMapPicking) cancelMapPicking();
        });

        function cancelMapPicking() {
            isMapPicking = false;
            if (reverseGeocodeTimer) clearTimeout(reverseGeocodeTimer);
            if (reverseGeocodeAbort) reverseGeocodeAbort.abort();
            if (pickerSettleTimer) { clearTimeout(pickerSettleTimer); pickerSettleTimer = null; }
            setPickerResolving(false);
            mapCenterPin.style.display = 'none';
            mapCenterPin.classList.remove('is-lifted', 'is-dropped');
            mapPickerUI.style.display = 'none';
            const hint = document.getElementById('mapPickerHint');
            if (hint) hint.style.display = 'none';
            document.body.classList.remove('is-map-picking', 'pick-origin', 'pick-destination');
            map.off('move', mapMovedHandler);
            map.off('movestart', pickerMoveStart);
            map.off('moveend', pickerMoveEnd);
        }

        // =============================================
        // UTILITIES & EXISTING UI RETAINMENTS
        // =============================================
        // ── TOASTS: one component for every Planner message ─────────────────────
        // showToast(message, type) with type 'info' | 'location' | 'success' | 'error'.
        // Bottom-center, stacked newest-at-bottom (max 3), auto-dismiss after 5s
        // (paused on hover/focus), plus a close button. Returns a handle with
        // dismiss() for messages whose lifetime is tied to something else.
        const showToast = (() => {
            const TOAST_MS = 4000;
            const MAX_TOASTS = 3;
            const LEAVE_MS = 180;
            const ICONS = {
                info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
                location: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
                success: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
                error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
                loading: '<path class="cz-toast-spinner-path" d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>'
            };
            const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const region = document.getElementById('toastRegion');
            const active = [];

            // Keep the stack just above whichever bottom panel is showing (directions
            // sheet, journey guide card, status pill). Measured per frame while toasts
            // are up, so it follows sheet drags/animations with no coupling to them.
            // Panels not spanning the horizontal center (the desktop sidebar) are ignored.
            const PANELS = '#directionsCard, #bottomStatusPill';
            let rafId = null;
            const updateClearance = () => {
                const vw = window.innerWidth, vh = window.innerHeight;
                let top = vh;
                document.querySelectorAll(PANELS).forEach(el => {
                    const r = el.getBoundingClientRect();
                    if (!r.height || r.left > vw / 2 || r.right < vw / 2) return;
                    if (r.top < top && r.top > 80) top = r.top;
                });

                // The map credits ("i" / open pill) at the bottom-left: stack above them when they sit under the toasts
                const attrib = document.querySelector('.maplibregl-ctrl-bottom-left .maplibregl-ctrl-attrib');
                if (attrib && getComputedStyle(attrib.parentElement).visibility !== 'hidden') {
                    const ra = attrib.getBoundingClientRect();
                    const rr = region.getBoundingClientRect();
                    if (ra.height && ra.right > rr.left && ra.left < rr.right && ra.top > 80 && ra.top < top) top = ra.top;
                }

                // In navigation mode on mobile (<=768px):
                // Ensure toast sits above the bottom sheet and does not cover the round map control (#reCenterBtn)
                if (vw <= 768 && document.body.classList.contains('navigation-active')) {
                    const reCenter = document.getElementById('reCenterBtn');
                    if (reCenter) {
                        const rBtn = reCenter.getBoundingClientRect();
                        if (rBtn.height > 0 && rBtn.top < top && getComputedStyle(reCenter).display !== 'none') {
                            top = rBtn.top;
                        }
                    }
                }

                // C3: Ensure at least 12px clearance below the guide card (#activeGuideCard) and Then strip
                let minTop = 16;
                const guideCard = document.getElementById('activeGuideCard');
                const thenStrip = document.getElementById('mobileGuideFollowing');
                const rGuide = (guideCard && getComputedStyle(guideCard).display !== 'none') ? guideCard.getBoundingClientRect() : null;
                const rThen = (thenStrip && getComputedStyle(thenStrip).display !== 'none') ? thenStrip.getBoundingClientRect() : null;
                const bannerBottom = Math.max(rGuide && rGuide.height > 0 ? rGuide.bottom : 0, rThen && rThen.height > 0 ? rThen.bottom : 0);
                if (bannerBottom > 0) {
                    minTop = Math.max(minTop, bannerBottom + 12);
                }
                // Never over the top bar (buttons + category pills)
                const topBar = document.getElementById('mapTopBar');
                if (topBar && getComputedStyle(topBar).display !== 'none') {
                    const rb = topBar.getBoundingClientRect().bottom;
                    if (rb > 0) minTop = Math.max(minTop, rb + 8);
                }

                const clear = Math.min(vh - Math.min(top, vh) + 12, vh - region.offsetHeight - minTop);
                region.style.setProperty('--toast-clear', `${Math.round(clear)}px`);
                rafId = active.length ? requestAnimationFrame(updateClearance) : null;
            };

            const remove = (item) => {
                const i = active.indexOf(item);
                if (i === -1) return;
                active.splice(i, 1);
                clearTimeout(item.timer);
                const { el } = item;
                if (reducedMotion()) { el.remove(); return; }
                el.classList.add('is-leaving');
                setTimeout(() => el.remove(), LEAVE_MS);
            };

            const startTimer = (item) => {
                clearTimeout(item.timer);
                item.startedAt = Date.now();
                item.timer = setTimeout(() => remove(item), item.remaining);
            };
            const pauseTimer = (item) => {
                clearTimeout(item.timer);
                item.remaining = Math.max(1000, item.remaining - (Date.now() - item.startedAt));
            };

            return (message, type = 'info') => {
                if (!region) return { dismiss() {} };
                const kind = ICONS[type] ? type : 'info';

                // Same message already showing: restart it rather than stacking a copy.
                const dupe = active.find(it => it.message === message);
                if (dupe) { dupe.remaining = TOAST_MS; startTimer(dupe); return { dismiss: () => remove(dupe) }; }

                const el = document.createElement('div');
                el.className = `cz-toast cz-toast--${kind}`;
                el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
                el.innerHTML = `
                    <svg class="cz-toast-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind]}</svg>
                    <p class="cz-toast-msg"></p>
                    <button type="button" class="cz-toast-close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>`;
                el.querySelector('.cz-toast-msg').textContent = message;
                const closeBtn = el.querySelector('.cz-toast-close');
                closeBtn.setAttribute('aria-label', t('planner.toast_dismiss'));

                const item = { el, message, remaining: (kind === 'loading' ? 25000 : TOAST_MS), timer: null, startedAt: 0 };
                closeBtn.addEventListener('click', () => remove(item));
                el.addEventListener('keydown', (e) => { if (e.key === 'Escape') remove(item); });
                // Pause only for a real mouse hover or keyboard focus. On phones a tap fires
                // mouseenter/focus with no matching leave, which kept toasts up forever.
                const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
                if (canHover) {
                    el.addEventListener('mouseenter', () => pauseTimer(item));
                    el.addEventListener('mouseleave', () => { if (!el.contains(document.activeElement)) startTimer(item); });
                }
                el.addEventListener('focusin', (e) => {
                    let kb = false;
                    try { kb = e.target.matches(':focus-visible'); } catch (_) { kb = false; }
                    if (kb) { item.kbFocus = true; pauseTimer(item); }
                });
                el.addEventListener('focusout', (e) => {
                    if (!item.kbFocus || el.contains(e.relatedTarget)) return;
                    item.kbFocus = false;
                    if (!(canHover && el.matches(':hover'))) startTimer(item);
                });

                active.push(item);
                region.appendChild(el);
                while (active.length > MAX_TOASTS) remove(active[0]);
                startTimer(item);
                if (!rafId) updateClearance();
                return { dismiss: () => remove(item) };
            };
        })();
        window.showToast = showToast;

        // =============================================
        // USER LOCATION DOT (ambient "you are here", Google Maps style)
        // =============================================
        // Display-only: coordinates never leave the browser and are never stored.
        // Kept separate from the journey tracker (startLiveTracking), which owns its
        // own watch + nav cursor; this dot hides itself while navigation is active.
        (() => {
            const GEO_DENIED_KEY = 'calzada_geo_denied';        // sessionStorage: user said no
            const GEO_TOAST_KEY = 'calzada_geo_toast_shown';    // sessionStorage: auto toast shown once
            const LOCATE_ZOOM = 16;
            const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            const ss = {
                get: (k) => { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
                set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (_) { /* private mode */ } },
                del: (k) => { try { sessionStorage.removeItem(k); } catch (_) { /* private mode */ } }
            };

            let dotMarker = null;
            let lastFixInfo = null;      // { lat, lng, acc, ts } of the latest reading
            let watchHandle = null;
            let fix = null;              // { lng, lat } currently rendered
            let hasCentered = false;     // auto-center only on the first fix
            let requesting = false;
            let animFrame = null;
            let locateBtn = null;
            let hintToast = null;

            const geoSupported = () => !!navigator.geolocation && window.isSecureContext !== false;
            const navActive = () => document.body.classList.contains('navigation-active');
            const routeOnMap = () => !!(window._calzadaRouteContext || isTrackingArrival);

            const queryPermission = async () => {
                try {
                    if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
                    const status = await navigator.permissions.query({ name: 'geolocation' });
                    return status.state; // 'granted' | 'denied' | 'prompt'
                } catch (_) { return 'unknown'; }
            };

            // Automatic (non-click) notices appear at most once per session.
            const geoToastType = (key) => (key === 'planner.geo_denied' ? 'location' : 'error');
            const toastOnce = (key) => {
                if (ss.get(GEO_TOAST_KEY)) return;
                ss.set(GEO_TOAST_KEY, '1');
                showToast(t(key), geoToastType(key));
            };

            const render = (f) => {
                const hidden = navActive(); // the journey nav cursor takes over
                if (!dotMarker) {
                    const el = document.createElement('div');
                    el.className = 'calzada-user-dot';
                    el.setAttribute('aria-hidden', 'true');
                    dotMarker = new maplibregl.Marker({ element: el, anchor: 'center' })
                        .setLngLat([f.lng, f.lat])
                        .addTo(map);
                }
                dotMarker.setLngLat([f.lng, f.lat]);
                dotMarker.getElement().style.visibility = hidden ? 'hidden' : '';
                scheduleLocateState();
            };

            // Glide the dot to the new fix instead of jumping.
            const moveTo = (next) => {
                if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
                const from = fix;
                if (!from || reducedMotion()) { fix = next; render(fix); return; }
                const start = performance.now(), dur = 600;
                const step = (now) => {
                    const k = Math.min(1, (now - start) / dur);
                    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
                    fix = {
                        lng: from.lng + (next.lng - from.lng) * e,
                        lat: from.lat + (next.lat - from.lat) * e
                    };
                    render(fix);
                    animFrame = k < 1 ? requestAnimationFrame(step) : null;
                };
                animFrame = requestAnimationFrame(step);
            };

            const centerOn = (f) => {
                const opts = { center: [f.lng, f.lat], zoom: Math.max(map.getZoom(), LOCATE_ZOOM) };
                if (reducedMotion()) map.jumpTo(opts);
                else map.easeTo({ ...opts, duration: 700, essential: true });
            };

            const setLoading = (on) => {
                requesting = on;
                if (!locateBtn) return;
                locateBtn.classList.toggle('is-loading', on);
                locateBtn.setAttribute('aria-busy', on ? 'true' : 'false');
            };

            const setActive = (on) => { if (locateBtn) locateBtn.classList.toggle('is-active', on); };

            const hideHint = () => {
                if (hintToast) { hintToast.dismiss(); hintToast = null; }
            };

            const showHint = () => {
                if (!hintToast) hintToast = showToast(t('planner.geo_hint'), 'location');
            };

            const onPosition = (pos, { recenter = false } = {}) => {
                const next = { lng: pos.coords.longitude, lat: pos.coords.latitude };
                lastFixInfo = { lat: next.lat, lng: next.lng, acc: pos.coords.accuracy, ts: Date.now() };
                moveTo(next);
                setActive(true);
                const inPreview = () => !!(selectedCoords.origin && selectedCoords.destination);
                if (recenter) {
                    centerOn(next);
                } else if (!hasCentered && !inPreview() && !routeOnMap()) {
                    centerOn(next);
                }
                hasCentered = true;

                // "My Location" origin from a rough first fix, no destination yet: just move the origin
                {
                    const of = window.__calzadaMyLocOriginFix;
                    if (!isTrackingArrival && !navActive() && isMyLocationOrigin() && selectedCoords.origin && !selectedCoords.destination
                        && of && of.accuracy > 50 && pos.coords.accuracy < of.accuracy * 0.6) {
                        window.__calzadaMyLocOriginFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                        selectedCoords.origin = [pos.coords.latitude, pos.coords.longitude];
                        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                        renderPlannerState();
                    }
                }

                // Requirement B: If origin is "My Location", check if live position moved > 30m before START JOURNEY
                if (!isTrackingArrival && !navActive() && isMyLocationOrigin() && selectedCoords.origin && selectedCoords.destination) {
                    const distFromOrigin = getHaversineDist(
                        pos.coords.latitude, pos.coords.longitude,
                        selectedCoords.origin[0], selectedCoords.origin[1]
                    ) * 1000;
                    // Also refine a "My Location" origin that was taken from a rough first fix
                    const originFix = window.__calzadaMyLocOriginFix;
                    const roughOrigin = originFix && originFix.accuracy > 50 && pos.coords.accuracy < originFix.accuracy * 0.6;
                    if (distFromOrigin > 30 || (roughOrigin && distFromOrigin > 10)) {
                        if (roughOrigin) window.__calzadaMyLocOriginFix = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
                        triggerPreviewReplan(pos.coords.latitude, pos.coords.longitude);
                    }
                }
            };

            // Where the user is, if known (the place search shows distances with it); never stored
            window._calzadaGetUserFix = () => (fix ? { lat: fix.lat, lng: fix.lng } : null);
            // The last GPS reading with its accuracy, if it is recent enough ("My Location" uses it at once)
            window._calzadaGetRecentFix = (maxAgeMs) => (lastFixInfo && Date.now() - lastFixInfo.ts <= maxAgeMs ? { ...lastFixInfo } : null);

            window._calzadaSetUserFix = (lng, lat) => {
                const next = { lng, lat };
                moveTo(next);
                setActive(true);
                hasCentered = true;
                startWatch();
            };

            const clearLocation = () => {
                if (watchHandle !== null) { navigator.geolocation.clearWatch(watchHandle); watchHandle = null; }
                if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
                if (dotMarker) { dotMarker.remove(); dotMarker = null; }
                fix = null;
                setActive(false);
                scheduleLocateState();
            };

            // fromClick: the user asked, so always answer; automatic failures toast once per session.
            const onError = (err, fromClick) => {
                const key = err && err.code === 1 ? 'planner.geo_denied' : 'planner.geo_unavailable';
                if (err && err.code === 1) { ss.set(GEO_DENIED_KEY, '1'); clearLocation(); }
                if (fromClick) showToast(t(key), geoToastType(key));
                else toastOnce(key);
            };

            const startWatch = () => {
                if (watchHandle !== null || !geoSupported() || document.hidden) return;
                watchHandle = navigator.geolocation.watchPosition(
                    (pos) => onPosition(pos),
                    // Timeouts/unavailable mid-watch: keep the last dot quietly.
                    (err) => { if (err && err.code === 1) onError(err, false); },
                    { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 }
                );
            };

            // One-shot request; watchPosition takes over once it succeeds.
            const requestLocation = ({ fromClick = false } = {}) => {
                if (requesting) return;
                setLoading(true);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        setLoading(false);
                        hideHint();
                        ss.del(GEO_DENIED_KEY);
                        onPosition(pos, { recenter: fromClick });
                        startWatch();
                    },
                    (err) => {
                        setLoading(false);
                        hideHint();
                        onError(err, fromClick);
                    },
                    { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
                );
            };

            let compassBtn = null;
            let compassNeedle = null;
            const updateLocateLocale = () => {
                if (locateBtn) {
                    const label = t('planner.show_my_location');
                    locateBtn.setAttribute('title', label);
                    locateBtn.setAttribute('aria-label', label);
                }
                if (compassBtn) {
                    const label = t('planner.reset_north');
                    compassBtn.setAttribute('title', label);
                    compassBtn.setAttribute('aria-label', label);
                }
            };
            window.addEventListener('calzada_lang_changed', updateLocateLocale);

            // Look of the locate button (what a tap does is unchanged): 'idle' = outline target, the map
            // is not on the user; 'centred' = filled arrow, the map is centred on the user; 'heading' =
            // heading arrow while navigation follows the user's direction.
            let locateState = '';
            const updateLocateState = () => {
                if (!locateBtn) return;
                let state = 'idle';
                if (navActive()) {
                    state = 'heading';
                } else if (fix) {
                    const c = map.project(map.getCenter());
                    const u = map.project([fix.lng, fix.lat]);
                    if (Math.hypot(c.x - u.x, c.y - u.y) <= 24) state = 'centred';
                }
                if (state === locateState) return;
                locateState = state;
                locateBtn.dataset.state = state;
                locateBtn.setAttribute('aria-pressed', state === 'idle' ? 'false' : 'true');
            };
            let locateStateFrame = null;
            const scheduleLocateState = () => {
                if (locateStateFrame) return;
                locateStateFrame = requestAnimationFrame(() => { locateStateFrame = null; updateLocateState(); });
            };
            map.on('move', scheduleLocateState);

            // Compass: the needle points north as the map rotates; a tap turns the map back to north
            const syncCompass = () => {
                if (compassNeedle) compassNeedle.style.transform = `rotate(${-map.getBearing()}deg)`;
            };
            map.on('rotate', syncCompass);
            const onCompassClick = () => {
                map.easeTo({ bearing: 0, pitch: 0, duration: reducedMotion() ? 0 : 300, essential: true });
            };

            const onLocateClick = async () => {
                if (requesting) return;
                if (fix) {
                    centerOn(fix);
                    startWatch();
                    return;
                }
                if (!geoSupported()) { showToast(t('planner.geo_unavailable'), 'error'); return; }
                if (await queryPermission() === 'denied') {
                    ss.set(GEO_DENIED_KEY, '1');
                    showToast(t('planner.geo_denied'), 'location');
                    return;
                }
                // Explicit tap: ask again even if an earlier prompt was dismissed.
                requestLocation({ fromClick: true });
            };

            // ── Map buttons: one card, compass on top, locate below ────────────────
            // Deliberately NOT .maplibregl-ctrl-group: the navigation code grabs the first
            // such group in the bottom-right to hide the zoom controls.
            map.addControl({
                onAdd() {
                    this._container = document.createElement('div');
                    this._container.className = 'maplibregl-ctrl calzada-map-card';

                    compassBtn = document.createElement('button');
                    compassBtn.type = 'button';
                    compassBtn.className = 'calzada-map-btn calzada-compass-btn';
                    compassBtn.innerHTML = `
                        <svg class="calzada-compass-needle" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 2.5 15.6 12H8.4Z" fill="#E5484D"/>
                            <path d="M12 21.5 8.4 12h7.2Z" fill="#94A3B8"/>
                        </svg>`;
                    compassNeedle = compassBtn.firstElementChild;
                    compassBtn.addEventListener('click', onCompassClick);

                    const divider = document.createElement('span');
                    divider.className = 'calzada-map-divider';
                    divider.setAttribute('aria-hidden', 'true');

                    locateBtn = document.createElement('button');
                    locateBtn.type = 'button';
                    locateBtn.className = 'calzada-map-btn calzada-locate-btn';
                    locateBtn.innerHTML = `
                        <svg class="calzada-locate-icon calzada-locate-icon--idle" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <circle cx="12" cy="12" r="7"/>
                            <circle cx="12" cy="12" r="2.5"/>
                            <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                        </svg>
                        <svg class="calzada-locate-icon calzada-locate-icon--centred" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M20.6 3.4 3.9 10.3c-.9.4-.8 1.6.1 1.8l6.7 1.4 1.4 6.7c.2.9 1.4 1 1.8.1z" fill="#378ADD"/>
                        </svg>
                        <svg class="calzada-locate-icon calzada-locate-icon--heading" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 2.5 19.5 20.5 12 16.6 4.5 20.5Z" fill="#378ADD"/>
                        </svg>`;
                    locateBtn.addEventListener('click', onLocateClick);

                    this._container.append(compassBtn, divider, locateBtn);
                    updateLocateLocale();
                    syncCompass();
                    updateLocateState();
                    return this._container;
                },
                onRemove() { this._container.remove(); }
            }, 'bottom-right');

            // Save battery: stop watching while the tab is hidden, resume on return.
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (watchHandle !== null) { navigator.geolocation.clearWatch(watchHandle); watchHandle = null; }
                } else if (fix) {
                    startWatch();
                }
            });

            // Journey start/stop toggles body.navigation-active; re-render so the dot
            // hides under the nav cursor and comes back afterwards.
            new MutationObserver(() => { if (fix) render(fix); updateLocateState(); })
                .observe(document.body, { attributes: true, attributeFilter: ['class'] });

            // ── Auto-request once on Planner open ──────────────────────────────────
            (async () => {
                if (!geoSupported()) { toastOnce('planner.geo_unavailable'); return; }
                const state = await queryPermission();
                if (state === 'denied') {
                    ss.set(GEO_DENIED_KEY, '1');
                    toastOnce('planner.geo_denied');
                    return;
                }
                if (state === 'granted') { requestLocation(); return; }
                // 'prompt' or unknown: stay quiet if the user already declined this session.
                if (ss.get(GEO_DENIED_KEY)) return;
                showHint();
                requestLocation();
            })();
        })();

        // ── DRAWER ACTIVE NAV SYNC ───────────────────────────────────────────────
        // Reduces any page URL - clean ("/about"), legacy ("/pages/about.html") or bare
        // ("about.html") - to one comparable key, so the active nav state keeps working
        // now that pages are served on extension-less URLs. "/" and "/index" mean home.
        const navKey = (value) => {
            const path = String(value || '').split('?')[0].split('#')[0];
            const last = path.split('/').filter(Boolean).pop() || '';
            const key = last.replace(/\.html$/i, '').toLowerCase();
            return (!key || key === 'index') ? 'home' : key;
        };

        const updateActiveDrawerNav = () => {
            const currentKey = navKey(window.location.pathname);

            const drawerItems = document.querySelectorAll('.drawer-nav-item, .drawer-links a');
            drawerItems.forEach(item => {
                const rawHref = item.getAttribute('href') || '';
                if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) {
                    item.classList.remove('active');
                    return;
                }
                const isMatch = navKey(rawHref) === currentKey;
                if (isMatch) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        };

        const syncDrawerLangState = () => {
            const currentLang = (localStorage.getItem('calzada_lang') || 'en').toLowerCase();
            document.querySelectorAll('.lang-dropdown-item').forEach(item => {
                const itemLang = (item.getAttribute('data-lang') || '').toLowerCase();
                const isActive = itemLang === currentLang;
                if (isActive) {
                    item.classList.add('active');
                    item.setAttribute('aria-checked', 'true');
                } else {
                    item.classList.remove('active');
                    item.setAttribute('aria-checked', 'false');
                }
            });
            document.querySelectorAll('.mobile-lang-toggle').forEach(btn => {
                const active = btn.querySelector('.lang-active');
                if (active) active.textContent = currentLang === 'en' ? 'EN' : 'TL';
                btn.setAttribute('aria-label', currentLang === 'en' ? 'Language: English' : 'Wika: Tagalog');
            });
        };

        const toggleDrawer = (state) => {
            const sd = document.getElementById('sideDrawer');
            const so = document.getElementById('sideDrawerOverlay');
            if (!sd || !so) return;

            // Reset any leftover inline transition/transform/opacity from swipe gesture
            sd.style.transition = '';
            so.style.transition = '';
            sd.style.transform = '';
            so.style.opacity = '';

            // Force reflow to guarantee CSS transition animation reliably executes
            void sd.offsetWidth;

            sd.classList.toggle('open', state);
            so.classList.toggle('visible', state);

            if (state) {
                updateActiveDrawerNav();
                syncDrawerLangState();
            }

            const menuIcon = document.querySelector('#hamburgerBtn .menu-toggle-icon, #mobileMenuBtn .menu-toggle-icon');
            if (menuIcon) {
                menuIcon.classList.toggle('open', state);
            }
        };

        document.getElementById('hamburgerBtn').addEventListener('click', () => toggleDrawer(true));
        document.getElementById('drawerCloseBtn').addEventListener('click', () => toggleDrawer(false));
        document.getElementById('sideDrawerOverlay').addEventListener('click', () => toggleDrawer(false));

        // Close drawer on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const sd = document.getElementById('sideDrawer');
                if (sd && sd.classList.contains('open')) {
                    toggleDrawer(false);
                }
            }
        });

        // Initialize active drawer nav state and language checkmark state
        updateActiveDrawerNav();
        syncDrawerLangState();

        window.addEventListener('calzada_lang_changed', () => {
            syncDrawerLangState();
            if (isLocatingOrigin) {
                const origEl = document.getElementById('openOriginModal');
                if (origEl) {
                    const isFil = (localStorage.getItem('calzada_lang') || 'en').toLowerCase() === 'tl';
                    origEl.textContent = isFil ? 'Hinahanap ang lokasyon mo...' : 'Finding your location...';
                }
            }
            if (isTrackingArrival || document.body.classList.contains('navigation-active')) {
                updateGuideStepsUI();
                syncNavDisplays();
            } else if (selectedCoords.origin && selectedCoords.destination) {
                renderItinerary();
                updateSummaryRow();
            }
        });

        // ── SIDE DRAWER SWIPE-TO-CLOSE ────────────────────────────────────────────
        const sideDrawer = document.getElementById('sideDrawer');
        const sideDrawerOverlay = document.getElementById('sideDrawerOverlay');

        let drawerTouchStartX = 0;
        let drawerTouchLastX = 0;
        let drawerVelocityX = 0;
        let drawerLastTime = 0;
        let drawerDragging = false;

        sideDrawer.addEventListener('touchstart', (e) => {
            drawerTouchStartX = e.touches[0].clientX;
            drawerTouchLastX = drawerTouchStartX;
            drawerLastTime = Date.now();
            drawerVelocityX = 0;
            drawerDragging = true;
            sideDrawer.style.transition = 'none';
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!drawerDragging || !sideDrawer.classList.contains('open')) return;
            const x = e.touches[0].clientX;
            const now = Date.now();
            drawerVelocityX = (x - drawerTouchLastX) / Math.max(1, now - drawerLastTime);
            drawerTouchLastX = x;
            drawerLastTime = now;

            const delta = Math.max(0, x - drawerTouchStartX); // only rightward movement
            sideDrawer.style.transform = `translateX(${delta}px)`;

            // Dim overlay proportionally
            const drawerWidth = sideDrawer.offsetWidth;
            const progress = delta / drawerWidth;
            sideDrawerOverlay.style.opacity = (1 - progress).toString();
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!drawerDragging) return;
            drawerDragging = false;

            const swipedFarRight = drawerTouchLastX - drawerTouchStartX > sideDrawer.offsetWidth * 0.4;
            const flingRight = drawerVelocityX > 0.5;

            sideDrawer.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
            sideDrawerOverlay.style.transition = 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)';

            if (swipedFarRight || flingRight) {
                // Close
                sideDrawer.classList.remove('open');
                sideDrawerOverlay.classList.remove('visible');
                sideDrawer.style.transform = '';
                sideDrawerOverlay.style.opacity = '';
                setTimeout(() => {
                    sideDrawer.style.transition = '';
                    sideDrawerOverlay.style.transition = '';
                }, 450);
            } else {
                // Snap back open
                sideDrawer.style.transform = 'translateX(0)';
                sideDrawerOverlay.style.opacity = '1';
                setTimeout(() => {
                    sideDrawer.style.transition = '';
                    sideDrawerOverlay.style.transition = '';
                    sideDrawer.style.transform = '';
                    sideDrawerOverlay.style.opacity = '';
                }, 450);
            }
        });

        const remindersModal = document.getElementById('remindersModal');
        const remindersOverlay = document.getElementById('remindersOverlay');
        const remindersPillBtn = document.getElementById('remindersPillBtn');
        const remindersCloseBtn = document.getElementById('remindersCloseBtn');
        const remindersConfirmBtn = document.getElementById('remindersConfirmBtn');

        const openReminders = () => {
            if (!remindersModal) return;
            remindersModal.classList.add('visible');
            if (remindersOverlay) remindersOverlay.classList.add('visible');
            document.body.style.overflow = 'hidden';
            if (remindersCloseBtn) {
                setTimeout(() => remindersCloseBtn.focus(), 50);
            }
        };

        const closeReminders = () => {
            if (!remindersModal || !remindersModal.classList.contains('visible')) return;
            remindersModal.classList.remove('visible');
            if (remindersOverlay) remindersOverlay.classList.remove('visible');
            document.body.style.overflow = '';
            if (remindersPillBtn) {
                remindersPillBtn.focus();
            }
        };

        if (remindersPillBtn) remindersPillBtn.addEventListener('click', openReminders);
        if (remindersCloseBtn) remindersCloseBtn.addEventListener('click', closeReminders);
        if (remindersConfirmBtn) remindersConfirmBtn.addEventListener('click', closeReminders);
        if (remindersOverlay) remindersOverlay.addEventListener('click', closeReminders);

        document.addEventListener('keydown', (e) => {
            if (!remindersModal || !remindersModal.classList.contains('visible')) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                closeReminders();
                return;
            }

            if (e.key === 'Tab') {
                const focusables = [remindersCloseBtn, remindersConfirmBtn].filter(Boolean);
                if (focusables.length === 0) return;

                const firstEl = focusables[0];
                const lastEl = focusables[focusables.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === firstEl) {
                        e.preventDefault();
                        lastEl.focus();
                    }
                } else {
                    if (document.activeElement === lastEl) {
                        e.preventDefault();
                        firstEl.focus();
                    }
                }
            }
        });

        // =============================================
        // DATETIME PICKER (LEAVE / ARRIVE) & SCHEDULE TRIGGER
        // =============================================
        const dtOverlay = document.getElementById('dtPickerOverlay');
        const dtModal = document.getElementById('dtPickerModal');
        const dtHrSlider = document.getElementById('dtHrSlider');
        const dtMinSlider = document.getElementById('dtMinSlider');
        const dtTimeDisplay = document.getElementById('dtTimeDisplay');
        const dtAmBtn = document.getElementById('dtAmBtn');
        const dtPmBtn = document.getElementById('dtPmBtn');
        const dtLeaveBtn = document.getElementById('dtLeaveBtn');
        const dtArriveBtn = document.getElementById('dtArriveBtn');
        const dtNowBtn = document.getElementById('dtNowBtn');
        const dtBackBtn = document.getElementById('dtBackBtn');
        const dtConfirmBtn = document.getElementById('dtConfirmBtn');
        const dtCalDays = document.getElementById('dtCalDays');
        const dtCalMonthYear = document.getElementById('dtCalMonthYear');
        const dtPrevMonth = document.getElementById('dtPrevMonth');
        const dtNextMonth = document.getElementById('dtNextMonth');

        let dtPickerMode = 'depart'; // 'depart' | 'arrive'
        let dtAmPm = 'pm';
        let dtCalDate = new Date();
        let dtSelectedDate = new Date();

        const pad2 = n => String(n).padStart(2, '0');

        function convert12To24Hour(hour12, period) {
            const p = String(period || 'am').trim().toLowerCase();
            let h = parseInt(hour12, 10);
            if (isNaN(h)) h = 12;
            h = h % 12; // 12 -> 0, 1..11 -> 1..11
            if (p === 'pm') {
                h += 12;
            }
            return h;
        }
        window._calzadaConvert12To24Hour = convert12To24Hour;

        const updateDtTimeDisplay = () => {
            if (!dtHrSlider || !dtMinSlider || !dtTimeDisplay) return;
            const h = parseInt(dtHrSlider.value, 10) || 12;
            const m = parseInt(dtMinSlider.value, 10) || 0;
            const period = String(dtAmPm || 'am').toUpperCase();
            dtTimeDisplay.textContent = `${pad2(h)}:${pad2(m)} ${period}`;
        };

        const setDtAmPm = (val) => {
            dtAmPm = String(val || 'am').trim().toLowerCase();
            if (dtAmBtn) dtAmBtn.classList.toggle('active', dtAmPm === 'am');
            if (dtPmBtn) dtPmBtn.classList.toggle('active', dtAmPm === 'pm');
            updateDtTimeDisplay();
        };

        const renderDtCalendar = () => {
            if (!dtCalDays || !dtCalMonthYear) return;
            const year = dtCalDate.getFullYear();
            const month = dtCalDate.getMonth();
            const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
            dtCalMonthYear.textContent = `${MONTHS[month]} ${year}`;

            dtCalDays.innerHTML = '';
            const today = new Date();
            const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const maxDateFloor = new Date(todayFloor.getTime() + 30 * 24 * 60 * 60 * 1000);

            // Restrict navigation: allow only current and next month (covering the 30-day limit)
            const currentMY = today.getFullYear() * 12 + today.getMonth();
            const calMY = dtCalDate.getFullYear() * 12 + dtCalDate.getMonth();
            const nextMY = currentMY + 1;

            if (dtPrevMonth) {
                const disablePrev = calMY <= currentMY;
                dtPrevMonth.disabled = disablePrev;
                dtPrevMonth.style.opacity = disablePrev ? '0.35' : '1';
                dtPrevMonth.style.cursor = disablePrev ? 'not-allowed' : 'pointer';
            }
            if (dtNextMonth) {
                const disableNext = calMY >= nextMY;
                dtNextMonth.disabled = disableNext;
                dtNextMonth.style.opacity = disableNext ? '0.35' : '1';
                dtNextMonth.style.cursor = disableNext ? 'not-allowed' : 'pointer';
            }

            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            for (let i = 0; i < firstDay; i++) {
                const empty = document.createElement('button');
                empty.type = 'button';
                empty.className = 'dt-cal-day empty';
                empty.disabled = true;
                dtCalDays.appendChild(empty);
            }

            for (let d = 1; d <= daysInMonth; d++) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'dt-cal-day';
                btn.textContent = d;

                const thisDate = new Date(year, month, d);
                const isToday = todayFloor.getTime() === thisDate.getTime();
                const isSelected = new Date(dtSelectedDate.getFullYear(), dtSelectedDate.getMonth(), dtSelectedDate.getDate()).getTime() === thisDate.getTime();
                const isPast = thisDate < todayFloor;
                const isBeyond30 = thisDate > maxDateFloor;

                if (isToday) btn.classList.add('today');
                if (isSelected) btn.classList.add('selected');
                if (isPast || isBeyond30) {
                    btn.classList.add('past');
                    btn.disabled = true;
                }

                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    dtSelectedDate = new Date(year, month, d);
                    renderDtCalendar();
                });

                dtCalDays.appendChild(btn);
            }
        };

        const setDtNow = () => {
            const now = new Date();
            let h24 = now.getHours();
            const m = now.getMinutes();
            const period = h24 >= 12 ? 'pm' : 'am';
            const h12 = h24 % 12 || 12;
            if (dtHrSlider) dtHrSlider.value = h12;
            if (dtMinSlider) dtMinSlider.value = m;
            setDtAmPm(period);
            dtSelectedDate = new Date();
            dtCalDate = new Date();
            renderDtCalendar();
            updateDtTimeDisplay();
        };

        const openDtPicker = (mode = 'depart') => {
            dtPickerMode = mode;
            if (dtLeaveBtn) dtLeaveBtn.classList.toggle('active', mode === 'depart');
            if (dtArriveBtn) dtArriveBtn.classList.toggle('active', mode === 'arrive');
            setDtNow();
            if (dtOverlay) dtOverlay.classList.add('visible');
            if (dtModal) dtModal.classList.add('visible');
        };

        const closeDtPicker = () => {
            if (dtModal) dtModal.classList.remove('visible');
            if (dtOverlay) dtOverlay.classList.remove('visible');
        };

        if (dtHrSlider) dtHrSlider.addEventListener('input', updateDtTimeDisplay);
        if (dtMinSlider) dtMinSlider.addEventListener('input', updateDtTimeDisplay);
        if (dtAmBtn) dtAmBtn.addEventListener('click', (e) => { e.preventDefault(); setDtAmPm('am'); });
        if (dtPmBtn) dtPmBtn.addEventListener('click', (e) => { e.preventDefault(); setDtAmPm('pm'); });
        if (dtNowBtn) dtNowBtn.addEventListener('click', (e) => { e.preventDefault(); setDtNow(); });
        if (dtBackBtn) dtBackBtn.addEventListener('click', (e) => { e.preventDefault(); closeDtPicker(); });
        if (dtOverlay) dtOverlay.addEventListener('click', closeDtPicker);
        if (dtPrevMonth) {
            dtPrevMonth.addEventListener('click', (e) => {
                e.preventDefault();
                const now = new Date();
                const currentMY = now.getFullYear() * 12 + now.getMonth();
                const calMY = dtCalDate.getFullYear() * 12 + dtCalDate.getMonth();
                if (calMY > currentMY) {
                    dtCalDate.setMonth(dtCalDate.getMonth() - 1);
                    renderDtCalendar();
                }
            });
        }
        if (dtNextMonth) {
            dtNextMonth.addEventListener('click', (e) => {
                e.preventDefault();
                const now = new Date();
                const currentMY = now.getFullYear() * 12 + now.getMonth();
                const calMY = dtCalDate.getFullYear() * 12 + dtCalDate.getMonth();
                if (calMY < currentMY + 1) {
                    dtCalDate.setMonth(dtCalDate.getMonth() + 1);
                    renderDtCalendar();
                }
            });
        }

        if (dtLeaveBtn) {
            dtLeaveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                dtPickerMode = 'depart';
                dtLeaveBtn.classList.add('active');
                if (dtArriveBtn) dtArriveBtn.classList.remove('active');
            });
        }
        if (dtArriveBtn) {
            dtArriveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                dtPickerMode = 'arrive';
                dtArriveBtn.classList.add('active');
                if (dtLeaveBtn) dtLeaveBtn.classList.remove('active');
            });
        }

        const formatManilaDisplayTime = (d) => {
            if (!d) return '--:--';
            const date = d instanceof Date ? d : new Date(d);
            return new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Manila',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).format(date);
        };

        if (dtConfirmBtn) {
            dtConfirmBtn.addEventListener('click', (e) => {
                e.preventDefault();

                const activePeriod = (dtPmBtn && dtPmBtn.classList.contains('active'))
                    ? 'pm'
                    : ((dtAmBtn && dtAmBtn.classList.contains('active')) ? 'am' : String(dtAmPm || 'am').toLowerCase());

                const h12 = parseInt(dtHrSlider ? dtHrSlider.value : 12, 10) || 12;
                const m = parseInt(dtMinSlider ? dtMinSlider.value : 0, 10) || 0;
                const h24 = convert12To24Hour(h12, activePeriod);

                // Date bounds: clamp dtSelectedDate between today and 30 days
                const now = new Date();
                const todayFloor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const maxDateFloor = new Date(todayFloor.getTime() + 30 * 24 * 60 * 60 * 1000);

                let selDate = new Date(dtSelectedDate.getFullYear(), dtSelectedDate.getMonth(), dtSelectedDate.getDate());
                if (selDate < todayFloor) selDate = todayFloor;
                if (selDate > maxDateFloor) selDate = maxDateFloor;

                const targetTime = new Date(
                    selDate.getFullYear(),
                    selDate.getMonth(),
                    selDate.getDate(),
                    h24,
                    m,
                    0,
                    0
                );

                // Depart at T in the past: treat as Leave now and tell the user
                if (dtPickerMode === 'depart' && targetTime.getTime() <= Date.now()) {
                    window._calzadaPlannedSchedule = null;
                    const schedTextEl = document.getElementById('scheduleSelectedText');
                    if (schedTextEl) {
                        schedTextEl.textContent = window.t ? window.t('planner.leave_now') : 'Leave now';
                    }
                    const schedOpts = document.getElementById('scheduleOptions');
                    if (schedOpts) {
                        schedOpts.querySelectorAll('li').forEach(l => l.classList.toggle('active', l.dataset.value === 'now'));
                    }
                    closeDtPicker();
                    if (selectedCoords && selectedCoords.destination) {
                        updateSummaryRow();
                    }
                    if (typeof window.showToast === 'function') {
                        const msg = (window.t ? window.t('reminders.depart_passed') : null)
                            || 'That departure time has already passed. Showing route for leaving now.';
                        window.showToast(msg, 'warning');
                    }
                    return;
                }

                window._calzadaPlannedSchedule = {
                    mode: dtPickerMode,
                    targetTime: targetTime
                };

                const prefix = dtPickerMode === 'depart'
                    ? (window.t ? window.t('planner.depart_at_pre') : 'Depart at')
                    : (window.t ? window.t('planner.arrive_by_pre') : 'Arrive by');
                const timeText = formatManilaDisplayTime(targetTime);
                const schedTextEl = document.getElementById('scheduleSelectedText');
                if (schedTextEl) {
                    schedTextEl.textContent = `${prefix} ${timeText}`;
                }

                closeDtPicker();

                // If a route is already calculated, refresh summary
                if (selectedCoords && selectedCoords.destination) {
                    updateSummaryRow();
                }
            });
        }

        // Schedule Dropdown Trigger
        const schedSelect = document.getElementById('scheduleSelected');
        const schedOpts = document.getElementById('scheduleOptions');
        if (schedSelect) schedSelect.addEventListener('click', () => schedOpts.classList.toggle('open'));
        if (schedOpts) {
            schedOpts.addEventListener('click', (e) => {
                const li = e.target.closest('li');
                if (li) {
                    const val = li.dataset.value;
                    schedOpts.classList.remove('open');
                    schedOpts.querySelectorAll('li').forEach(l => l.classList.remove('active'));
                    li.classList.add('active');

                    if (val === 'now') {
                        window._calzadaPlannedSchedule = null;
                        const schedText = document.getElementById('scheduleSelectedText');
                        if (schedText) schedText.textContent = li.textContent;
                        if (selectedCoords && selectedCoords.destination) {
                            updateSummaryRow();
                        }
                        return;
                    }

                    if (val === 'depart') {
                        openDtPicker('depart');
                        return;
                    }

                    if (val === 'arrive') {
                        openDtPicker('arrive');
                        return;
                    }
                }
            });
        }
        window._calzadaOpenDtPicker = openDtPicker;

        // =============================================
        // SMART TRAVEL REMINDERS UI
        // =============================================
        const remindMeBtn = document.getElementById('remindMeBtn');
        const setReminderOverlay = document.getElementById('setReminderOverlay');
        const setReminderModal = document.getElementById('setReminderModal');
        const closeSetReminderBtn = document.getElementById('closeSetReminderBtn');
        const saveReminderBtn = document.getElementById('saveReminderBtn');
        const reminderWhenOptions = document.getElementById('reminderWhenOptions');
        const reminderSignInOverlay = document.getElementById('reminderSignInOverlay');
        const reminderSignInModal = document.getElementById('reminderSignInModal');
        const closeReminderSignInBtn = document.getElementById('closeReminderSignInBtn');

        const closeSetReminder = () => {
            if (setReminderModal) setReminderModal.classList.remove('visible');
            if (setReminderOverlay) setReminderOverlay.classList.remove('visible');
        };

        const closeReminderSignIn = () => {
            if (reminderSignInModal) {
                reminderSignInModal.classList.remove('visible');
                reminderSignInModal.style.display = 'none';
            }
            if (reminderSignInOverlay) reminderSignInOverlay.classList.remove('visible');
        };

        if (closeSetReminderBtn) closeSetReminderBtn.addEventListener('click', closeSetReminder);
        if (setReminderOverlay) setReminderOverlay.addEventListener('click', closeSetReminder);
        if (closeReminderSignInBtn) closeReminderSignInBtn.addEventListener('click', closeReminderSignIn);
        if (reminderSignInOverlay) reminderSignInOverlay.addEventListener('click', closeReminderSignIn);

        if (reminderWhenOptions) {
            reminderWhenOptions.addEventListener('click', (e) => {
                const btn = e.target.closest('.reminder-opt-btn');
                if (btn && !btn.disabled) {
                    reminderWhenOptions.querySelectorAll('.reminder-opt-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        }

        const openSetReminderModal = () => {
            const user = window.CalzadaAuth?.getCurrentUser();
            if (!user || user.isAnonymous) {
                if (reminderSignInOverlay) reminderSignInOverlay.classList.add('visible');
                if (reminderSignInModal) {
                    reminderSignInModal.style.display = 'block';
                    reminderSignInModal.classList.add('visible');
                }
                return;
            }

            const leaveCalc = window._calzadaLeaveCalculation;
            if (!leaveCalc || !leaveCalc.leaveAt) {
                showToast((window.t ? window.t('reminders.error_past') : null) || 'Please select a future schedule.', 'warning');
                return;
            }

            const destEl = document.getElementById('setReminderDest');
            const leaveTextEl = document.getElementById('setReminderLeaveText');
            const emailEl = document.getElementById('setReminderEmail');
            const noticeEl = document.getElementById('setReminderNotice');
            const noticeTextEl = document.getElementById('setReminderNoticeText');
            const badgeEl = document.querySelector('.reminder-channel-badge');

            if (destEl) destEl.textContent = leaveCalc.destName || 'Destination';
            if (leaveTextEl) leaveTextEl.textContent = document.getElementById('leaveTimeHintText')?.textContent || '';
            if (emailEl) emailEl.textContent = user.email || 'your account email';

            // Check email verification status: Google sign-ins count as verified
            const isGoogleUser = Array.isArray(user.providerData) && user.providerData.some(p => p.providerId === 'google.com');
            const isEmailVerified = !!user.emailVerified || isGoogleUser;

            const now = Date.now();
            const leaveMs = leaveCalc.leaveAt.getTime();
            const optBtns = reminderWhenOptions ? Array.from(reminderWhenOptions.querySelectorAll('.reminder-opt-btn')) : [];

            // Find currently active offset
            const currentlyActiveBtn = reminderWhenOptions?.querySelector('.reminder-opt-btn.active');
            const activeOffset = currentlyActiveBtn ? (parseInt(currentlyActiveBtn.dataset.offset, 10) || 0) : 10;

            const validBtns = [];
            optBtns.forEach(btn => {
                const offset = parseInt(btn.dataset.offset, 10) || 0;
                const remindMs = leaveMs - offset * 60 * 1000;
                if (remindMs <= now) {
                    btn.disabled = true;
                    btn.classList.remove('active');
                } else {
                    btn.disabled = false;
                    validBtns.push(btn);
                }
            });

            // Preselect nearest valid option:
            // If the active option is still valid, keep it.
            // Otherwise choose the valid option with the nearest offset.
            let targetBtn = validBtns.find(b => (parseInt(b.dataset.offset, 10) || 0) === activeOffset);
            if (!targetBtn && validBtns.length > 0) {
                targetBtn = validBtns.reduce((closest, curr) => {
                    const currOffset = parseInt(curr.dataset.offset, 10) || 0;
                    const closestOffset = parseInt(closest.dataset.offset, 10) || 0;
                    return Math.abs(currOffset - activeOffset) < Math.abs(closestOffset - activeOffset) ? curr : closest;
                }, validBtns[0]);
            }

            if (targetBtn) {
                optBtns.forEach(b => b.classList.remove('active'));
                targetBtn.classList.add('active');
            }

            let canSave = true;
            let noticeMsg = '';

            if (!isEmailVerified) {
                canSave = false;
                noticeMsg = (window.t ? window.t('reminders.verify_email') : null) || 'Verify your email to get reminders';
                if (badgeEl) {
                    const isTl = (window.currentLang === 'tl' || localStorage.getItem('calzada_lang') === 'tl');
                    badgeEl.textContent = isTl ? 'Hindi na-verify' : 'Unverified';
                    badgeEl.classList.add('unverified');
                }
            } else if (validBtns.length === 0) {
                canSave = false;
                noticeMsg = (window.t ? window.t('reminders.almost_time') : null) || "It's almost time to leave";
                if (badgeEl) {
                    badgeEl.textContent = 'Active';
                    badgeEl.classList.remove('unverified');
                }
            } else {
                if (badgeEl) {
                    badgeEl.textContent = 'Active';
                    badgeEl.classList.remove('unverified');
                }
            }

            if (noticeEl && noticeTextEl) {
                if (noticeMsg) {
                    noticeTextEl.textContent = noticeMsg;
                    noticeEl.style.display = 'flex';
                } else {
                    noticeTextEl.textContent = '';
                    noticeEl.style.display = 'none';
                }
            }

            if (saveReminderBtn) {
                saveReminderBtn.disabled = !canSave;
            }

            if (setReminderOverlay) setReminderOverlay.classList.add('visible');
            if (setReminderModal) setReminderModal.classList.add('visible');
        };

        window._calzadaOpenSetReminderModal = openSetReminderModal;

        window.addEventListener('calzada_lang_changed', () => {
            if (setReminderModal && setReminderModal.classList.contains('visible')) {
                const user = window.CalzadaAuth?.getCurrentUser();
                if (!user) return;
                const isGoogleUser = Array.isArray(user.providerData) && user.providerData.some(p => p.providerId === 'google.com');
                const isEmailVerified = !!user.emailVerified || isGoogleUser;
                const isTl = (window.currentLang === 'tl' || localStorage.getItem('calzada_lang') === 'tl');
                const badgeEl = document.querySelector('.reminder-channel-badge');
                const noticeTextEl = document.getElementById('setReminderNoticeText');
                const optBtns = reminderWhenOptions ? Array.from(reminderWhenOptions.querySelectorAll('.reminder-opt-btn')) : [];
                const validBtns = optBtns.filter(b => !b.disabled);

                if (!isEmailVerified) {
                    if (noticeTextEl) noticeTextEl.textContent = (window.t ? window.t('reminders.verify_email') : null) || 'Verify your email to get reminders';
                    if (badgeEl) {
                        badgeEl.textContent = isTl ? 'Hindi na-verify' : 'Unverified';
                    }
                } else if (validBtns.length === 0) {
                    if (noticeTextEl) noticeTextEl.textContent = (window.t ? window.t('reminders.almost_time') : null) || "It's almost time to leave";
                }
            }
        });

        if (remindMeBtn) {
            remindMeBtn.addEventListener('click', openSetReminderModal);
        }

        if (saveReminderBtn) {
            saveReminderBtn.addEventListener('click', async () => {
                const user = window.CalzadaAuth?.getCurrentUser();
                if (!user || user.isAnonymous) {
                    closeSetReminder();
                    return;
                }

                const isGoogleUser = Array.isArray(user.providerData) && user.providerData.some(p => p.providerId === 'google.com');
                const isEmailVerified = !!user.emailVerified || isGoogleUser;
                if (!isEmailVerified) {
                    showToast((window.t ? window.t('reminders.verify_email') : null) || 'Verify your email to get reminders', 'warning');
                    return;
                }

                const leaveCalc = window._calzadaLeaveCalculation;
                if (!leaveCalc || !leaveCalc.leaveAt) {
                    closeSetReminder();
                    return;
                }

                const activeOpt = reminderWhenOptions?.querySelector('.reminder-opt-btn.active');
                if (!activeOpt || activeOpt.disabled) {
                    showToast((window.t ? window.t('reminders.almost_time') : null) || "It's almost time to leave", 'warning');
                    return;
                }
                const offset = parseInt(activeOpt.dataset.offset, 10) || 0;
                const remindAt = new Date(leaveCalc.leaveAt.getTime() - offset * 60 * 1000);

                if (remindAt.getTime() <= Date.now()) {
                    showToast((window.t ? window.t('reminders.almost_time') : null) || "It's almost time to leave", 'warning');
                    return;
                }

                const spinner = document.getElementById('reminderSpinner');
                saveReminderBtn.disabled = true;
                if (spinner) spinner.style.display = 'inline-block';

                try {
                    if (!window.CalzadaReminders || !window.CalzadaReminders.createReminder) {
                        throw new Error('MODULE_UNAVAILABLE');
                    }

                    const lang = (localStorage.getItem('calzada_lang') === 'tl') ? 'tl' : 'en';

                    const isWalk = leaveCalc.mode === 'walk';
                    let fareReg = isWalk ? 0 : Number(leaveCalc.fareRegular ?? leaveCalc.fare ?? 0);
                    let fareDisc = isWalk ? 0 : Number(leaveCalc.fareDiscounted ?? 0);
                    if (!isWalk && fareReg > 0 && fareDisc <= 0) {
                        fareDisc = Math.round(fareReg * 0.8 * 4) / 4;
                    }

                    await window.CalzadaReminders.createReminder({
                        destName: leaveCalc.destName,
                        destLat: leaveCalc.destCoords ? leaveCalc.destCoords[0] : 0,
                        destLng: leaveCalc.destCoords ? leaveCalc.destCoords[1] : 0,
                        originLabel: leaveCalc.originLabel || 'My Location',
                        mode: leaveCalc.mode || 'jeepney',
                        leaveAt: leaveCalc.leaveAt,
                        arriveBy: leaveCalc.arriveAt,
                        remindAt: remindAt,
                        fareRegular: fareReg,
                        fareDiscounted: fareDisc,
                        lang: lang
                    });

                    closeSetReminder();
                    const timeStr = formatManilaDisplayTime(remindAt);
                    showToast(t('reminders.toast_saved', { time: timeStr }) || `Reminder set! We'll email you at ${timeStr}.`, 'success');
                } catch (err) {
                    console.error('Failed to create reminder:', err);
                    if (err.message === 'LIMIT_REACHED') {
                        showToast(t('reminders.error_limit') || 'Maximum of 10 scheduled reminders reached.', 'warning');
                    } else if (err.message === 'TIME_IN_PAST') {
                        showToast(t('reminders.error_past') || 'Reminder time must be in the future.', 'warning');
                    } else {
                        showToast(t('reminders.error_save') || "Couldn't save reminder. Try again.", 'error');
                    }
                } finally {
                    saveReminderBtn.disabled = false;
                    if (spinner) spinner.style.display = 'none';
                }
            });
        }

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
        // ACTIVE JOURNEY FROM BEFORE A RELOAD
        // =============================================
        // A journey that is still running (saved in this tab, started under 3 hours ago) comes back
        // exactly as it was and wins over URL parameters and the defaults. Ended and cancelled
        // journeys are already removed; older or unreadable ones are removed here.
        const JOURNEY_RESTORE_MAX_AGE_MS = 3 * 60 * 60 * 1000;
        const savedActiveJourney = (() => {
            let state = null;
            try { state = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { state = null; }
            if (!state || !state.isJourneyActive) return null;
            const isPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
            const startedAt = Number.isFinite(state.startedAt) ? state.startedAt : state.savedAt;
            const ageMs = Date.now() - startedAt;
            if (!(ageMs >= 0 && ageMs < JOURNEY_RESTORE_MAX_AGE_MS) || !isPoint(state.origin) || !isPoint(state.destination)) {
                try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
                return null;
            }
            return state;
        })();

        // =============================================
        // URL PARAMETERS LOGIC
        // =============================================
        // URL PARAMETERS — runs regardless of earlier errors. Skipped while an active journey is
        // restored: the URL still holds the link the planner was opened with.
        try {
            const urlParams = new URLSearchParams(savedActiveJourney ? '' : window.location.search);
            // URLSearchParams.get automatically decodes, so no decodeURIComponent needed
            const destName = urlParams.get('destName') || urlParams.get('dest') || '';
            const destLat = parseFloat(urlParams.get('destLat') || urlParams.get('dlat') || '');
            const destLng = parseFloat(urlParams.get('destLng') || urlParams.get('dlng') || '');

            // Origin parameters (e.g. from index.html "Near Me" or direct origin links)
            const origName = urlParams.get('originName') || urlParams.get('origName') || urlParams.get('origin') || '';
            const origLat = parseFloat(urlParams.get('originLat') || urlParams.get('origLat') || urlParams.get('olat') || '');
            const origLng = parseFloat(urlParams.get('originLng') || urlParams.get('origLng') || urlParams.get('olng') || '');

            const hasValidDestCoords = !isNaN(destLat) && !isNaN(destLng) && destLat !== 0 && destLng !== 0;
            const hasValidOrigCoords = !isNaN(origLat) && !isNaN(origLng) && origLat !== 0 && origLng !== 0;

            if (origName || hasValidOrigCoords) {
                originPlaceName = origName || 'Selected Origin';
                if (hasValidOrigCoords) {
                    selectedCoords.origin = [origLat, origLng];
                    if (originMarker) { originMarker.remove(); originMarker = null; }
                    const oEl = document.createElement('div');
                    oEl.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M14 0C6.268 0 0 6.268 0 14c0 8.75 14 22 14 22S28 22.75 28 14C28 6.268 21.732 0 14 0z" fill="#3b82f6"/>
                        <circle cx="14" cy="14" r="6" fill="white"/>
                    </svg>`;
                    originMarker = new maplibregl.Marker({
                        element: oEl.firstElementChild || oEl,
                        anchor: 'bottom'
                    }).setLngLat([origLng, origLat]).addTo(map);
                }
            }

            if (destName || hasValidDestCoords) {
                if (hasValidDestCoords) {
                    selectedCoords.destination = [destLat, destLng];
                    destPlaceName = destName || 'Selected Destination';

                    // Match place in shared data to align name and metadata exactly as if chosen from search
                    const allKnown = (typeof window !== 'undefined' && Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length)
                        ? window.FALLBACK_PLACES
                        : ((typeof CALAMBA_PLACES_FALLBACK !== 'undefined' && Array.isArray(CALAMBA_PLACES_FALLBACK)) ? CALAMBA_PLACES_FALLBACK : []);
                    // Match by name first. Several places share one building (same coordinates),
                    // so a coordinate match only counts when no name was given and exactly one place is there.
                    const byName = destName
                        ? allKnown.find(p => p.name === destName || p.title === destName || p.slug === destName)
                        : null;
                    const atCoords = byName ? [] : allKnown.filter(p =>
                        p.lat && p.lng && Math.abs(p.lat - destLat) < 0.0001 && Math.abs(p.lng - destLng) < 0.0001);
                    const matchedPlace = byName || (!destName && atCoords.length === 1 ? atCoords[0] : null);
                    if (matchedPlace && matchedPlace.name) {
                        destPlaceName = matchedPlace.name;
                    }

                    // Update UI fields & helper text now that selectedCoords.destination is set
                    updateODDisplay();

                    if (destMarker) { destMarker.remove(); destMarker = null; }
                    createDestMarker(selectedCoords.destination);

                    map.flyTo({ center: [destLng, destLat], zoom: 16 });
                    setTimeout(() => map.resize(), 300);

                    // If origin is already present, calculate route immediately; otherwise focus and open origin picker
                    if (selectedCoords.origin && selectedCoords.destination) {
                        executeRouteQuery();
                    } else {
                        setTimeout(() => {
                            const origField = document.getElementById('openOriginModal');
                            if (origField) origField.focus();
                            openLocationModal('origin');
                        }, 400);
                    }
                } else {
                    destPlaceName = destName || 'Selected Destination';
                    updateODDisplay();

                    // Fallback: Name only, no coordinates (legacy / external links)
                    // Automatically resolve destination and then ask for origin
                    activeSelectingField = 'destination';

                    // Slug mapping for in-scope establishments. Coordinates are resolved dynamically
                    // from shared verified places data (places-shared.js) so a fix in places.json applies everywhere.
                    const PLACE_FINDER_SLUGS = {
                        "barangay uno hall, calamba city": "barangay-uno-hall",
                        "barangay uno hall": "barangay-uno-hall",
                        "card sme bank – calamba branch": "card-sme-bank",
                        "card sme bank": "card-sme-bank",
                        "citymall calamba": "citymall-calamba",
                        "colegio de san juan de letran – calamba": "letran-calamba",
                        "letran calamba": "letran-calamba",
                        "creekside halang": "creekside-halang",
                        "d & a": "d-and-q",
                        "d & q": "d-and-q",
                        "d and q": "d-and-q",
                        "d' fresco": "d-fresco",
                        "d fresco": "d-fresco",
                        "dear hotpot – unlimited japanese hotpot": "dear-hotpot",
                        "dear hotpot": "dear-hotpot",
                        "ding hao": "ding-hao",
                        "halang elementary school": "halang-elementary",
                        "jollibee – real, calamba city": "jollibee-real",
                        "jollibee real": "jollibee-real",
                        "krav cafe": "krav-cafe",
                        "mang inasal – halang, calamba": "mang-inasal-halang",
                        "mang inasal halang": "mang-inasal-halang",
                        "mariz food town": "mariz-food-town",
                        "morales bercasio": "morales-bercasio",
                        "news star": "news-star",
                        "puregold – halang, calamba": "puregold-halang",
                        "puregold halang": "puregold-halang",
                        "rj auto shop": "rj-auto-shop",
                        "rsm lutong bahay – real, calamba": "rsm-lutong-bahay",
                        "rsm lutong bahay": "rsm-lutong-bahay",
                        "saint benilde international school (calamba), inc.": "saint-benilde",
                        "saint benilde international school": "saint-benilde",
                        "sm city calamba transport terminal": "sm-transport-term",
                        "sm transport terminal": "sm-transport-term",
                        "sti college - calamba": "sti-calamba",
                        "sti college calamba": "sti-calamba",
                        "teng-teng's": "teng-tengs",
                        "teng-tengs": "teng-tengs",
                        "ton-ton's sisig": "ton-tons-sisig",
                        "ton-tons sisig": "ton-tons-sisig",
                        "uncle john's": "uncle-johns",
                        "uncle johns": "uncle-johns",
                        "wilcon depot calamba": "wilcon-depot",
                        "wilcon depot": "wilcon-depot"
                    };

                    const lowerName = destName.toLowerCase().trim();
                    const cleanNorm = lowerName.replace(/[^a-z0-9]/g, '');

                    let matchedSlug = PLACE_FINDER_SLUGS[lowerName];
                    if (!matchedSlug) {
                        const foundKey = Object.keys(PLACE_FINDER_SLUGS).find(k => k.replace(/[^a-z0-9]/g, '') === cleanNorm);
                        if (foundKey) matchedSlug = PLACE_FINDER_SLUGS[foundKey];
                    }

                    // Look up coordinates from shared verified places dataset by slug or normalized name
                    let matchedCoords = null;
                    const sharedPool = (typeof window !== 'undefined' && Array.isArray(window.FALLBACK_PLACES) && window.FALLBACK_PLACES.length > 0)
                        ? window.FALLBACK_PLACES
                        : ((typeof pickerKnownPlaces !== 'undefined' && pickerKnownPlaces.length > 0) ? pickerKnownPlaces : CALAMBA_PLACES_FALLBACK);

                    if (matchedSlug) {
                        const sp = sharedPool.find(p => (p.slug && p.slug.toLowerCase() === matchedSlug) || (p.id && String(p.id).toLowerCase() === matchedSlug));
                        if (sp && sp.lat != null && sp.lng != null) {
                            matchedCoords = [Number(sp.lat), Number(sp.lng)];
                        }
                    }

                    if (!matchedCoords) {
                        const spByName = sharedPool.find(p => {
                            if (!p.name) return false;
                            const pNorm = p.name.toLowerCase().trim();
                            return pNorm === lowerName || pNorm.replace(/[^a-z0-9]/g, '') === cleanNorm;
                        });
                        if (spByName && spByName.lat != null && spByName.lng != null) {
                            matchedCoords = [Number(spByName.lat), Number(spByName.lng)];
                        }
                    }

                    if (matchedCoords) {
                        // Exact match found in local dictionary
                        selectLocation(destName, matchedCoords);
                        if (!selectedCoords.origin) {
                            setTimeout(() => openLocationModal('origin'), 500);
                        }
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
                                if (!selectedCoords.origin) {
                                    setTimeout(() => openLocationModal('origin'), 500);
                                }
                            })
                            .catch(() => {
                                selectLocation(destName, fallbackCoords);
                                if (!selectedCoords.origin) {
                                    setTimeout(() => openLocationModal('origin'), 500);
                                }
                            });
                    }
                }
            }
        } catch (urlErr) {
            console.error('URL param error:', urlErr);
        }


        const switchActiveMode = async (newMode) => {
            if (selectedMode === newMode) return;
            userExplicitMode = true;
            selectedMode = newMode;
            setModeUI(newMode);

            // Trigger full route recalculation per mode
            await executeRouteQuery();
        };

        // =============================================
        // SESSION RECOVERY — restore the journey or last route on reload
        // =============================================
        // An active journey resumes straight into navigation with everything it had: origin
        // (label and coordinates), destination, mode, route legs, boarding point, start time,
        // journey id and current step. Location fixes after this only move the dot and the camera.
        const isSavedLeg = (leg) => !!leg && Array.isArray(leg.coordinates) && Array.isArray(leg.steps) && Number.isFinite(leg.distance);
        const resumeSavedJourney = (state) => {
            selectedCoords.origin = state.origin;
            selectedCoords.destination = state.destination;
            originPlaceName = state.originName || '';
            destPlaceName = state.destName || '';
            selectedMode = state.selectedMode === 'walking' ? 'walking' : 'jeepney';
            userExplicitMode = true; // no distance-based mode switch, also if the route is fetched again
            journeyStartedAt = Number.isFinite(state.startedAt) ? state.startedAt : null;
            journeyId = typeof state.journeyId === 'string' && /^[A-Za-z0-9]{20}$/.test(state.journeyId) ? state.journeyId : null;
            isTrackingArrival = true; // from here on the preview replan never moves the origin
            setModeUI(selectedMode);

            const resumeNavigation = () => {
                startActiveJourneyUI();
                startCompassListening();
                startLiveTracking();
                // startLiveTracking begins at the first step and leg: put back where the journey was
                const steps = window.activeRouteSteps || [];
                activeLegIndex = selectedMode === 'walking' ? 0 : Math.min(Math.max(state.activeLegIndex | 0, 0), 1);
                window.currentStepIndex = Math.min(Math.max(state.currentStepIndex | 0, 0), Math.max(steps.length - 1, 0));
                updateGuideStepsUI();
                saveJourneyState();
                map.resize();
                showToast(t('planner.toast_resuming').replace('{dest}', state.destName || t('planner.toast_destination')), 'info');
            };

            const route = state.route || {};
            const stats = state.stats || {};
            const hasSavedRoute = isSavedLeg(route.walk) && isSavedLeg(route.transit)
                && (route.walk.coordinates.length >= 2 || route.transit.coordinates.length >= 2)
                && ['walkDist', 'walkDur', 'transitDist', 'transitDur', 'fare'].every(k => Number.isFinite(stats[k]));
            if (hasSavedRoute) {
                // Redraw the saved route: no request to the routing servers
                walkRouteGeojson = route.walk;
                transitRouteGeojson = route.transit;
                window.walkRouteGeojson = walkRouteGeojson;
                window.transitRouteGeojson = transitRouteGeojson;
                currentWalkDist = stats.walkDist;
                currentWalkDur = stats.walkDur;
                currentTransitDist = stats.transitDist;
                currentTransitDur = stats.transitDur;
                currentFare = stats.fare;
                pendingTransfer = (state.transfer && state.transfer.jeep && Array.isArray(state.transfer.jeep.coords)) ? state.transfer : null;
                priorTrip = (state.prior && Array.isArray(state.prior.legs)) ? state.prior : null;
                window.finalWalkRouteGeojson = transitRouteGeojson.finalWalk || null;
                updateRouteSource('next-transit-route', pendingTransfer ? pendingTransfer.jeep.coords.map(c => [c[1], c[0]]) : []);
                ensureOriginMarker();
                ensureDestMarker();
                drawRoutes(walkRouteGeojson.coordinates, transitRouteGeojson.coordinates, transitRouteGeojson.finalWalk?.coordinates);
                drawTransitMarkers();
                updateSummaryRow();
                updatePillFareUI();
                renderItinerary();
                renderPlannerState();
                resumeNavigation();
            } else {
                // Saved before the route was kept: fetch it once, with the same origin and mode
                executeRouteQuery().then(resumeNavigation).catch((e) => {
                    console.error('Journey restore failed:', e);
                    showToast(t('planner.toast_resume_failed'), 'error');
                });
            }
        };

        (() => {
            if (savedActiveJourney) {
                resumeSavedJourney(savedActiveJourney);
                return;
            }

            // No active journey: bring back the last route preview (as before)
            const raw = sessionStorage.getItem('calzada_journey');
            if (!raw) return;
            let state;
            try { state = JSON.parse(raw); } catch (e) { return; }
            const ageMs = Date.now() - (state.savedAt || 0);
            if (state.isJourneyActive || ageMs > 7200000) { sessionStorage.removeItem('calzada_journey'); return; } // >2h old
            if (!state.origin || !state.destination) return;

            // Build recovery banner
            const banner = document.createElement('div');
            banner.id = 'recoveryBanner';
            banner.innerHTML = `
            <span class="recovery-banner-text"></span>
            <button id="recoveryDismissBtn" type="button">×</button>
        `;
            // Texts follow the site language, also when it is switched while the banner shows
            const setBannerTexts = () => {
                banner.querySelector('.recovery-banner-text').textContent = t('planner.route_restored_banner');
                const dismiss = banner.querySelector('#recoveryDismissBtn');
                dismiss.title = t('planner.route_restored_dismiss');
                dismiss.setAttribute('aria-label', t('planner.route_restored_dismiss'));
            };
            setBannerTexts();
            window.addEventListener('calzada_lang_changed', setBannerTexts);
            banner.style.cssText = [
                'position:fixed', 'bottom:90px', 'left:50%', 'transform:translateX(-50%)',
                'background:rgba(30,41,59,0.95)', 'color:#f8fafc', 'padding:10px 18px',
                'border-radius:12px', 'font-size:0.88rem', 'z-index:9999',
                'display:flex', 'align-items:center', 'gap:12px',
                'box-shadow:0 4px 20px rgba(0,0,0,0.3)', 'backdrop-filter:blur(8px)'
            ].join(';');
            banner.querySelector('#recoveryDismissBtn').style.cssText =
                'background:none;border:none;color:#94a3b8;font-size:1.1rem;cursor:pointer;padding:0 4px;line-height:1;';
            document.body.appendChild(banner);

            const dismissBanner = () => {
                window.removeEventListener('calzada_lang_changed', setBannerTexts);
                banner.remove();
            };
            banner.querySelector('#recoveryDismissBtn').addEventListener('click', () => {
                sessionStorage.removeItem('calzada_journey');
                dismissBanner();
            });

            journeyStartedAt = null;
            journeyId = null;

            // Restore OD state
            selectedCoords.origin = state.origin;
            selectedCoords.destination = state.destination;
            originPlaceName = state.originName || '';
            destPlaceName = state.destName || '';
            selectedMode = (state.selectedMode === 'walking' ? 'walking' : 'jeepney');
            // Keep the mode saved with the preview (no re-pick by distance), as the journey restore does.
            // Previews saved without a mode keep the distance-based choice.
            if (state.selectedMode === 'walking' || state.selectedMode === 'jeepney') {
                userExplicitMode = true;
                setModeUI(selectedMode);
            }
            updateODDisplay();

            // Re-fetch fresh OSRM route for the preview
            executeRouteQuery().then(() => {
                dismissBanner();
                showToast(t('planner.toast_route_restored'), 'success');
            }).catch(() => {
                sessionStorage.removeItem(STORAGE_KEY);
                dismissBanner();
            });
        })();


    }, 0);
});