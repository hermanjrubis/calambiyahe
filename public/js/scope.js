/**
 * public/js/scope.js
 *
 * Calzada Scope Runtime Module (window.CalzadaScope)
 *
 * Locks the map outside what Calzada supports via MapLibre GL layers:
 * - load(): fetches /data/coverage.json once
 * - contains(lat, lng): small ray-casting point-in-polygon (no library)
 * - bbox(): returns [minLng, minLat, maxLng, maxLat]
 * - barangays(): returns ['Uno', 'Real', 'Halang']
 * - addFog(map, { beforeLayerId }): adds fog fill, pattern, slow drift, soft edge, outline, labels
 */

(function () {
    'use strict';

    if (window.CalzadaScope) return;

    let coverageData = null;
    let loadPromise = null;

    // Default fallback bbox & barangays in case load is pending
    const FALLBACK_BBOX = [121.140019, 14.186221, 121.183502, 14.209973];
    const PRIMARY_BARANGAYS = ['Uno', 'Real', 'Halang'];

    // Room around the area the map may show: about 7.8 km north/south (0.070 lat) and 5.4 km
    // east/west (0.050 lng). The limits apply to the whole screen, including the part under the
    // bottom sheet, so on a tall phone they must be much taller than the area itself, or the map
    // cannot show all 3 barangays above the sheet (the old 1.5 km was too tight).
    const PAD_1_5KM_LAT = 0.070;
    const PAD_1_5KM_LNG = 0.050;
    // 500 m padding (~0.0045 lat, ~0.0046 lng at 14.2° N)
    const PAD_500M_LAT = 0.0045;
    const PAD_500M_LNG = 0.0046;

    // Center points of places in each primary barangay for labels
    const BARANGAY_CENTERS = [
        { name: 'Brgy. Uno', coordinates: [121.15691, 14.20415] },
        { name: 'Brgy. Real', coordinates: [121.14964, 14.19625] },
        { name: 'Brgy. Halang', coordinates: [121.16341, 14.19505] }
    ];

    /**
     * Compute signed area of a 2D ring to check and fix winding order.
     * Positive = clockwise, Negative = counter-clockwise.
     */
    function ringSignedArea(ring) {
        let area = 0;
        const n = ring.length;
        for (let i = 0; i < n - 1; i++) {
            area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
        }
        return area;
    }

    function ensureWinding(ring, wantClockwise) {
        if (!ring || ring.length < 3) return ring;
        const isCW = ringSignedArea(ring) > 0;
        if (isCW !== wantClockwise) {
            return ring.slice().reverse();
        }
        return ring;
    }

    /**
     * Ray-casting point-in-ring algorithm.
     * pt = [lng, lat], ring = [[lng, lat], ...]
     */
    function inRing(pt, ring) {
        let inside = false;
        const px = pt[0], py = pt[1];
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /**
     * Point in polygon check against coverage FeatureCollection
     */
    function checkPointInCoverage(lat, lng) {
        const ptLat = Number(lat);
        const ptLng = Number(lng);
        if (isNaN(ptLat) || isNaN(ptLng)) return false;

        const pt = [ptLng, ptLat];

        // Fast bounding box check
        const b = (coverageData && coverageData.bbox) ? coverageData.bbox : FALLBACK_BBOX;
        if (ptLng < b[0] || ptLat < b[1] || ptLng > b[2] || ptLat > b[3]) {
            return false;
        }

        if (!coverageData || !coverageData.area) {
            // Pending initial fetch: allow if inside bounding box
            return true;
        }

        const features = coverageData.area.features || [coverageData.area];
        for (const feat of features) {
            const geom = feat.geometry || feat;
            if (geom.type === 'Polygon') {
                const rings = geom.coordinates;
                if (inRing(pt, rings[0])) {
                    let inHole = false;
                    for (let h = 1; h < rings.length; h++) {
                        if (inRing(pt, rings[h])) {
                            inHole = true;
                            break;
                        }
                    }
                    if (!inHole) return true;
                }
            } else if (geom.type === 'MultiPolygon') {
                for (const poly of geom.coordinates) {
                    if (inRing(pt, poly[0])) {
                        let inHole = false;
                        for (let h = 1; h < poly.length; h++) {
                            if (inRing(pt, poly[h])) {
                                inHole = true;
                                break;
                            }
                        }
                        if (!inHole) return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Fetch coverage.json once and cache it
     */
    async function load() {
        if (coverageData) return coverageData;
        if (loadPromise) return loadPromise;

        loadPromise = fetch('/data/coverage.json')
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                coverageData = data;
                return coverageData;
            })
            .catch(err => {
                console.warn('[CalzadaScope] Could not load coverage.json:', err);
                coverageData = {
                    version: '2026-10-27',
                    barangays: PRIMARY_BARANGAYS,
                    bbox: FALLBACK_BBOX,
                    area: null
                };
                return coverageData;
            });

        return loadPromise;
    }

    // Immediately trigger load in the background
    load();

    function getBaseBounds() {
        const b = (coverageData && coverageData.bbox) ? coverageData.bbox : FALLBACK_BBOX;
        return [
            [b[0] - PAD_1_5KM_LNG, b[1] - PAD_1_5KM_LAT],
            [b[2] + PAD_1_5KM_LNG, b[3] + PAD_1_5KM_LAT]
        ];
    }

    // Points outside the area the map must still reach: the trip's start ('start') and the
    // user's live location ('user'). Kept separately so clearing a trip keeps the user reachable.
    const extraPoints = {};
    // A live location farther than this from the area is not pulled into view (zooming out
    // that far would lose the 3 barangays); the area stays framed instead.
    const USER_MAX_DIST_DEG = 0.25; // about 25 km

    function applyBounds(map) {
        if (!map) return;
        const base = getBaseBounds();
        let minLng = base[0][0], minLat = base[0][1], maxLng = base[1][0], maxLat = base[1][1];
        Object.values(extraPoints).forEach((p) => {
            minLng = Math.min(minLng, p.lng - PAD_500M_LNG);
            minLat = Math.min(minLat, p.lat - PAD_500M_LAT);
            maxLng = Math.max(maxLng, p.lng + PAD_500M_LNG);
            maxLat = Math.max(maxLat, p.lat + PAD_500M_LAT);
        });
        try {
            // A user outside the area may need a wider view than zoom 13 to see both.
            map.setMinZoom(extraPoints.user ? 11 : 12);
            map.setMaxBounds([
                [minLng, minLat],
                [maxLng, maxLat]
            ]);
        } catch (_) {}
    }

    function resetBounds(map) {
        if (!map) return;
        delete extraPoints.start;
        applyBounds(map);
    }

    function expandBoundsForStart(map, startLat, startLng) {
        if (!map || startLat == null || startLng == null) return;
        const lat = Number(startLat);
        const lng = Number(startLng);
        if (isNaN(lat) || isNaN(lng)) return;
        extraPoints.start = { lat, lng };
        applyBounds(map);
    }

    /**
     * Keep the user's live location reachable when it is outside the area (and not too far).
     * Returns true when the location is now inside the allowed bounds.
     */
    function includeUser(map, userLat, userLng) {
        if (!map) return false;
        const lat = Number(userLat);
        const lng = Number(userLng);
        const had = !!extraPoints.user;
        if (userLat == null || userLng == null || isNaN(lat) || isNaN(lng) || checkPointInCoverage(lat, lng)) {
            delete extraPoints.user;
            if (had) applyBounds(map);
            return !isNaN(lat) && !isNaN(lng) && userLat != null;
        }
        const b = (coverageData && coverageData.bbox) ? coverageData.bbox : FALLBACK_BBOX;
        const dLng = Math.max(b[0] - lng, 0, lng - b[2]);
        const dLat = Math.max(b[1] - lat, 0, lat - b[3]);
        if (Math.hypot(dLng, dLat) > USER_MAX_DIST_DEG) {
            delete extraPoints.user;
            if (had) applyBounds(map);
            return false;
        }
        const prev = extraPoints.user;
        extraPoints.user = { lat, lng };
        // Re-apply only when the user moved enough to matter (bounds carry 500 m of room).
        if (!prev || Math.abs(prev.lat - lat) > 0.001 || Math.abs(prev.lng - lng) > 0.001) applyBounds(map);
        return true;
    }

    /**
     * Add coverage fog layers to a MapLibre GL map
     */
    async function addFog(map, options = {}) {
        if (!map) return;
        const beforeLayerId = options.beforeLayerId;

        resetBounds(map);

        await load();

        const data = coverageData || {};
        resetBounds(map);

        // 2. Build Mask Polygon:
        // Outer ring: large box covering world around region
        // Winding: outer counter-clockwise, inner holes clockwise
        const outerBoxCCW = [
            [-180.0, -85.0],
            [180.0, -85.0],
            [180.0, 85.0],
            [-180.0, 85.0],
            [-180.0, -85.0]
        ];
        const fixedOuter = ensureWinding(outerBoxCCW, false); // counter-clockwise

        const holesCW = [];
        const outlineLines = [];

        if (data.area && data.area.features) {
            for (const feat of data.area.features) {
                const geom = feat.geometry || feat;
                if (geom.type === 'Polygon') {
                    if (geom.coordinates[0]) {
                        const hole = ensureWinding(geom.coordinates[0], true); // clockwise
                        holesCW.push(hole);
                        outlineLines.push(hole);
                    }
                } else if (geom.type === 'MultiPolygon') {
                    for (const poly of geom.coordinates) {
                        if (poly[0]) {
                            const hole = ensureWinding(poly[0], true); // clockwise
                            holesCW.push(hole);
                            outlineLines.push(hole);
                        }
                    }
                }
            }
        }

        const maskCoordinates = [fixedOuter, ...holesCW];
        const maskGeoJSON = {
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: maskCoordinates
            }
        };

        const outlineGeoJSON = {
            type: 'Feature',
            geometry: {
                type: 'MultiLineString',
                coordinates: outlineLines
            }
        };

        const labelsGeoJSON = {
            type: 'FeatureCollection',
            features: BARANGAY_CENTERS.map(c => ({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: c.coordinates
                },
                properties: {
                    name: c.name
                }
            }))
        };

        async function onMapStyleReady() {
            // Helper to find layer to insert before
            let targetBefore = beforeLayerId;
            if (!targetBefore || !map.getLayer(targetBefore)) {
                // Fog goes above every base-map fill, road and building (so it covers them) and
                // below the first label or the first of our own route layers. Base-map layer ids use
                // underscores ("tunnel_railway_transit", "road_minor"); ours use hyphens
                // ("transit-route-layer"), so a base-map "transit" layer is not a stopping point.
                const layers = map.getStyle()?.layers || [];
                const isOurRouteLayer = (id) => id.includes('-') && /route|transit/.test(id) && !id.startsWith('scope-');
                for (const l of layers) {
                    if (l.type === 'symbol' || isOurRouteLayer(l.id)) {
                        targetBefore = l.id;
                        break;
                    }
                }
            }

            // Sources
            if (!map.getSource('scope-fog-mask')) {
                map.addSource('scope-fog-mask', {
                    type: 'geojson',
                    data: maskGeoJSON
                });
            }

            if (!map.getSource('scope-coverage-outline')) {
                map.addSource('scope-coverage-outline', {
                    type: 'geojson',
                    data: outlineGeoJSON
                });
            }

            if (!map.getSource('scope-barangay-labels')) {
                map.addSource('scope-barangay-labels', {
                    type: 'geojson',
                    data: labelsGeoJSON
                });
            }

            // 1. scope-fog-fill: fill-color #EEF2F7, fill-opacity 0.8
            if (!map.getLayer('scope-fog-fill')) {
                map.addLayer({
                    id: 'scope-fog-fill',
                    type: 'fill',
                    source: 'scope-fog-mask',
                    paint: {
                        'fill-color': '#E2E8F0',
                        'fill-opacity': 0.82
                    }
                }, targetBefore);
            }

            // 2. Soft edge: three line layers on the coverage outline, line-color #EEF2F7
            const edgeTiers = [
                { id: 'scope-fog-edge-1', width: 6, blur: 4, opacity: 0.7 },
                { id: 'scope-fog-edge-2', width: 14, blur: 10, opacity: 0.45 },
                { id: 'scope-fog-edge-3', width: 26, blur: 20, opacity: 0.25 }
            ];

            edgeTiers.forEach(tier => {
                if (!map.getLayer(tier.id)) {
                    map.addLayer({
                        id: tier.id,
                        type: 'line',
                        source: 'scope-coverage-outline',
                        paint: {
                            'line-color': '#E2E8F0',
                            'line-width': tier.width,
                            'line-blur': tier.blur,
                            'line-opacity': tier.opacity
                        }
                    }, targetBefore);
                }
            });

            // 3. scope-outline: 1.5px #378ADD line with line-dasharray [2, 2]
            if (!map.getLayer('scope-outline')) {
                map.addLayer({
                    id: 'scope-outline',
                    type: 'line',
                    source: 'scope-coverage-outline',
                    paint: {
                        'line-color': '#378ADD',
                        'line-width': 1.5,
                        'line-dasharray': [2, 2]
                    }
                }, targetBefore);
            }

            // 4. Barangay names at center points
            if (!map.getLayer('scope-barangay-labels')) {
                map.addLayer({
                    id: 'scope-barangay-labels',
                    type: 'symbol',
                    source: 'scope-barangay-labels',
                    layout: {
                        'text-field': ['get', 'name'],
                        'text-size': 11,
                        'text-anchor': 'center',
                        'text-max-width': 8
                    },
                    paint: {
                        'text-color': '#475569',
                        'text-halo-color': '#FFFFFF',
                        'text-halo-width': 2
                    }
                });
            }

            // 5. scope-fog-clouds: fill-pattern with fog-clouds.png, fill-opacity 0.5
            function addCloudPatternLayer() {
                if (map.getLayer('scope-fog-clouds')) return;
                map.addLayer({
                    id: 'scope-fog-clouds',
                    type: 'fill',
                    source: 'scope-fog-mask',
                    paint: {
                        'fill-pattern': 'fog-clouds-pattern',
                        'fill-opacity': 0.5
                    }
                }, targetBefore);

                // Slow drift: change fill-translate by 1px every 150 ms in a loop of 256px
                let driftX = 0;
                let driftY = 0;
                let driftTimer = null;

                function tickDrift() {
                    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                    if (!prefersReduced && !document.hidden && map && map.getLayer('scope-fog-clouds')) {
                        driftX = (driftX + 1) % 256;
                        driftY = (driftY + 0.5) % 256;
                        try {
                            map.setPaintProperty('scope-fog-clouds', 'fill-translate', [driftX, driftY]);
                        } catch (_) {}
                    }
                }

                driftTimer = setInterval(tickDrift, 150);
                map.once('remove', () => clearInterval(driftTimer));
            }

            if (!map.hasImage('fog-clouds-pattern')) {
                const img = new Image();
                img.onload = () => {
                    if (!map.hasImage('fog-clouds-pattern')) {
                        try {
                            map.addImage('fog-clouds-pattern', img);
                        } catch (_) {}
                    }
                    addCloudPatternLayer();
                };
                img.onerror = (e) => {
                    console.warn('[CalzadaScope] Could not load fog-clouds.png', e);
                };
                img.src = '/assets/map/fog-clouds.png';
            } else {
                addCloudPatternLayer();
            }
        }

        // Map click in fog toast prevention
        if (!map._calzadaScopeClickBound) {
            map._calzadaScopeClickBound = true;
            map.on('click', (e) => {
                if (!e || !e.lngLat) return;
                const { lat, lng } = e.lngLat;
                if (!checkPointInCoverage(lat, lng)) {
                    const toastMsg = (typeof window.t === 'function')
                        ? window.t('scope.outside_toast')
                        : 'Calzada covers Brgy. Uno, Real and Halang for now.';
                    if (typeof window.showToast === 'function') {
                        window.showToast(toastMsg, 'warning');
                    } else {
                        console.warn('[CalzadaScope] Clicked outside coverage:', toastMsg);
                    }
                }
            });
        }

        if (map.isStyleLoaded() || map.loaded() || map.getStyle()) {
            onMapStyleReady();
        } else {
            map.once('load', onMapStyleReady);
            map.once('styledata', onMapStyleReady);
        }
        map.on('style.load', onMapStyleReady);
    }

    window.CalzadaScope = {
        load,
        contains: (lat, lng) => checkPointInCoverage(lat, lng),
        bbox: () => ((coverageData && coverageData.bbox) ? coverageData.bbox : FALLBACK_BBOX),
        barangays: () => ((coverageData && coverageData.barangays) ? coverageData.barangays : PRIMARY_BARANGAYS),
        getBaseBounds,
        resetBounds,
        expandBoundsForStart,
        includeUser,
        addFog
    };
})();
