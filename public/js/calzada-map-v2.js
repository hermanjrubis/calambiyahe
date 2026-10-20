/**
 * Calzada Map Style v2 Module
 * Enabled only behind the flag: ?mapstyle=v2 (or localStorage calzada_mapstyle = 'v2').
 * Implements:
 * - Canvas pin generation for categories with Tabler icons & badges
 * - MapLibre GeoJSON layers for building footprints & place pins
 * - Hover & selection interactions with smooth visible-area centering
 * - Cards F1 (multi-tenant), F2 (single place), F3 (mobile bottom sheet)
 * - Dynamic 3D extrusion on pitch > 0 && zoom >= 17 (always flat at pitch 0)
 * - Full EN/TL bilingual support
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CalzadaMapV2 = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // ── Flag Detection ───────────────────────────────────────────────────────
    function isV2Enabled() {
        try {
            const params = new URLSearchParams(window.location.search);
            const style = params.get('mapstyle');
            if (style === 'v2') {
                try { localStorage.setItem('calzada_mapstyle', 'v2'); } catch (_) {}
                return true;
            }
            if (style === 'v1') {
                try { localStorage.removeItem('calzada_mapstyle'); } catch (_) {}
                return false;
            }
            return localStorage.getItem('calzada_mapstyle') === 'v2';
        } catch (_) {
            return false;
        }
    }

    // ── Category Definitions & Colors ────────────────────────────────────────
    const CATEGORY_COLORS = {
        malls: '#7C5CD6',
        eateries: '#E0763A',
        schools: '#2E9D6B',
        terminals: '#2272C3',
        coffee: '#9A6B4F',
        establishments: '#5B6B80'
    };

    const CATEGORY_TINTS = {
        malls: 'rgba(124, 92, 214, 0.12)',
        eateries: 'rgba(224, 118, 58, 0.12)',
        schools: 'rgba(46, 157, 107, 0.12)',
        terminals: 'rgba(34, 114, 195, 0.12)',
        coffee: 'rgba(154, 107, 79, 0.12)',
        establishments: 'rgba(91, 107, 128, 0.12)'
    };

    // Tabler SVG 24x24 outline paths
    const TABLER_PATHS = {
        'building-store': 'M3 21l18 0 M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1 M5 21v-10.85 M19 21v-10.85 M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4 M3 7l2 -4h14l2 4',
        'tools-kitchen-2': 'M19 3v12h-5c-.023 -3.681 .184 -7.406 5 -12zm0 12v6h-1v-3 M8 4v17 M5 4v3a3 3 0 1 0 6 0v-3',
        'school': 'M22 9l-10 -4l-10 4l10 4l10 -4v6 M6 10.6v5.4a6 3 0 0 0 12 0v-5.4',
        'bus': 'M6 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M18 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M4 17h-2v-11a1 1 0 0 1 1 -1h14a5 5 0 0 1 5 5v7h-2m-4 0h-8 M16 5l1.5 7h4.5 M2 10h15 M7 5v5 M12 5v5',
        'coffee': 'M3 14c.83 .642 2.077 1.017 3.5 1c1.423 .017 2.67 -.358 3.5 -1c.83 -.642 2.077 -1.017 3.5 -1c1.423 -.017 2.67 .358 3.5 1 M8 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2 M12 3a2.4 2.4 0 0 0 -1 2a2.4 2.4 0 0 0 1 2 M3 10h14v5a6 6 0 0 1 -6 6h-2a6 6 0 0 1 -6 -6v-5z M16.746 16.726a3 3 0 1 0 .252 -5.555',
        'building': 'M3 21l18 0 M9 8l1 0 M9 12l1 0 M9 16l1 0 M14 8l1 0 M14 12l1 0 M14 16l1 0 M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16'
    };

    const CATEGORY_ICON_NAMES = {
        malls: 'building-store',
        eateries: 'tools-kitchen-2',
        schools: 'school',
        terminals: 'bus',
        coffee: 'coffee',
        establishments: 'building'
    };

    // ── Bilingual Text Helpers ───────────────────────────────────────────────
    function getLang() {
        try {
            return (localStorage.getItem('calzada_lang') || 'en').toLowerCase();
        } catch (_) {
            return 'en';
        }
    }

    const I18N = {
        en: {
            commercial_building: 'Commercial building · {brgy}, Calamba',
            establishments_here: '{n} ESTABLISHMENTS HERE',
            plan_route: 'Plan route',
            view_place: 'View place',
            info_osm: 'Info from OpenStreetMap',
            open: 'Open',
            closed: 'Closed',
            photo: 'Photo',
            photo_360: 'Photo · 360',
            close: 'Close',
            back: 'Back to building list'
        },
        tl: {
            commercial_building: 'Gusaling pangkomersyo · {brgy}, Calamba',
            establishments_here: '{n} NA ESTABLISHMENT DITO',
            plan_route: 'Planuhin ang ruta',
            view_place: 'Tingnan ang lugar',
            info_osm: 'Impormasyon mula sa OpenStreetMap',
            open: 'Bukás',
            closed: 'Sarado',
            photo: 'Litrato',
            photo_360: 'Litrato · 360',
            close: 'Isara',
            back: 'Bumalik sa listahan'
        }
    };

    function tText(key, vars) {
        const lang = getLang();
        const dict = I18N[lang] || I18N.en;
        let str = dict[key] || I18N.en[key] || key;
        if (vars) {
            Object.keys(vars).forEach(k => {
                str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
            });
        }
        return str;
    }

    // ── Safe Opening Hours Parser ────────────────────────────────────────────
    function parseHours(raw) {
        if (!raw || typeof raw !== 'string') return null;
        const str = raw.trim();
        if (str === '24/7') {
            return { parsed: true, isOpen: true, display: '24/7' };
        }

        // Match format: Mo-Su 10:00-22:00 or Mo-Sa 08:00-17:00
        const m = str.match(/^([A-Za-z]{2}(?:-[A-Za-z]{2})?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
        if (!m) {
            return { parsed: false, isOpen: null, display: str };
        }

        try {
            const dayRange = m[1].toLowerCase();
            const startStr = m[2];
            const endStr = m[3];

            // Current PH time (UTC+8)
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const phTime = new Date(utc + (3600000 * 8));

            const days = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
            const curDay = days[phTime.getDay()];
            const curMinutes = phTime.getHours() * 60 + phTime.getMinutes();

            const [sH, sM] = startStr.split(':').map(Number);
            const [eH, eM] = endStr.split(':').map(Number);
            const startMin = sH * 60 + sM;
            let endMin = eH * 60 + eM;
            if (endMin === 0 || endMin < startMin) endMin += 1440; // overnight/midnight

            let inDays = false;
            if (dayRange === 'mo-su' || dayRange === 'su-sa') {
                inDays = true;
            } else if (dayRange.includes('-')) {
                const [dStart, dEnd] = dayRange.split('-');
                const sIdx = days.indexOf(dStart);
                const eIdx = days.indexOf(dEnd);
                const curIdx = days.indexOf(curDay);
                if (sIdx <= eIdx) {
                    inDays = (curIdx >= sIdx && curIdx <= eIdx);
                } else {
                    inDays = (curIdx >= sIdx || curIdx <= eIdx);
                }
            } else {
                inDays = (curDay === dayRange);
            }

            const inHours = curMinutes >= startMin && curMinutes <= endMin;
            const isOpen = inDays && inHours;

            // Format AM/PM display
            const fmtTime = (h, min) => {
                const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
                let h12 = h % 12;
                if (h12 === 0) h12 = 12;
                return `${h12}:${min < 10 ? '0' + min : min} ${ampm}`;
            };
            const timeDisplay = `${fmtTime(sH, sM)} – ${fmtTime(eH % 24, eM)}`;

            return { parsed: true, isOpen, display: timeDisplay };
        } catch (_) {
            return { parsed: false, isOpen: null, display: str };
        }
    }

    // ── Canvas Pin Generator ─────────────────────────────────────────────────
    function createPinCanvas(category, isSelected, badgeCount) {
        const dpr = 2;
        const size = 64; // Logical box 64x64
        const canvas = document.createElement('canvas');
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const cx = 32;
        const cy = 32;
        const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.establishments;
        const iconName = CATEGORY_ICON_NAMES[category] || 'building';
        const pathData = TABLER_PATHS[iconName] || TABLER_PATHS.building;

        // 1. If selected: outer 2px #2272C3 ring with 6px gap
        if (isSelected) {
            // Selected pin diameter = 34px (radius 17px)
            // Outer ring radius = 17 + 6 + 1 = 24px
            ctx.beginPath();
            ctx.arc(cx, cy, 24, 0, Math.PI * 2);
            ctx.strokeStyle = '#2272C3';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // 2. Normal pin: 28px diameter (radius 14). Selected: 34px diameter (radius 17)
        const pinRadius = isSelected ? 17 : 14;

        // Fill category circle
        ctx.beginPath();
        ctx.arc(cx, cy, pinRadius, 0, Math.PI * 2);
        ctx.fillStyle = catColor;
        ctx.fill();

        // 2.5px white ring
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 3. Tabler Icon (16px normal, 20px selected)
        const iconSize = isSelected ? 20 : 16;
        const iconOffset = (24 - iconSize) / 2;
        ctx.save();
        ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
        ctx.scale(iconSize / 24, iconSize / 24);
        const iconPath = new Path2D(pathData);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.2 * (24 / iconSize);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath);
        ctx.restore();

        // 4. Count badge for multi-tenant building (offset +12, -12 from center)
        if (badgeCount && badgeCount > 1) {
            const bx = cx + 12;
            const by = cy - 12;

            // Circle 18px diameter (radius 9px), fill #0E2A47, 2px white ring
            ctx.beginPath();
            ctx.arc(bx, by, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#0E2A47';
            ctx.fill();
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Digit Sora 700 11px white
            ctx.font = '700 11px Sora, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(badgeCount), bx, by + 0.5);
        }

        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    // ── Main CalzadaMapV2 Controller ─────────────────────────────────────────
    class CalzadaV2Controller {
        constructor() {
            this.map = null;
            this.places = [];
            this.buildingsGeojson = null;
            this.osmDetails = {};
            this.selectedFeatureId = null; // building osm_id or place slug
            this.selectedType = null; // 'building' | 'place'
            this.activeCategory = 'all';
            this.cardEl = null;
            this.currentCardView = null; // { type: 'building'|'place', data: ... }
            this.historyStack = [];
            this.initialized = false;
        }

        async init(map, placesList) {
            if (this.initialized) return;
            this.map = map;
            this.places = placesList || window.FALLBACK_PLACES || [];
            this.initialized = true;

            // 1. Register pin images
            this._registerPinImages();

            // 2. Fetch precomputed datasets
            await this._loadData();

            // 3. Add sources and layers
            this._setupLayers();

            // 4. Setup card DOM
            this._setupCardDOM();

            // 5. Setup event listeners (click, hover, keyboard, 3D pitch, resize)
            this._setupEvents();

            console.log('[CalzadaMapV2] Initialized successfully with 54 building footprints.');
        }

        _registerPinImages() {
            const categories = Object.keys(CATEGORY_COLORS);
            const badgeCounts = [null, 2, 3, 4, 5, 6, 7];

            categories.forEach(cat => {
                badgeCounts.forEach(count => {
                    const suffix = count ? `-badge-${count}` : '';
                    // Normal
                    const normalName = `pin-${cat}${suffix}`;
                    if (!this.map.hasImage(normalName)) {
                        this.map.addImage(normalName, createPinCanvas(cat, false, count), { pixelRatio: 2 });
                    }
                    // Selected
                    const selectedName = `pin-${cat}${suffix}-selected`;
                    if (!this.map.hasImage(selectedName)) {
                        this.map.addImage(selectedName, createPinCanvas(cat, true, count), { pixelRatio: 2 });
                    }
                });
            });
        }

        async _loadData() {
            try {
                const [bRes, dRes] = await Promise.all([
                    fetch('/data/place-buildings.geojson'),
                    fetch('/data/place-osm-details.json')
                ]);
                if (bRes.ok) this.buildingsGeojson = await bRes.json();
                if (dRes.ok) this.osmDetails = await dRes.json();
            } catch (err) {
                console.warn('[CalzadaMapV2] Failed to load precomputed files:', err);
            }
        }

        _setupLayers() {
            if (!this.buildingsGeojson) return;

            // Match places into buildings map
            const buildingsMap = new Map();
            this.buildingsGeojson.features.forEach(f => {
                buildingsMap.set(f.properties.osm_id, f);
            });

            // Prepare Place Pins GeoJSON at runtime
            const pinFeatures = [];
            const processedPlaceSlugs = new Set();

            // 1. Add multi-tenant building pins (ONE pin per multi-tenant building)
            this.buildingsGeojson.features.forEach(f => {
                const pIds = f.properties.place_ids || [];
                if (pIds.length > 1) {
                    const tenantPlaces = pIds.map(slug => this.places.find(p => p.slug === slug || String(p.id) === String(slug))).filter(Boolean);
                    if (tenantPlaces.length > 0) {
                        tenantPlaces.forEach(p => processedPlaceSlugs.add(p.slug));
                        // Primary place determines category and pin coordinates
                        const primary = tenantPlaces.find(p => p.slug === f.properties.primary_place_id) || tenantPlaces[0];
                        const cat = primary.category || 'establishments';
                        const count = tenantPlaces.length;
                        const bName = f.properties.building_name || primary.name;

                        pinFeatures.push({
                            type: 'Feature',
                            id: f.properties.osm_id,
                            properties: {
                                id: f.properties.osm_id,
                                building_osm_id: f.properties.osm_id,
                                name: bName,
                                category: cat,
                                is_multi_tenant: true,
                                tenant_count: count,
                                primary_place_slug: primary.slug,
                                place_slugs: pIds,
                                icon_image: `pin-${cat}-badge-${count}`,
                                icon_selected: `pin-${cat}-badge-${count}-selected`,
                                is_selected: false
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: [primary.lng, primary.lat]
                            }
                        });
                    }
                }
            });

            // 2. Add single place pins
            this.places.forEach(p => {
                if (processedPlaceSlugs.has(p.slug)) return;
                const cat = p.category || 'establishments';

                // Check if this single place has a building footprint
                const bFeature = this.buildingsGeojson.features.find(f => {
                    const pIds = f.properties.place_ids || [];
                    return pIds.includes(p.slug) || pIds.includes(String(p.id));
                });

                pinFeatures.push({
                    type: 'Feature',
                    id: p.id,
                    properties: {
                        id: p.id,
                        place_slug: p.slug,
                        name: p.name,
                        category: cat,
                        is_multi_tenant: false,
                        tenant_count: 1,
                        building_osm_id: bFeature ? bFeature.properties.osm_id : null,
                        icon_image: `pin-${cat}`,
                        icon_selected: `pin-${cat}-selected`,
                        is_selected: false
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [p.lng, p.lat]
                    }
                });
            });

            this.pinsGeojson = {
                type: 'FeatureCollection',
                features: pinFeatures
            };

            // Add Building Footprints Source & Layers
            if (!this.map.getSource('calzada-place-buildings')) {
                // Initialize is_selected & is_hovered properties
                this.buildingsGeojson.features.forEach(f => {
                    f.properties.is_selected = false;
                    f.properties.is_hovered = false;
                });
                this.map.addSource('calzada-place-buildings', {
                    type: 'geojson',
                    data: this.buildingsGeojson
                });

                // Fill Layer (z >= 16)
                this.map.addLayer({
                    id: 'calzada-buildings-fill',
                    type: 'fill',
                    source: 'calzada-place-buildings',
                    minzoom: 16,
                    paint: {
                        'fill-color': ['case', ['get', 'is_selected'], '#CFE2F7', '#EAF2FC'],
                        'fill-opacity': 0.95
                    }
                });

                // Outline Layer (z >= 16)
                this.map.addLayer({
                    id: 'calzada-buildings-outline',
                    type: 'line',
                    source: 'calzada-place-buildings',
                    minzoom: 16,
                    paint: {
                        'line-color': ['case', ['get', 'is_selected'], '#2272C3', ['get', 'is_hovered'], '#2272C3', '#378ADD'],
                        'line-width': ['case', ['get', 'is_selected'], 2.6, ['get', 'is_hovered'], 2.0, 1.5]
                    }
                });
            }

            // Add Place Pins Source & Layers
            if (!this.map.getSource('calzada-place-pins')) {
                this.map.addSource('calzada-place-pins', {
                    type: 'geojson',
                    data: this.pinsGeojson
                });

                // Hit target layer (diameter >= 44px for smooth mobile touch targets)
                this.map.addLayer({
                    id: 'calzada-pins-hit',
                    type: 'circle',
                    source: 'calzada-place-pins',
                    minzoom: 14,
                    paint: {
                        'circle-radius': 22,
                        'circle-opacity': 0
                    }
                });

                const isMobile = window.innerWidth < 768;

                // Normal Symbol Layer (collision on, overlap false)
                this.map.addLayer({
                    id: 'calzada-pins-symbol',
                    type: 'symbol',
                    source: 'calzada-place-pins',
                    minzoom: 14,
                    filter: ['!=', ['get', 'is_selected'], true],
                    layout: {
                        'icon-image': ['get', 'icon_image'],
                        'icon-size': 1,
                        'icon-allow-overlap': false,
                        'icon-ignore-placement': false,
                        // Desktop: labels z >= 16. Mobile: z >= 17, except large places (malls, schools, multi-tenant) from z >= 16
                        'text-field': isMobile ? [
                            'step',
                            ['zoom'],
                            [
                                'case',
                                ['any',
                                    ['==', ['get', 'category'], 'malls'],
                                    ['==', ['get', 'category'], 'schools'],
                                    ['get', 'is_multi_tenant']
                                ],
                                ['get', 'name'],
                                ''
                            ],
                            17,
                            ['get', 'name']
                        ] : [
                            'step',
                            ['zoom'],
                            '',
                            16,
                            ['get', 'name']
                        ],
                        'text-font': ['Noto Sans Bold'],
                        'text-size': 13,
                        'text-offset': [0, 1.6],
                        'text-anchor': 'top',
                        'text-max-width': 9,
                        'text-allow-overlap': false,
                        'symbol-sort-key': [
                            'case',
                            ['==', ['get', 'category'], 'malls'], 2,
                            ['==', ['get', 'category'], 'schools'], 3,
                            ['get', 'is_multi_tenant'], 4,
                            ['==', ['get', 'category'], 'terminals'], 5,
                            6
                        ]
                    },
                    paint: {
                        'text-color': '#0E2A47',
                        'text-halo-color': '#FFFFFF',
                        'text-halo-width': 2,
                        'text-halo-blur': 0
                    }
                });

                // Selected Symbol Layer (overlap true, on top of everything)
                this.map.addLayer({
                    id: 'calzada-pins-selected',
                    type: 'symbol',
                    source: 'calzada-place-pins',
                    minzoom: 14,
                    filter: ['==', ['get', 'is_selected'], true],
                    layout: {
                        'icon-image': ['get', 'icon_selected'],
                        'icon-size': 1,
                        'icon-allow-overlap': true,
                        'icon-ignore-placement': true,
                        'text-field': ['get', 'name'],
                        'text-font': ['Noto Sans Bold'],
                        'text-size': 13,
                        'text-offset': [0, 1.6],
                        'text-anchor': 'top',
                        'text-max-width': 9,
                        'text-allow-overlap': true,
                        'symbol-sort-key': 1
                    },
                    paint: {
                        'text-color': '#0E2A47',
                        'text-halo-color': '#FFFFFF',
                        'text-halo-width': 2,
                        'text-halo-blur': 0
                    }
                });
            }
        }

        _setupCardDOM() {
            let card = document.getElementById('calzadaV2Card');
            if (!card) {
                card = document.createElement('div');
                card.id = 'calzadaV2Card';
                card.className = 'calzada-v2-card';
                card.setAttribute('role', 'dialog');
                card.setAttribute('aria-modal', 'false');
                document.body.appendChild(card);
            }
            this.cardEl = card;
        }

        _setupEvents() {
            const map = this.map;

            // 1. Hover on footprints (desktop with fine pointer only)
            let hoveredBuildingId = null;
            if (window.matchMedia('(pointer: fine)').matches) {
                map.on('mousemove', 'calzada-buildings-fill', (e) => {
                    if (e.features.length > 0) {
                        map.getCanvas().style.cursor = 'pointer';
                        const id = e.features[0].properties.osm_id;
                        if (hoveredBuildingId !== id) {
                            hoveredBuildingId = id;
                            this._updateBuildingHover(id);
                        }
                    }
                });
                map.on('mouseleave', 'calzada-buildings-fill', () => {
                    map.getCanvas().style.cursor = '';
                    if (hoveredBuildingId !== null) {
                        hoveredBuildingId = null;
                        this._updateBuildingHover(null);
                    }
                });
                map.on('mouseenter', 'calzada-pins-hit', () => {
                    map.getCanvas().style.cursor = 'pointer';
                });
                map.on('mouseleave', 'calzada-pins-hit', () => {
                    map.getCanvas().style.cursor = '';
                });
            }

            // 2. Click on building footprint
            map.on('click', 'calzada-buildings-fill', (e) => {
                if (e.features.length > 0) {
                    const osmId = e.features[0].properties.osm_id;
                    this.selectBuilding(osmId);
                }
            });

            // 3. Click on place pin
            map.on('click', 'calzada-pins-hit', (e) => {
                if (e.features.length > 0) {
                    const props = e.features[0].properties;
                    if (props.is_multi_tenant) {
                        this.selectBuilding(props.building_osm_id);
                    } else {
                        this.selectPlace(props.place_slug || props.id);
                    }
                }
            });

            // 4. Click empty map deselects
            map.on('click', (e) => {
                const fBuildings = map.queryRenderedFeatures(e.point, { layers: ['calzada-buildings-fill'] });
                const fPins = map.queryRenderedFeatures(e.point, { layers: ['calzada-pins-hit'] });
                if (!fBuildings.length && !fPins.length) {
                    this.deselect();
                }
            });

            // 5. Esc closes card on desktop
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.selectedFeatureId) {
                    this.deselect();
                }
            });

            // 6. 3D extrusion on pitch > 0 && zoom >= 17 (always flat at pitch 0)
            const handle3DExtrusion = () => {
                if (!map.getLayer('building-3d')) return;
                const is3D = map.getPitch() > 0 && map.getZoom() >= 17;
                map.setLayoutProperty('building-3d', 'visibility', is3D ? 'visible' : 'none');
                if (map.getLayer('building')) {
                    map.setLayoutProperty('building', 'visibility', is3D ? 'none' : 'visible');
                }
            };
            map.on('pitch', handle3DExtrusion);
            map.on('zoom', handle3DExtrusion);

            // 7. Update language on calzada_lang_changed
            window.addEventListener('calzada_lang_changed', () => {
                if (this.currentCardView) {
                    if (this.currentCardView.type === 'building') {
                        this._renderBuildingCard(this.currentCardView.data);
                    } else if (this.currentCardView.type === 'place') {
                        this._renderPlaceCard(this.currentCardView.data);
                    }
                }
            });

            // 8. Category Pill Bar Filter Sync
            document.querySelectorAll('.cat-pill[data-category]').forEach(pill => {
                pill.addEventListener('click', () => {
                    const cat = pill.dataset.category;
                    this.filterByCategory(cat);
                });
            });
        }

        filterByCategory(category) {
            this.activeCategory = category || 'all';
            if (!this.map || !this.map.getLayer || !this.map.getLayer('calzada-pins-symbol')) return;

            if (this.activeCategory === 'all') {
                this.map.setFilter('calzada-pins-symbol', ['!=', ['get', 'is_selected'], true]);
                this.map.setFilter('calzada-pins-hit', null);
            } else {
                const targetCat = this.activeCategory.toLowerCase();
                const filter = [
                    'all',
                    ['!=', ['get', 'is_selected'], true],
                    ['==', ['get', 'category'], targetCat]
                ];
                this.map.setFilter('calzada-pins-symbol', filter);
                this.map.setFilter('calzada-pins-hit', ['==', ['get', 'category'], targetCat]);
            }
        }

        _updateBuildingHover(hoveredOsmId) {
            if (!this.buildingsGeojson) return;
            this.buildingsGeojson.features.forEach(f => {
                f.properties.is_hovered = (f.properties.osm_id === hoveredOsmId);
            });
            const src = this.map.getSource('calzada-place-buildings');
            if (src) src.setData(this.buildingsGeojson);
        }

        _updateSelectionState(selectedOsmId, selectedSlug) {
            // Update footprints
            if (this.buildingsGeojson) {
                this.buildingsGeojson.features.forEach(f => {
                    f.properties.is_selected = (selectedOsmId && f.properties.osm_id === selectedOsmId);
                });
                const srcB = this.map.getSource('calzada-place-buildings');
                if (srcB) srcB.setData(this.buildingsGeojson);
            }

            // Update pins
            if (this.pinsGeojson) {
                this.pinsGeojson.features.forEach(f => {
                    const p = f.properties;
                    if (selectedOsmId && p.is_multi_tenant) {
                        p.is_selected = (p.building_osm_id === selectedOsmId);
                    } else if (selectedSlug) {
                        p.is_selected = (p.place_slug === selectedSlug || String(p.id) === String(selectedSlug));
                    } else {
                        p.is_selected = false;
                    }
                });
                const srcP = this.map.getSource('calzada-place-pins');
                if (srcP) srcP.setData(this.pinsGeojson);
            }
        }

        // Center map so building is in visible area (not under left panel or right card/bottom sheet)
        _centerFeature(lngLat) {
            const isMobile = window.innerWidth < 768;
            const targetZoom = Math.max(this.map.getZoom(), 17);
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

            if (isMobile) {
                // Offset Y so pin stays visible above bottom sheet
                const offset = [0, -100];
                if (reducedMotion) {
                    this.map.jumpTo({ center: lngLat, zoom: targetZoom });
                } else {
                    this.map.easeTo({ center: lngLat, offset, zoom: targetZoom, duration: 350 });
                }
            } else {
                // Desktop: left panel ~380px, right card ~380px -> offset X center
                const offset = [-10, 0];
                if (reducedMotion) {
                    this.map.jumpTo({ center: lngLat, zoom: targetZoom });
                } else {
                    this.map.easeTo({ center: lngLat, offset, zoom: targetZoom, duration: 350 });
                }
            }
        }

        selectBuilding(osmId) {
            const bFeature = this.buildingsGeojson?.features.find(f => f.properties.osm_id === osmId);
            if (!bFeature) return;

            const pIds = bFeature.properties.place_ids || [];
            const tenants = pIds.map(slug => this.places.find(p => p.slug === slug || String(p.id) === String(slug))).filter(Boolean);

            if (tenants.length <= 1) {
                // Single place: open single place card F2
                const single = tenants[0] || this.places.find(p => p.slug === bFeature.properties.primary_place_id);
                if (single) {
                    this.selectPlace(single.slug, osmId);
                }
                return;
            }

            // Multi-tenant building: open F1
            this.selectedFeatureId = osmId;
            this.selectedType = 'building';
            this.historyStack = [];
            this._updateSelectionState(osmId, null);

            // Center map
            const primary = tenants.find(p => p.slug === bFeature.properties.primary_place_id) || tenants[0];
            this._centerFeature([primary.lng, primary.lat]);

            // Render F1 card
            this._renderBuildingCard({ bFeature, tenants, primary });
        }

        selectPlace(placeSlugOrId, fromOsmId = null) {
            const place = this.places.find(p => p.slug === placeSlugOrId || String(p.id) === String(placeSlugOrId));
            if (!place) return;

            // Check if place belongs to a building
            const bFeature = this.buildingsGeojson?.features.find(f => {
                const ids = f.properties.place_ids || [];
                return ids.includes(place.slug) || ids.includes(String(place.id));
            });

            const osmId = fromOsmId || (bFeature ? bFeature.properties.osm_id : null);
            this.selectedFeatureId = place.slug;
            this.selectedType = 'place';
            this._updateSelectionState(osmId, place.slug);

            // Center map
            this._centerFeature([place.lng, place.lat]);

            // Render F2 card
            this._renderPlaceCard({ place, bFeature });
        }

        deselect() {
            this.selectedFeatureId = null;
            this.selectedType = null;
            this.currentCardView = null;
            this.historyStack = [];
            this._updateSelectionState(null, null);

            if (this.cardEl) {
                this.cardEl.classList.remove('open');
                document.body.classList.remove('calzada-v2-sheet-open');
            }
        }

        // ── Render F1: Multi-tenant Building Card ─────────────────────────────
        _renderBuildingCard(data) {
            this.currentCardView = { type: 'building', data };
            const { bFeature, tenants, primary } = data;
            const bProps = bFeature.properties;
            const count = tenants.length;
            const title = bProps.building_name || primary.name;
            const brgy = primary.barangay || 'Calamba';
            const cat = primary.category || 'establishments';
            const catColor = CATEGORY_COLORS[cat] || '#5B6B80';
            const catTint = CATEGORY_TINTS[cat] || 'rgba(91, 107, 128, 0.12)';
            const address = primary.full_address || `${brgy}, Calamba City, Laguna`;

            const isMobile = window.innerWidth < 768;

            let html = '';
            if (isMobile) {
                html += '<div class="calzada-v2-grab-handle"></div>';
            }

            // Header
            html += `
                <div class="calzada-v2-f1-header">
                    <div class="calzada-v2-tile-44" style="background:${catTint}; color:${catColor};">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="${TABLER_PATHS.building}"></path>
                        </svg>
                    </div>
                    <div class="calzada-v2-header-text">
                        <h2 class="calzada-v2-f1-title">${this._escape(title)}</h2>
                        <div class="calzada-v2-f1-meta">${this._escape(tText('commercial_building', { brgy }))}</div>
                    </div>
                    <button type="button" class="calzada-v2-close-btn" id="calzadaV2CloseBtn" aria-label="${tText('close')}">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="calzada-v2-card-body">
                    <div class="calzada-v2-address-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 21c-4.97-4.97-8-8.5-8-12.5a8 8 0 1 1 16 0c0 4-3.03 7.53-8 12.5z"></path>
                            <circle cx="12" cy="8.5" r="2.5"></circle>
                        </svg>
                        <div class="calzada-v2-address-text">${this._escape(address)}</div>
                    </div>
                    <div class="calzada-v2-section-label">${this._escape(tText('establishments_here', { n: count }))}</div>
                    <div class="calzada-v2-tenants-list">
            `;

            // Tenant rows
            tenants.forEach((tenant, idx) => {
                const photoUrl = tenant.photo || tenant.image_path || '';
                const hasPano = Boolean(tenant.pano || tenant.nodeId);
                const tCatName = this._getCategoryLabel(tenant.category);

                html += `
                    <div class="calzada-v2-tenant-row" data-slug="${this._escape(tenant.slug)}" role="button" tabindex="0" aria-label="${this._escape(tenant.name)}">
                        <div class="calzada-v2-tenant-photo">
                            ${photoUrl ? `<img src="${this._escape(photoUrl)}" alt="${this._escape(tenant.name)}" loading="lazy">` : `
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="${TABLER_PATHS.building}"></path>
                                </svg>
                            `}
                        </div>
                        <div class="calzada-v2-tenant-info">
                            <div class="calzada-v2-tenant-name-row">
                                <span class="calzada-v2-tenant-name">${this._escape(tenant.name)}</span>
                                ${hasPano ? `
                                    <span class="calzada-v2-360-badge">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                            <circle cx="12" cy="12" r="9"></circle>
                                            <ellipse cx="12" cy="12" rx="4" ry="9"></ellipse>
                                        </svg>
                                        360
                                    </span>
                                ` : ''}
                            </div>
                            <div class="calzada-v2-tenant-category">${this._escape(tCatName)}</div>
                        </div>
                        <svg class="calzada-v2-tenant-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 18l6-6-6-6"></path>
                        </svg>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
                <div class="calzada-v2-footer">
                    <button type="button" class="calzada-v2-btn-primary" id="calzadaV2PlanRouteBtn">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M3 17l6 -6l4 4l8 -8M14 7l7 0l0 7"></path></svg>
                        <span>${this._escape(tText('plan_route'))}</span>
                    </button>
                </div>
            `;

            this.cardEl.innerHTML = html;
            this.cardEl.setAttribute('aria-label', title);
            this.cardEl.classList.add('open');
            if (isMobile) {
                document.body.classList.add('calzada-v2-sheet-open');
                this._updateSheetHeight();
            }

            // Attach interactions
            this.cardEl.querySelector('#calzadaV2CloseBtn').addEventListener('click', () => this.deselect());

            this.cardEl.querySelectorAll('.calzada-v2-tenant-row').forEach(row => {
                const openTenant = () => {
                    const slug = row.dataset.slug;
                    this.historyStack.push({ type: 'building', data });
                    this.selectPlace(slug, bFeature.properties.osm_id);
                };
                row.addEventListener('click', openTenant);
                row.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openTenant();
                    }
                });
            });

            this.cardEl.querySelector('#calzadaV2PlanRouteBtn').addEventListener('click', () => {
                this._setDestination(primary);
            });
        }

        // ── Render F2: Single Place Card ──────────────────────────────────────
        _renderPlaceCard(data) {
            this.currentCardView = { type: 'place', data };
            const { place, bFeature } = data;
            const brgy = place.barangay || 'Calamba';
            const cat = place.category || 'establishments';
            const catColor = CATEGORY_COLORS[cat] || '#5B6B80';
            const catTint = CATEGORY_TINTS[cat] || 'rgba(91, 107, 128, 0.12)';
            const iconName = CATEGORY_ICON_NAMES[cat] || 'building';
            const pathData = TABLER_PATHS[iconName] || TABLER_PATHS.building;
            const catName = this._getCategoryLabel(cat);
            const photoUrl = place.photo || place.image_path || '';
            const hasPano = Boolean(place.pano || place.nodeId);
            const hasBack = this.historyStack.length > 0;
            const isMobile = window.innerWidth < 768;

            // Details from place and OSM
            const osmInfo = this.osmDetails[place.slug] || this.osmDetails[String(place.id)] || null;
            const osmTags = osmInfo ? osmInfo.tags : {};

            const address = place.full_address || `${brgy}, Calamba City, Laguna`;
            const hoursVal = place.opening_hours || osmTags.opening_hours || null;
            const hoursParsed = parseHours(hoursVal);
            const hoursFromOsm = !place.opening_hours && Boolean(osmTags.opening_hours);

            const phoneVal = place.phone || osmTags.phone || null;
            const phoneFromOsm = !place.phone && Boolean(osmTags.phone);

            const websiteVal = place.website || osmTags.website || null;
            const websiteFromOsm = !place.website && Boolean(osmTags.website);

            const hasOsmDetails = hoursFromOsm || phoneFromOsm || websiteFromOsm;

            let html = '';
            if (isMobile) {
                html += '<div class="calzada-v2-grab-handle"></div>';
            }

            // Photo Block
            if (photoUrl) {
                html += `
                    <div class="calzada-v2-photo-block">
                        <img src="${this._escape(photoUrl)}" alt="${this._escape(place.name)}" loading="lazy">
                        <div class="calzada-v2-photo-tag">${hasPano ? tText('photo_360') : tText('photo')}</div>
                    </div>
                `;
            }

            // Header
            html += `
                <div class="calzada-v2-f2-header">
                    ${hasBack ? `
                        <button type="button" class="calzada-v2-back-btn" id="calzadaV2BackBtn" aria-label="${tText('back')}">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6"></path></svg>
                        </button>
                    ` : ''}
                    <div class="calzada-v2-tile-40" style="background:${catTint}; color:${catColor};">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="${pathData}"></path>
                        </svg>
                    </div>
                    <div class="calzada-v2-header-text">
                        <h2 class="calzada-v2-f2-title">${this._escape(place.name)}</h2>
                        <div class="calzada-v2-f2-meta">${this._escape(catName)} · ${this._escape(brgy)}, Calamba</div>
                    </div>
                    <button type="button" class="calzada-v2-close-btn" id="calzadaV2CloseBtn" aria-label="${tText('close')}">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12"></path></svg>
                    </button>
                </div>
                <div class="calzada-v2-card-body">
                    <!-- Address Row -->
                    <div class="calzada-v2-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 21c-4.97-4.97-8-8.5-8-12.5a8 8 0 1 1 16 0c0 4-3.03 7.53-8 12.5z"></path>
                            <circle cx="12" cy="8.5" r="2.5"></circle>
                        </svg>
                        <div class="calzada-v2-row-content">${this._escape(address)}</div>
                    </div>
            `;

            // Hours Row
            if (hoursVal) {
                html += `
                    <div class="calzada-v2-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="9"></circle>
                            <polyline points="12 7 12 12 15 15"></polyline>
                        </svg>
                        <div class="calzada-v2-row-content">
                            ${hoursParsed && hoursParsed.parsed ? `
                                <span class="${hoursParsed.isOpen ? 'calzada-v2-hours-open' : 'calzada-v2-hours-closed'}">
                                    ${hoursParsed.isOpen ? tText('open') : tText('closed')}
                                </span> · ${this._escape(hoursParsed.display)}
                            ` : this._escape(hoursVal)}
                        </div>
                    </div>
                `;
            }

            // Phone Row
            if (phoneVal) {
                html += `
                    <div class="calzada-v2-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2"></path>
                        </svg>
                        <div class="calzada-v2-row-content">
                            <a href="tel:${this._escape(phoneVal.replace(/\s+/g, ''))}">${this._escape(phoneVal)}</a>
                        </div>
                    </div>
                `;
            }

            // Website Row
            if (websiteVal) {
                let domain = websiteVal;
                try {
                    domain = new URL(websiteVal).hostname.replace(/^www\./, '');
                } catch (_) {}
                html += `
                    <div class="calzada-v2-row">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="9"></circle>
                            <line x1="3.6" y1="9" x2="20.4" y2="9"></line>
                            <line x1="3.6" y1="15" x2="20.4" y2="15"></line>
                            <path d="M11.5 3a17 17 0 0 0 0 18"></path>
                            <path d="M12.5 3a17 17 0 0 1 0 18"></path>
                        </svg>
                        <div class="calzada-v2-row-content">
                            <a href="${this._escape(websiteVal)}" target="_blank" rel="noopener">${this._escape(domain)}</a>
                        </div>
                    </div>
                `;
            }

            // OSM Attribution note if any detail came from OSM
            if (hasOsmDetails) {
                html += `<div class="calzada-v2-osm-notice">${this._escape(tText('info_osm'))}</div>`;
            }

            html += `
                </div>
                <div class="calzada-v2-footer">
                    <button type="button" class="calzada-v2-btn-primary" id="calzadaV2PlanRouteBtn">
                        <svg viewBox="0 0 24 24" fill="none"><path d="M3 17l6 -6l4 4l8 -8M14 7l7 0l0 7"></path></svg>
                        <span>${this._escape(tText('plan_route'))}</span>
                    </button>
                    <button type="button" class="calzada-v2-btn-secondary" id="calzadaV2ViewPlaceBtn">
                        <span>${this._escape(tText('view_place'))}</span>
                    </button>
                </div>
            `;

            this.cardEl.innerHTML = html;
            this.cardEl.setAttribute('aria-label', place.name);
            this.cardEl.classList.add('open');
            if (isMobile) {
                document.body.classList.add('calzada-v2-sheet-open');
                this._updateSheetHeight();
            }

            // Attach interactions
            this.cardEl.querySelector('#calzadaV2CloseBtn').addEventListener('click', () => this.deselect());

            if (hasBack) {
                this.cardEl.querySelector('#calzadaV2BackBtn').addEventListener('click', () => {
                    const prev = this.historyStack.pop();
                    if (prev && prev.type === 'building') {
                        this.selectBuilding(prev.data.bFeature.properties.osm_id);
                    }
                });
            }

            this.cardEl.querySelector('#calzadaV2PlanRouteBtn').addEventListener('click', () => {
                this._setDestination(place);
            });

            this.cardEl.querySelector('#calzadaV2ViewPlaceBtn').addEventListener('click', () => {
                if (typeof window.openPlacePanel === 'function') {
                    window.openPlacePanel(place.name, place.lat, place.lng);
                }
            });
        }

        _updateSheetHeight() {
            setTimeout(() => {
                if (this.cardEl) {
                    const h = this.cardEl.offsetHeight;
                    document.documentElement.style.setProperty('--calzada-v2-sheet-height', `${h}px`);
                }
            }, 50);
        }

        _setDestination(place) {
            this.deselect();

            // Set destination state in planner (identical flow to selecting it in Where to?)
            if (typeof window._calzadaSetDestination === 'function') {
                window._calzadaSetDestination(place.name, [place.lat, place.lng]);
            } else if (typeof window._calzadaSelectLocation === 'function') {
                window.activeSelectingField = 'destination';
                window._calzadaSelectLocation(place.name, [place.lat, place.lng]);
            }
        }

        _getCategoryLabel(category) {
            const lang = getLang();
            const labels = {
                en: { malls: 'Mall', eateries: 'Eatery', schools: 'School', terminals: 'Terminal', coffee: 'Coffee Shop', establishments: 'Establishment' },
                tl: { malls: 'Mall', eateries: 'Kainan', schools: 'Paaralan', terminals: 'Terminal', coffee: 'Kapihan', establishments: 'Establisimyento' }
            };
            const dict = labels[lang] || labels.en;
            return dict[category] || dict.establishments;
        }

        _escape(str) {
            if (str == null) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    }

    const instance = new CalzadaV2Controller();
    instance.isV2Enabled = isV2Enabled;

    return instance;
}));
