/**
 * Calzada Route PDF Exporter (Offline Route Export) v1.0.7
 * 
 * Generates an A4 portrait PDF for a planned route on the planner.
 * Works entirely client-side on the device; nothing is uploaded.
 * 
 * Features:
 * - Clean Calzada style: #378ADD accent, #0E2A47 text, no emoji, no gradients
 * - Header: Calzada wordmark, title "Route to <destination>", generated date/time
 * - Summary row: From (label only, never coordinates), To, mode, times, duration, distance, fares (regular + discounted)
 * - Map snapshot: whole route fitted, origin and destination markers, walk dotted + jeepney solid, "© OpenStreetMap contributors"
 * - Trip legs timeline: origin -> walk -> board -> jeepney -> alight -> walk -> dest
 * - Numbered step-by-step directions matching the app
 * - Footer: LTFRB fare guide attribution + calzadaph.com
 * - Correct Peso sign (₱)
 * - English and Tagalog support
 * - Web Share API on iOS/supported devices, anchor download fallback
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.CalzadaRoutePdf = api;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const HTML_TO_IMAGE_SRC = '/vendor/html-to-image/html-to-image-1.11.11.js';
    const JSPDF_SRC = '/vendor/jspdf/jspdf.umd.min.js';
    const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Sora:wght@600;700&display=swap';

    let htmlToImageLoad = null;
    const loadHtmlToImage = () => htmlToImageLoad || (htmlToImageLoad = new Promise((resolve, reject) => {
        if (window.htmlToImage) { resolve(window.htmlToImage); return; }
        const s = document.createElement('script');
        s.src = HTML_TO_IMAGE_SRC;
        s.onload = () => window.htmlToImage ? resolve(window.htmlToImage) : reject(new Error('html-to-image missing'));
        s.onerror = () => { htmlToImageLoad = null; reject(new Error('html-to-image failed to load')); };
        document.head.appendChild(s);
    }));

    let jsPdfLoad = null;
    const loadJsPdf = () => jsPdfLoad || (jsPdfLoad = new Promise((resolve, reject) => {
        const existing = window.jspdf?.jsPDF || window.jsPDF;
        if (existing) { resolve(existing); return; }
        const s = document.createElement('script');
        s.src = JSPDF_SRC;
        s.onload = () => {
            const ctor = window.jspdf?.jsPDF || window.jsPDF;
            ctor ? resolve(ctor) : reject(new Error('jsPDF missing'));
        };
        s.onerror = () => { jsPdfLoad = null; reject(new Error('jsPDF failed to load')); };
        document.head.appendChild(s);
    }));

    let fontCssPromise = null;
    const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(blob);
    });

    const getFontCss = () => fontCssPromise || (fontCssPromise = (async () => {
        try {
            const css = await (await fetch(FONT_CSS_URL)).text();
            const faces = css.split(/(?=\/\*\s*[\w-]+\s*\*\/)/).filter(b => /^\/\*\s*latin(-ext)?\s*\*\//.test(b));
            const dataUrls = new Map();
            const inlined = await Promise.all(faces.map(async (face) => {
                const m = face.match(/url\((https:[^)]+?\.woff2)\)/);
                if (!m) return '';
                if (!dataUrls.has(m[1])) {
                    dataUrls.set(m[1], fetch(m[1])
                        .then(r => { if (!r.ok) throw new Error(`font ${r.status}`); return r.blob(); })
                        .then(blobToDataUrl));
                }
                return face.replace(m[1], await dataUrls.get(m[1]));
            }));
            const out = inlined.join('\n');
            if (!out.includes('data:')) throw new Error('no font faces');
            return out;
        } catch (e) {
            fontCssPromise = null;
            return '';
        }
    })());

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const COORDINATE_LIKE = /^\s*-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}\s*$/;

    function sanitizeOriginLabel(label, isTl) {
        const trimmed = (label || '').trim();
        const myLocStr = isTl ? 'Aking Lokasyon' : 'My Location';
        const pinnedStr = isTl ? 'Naka-pin na lokasyon' : 'Pinned location';
        if (!trimmed || trimmed === 'My Location' || trimmed.toLowerCase() === 'use my current location') {
            return myLocStr;
        }
        if (COORDINATE_LIKE.test(trimmed) || trimmed.toLowerCase().startsWith('pinned location')) {
            return pinnedStr;
        }
        return trimmed;
    }

    function formatGeneratedDate(date, isTl) {
        try {
            return new Intl.DateTimeFormat(isTl ? 'fil-PH' : 'en-PH', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            }).format(date);
        } catch (_) {
            const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const m = monthsEn[date.getMonth()];
            const d = date.getDate();
            const y = date.getFullYear();
            let h = date.getHours();
            const ampm = h >= 12 ? 'PM' : 'AM';
            h = h % 12 || 12;
            const min = String(date.getMinutes()).padStart(2, '0');
            return `${m} ${d}, ${y}, ${h}:${min} ${ampm}`;
        }
    }

    function formatTime12(date) {
        let h = date.getHours();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${h}:${min} ${ampm}`;
    }

    function formatDistanceMeters(m) {
        const meters = Math.round(m);
        if (meters < 1000) {
            return `${Math.round(meters / 50) * 50 || meters} m`;
        }
        return `${(meters / 1000).toFixed(1)} km`;
    }

    function buildPdfFileName(destName, date = new Date()) {
        const rawDest = (destName || 'Destination').trim();
        let safeDest = rawDest
            .replace(/[^a-zA-Z0-9\s_-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-');
        if (!safeDest) safeDest = 'Destination';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `Calzada-Route-${safeDest}-${y}-${m}-${d}.pdf`;
    }

    function downloadBlob(blob, name) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function extractGeojsonCoords(geojson) {
        if (!geojson) return [];
        if (Array.isArray(geojson)) return geojson;
        if (geojson.coordinates && Array.isArray(geojson.coordinates)) {
            if (Array.isArray(geojson.coordinates[0])) {
                if (typeof geojson.coordinates[0][0] === 'number') return geojson.coordinates;
                return geojson.coordinates.flat();
            }
            return [geojson.coordinates];
        }
        if (geojson.features && Array.isArray(geojson.features)) {
            const all = [];
            geojson.features.forEach(f => {
                if (f.geometry && f.geometry.coordinates) {
                    if (Array.isArray(f.geometry.coordinates[0])) {
                        if (typeof f.geometry.coordinates[0][0] === 'number') {
                            all.push(...f.geometry.coordinates);
                        } else {
                            all.push(...f.geometry.coordinates.flat());
                        }
                    }
                }
            });
            return all;
        }
        return [];
    }

    function waitForMapTilesLoaded(map, timeoutMs = 12000) {
        return new Promise((resolve, reject) => {
            let timer = null;
            let resolved = false;

            const cleanup = () => {
                if (timer) clearTimeout(timer);
                map.off('idle', onCheck);
                map.off('render', onCheck);
            };

            const onCheck = () => {
                if (resolved) return;
                if (map.areTilesLoaded() && map.loaded()) {
                    resolved = true;
                    cleanup();
                    requestAnimationFrame(() => {
                        setTimeout(() => resolve(true), 80);
                    });
                }
            };

            timer = setTimeout(() => {
                if (resolved) return;
                resolved = true;
                cleanup();
                if (map.areTilesLoaded()) {
                    resolve(true);
                } else {
                    reject(new Error('Map tiles load timeout or offline'));
                }
            }, timeoutMs);

            map.on('idle', onCheck);
            map.on('render', onCheck);
            map.triggerRepaint();
            onCheck();
        });
    }

    function createOfflineRouteDiagram(routeData, isTl) {
        const width = 1420;
        const height = 800;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Clean neutral background
        ctx.fillStyle = '#F8FAFC';
        ctx.fillRect(0, 0, width, height);

        // Subtle background grid
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 1;
        for (let x = 40; x < width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 40; y < height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        const toLL = (c) => {
            if (!c) return null;
            if (Array.isArray(c)) {
                if (c.length < 2) return null;
                const a = Number(c[0]);
                const b = Number(c[1]);
                if (!isFinite(a) || !isFinite(b)) return null;
                if (a > 100 && b < 100) return [a, b];
                if (b > 100 && a < 100) return [b, a];
                return [b, a];
            }
            if (typeof c === 'object') {
                const lat = c.lat !== undefined ? c.lat : c.latitude;
                const lng = c.lng !== undefined ? c.lng : (c.lon !== undefined ? c.lon : c.longitude);
                const numLat = Number(lat);
                const numLng = Number(lng);
                if (!isFinite(numLat) || !isFinite(numLng)) return null;
                return [numLng, numLat];
            }
            return null;
        };

        const origLL = toLL(routeData.originCoords);
        const destLL = toLL(routeData.destCoords);
        const walkCoords = routeData.walkCoordinates || extractGeojsonCoords(routeData.walkRouteGeojson) || [];
        const transitCoords = routeData.transitCoordinates || extractGeojsonCoords(routeData.transitRouteGeojson) || [];
        const finalWalkCoords = routeData.finalWalkCoordinates || extractGeojsonCoords(routeData.finalWalkRouteGeojson) || [];

        const boardingLL = transitCoords && transitCoords.length > 0 ? toLL(transitCoords[0]) : null;
        const alightingLL = transitCoords && transitCoords.length > 0 ? toLL(transitCoords[transitCoords.length - 1]) : null;

        const pts = [];
        if (origLL) pts.push(origLL);
        if (destLL) pts.push(destLL);
        if (boardingLL) pts.push(boardingLL);
        if (alightingLL) pts.push(alightingLL);
        [...walkCoords, ...transitCoords, ...finalWalkCoords].forEach(c => {
            const ll = toLL(c);
            if (ll) pts.push(ll);
        });

        let projectPt = null;
        if (pts.length >= 2) {
            let minLng = Math.min(...pts.map(p => p[0]));
            let maxLng = Math.max(...pts.map(p => p[0]));
            let minLat = Math.min(...pts.map(p => p[1]));
            let maxLat = Math.max(...pts.map(p => p[1]));

            if (maxLng - minLng < 0.002) { maxLng += 0.005; minLng -= 0.005; }
            if (maxLat - minLat < 0.002) { maxLat += 0.005; minLat -= 0.005; }

            const padX = 140;
            const padY = 120;
            const availW = width - padX * 2;
            const availH = height - padY * 2;
            const latCorr = Math.cos((minLat + maxLat) / 2 * Math.PI / 180);

            const scaleX = availW / ((maxLng - minLng) * latCorr);
            const scaleY = availH / (maxLat - minLat);
            const scale = Math.min(scaleX, scaleY);
            const offsetX = (width - (maxLng - minLng) * latCorr * scale) / 2;
            const offsetY = (height - (maxLat - minLat) * scale) / 2;

            projectPt = (ll) => ({
                x: offsetX + (ll[0] - minLng) * latCorr * scale,
                y: height - (offsetY + (ll[1] - minLat) * scale)
            });
        } else {
            // Linear schematic fallback
            const isWalkOnly = routeData.selectedMode === 'walking';
            if (isWalkOnly) {
                projectPt = (ll) => (ll === origLL ? { x: 260, y: 380 } : { x: 1160, y: 380 });
            } else {
                projectPt = (ll) => {
                    if (ll === origLL) return { x: 200, y: 380 };
                    if (ll === boardingLL) return { x: 480, y: 380 };
                    if (ll === alightingLL) return { x: 940, y: 380 };
                    return { x: 1220, y: 380 };
                };
            }
        }

        const drawLeg = (coords, isDotted, color, lineWidth) => {
            if (!coords || coords.length < 2) return;
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (isDotted) {
                ctx.setLineDash([10, 10]);
            } else {
                ctx.setLineDash([]);
            }
            ctx.beginPath();
            coords.forEach((c, idx) => {
                const ll = toLL(c);
                if (!ll) return;
                const p = projectPt(ll);
                if (idx === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            });
            ctx.stroke();
            ctx.restore();
        };

        // 1. Walk leg 1 (dotted)
        if (walkCoords.length >= 2) {
            drawLeg(walkCoords, true, '#64748B', 5);
        } else if (origLL && boardingLL) {
            drawLeg([origLL, boardingLL], true, '#64748B', 5);
        }

        // 2. Transit jeepney leg (solid #378ADD)
        if (transitCoords.length >= 2) {
            drawLeg(transitCoords, false, '#378ADD', 8);
        } else if (boardingLL && alightingLL) {
            drawLeg([boardingLL, alightingLL], false, '#378ADD', 8);
        }

        // 3. Final walk leg (dotted)
        if (finalWalkCoords.length >= 2) {
            drawLeg(finalWalkCoords, true, '#64748B', 5);
        } else if (alightingLL && destLL && Math.hypot(alightingLL[0] - destLL[0], alightingLL[1] - destLL[1]) > 0.0001) {
            drawLeg([alightingLL, destLL], true, '#64748B', 5);
        } else if (routeData.selectedMode === 'walking' && origLL && destLL && walkCoords.length < 2) {
            drawLeg([origLL, destLL], true, '#64748B', 5);
        }

        // Draw pill label helper
        const drawLabelPill = (text, x, y, isAbove = true) => {
            if (!text) return;
            ctx.save();
            ctx.font = '600 18px Outfit, sans-serif';
            const metrics = ctx.measureText(text);
            const padH = 14;
            const padV = 6;
            const pw = metrics.width + padH * 2;
            const ph = 28;
            const px = Math.max(16, Math.min(width - pw - 16, x - pw / 2));
            const py = isAbove ? (y - ph - 16) : (y + 16);

            ctx.shadowColor = 'rgba(14, 42, 71, 0.12)';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#DCE5EE';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(px, py, pw, ph, 14);
            ctx.fill();
            ctx.stroke();

            ctx.shadowColor = 'transparent';
            ctx.fillStyle = '#0E2A47';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, px + pw / 2, py + ph / 2);
            ctx.restore();
        };

        // Draw Markers
        // 1. Origin marker
        if (origLL) {
            const p = projectPt(origLL);
            ctx.save();
            ctx.shadowColor = 'rgba(28, 110, 242, 0.45)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#1C6EF2';
            ctx.fill();
            ctx.restore();
            drawLabelPill(sanitizeOriginLabel(routeData.originName, isTl), p.x, p.y, true);
        }

        // 2. Boarding point marker & label
        if (boardingLL && (!origLL || Math.hypot(boardingLL[0] - origLL[0], boardingLL[1] - origLL[1]) > 0.0001)) {
            const p = projectPt(boardingLL);
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#3B82F6';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.restore();

            const boardName = routeData.lastItineraryStops?.boardAt || (isTl ? 'Sakayan' : 'Boarding');
            drawLabelPill(boardName, p.x, p.y, false);
        }

        // 3. Drop-off point marker & label
        if (alightingLL && destLL && Math.hypot(alightingLL[0] - destLL[0], alightingLL[1] - destLL[1]) > 0.0001) {
            const p = projectPt(alightingLL);
            ctx.save();
            ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#2272C3';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            ctx.restore();

            const alightName = routeData.lastItineraryStops?.alightAt || (isTl ? 'Babaan' : 'Drop-off');
            drawLabelPill(alightName, p.x, p.y, true);
        }

        // 4. Destination marker & label
        if (destLL) {
            const p = projectPt(destLL);
            ctx.save();
            ctx.shadowColor = 'rgba(239, 68, 68, 0.45)';
            ctx.shadowBlur = 10;
            ctx.translate(p.x, p.y);
            ctx.scale(1.15, 1.15);
            ctx.translate(-14, -36);
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.moveTo(14, 0);
            ctx.bezierCurveTo(6.268, 0, 0, 6.268, 0, 14);
            ctx.bezierCurveTo(0, 22.75, 14, 36, 14, 36);
            ctx.bezierCurveTo(14, 36, 28, 22.75, 28, 14);
            ctx.bezierCurveTo(28, 6.268, 21.732, 0, 14, 0);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(14, 14, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawLabelPill(routeData.destName || (isTl ? 'Pupuntahan' : 'Destination'), p.x, p.y, false);
        }

        // Note: "Map preview unavailable offline"
        ctx.save();
        ctx.font = '600 20px Outfit, sans-serif';
        const noteText = isTl ? 'Hindi available ang preview ng mapa offline' : 'Map preview unavailable offline';
        const metrics = ctx.measureText(noteText);
        const pillW = metrics.width + 48;
        const pillH = 40;
        const pillX = (width - pillW) / 2;
        const pillY = height - 56;

        ctx.shadowColor = 'rgba(14, 42, 71, 0.12)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 20);
        ctx.fill();
        ctx.stroke();

        ctx.shadowColor = 'transparent';
        ctx.fillStyle = '#64748B';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteText, width / 2, pillY + pillH / 2);
        ctx.restore();

        return {
            dataUrl: canvas.toDataURL('image/png'),
            width,
            height,
            isOffline: true
        };
    }

    function computePage1MapHeight(routeTitle, isTl) {
        try {
            const dummy = document.createElement('div');
            dummy.style.cssText = 'width: 794px; padding: 34px 42px 28px; box-sizing: border-box; visibility: hidden; position: absolute; left: -9999px; top: 0; font-family: Outfit, Sora, sans-serif;';
            dummy.innerHTML = `
                <div id="_mHeader" style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #378ADD; padding-bottom: 12px; margin-bottom: 14px;">
                    <div>
                        <div style="height: 30px; margin-bottom: 5px;"></div>
                        <div style="font-size: 18px; font-weight: 700; font-family: 'Sora', sans-serif;">${escapeHtml(routeTitle || '')}</div>
                    </div>
                </div>
                <div id="_mSummary" style="background: #F8FAFC; border: 1px solid #DCE5EE; border-radius: 9px; padding: 10px 14px; margin-bottom: 14px;">
                    <div style="display: grid; grid-template-columns: 1.1fr 1.1fr 0.9fr 0.9fr; gap: 8px; margin-bottom: 8px;">
                        <div><div style="font-size: 9px;">FROM</div><div style="font-size: 12px;">Origin Place Name</div></div>
                        <div><div style="font-size: 9px;">TO</div><div style="font-size: 12px;">Destination Place Name</div></div>
                        <div><div style="font-size: 9px;">MODE</div><div style="font-size: 12px;">Jeepney</div></div>
                        <div><div style="font-size: 9px;">SCHEDULE</div><div style="font-size: 12px;">12:00 PM</div></div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1.6fr; gap: 8px; padding-top: 8px; border-top: 1px dashed #DCE5EE;">
                        <div><div style="font-size: 9px;">TOTAL TIME</div><div style="font-size: 12px;">30 min</div></div>
                        <div><div style="font-size: 9px;">TOTAL DISTANCE</div><div style="font-size: 12px;">5.0 km</div></div>
                        <div><div style="font-size: 9px;">FARE</div><div style="font-size: 12px;">₱14.00</div></div>
                    </div>
                </div>
                <div id="_mAttr" style="font-size: 9px; margin-top: 4px;">© OpenStreetMap contributors</div>
                <div id="_mFooter" style="border-top: 1px solid #E2E8F0; padding-top: 8px; font-size: 9.5px;">Footer text</div>
            `;
            document.body.appendChild(dummy);
            const headerH = dummy.querySelector('#_mHeader')?.offsetHeight || 75;
            const summaryH = dummy.querySelector('#_mSummary')?.offsetHeight || 105;
            const attrH = dummy.querySelector('#_mAttr')?.offsetHeight || 16;
            const footerH = dummy.querySelector('#_mFooter')?.offsetHeight || 24;
            document.body.removeChild(dummy);

            const availableH = 1123 - 34 - 28; // 1061px
            const margins = 14 + 8; // summary margin-bottom + map box margin-bottom
            const targetBlank = 24; // Keep blank space under map + attribution < 40px
            const targetH = availableH - (headerH + summaryH + attrH + footerH + margins + targetBlank);
            return Math.max(710, Math.min(805, Math.round(targetH)));
        } catch (_) {
            return 795;
        }
    }

    async function captureRouteMapSnapshot(map, routeData, isTl) {
        if (!map) return createOfflineRouteDiagram(routeData, isTl);

        let prevSheetState = null;
        const prevCamera = {
            center: map.getCenter(),
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch()
        };

        try {
            const bounds = new maplibregl.LngLatBounds();
            const toLL = (c) => {
                if (!c) return null;
                if (Array.isArray(c)) {
                    if (c.length < 2) return null;
                    const a = Number(c[0]);
                    const b = Number(c[1]);
                    if (!isFinite(a) || !isFinite(b)) return null;
                    if (a > 100 && b < 100) return [a, b];
                    if (b > 100 && a < 100) return [b, a];
                    return [b, a];
                }
                if (typeof c === 'object') {
                    const lat = c.lat !== undefined ? c.lat : c.latitude;
                    const lng = c.lng !== undefined ? c.lng : (c.lon !== undefined ? c.lon : c.longitude);
                    const numLat = Number(lat);
                    const numLng = Number(lng);
                    if (!isFinite(numLat) || !isFinite(numLng)) return null;
                    return [numLng, numLat];
                }
                return null;
            };

            const origLL = toLL(routeData.originCoords);
            const destLL = toLL(routeData.destCoords);

            const walkCoords = routeData.walkCoordinates || extractGeojsonCoords(routeData.walkRouteGeojson) || [];
            const transitCoords = routeData.transitCoordinates || extractGeojsonCoords(routeData.transitRouteGeojson) || [];
            const finalWalkCoords = routeData.finalWalkCoordinates || extractGeojsonCoords(routeData.finalWalkRouteGeojson) || [];

            const boardingLL = transitCoords && transitCoords.length > 0 ? toLL(transitCoords[0]) : null;
            const alightingLL = transitCoords && transitCoords.length > 0 ? toLL(transitCoords[transitCoords.length - 1]) : null;

            if (origLL) bounds.extend(origLL);
            if (destLL) bounds.extend(destLL);
            if (boardingLL) bounds.extend(boardingLL);
            if (alightingLL) bounds.extend(alightingLL);

            const addCoordList = (coords) => {
                if (!coords || !Array.isArray(coords)) return;
                coords.forEach(pt => {
                    const ll = toLL(pt);
                    if (ll && isFinite(ll[0]) && isFinite(ll[1])) bounds.extend(ll);
                });
            };

            addCoordList(walkCoords);
            addCoordList(transitCoords);
            addCoordList(finalWalkCoords);

            if (bounds.isEmpty() && window._calzadaPreviewRouteBounds && !window._calzadaPreviewRouteBounds.isEmpty()) {
                bounds = window._calzadaPreviewRouteBounds;
            }
            if (bounds.isEmpty() && typeof map.getBounds === 'function') {
                try {
                    const mb = map.getBounds();
                    if (mb && !mb.isEmpty()) bounds = mb;
                } catch (_) {}
            }

            // Step 1: Measure real marker sizes (fallback 48px height, 32px width)
            const originEl = document.querySelector('.calzada-origin-marker');
            const destEl = document.querySelector('.calzada-dest-marker');
            let markerHeight = 48;
            let markerWidth = 32;
            if (destEl) {
                const r = destEl.getBoundingClientRect();
                if (r && r.height > 0) {
                    markerHeight = Math.max(markerHeight, r.height);
                    markerWidth = Math.max(markerWidth, r.width);
                }
            }
            if (originEl) {
                const r = originEl.getBoundingClientRect();
                if (r && r.height > 0) {
                    markerHeight = Math.max(markerHeight, r.height);
                    markerWidth = Math.max(markerWidth, r.width);
                }
            }

            const padTop = markerHeight + 24;
            const padSidesBottom = Math.max(Math.round(markerWidth / 2 + 24), 40);

            // Calculate visible map rectangle excluding sheet/panel and top controls
            const isDesktop = window.innerWidth > 768;
            const topBar = document.getElementById('mapTopBar');
            const topBarRect = topBar ? topBar.getBoundingClientRect() : null;
            const topControlsBottom = topBarRect && topBarRect.bottom > 0 ? topBarRect.bottom : 0;
            const activeGuide = document.getElementById('activeGuideCard');
            const guideRect = (activeGuide && getComputedStyle(activeGuide).display !== 'none') ? activeGuide.getBoundingClientRect() : null;
            const topInset = Math.max(topControlsBottom, guideRect && guideRect.bottom > 0 ? guideRect.bottom : 0, 16);

            const directionsCard = document.getElementById('directionsCard');
            const activeNavPanel = document.getElementById('activeNavPanel');

            prevSheetState = null;
            if (!isDesktop && directionsCard && typeof window._calzadaSetSheetState === 'function') {
                const currentY = parseFloat(directionsCard.style.transform?.match(/translateY\(([^)]+)px\)/)?.[1] || 0);
                const isExpanded = directionsCard.classList.contains('expanded') || currentY < 100;
                if (isExpanded) {
                    prevSheetState = 'expanded';
                    window._calzadaSetSheetState('peek', false);
                }
            }

            const dcRect = (directionsCard && getComputedStyle(directionsCard).display !== 'none') ? directionsCard.getBoundingClientRect() : null;
            const navRect = (activeNavPanel && getComputedStyle(activeNavPanel).display !== 'none') ? activeNavPanel.getBoundingClientRect() : null;

            let leftInset = 0;
            let visibleWidth = window.innerWidth;
            let visibleHeight = window.innerHeight;

            if (isDesktop) {
                const leftPanelRight = Math.max(dcRect && dcRect.right > 0 ? dcRect.right : 0, navRect && navRect.right > 0 ? navRect.right : 0);
                leftInset = Math.max(leftPanelRight, 0);
                visibleWidth = Math.max(200, window.innerWidth - leftInset);
                visibleHeight = Math.max(200, window.innerHeight - topInset);
            } else {
                const sheetTop = dcRect && dcRect.top > 0 ? dcRect.top : (navRect && navRect.top > 0 ? navRect.top : window.innerHeight);
                visibleWidth = window.innerWidth;
                visibleHeight = Math.max(120, sheetTop - topInset);
            }

            // Step 2: Decide target box H on Page 1 and crop rectangle
            const routeTitle = isTl
                ? `Ruta papuntang ${routeData.destName || ''}`
                : `Route to ${routeData.destName || ''}`;
            const targetH = computePage1MapHeight(routeTitle, isTl);
            const targetAspect = 710 / targetH; // ~0.93 - 0.96

            let cropX = 0;
            let cropY = topInset;
            let cropW = visibleWidth;
            let cropH = visibleHeight;

            if (isDesktop) {
                // Desktop: take the LARGEST centered rectangle with aspect 710:targetH inside visible area
                const visibleAspect = visibleWidth / visibleHeight;
                if (visibleAspect >= targetAspect) {
                    cropH = visibleHeight;
                    cropW = Math.round(cropH * targetAspect);
                    cropX = leftInset + Math.round((visibleWidth - cropW) / 2);
                    cropY = topInset;
                } else {
                    cropW = visibleWidth;
                    cropH = Math.round(cropW / targetAspect);
                    cropX = leftInset;
                    cropY = topInset + Math.round((visibleHeight - cropH) / 2);
                }
            } else {
                // Mobile: use visible map area as is
                cropX = 0;
                cropY = topInset;
                cropW = visibleWidth;
                cropH = visibleHeight;
            }

            const fitPadding = {
                top: Math.round(cropY + padTop),
                bottom: Math.round((window.innerHeight - (cropY + cropH)) + padSidesBottom),
                left: Math.round(cropX + padSidesBottom),
                right: Math.round((window.innerWidth - (cropX + cropW)) + padSidesBottom)
            };

            let camera = null;
            if (!bounds.isEmpty()) {
                try {
                    camera = map.cameraForBounds(bounds, {
                        padding: fitPadding,
                        bearing: 0,
                        pitch: 0,
                        maxZoom: 16.5
                    });
                } catch (_) {}
            }

            if (!camera && !bounds.isEmpty()) {
                try {
                    camera = map.cameraForBounds(bounds, {
                        padding: {
                            left: Math.min(fitPadding.left, 40),
                            right: Math.min(fitPadding.right, 40),
                            top: Math.min(fitPadding.top, 50),
                            bottom: Math.min(fitPadding.bottom, 40)
                        },
                        bearing: 0,
                        pitch: 0,
                        maxZoom: 16.5
                    });
                } catch (_) {}
            }

            if (camera && camera.center && isFinite(camera.center.lng) && isFinite(camera.center.lat) && isFinite(camera.zoom)) {
                map.jumpTo({
                    center: camera.center,
                    zoom: camera.zoom,
                    bearing: 0,
                    pitch: 0
                });
            }

            // Wait for 'idle' and map.areTilesLoaded() (8 s on a slow phone connection; after that
            // the PDF uses the offline route diagram instead of waiting longer)
            await waitForMapTilesLoaded(map, 8000);

            // Verification loop: verify with map.project() that marker boxes have >= 12px clearance
            const checkPinsInsideCrop = () => {
                const checkPts = [];
                if (origLL) checkPts.push(origLL);
                if (destLL) checkPts.push(destLL);
                if (boardingLL) checkPts.push(boardingLL);
                if (alightingLL) checkPts.push(alightingLL);

                for (const ptLL of checkPts) {
                    const pt = map.project(ptLL);
                    const minX = pt.x - markerWidth / 2;
                    const maxX = pt.x + markerWidth / 2;
                    const minY = pt.y - markerHeight;
                    const maxY = pt.y;

                    if (minX < cropX + 12 ||
                        maxX > cropX + cropW - 12 ||
                        minY < cropY + 12 ||
                        maxY > cropY + cropH - 12) {
                        return false;
                    }
                }
                return true;
            };

            // Zoom out until the pins fit. Positions do not need tiles, so check first and wait for
            // the tiles once at the end (waiting after every step could take 12 s on its own).
            let zoomTries = 0;
            while (zoomTries < 4 && !checkPinsInsideCrop()) {
                zoomTries++;
                const curZoom = map.getZoom();
                map.jumpTo({ zoom: curZoom - 0.25 });
            }
            if (zoomTries > 0) {
                try { await waitForMapTilesLoaded(map, 5000); } catch (_) { /* use what has loaded */ }
            }

            try {
                window._calzadaLastMapCropVerification = {
                    cropX, cropY, cropW, cropH,
                    markerWidth, markerHeight,
                    pinsInside: checkPinsInsideCrop(),
                    zoomTries,
                    finalZoom: map.getZoom()
                };
            } catch (_) {}

            // Fresh repaint right before cropping WebGL canvas
            map.triggerRepaint();
            await new Promise(r => { map.once('render', r); setTimeout(r, 1500); });

            const mapCanvas = map.getCanvas();
            const dpr = window.devicePixelRatio || 1;

            const sx = Math.max(0, Math.round(cropX * dpr));
            const sy = Math.max(0, Math.round(cropY * dpr));
            const sw = Math.max(1, Math.min(mapCanvas.width - sx, Math.round(cropW * dpr)));
            const sh = Math.max(1, Math.min(mapCanvas.height - sy, Math.round(cropH * dpr)));

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = sw;
            cropCanvas.height = sh;
            const ctx = cropCanvas.getContext('2d');
            ctx.drawImage(mapCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            // Draw DOM markers onto the cropped image at their exact positions using map.project()
            const toCanvasPt = (ll) => {
                const validLL = toLL(ll);
                const pt = map.project(validLL || ll);
                return {
                    x: (pt.x - cropX) * dpr,
                    y: (pt.y - cropY) * dpr
                };
            };

            // Draw dotted final walk line on cropCanvas BEFORE markers if route has final walk
            if (finalWalkCoords && finalWalkCoords.length >= 2 && routeData.selectedMode !== 'walking') {
                ctx.save();
                ctx.strokeStyle = '#64748B';
                ctx.lineWidth = 5 * dpr;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.setLineDash([8 * dpr, 8 * dpr]);
                ctx.beginPath();
                const p0 = toCanvasPt(finalWalkCoords[0]);
                ctx.moveTo(p0.x, p0.y);
                for (let i = 1; i < finalWalkCoords.length; i++) {
                    const pi = toCanvasPt(finalWalkCoords[i]);
                    ctx.lineTo(pi.x, pi.y);
                }
                ctx.stroke();
                ctx.restore();
            }

            // 1. Origin marker (blue dot, white ring)
            if (origLL) {
                const p = toCanvasPt(origLL);
                ctx.save();
                ctx.shadowColor = 'rgba(28, 110, 242, 0.45)';
                ctx.shadowBlur = 6 * dpr;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 8 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(p.x, p.y, 5 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = '#1C6EF2';
                ctx.fill();
                ctx.restore();
            }

            // 2. Boarding point marker (white circle with blue ring)
            if (boardingLL && (!origLL || Math.hypot(boardingLL[0] - origLL[0], boardingLL[1] - origLL[1]) > 0.0001)) {
                const p = toCanvasPt(boardingLL);
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                ctx.shadowBlur = 4 * dpr;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 7 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = '#3B82F6';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                ctx.restore();
            }

            // 3. Drop-off point marker (alighting point)
            if (alightingLL && destLL && Math.hypot(alightingLL[0] - destLL[0], alightingLL[1] - destLL[1]) > 0.0001) {
                const p = toCanvasPt(alightingLL);
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                ctx.shadowBlur = 4 * dpr;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 7 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = '#2272C3';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4 * dpr, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();
                ctx.restore();
            }

            // 4. Destination marker (red pin)
            if (destLL) {
                const p = toCanvasPt(destLL);
                ctx.save();
                ctx.shadowColor = 'rgba(239, 68, 68, 0.45)';
                ctx.shadowBlur = 6 * dpr;
                ctx.translate(p.x, p.y);
                ctx.scale(dpr, dpr);
                ctx.translate(-14, -36);
                ctx.fillStyle = '#EF4444';
                ctx.beginPath();
                ctx.moveTo(14, 0);
                ctx.bezierCurveTo(6.268, 0, 0, 6.268, 0, 14);
                ctx.bezierCurveTo(0, 22.75, 14, 36, 14, 36);
                ctx.bezierCurveTo(14, 36, 28, 22.75, 28, 14);
                ctx.bezierCurveTo(28, 6.268, 21.732, 0, 14, 0);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.arc(14, 14, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            return {
                dataUrl: cropCanvas.toDataURL('image/jpeg', 0.92),
                width: sw,
                height: sh,
                isOffline: false
            };
        } catch (err) {
            console.warn('Map capture using tiles failed or offline:', err);
            return createOfflineRouteDiagram(routeData, isTl);
        } finally {
            if (prevSheetState && typeof window._calzadaSetSheetState === 'function') {
                try { window._calzadaSetSheetState(prevSheetState, false); } catch (_) {}
            }
            map.jumpTo(prevCamera);
        }
    }

    function buildTimelineRows(routeData, isTl, depTime, arrTime) {
        const isWalkOnly = routeData.selectedMode === 'walking';
        const freeLabel = isTl ? 'Libre' : 'Free';
        const boardSub = isTl ? 'Sumakay dito' : 'Board here';
        const getOffSub = isTl ? 'Bumaba dito' : 'Get off here';
        const walkDur = routeData.walkDur || 0;
        const walkDistM = Math.round((routeData.walkDist || 0) * 1000);
        const transitDur = routeData.transitDur || 0;
        const transitDistKm = (routeData.transitDist || 0).toFixed(1);
        const regularFare = (typeof routeData.fare === 'number' && routeData.fare > 0)
            ? routeData.fare
            : ((window.CalzadaFare && typeof window.CalzadaFare.fareFor === 'function')
                ? window.CalzadaFare.fareFor(routeData.transitDist || 0, 'regular')
                : 14);
        const fareStr = window.CalzadaFare?.formatPeso ? window.CalzadaFare.formatPeso(regularFare) : `₱${regularFare.toFixed(2)}`;

        const boardTime = new Date(depTime.getTime() + walkDur * 60 * 1000);
        const stopsInfo = routeData.lastItineraryStops || {};
        const boardAt = stopsInfo.boardAt || 'National Highway';
        const alightAt = stopsInfo.alightAt || routeData.destName;

        let rowsHtml = '';

        const renderStop = (timeStr, ringColor, nameStr, subStr) => `
            <div style="display: flex; align-items: flex-start; gap: 12px; margin-bottom: 4px;">
                <div style="width: 52px; font-size: 11px; font-weight: 600; color: #5B6B7C; text-align: right; padding-top: 1px;">${escapeHtml(timeStr)}</div>
                <div style="width: 16px; display: flex; justify-content: center; padding-top: 3px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; border: 2.5px solid ${ringColor}; background: #FFFFFF; display: block; box-sizing: border-box;"></span>
                </div>
                <div style="flex-grow: 1;">
                    <div style="font-size: 12px; font-weight: 700; color: #0E2A47;">${escapeHtml(nameStr)}</div>
                    ${subStr ? `<div style="font-size: 10.5px; color: #5B6B7C;">${escapeHtml(subStr)}</div>` : ''}
                </div>
            </div>
        `;

        const renderLeg = (isWalk, metaStr, extraStr) => `
            <div style="display: flex; align-items: stretch; gap: 12px; min-height: 28px; margin-bottom: 4px;">
                <div style="width: 52px;"></div>
                <div style="width: 16px; display: flex; justify-content: center;">
                    <div style="width: 0; border-left: ${isWalk ? '2px dashed #94A3B8' : '3px solid #378ADD'}; height: 100%;"></div>
                </div>
                <div style="flex-grow: 1; padding: 2px 0 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #0E2A47;">
                        <span style="font-weight: 600;">${escapeHtml(metaStr)}</span>
                        ${extraStr ? `<span style="font-size: 10.5px; font-weight: 700; color: ${isWalk ? '#5B6B7C' : '#378ADD'};">${escapeHtml(extraStr)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;

        if (isWalkOnly) {
            rowsHtml += renderStop(formatTime12(depTime), '#1C6EF2', routeData.originName, null);
            const walkMeta = isTl
                ? `Maglakad ${formatDistanceMeters(walkDistM)} · ${walkDur} min`
                : `Walk ${formatDistanceMeters(walkDistM)} · ${walkDur} min`;
            rowsHtml += renderLeg(true, walkMeta, freeLabel);
            rowsHtml += renderStop(formatTime12(arrTime), '#EF4444', routeData.destName, null);
            return rowsHtml;
        }

        // Jeepney route
        rowsHtml += renderStop(formatTime12(depTime), '#1C6EF2', routeData.originName, null);
        const walk1Meta = isTl
            ? `Maglakad ${formatDistanceMeters(walkDistM)} · ${walkDur} min`
            : `Walk ${formatDistanceMeters(walkDistM)} · ${walkDur} min`;
        rowsHtml += renderLeg(true, walk1Meta, freeLabel);

        rowsHtml += renderStop(formatTime12(boardTime), '#378ADD', boardAt, boardSub);

        const signboard = routeData.transitRouteGeojson?.signboard
            || routeData.transitRouteGeojson?.routeName
            || routeData.transitRouteGeojson?.route_name;
        const jeepMeta = `Jeepney · ${transitDur} min · ${transitDistKm} km${signboard ? ` (${(isTl ? 'Karatula' : 'Signboard')}: ${signboard})` : ''}`;
        rowsHtml += renderLeg(false, jeepMeta, fareStr);

        if (stopsInfo.finalWalkM > 0) {
            const alightTime = new Date(boardTime.getTime() + transitDur * 60 * 1000);
            rowsHtml += renderStop(formatTime12(alightTime), '#378ADD', alightAt, getOffSub);
            const walk2Meta = isTl
                ? `Maglakad ${formatDistanceMeters(stopsInfo.finalWalkM)} · ${stopsInfo.finalWalkMin || 2} min`
                : `Walk ${formatDistanceMeters(stopsInfo.finalWalkM)} · ${stopsInfo.finalWalkMin || 2} min`;
            rowsHtml += renderLeg(true, walk2Meta, freeLabel);
            rowsHtml += renderStop(formatTime12(arrTime), '#EF4444', routeData.destName, null);
        } else {
            let alightSub = getOffSub;
            if (alightAt && alightAt.toLowerCase() !== (routeData.destName || '').toLowerCase()) {
                alightSub = isTl ? `Bumaba sa ${alightAt}` : `Get off at ${alightAt}`;
            }
            rowsHtml += renderStop(formatTime12(arrTime), '#EF4444', routeData.destName, alightSub);
        }

        return rowsHtml;
    }

    function buildDirectionsList(routeData, startIndex = 0, rowGap = 6) {
        const steps = routeData.activeRouteSteps || [];
        if (!steps || steps.length === 0) {
            return '<div style="font-size: 11px; color: #5B6B7C;">No step-by-step directions available.</div>';
        }

        const stopsInfo = routeData.lastItineraryStops || {};
        const boardAt = (stopsInfo.boardAt || '').trim();
        const alightAt = (stopsInfo.alightAt || routeData.destName || '').trim();

        const fmtDist = (m) => formatDistanceMeters(m);

        return steps.map((step, idx) => {
            const isLast = (idx === steps.length - 1);
            const nextMode = (idx + 1 < steps.length) ? steps[idx + 1].mode : null;
            const prevStep = idx > 0 ? steps[idx - 1] : null;
            const prevName = prevStep ? (prevStep.name || '').trim() : '';

            let stepStopName = (step.stopName || '').trim();
            let stepGetOffStop = (step.getOffStop || '').trim();

            if (step.mode === 'foot' && nextMode && (nextMode === 'driving' || nextMode === 'jeepney')) {
                stepStopName = boardAt || stepStopName;
            }
            if ((step.mode === 'driving' || step.mode === 'jeepney') && (isLast || (nextMode && nextMode === 'foot'))) {
                stepStopName = alightAt || stepStopName;
                stepGetOffStop = alightAt || stepGetOffStop;
            }

            let text = '';
            if (typeof window.formatStepInstruction === 'function') {
                text = window.formatStepInstruction(step, step.mode, {
                    isLastStep: isLast,
                    nextMode,
                    steps,
                    index: idx,
                    prevName,
                    stopName: stepStopName,
                    getOffStop: stepGetOffStop
                });
            } else {
                text = step.instruction || step.name || 'Proceed along route';
            }

            const distStr = step.distance ? fmtDist(step.distance) : '';
            const stepNum = (startIndex || 0) + idx + 1;
            const mb = isLast ? 0 : Math.max(6, rowGap != null ? rowGap : 6);

            return `
                <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: ${mb}px; font-size: 11px; line-height: 1.35;">
                    <span style="display: inline-flex; align-items: center; justify-content: center; width: 17px; height: 17px; border-radius: 50%; background: #F1F5F9; color: #0E2A47; font-size: 9.5px; font-weight: 700; flex-shrink: 0;">${stepNum}</span>
                    <span style="color: #0E2A47; flex-grow: 1;">${escapeHtml(text)}</span>
                    ${distStr ? `<span style="color: #64748B; font-size: 10px; font-weight: 500; flex-shrink: 0;">${escapeHtml(distStr)}</span>` : ''}
                </div>
            `;
        }).join('');
    }

    function createPageElement({
        logoDataUrl,
        routeTitle,
        subtitleText,
        generatedDateText,
        originLabel,
        destLabel,
        modeLabel,
        timesLabel,
        totalDurationText,
        totalDistanceText,
        fareSummaryText,
        mapSnapshotDataUrl,
        mapSnapshotWidth,
        mapSnapshotHeight,
        mapIsOffline,
        timelineRowsHtml,
        directionsListHtml,
        isTl,
        isContinuation = false,
        pageNumber = 1,
        totalPages = 1
    }) {
        let boxWidth = 710;
        let boxHeight = 795;
        if (mapSnapshotWidth && mapSnapshotHeight) {
            const ratio = mapSnapshotWidth / mapSnapshotHeight;
            boxWidth = 710;
            boxHeight = Math.min(805, Math.round(710 / ratio));
        }

        const page = document.createElement('div');
        page.className = 'calzada-pdf-page';
        page.style.cssText = `
            width: 794px;
            min-height: 1123px;
            max-height: 1123px;
            background: #FFFFFF;
            color: #0E2A47;
            font-family: 'Outfit', 'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            box-sizing: border-box;
            padding: 34px 42px 28px;
            margin: 0;
            line-height: 1.35;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: relative;
        `;

        if (!isContinuation) {
            page.innerHTML = `
                <div>
                    <!-- 1. Header -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #378ADD; padding-bottom: 12px; margin-bottom: 14px;">
                        <div>
                            <div class="pdf-logo-box" style="height: 30px; display: inline-block; margin-bottom: 5px;">
                                ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Calzada" style="height: 30px; width: auto; display: block;">` : `<div style="font-size: 22px; font-weight: 800; color: #378ADD; letter-spacing: -0.02em; font-family: 'Sora', sans-serif;">CALZADA</div>`}
                            </div>
                            <div style="font-size: 18px; font-weight: 700; color: #0E2A47; font-family: 'Sora', sans-serif;">
                                ${escapeHtml(routeTitle)}
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 10.5px; color: #5B6B7C; padding-top: 4px;">
                            <div style="font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9.5px; margin-bottom: 2px;">
                                ${isTl ? 'GABAY SA RUTA (OFFLINE)' : 'OFFLINE ROUTE GUIDE'}
                            </div>
                            <div>${escapeHtml(generatedDateText)}</div>
                        </div>
                    </div>

                    <!-- 2. Summary Card -->
                    <div style="background: #F8FAFC; border: 1px solid #DCE5EE; border-radius: 9px; padding: 10px 14px; margin-bottom: 14px;">
                        <div style="display: grid; grid-template-columns: 1.1fr 1.1fr 0.9fr 0.9fr; gap: 8px; margin-bottom: 8px;">
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'MULA SA' : 'FROM'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #0E2A47; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(originLabel)}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'PAPUNTA SA' : 'TO'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #0E2A47; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(destLabel)}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'PARAAN' : 'MODE'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #378ADD;">${escapeHtml(modeLabel)}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'ORAS' : 'SCHEDULE'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #0E2A47;">${escapeHtml(timesLabel)}</div>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1.6fr; gap: 8px; padding-top: 8px; border-top: 1px dashed #DCE5EE;">
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'KABUUANG ORAS' : 'TOTAL TIME'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #0E2A47;">${escapeHtml(totalDurationText)}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'KABUUANG DISTANSYA' : 'TOTAL DISTANCE'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #0E2A47;">${escapeHtml(totalDistanceText)}</div>
                            </div>
                            <div>
                                <div style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: #5B6B7C; letter-spacing: 0.04em;">${isTl ? 'PASAHE' : 'ESTIMATED FARE'}</div>
                                <div style="font-size: 12px; font-weight: 600; color: #0E2A47;">${escapeHtml(fareSummaryText)}</div>
                            </div>
                        </div>
                    </div>

                    ${mapSnapshotDataUrl ? `
                    <!-- 3. Portrait Route Map Snapshot (Page 1) -->
                    <div style="margin-bottom: 8px; display: flex; flex-direction: column; align-items: center;">
                        <div id="pdfMapSnapshotBox" style="border-radius: 8px; overflow: hidden; border: 1px solid #DCE5EE; background: #E2E8F0; width: ${boxWidth}px; height: ${boxHeight}px; position: relative;">
                            <img src="${mapSnapshotDataUrl}" alt="Route Map" style="width: ${boxWidth}px; height: ${boxHeight}px; object-fit: contain; display: block;">
                        </div>
                        ${!mapIsOffline ? `
                        <div style="width: ${boxWidth}px; font-size: 9px; color: #64748B; margin-top: 4px; text-align: right;">
                            © OpenStreetMap contributors
                        </div>
                        ` : ''}
                    </div>
                    ${timelineRowsHtml ? `
                    <div style="margin-top: 10px; margin-bottom: 8px;">
                        <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            ${isTl ? 'TIMELINE NG BYAHE' : 'TRIP LEGS TIMELINE'}
                        </div>
                        <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;">
                            ${timelineRowsHtml}
                        </div>
                    </div>
                    ` : ''}
                    ` : `
                    <!-- Fallback: Timeline & Directions if map is unavailable -->
                    ${timelineRowsHtml ? `
                    <div style="margin-bottom: 12px;">
                        <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            ${isTl ? 'TIMELINE NG BYAHE' : 'TRIP LEGS TIMELINE'}
                        </div>
                        <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;">
                            ${timelineRowsHtml}
                        </div>
                    </div>
                    ` : ''}
                    ${directionsListHtml ? `
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            ${isTl ? 'MGA HAKBANG SA DIREKSYON' : 'STEP-BY-STEP DIRECTIONS'}
                        </div>
                        <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;">
                            ${directionsListHtml}
                        </div>
                    </div>
                    ` : ''}
                    `}
                </div>

                <!-- Footer -->
                <div style="border-top: 1px solid #E2E8F0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #64748B;">
                    <div>${isTl ? 'Ang mga pasahe ay pagtatantya batay sa gabay ng LTFRB na may bisang Setyembre 28, 2026.' : 'Fares are estimates based on the LTFRB fare guide effective September 28, 2026.'}</div>
                    <div style="display: flex; gap: 14px; align-items: center;">
                        <span>${isTl ? 'Pahina' : 'Page'} ${pageNumber} / ${totalPages}</span>
                        <span style="font-weight: 600; color: #378ADD;">calzadaph.com</span>
                    </div>
                </div>
            `;
        } else {
            // Continuation page (Page 2+: Timeline & Directions)
            page.innerHTML = `
                <div>
                    <!-- Header Continuation -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #378ADD; padding-bottom: 12px; margin-bottom: 14px;">
                        <div>
                            <div class="pdf-logo-box" style="height: 30px; display: inline-block; margin-bottom: 5px;">
                                ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Calzada" style="height: 30px; width: auto; display: block;">` : `<div style="font-size: 22px; font-weight: 800; color: #378ADD; letter-spacing: -0.02em; font-family: 'Sora', sans-serif;">CALZADA</div>`}
                            </div>
                            <div style="font-size: 18px; font-weight: 700; color: #0E2A47; font-family: 'Sora', sans-serif;">
                                ${escapeHtml(routeTitle)} <span style="font-size: 14px; font-weight: 500; color: #5B6B7C;">(${isTl ? 'Itutuloy' : 'Continued'})</span>
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 10.5px; color: #5B6B7C; padding-top: 4px;">
                            <div style="font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9.5px; margin-bottom: 2px;">
                                ${isTl ? 'GABAY SA RUTA (OFFLINE)' : 'OFFLINE ROUTE GUIDE'}
                            </div>
                            <div>${escapeHtml(generatedDateText)}</div>
                        </div>
                    </div>

                    ${timelineRowsHtml ? `
                    <!-- Trip Legs Timeline -->
                    <div style="margin-bottom: 14px;">
                        <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            ${isTl ? 'TIMELINE NG BYAHE' : 'TRIP LEGS TIMELINE'}
                        </div>
                        <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;">
                            ${timelineRowsHtml}
                        </div>
                    </div>
                    ` : ''}

                    <!-- Step-by-Step Directions -->
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            ${isTl ? 'MGA HAKBANG SA DIREKSYON' : 'STEP-BY-STEP DIRECTIONS'}
                        </div>
                        <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;">
                            ${directionsListHtml}
                        </div>
                    </div>
                </div>

                <!-- Footer -->
                <div style="border-top: 1px solid #E2E8F0; padding-top: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 9.5px; color: #64748B;">
                    <div>${isTl ? 'Ang mga pasahe ay pagtatantya batay sa gabay ng LTFRB na may bisang Setyembre 28, 2026.' : 'Fares are estimates based on the LTFRB fare guide effective September 28, 2026.'}</div>
                    <div style="display: flex; gap: 14px; align-items: center;">
                        <span>${isTl ? 'Pahina' : 'Page'} ${pageNumber} / ${totalPages}</span>
                        <span style="font-weight: 600; color: #378ADD;">calzadaph.com</span>
                    </div>
                </div>
            `;
        }

        return page;
    }

    async function generateRoutePdfBlob(routeData) {
        const [htmlToImage, JsPdfCtor] = await Promise.all([
            loadHtmlToImage(),
            loadJsPdf()
        ]);

        const isTl = (window.currentLang === 'tl' || document.documentElement.lang === 'tl');
        const now = new Date();
        const generatedDateText = formatGeneratedDate(now, isTl);

        const destName = routeData.destName || (isTl ? 'Pupuntahan' : 'Destination');
        const originLabel = sanitizeOriginLabel(routeData.originName, isTl);
        const destLabel = destName;

        const routeTitle = isTl
            ? `Ruta papuntang ${destName}`
            : `Route to ${destName}`;

        const isWalkOnly = routeData.selectedMode === 'walking';
        const modeLabel = isWalkOnly ? (isTl ? 'Lakad' : 'Walk') : 'Jeepney';

        const stopsInfo = routeData.lastItineraryStops || {};
        const finalWalkMin = (!isWalkOnly && stopsInfo.finalWalkMin) ? stopsInfo.finalWalkMin : 0;
        const finalWalkM = (!isWalkOnly && stopsInfo.finalWalkM) ? stopsInfo.finalWalkM : 0;

        const depTime = routeData.journeyStartedAt
            ? new Date(routeData.journeyStartedAt)
            : (routeData.leaveAt ? new Date(routeData.leaveAt) : now);
        const totalMin = (routeData.walkDur || 0) + (routeData.transitDur || 0) + finalWalkMin;
        const arrTime = routeData.arriveAt
            ? new Date(routeData.arriveAt)
            : new Date(depTime.getTime() + totalMin * 60 * 1000);
        const timesLabel = isTl
            ? `Alis ${formatTime12(depTime)} · Dating ${formatTime12(arrTime)}`
            : `Leave ${formatTime12(depTime)} · Arrive ${formatTime12(arrTime)}`;

        const totalDurationText = `${totalMin} min`;
        const totalDistanceText = `${((routeData.walkDist || 0) + (routeData.transitDist || 0) + (finalWalkM / 1000)).toFixed(1)} km`;

        let fareSummaryText = '';
        if (isWalkOnly) {
            fareSummaryText = isTl ? 'Libre' : 'Free';
        } else {
            const transitDist = Number(routeData.transitDist) || 0;
            const fareData = (window.CalzadaFare && typeof window.CalzadaFare.fares === 'function')
                ? window.CalzadaFare.fares(transitDist)
                : { regular: 14.00, discounted: 11.20 };

            // Use the same per-leg fare values the planner/itinerary already computed (fare-calc.js on the jeepney leg distance only)
            let regularFare = (typeof routeData.fare === 'number' && routeData.fare > 0)
                ? routeData.fare
                : fareData.regular;

            // Runtime check: PDF fare == on-screen fare for the same route
            if (typeof routeData.fare === 'number' && routeData.fare > 0 && Math.abs(regularFare - routeData.fare) > 0.01) {
                console.warn(`[RoutePDF] Fare reconciliation: adjusting PDF fare ₱${regularFare} to match on-screen fare ₱${routeData.fare}`);
                regularFare = routeData.fare;
            }

            routeData._pdfRegularFare = regularFare;
            routeData._pdfDiscountedFare = fareData.discounted;

            const regStr = window.CalzadaFare?.formatPeso ? window.CalzadaFare.formatPeso(regularFare) : `₱${regularFare.toFixed(2)}`;
            const discStr = window.CalzadaFare?.formatPeso ? window.CalzadaFare.formatPeso(fareData.discounted) : `₱${fareData.discounted.toFixed(2)}`;
            fareSummaryText = isTl
                ? `Regular: ${regStr} · Estudyante/Senior/PWD: ${discStr}`
                : `Regular: ${regStr} · Student/Senior/PWD: ${discStr}`;
        }

        // Map snapshot
        let mapSnapshotData = null;
        if (routeData.map) {
            try {
                mapSnapshotData = await captureRouteMapSnapshot(routeData.map, routeData, isTl);
            } catch (e) {
                console.warn('Map capture failed:', e);
                mapSnapshotData = createOfflineRouteDiagram(routeData, isTl);
            }
        } else {
            mapSnapshotData = createOfflineRouteDiagram(routeData, isTl);
        }

        const mapSnapshotDataUrl = mapSnapshotData?.dataUrl;
        const mapSnapshotWidth = mapSnapshotData?.width;
        const mapSnapshotHeight = mapSnapshotData?.height;
        const mapIsOffline = !!mapSnapshotData?.isOffline;

        // Timeline
        const timelineRowsHtml = buildTimelineRows(routeData, isTl, depTime, arrTime);

                // Embedded Calzada brand logo data URL (always available, offline-safe)
        const logoDataUrl = 'data:image/png;base64,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';
        // Font CSS (Outfit + Sora with Latin-Ext for ₱)
        let fontEmbedCSS = '';
        try {
            fontEmbedCSS = await getFontCss();
        } catch (_) {}

        // Measure / Paginate
        // Measure / Paginate
        // Fill pages by measured height, not a fixed count.
        const steps = routeData.activeRouteSteps || [];
        const pageConfigs = [];

        // Dynamic height measurement and packing helper
        function paginateContinuationSteps(allSteps, hasTimelineOnP2) {
            if (!allSteps || allSteps.length === 0) return [];

            const measureBox = document.createElement('div');
            measureBox.style.cssText = 'position:fixed;left:-9999px;top:0;width:710px;visibility:hidden;box-sizing:border-box;font-family:\'Outfit\',\'Sora\',-apple-system,sans-serif;line-height:1.35;';
            document.body.appendChild(measureBox);

            let headerHeight = 74;
            let timelineHeight = 0;
            let dirOverhead = 43;
            const stepHeights = [];

            try {
                // Measure continuation header
                measureBox.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #378ADD; padding-bottom: 12px; margin-bottom: 14px;">
                        <div>
                            <div class="pdf-logo-box" style="height: 30px; display: inline-block; margin-bottom: 5px;"></div>
                            <div style="font-size: 18px; font-weight: 700; color: #0E2A47; font-family: 'Sora', sans-serif;">
                                ${escapeHtml(routeTitle)} <span style="font-size: 14px; font-weight: 500; color: #5B6B7C;">(${isTl ? 'Itutuloy' : 'Continued'})</span>
                            </div>
                        </div>
                        <div style="text-align: right; font-size: 10.5px; color: #5B6B7C; padding-top: 4px;">
                            <div style="font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; font-size: 9.5px; margin-bottom: 2px;">
                                ${isTl ? 'GABAY SA RUTA (OFFLINE)' : 'OFFLINE ROUTE GUIDE'}
                            </div>
                            <div>${escapeHtml(generatedDateText)}</div>
                        </div>
                    </div>
                `;
                if (measureBox.firstElementChild) {
                    headerHeight = Math.ceil(measureBox.firstElementChild.getBoundingClientRect().height) + 14;
                }

                if (hasTimelineOnP2 && timelineRowsHtml) {
                    measureBox.innerHTML = `
                        <div style="margin-bottom: 14px;">
                            <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                                ${isTl ? 'TIMELINE NG BYAHE' : 'TRIP LEGS TIMELINE'}
                            </div>
                            <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;">
                                ${timelineRowsHtml}
                            </div>
                        </div>
                    `;
                    if (measureBox.firstElementChild) {
                        timelineHeight = Math.ceil(measureBox.firstElementChild.getBoundingClientRect().height) + 14;
                    }
                }

                measureBox.innerHTML = `
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 11px; font-weight: 700; color: #0E2A47; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px;">
                            ${isTl ? 'MGA HAKBANG SA DIREKSYON' : 'STEP-BY-STEP DIRECTIONS'}
                        </div>
                        <div id="measureStepsBox" style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; background: #FFFFFF;"></div>
                    </div>
                `;
                if (measureBox.firstElementChild) {
                    dirOverhead = Math.ceil(measureBox.firstElementChild.getBoundingClientRect().height);
                }

                const sBox = measureBox.querySelector('#measureStepsBox');
                for (let i = 0; i < allSteps.length; i++) {
                    sBox.innerHTML = buildDirectionsList({ ...routeData, activeRouteSteps: [allSteps[i]] }, i, 0);
                    const rowEl = sBox.firstElementChild;
                    stepHeights.push(rowEl ? Math.ceil(rowEl.getBoundingClientRect().height) : 22);
                }
            } catch (_) {
                for (let i = stepHeights.length; i < allSteps.length; i++) {
                    stepHeights.push(22);
                }
            } finally {
                measureBox.remove();
            }

            // Usable content area height: 1123 - 34 (top pad) - 28 (bottom pad) - 34 (footer area) = 1027px
            const maxContentHeight = 1022;
            const p2Avail = maxContentHeight - headerHeight - timelineHeight - dirOverhead;
            const nextAvail = maxContentHeight - headerHeight - dirOverhead;

            const DEFAULT_GAP = 8;
            const MIN_GAP = 6;

            const calcHeight = (startIdx, len, gap) => {
                let h = 0;
                for (let j = 0; j < len; j++) {
                    h += stepHeights[startIdx + j];
                }
                h += Math.max(0, len - 1) * gap;
                return h;
            };

            const chunks = [];
            let curIdx = 0;
            let pageNum = 0;

            while (curIdx < allSteps.length) {
                const availH = (pageNum === 0) ? p2Avail : nextAvail;
                const rem = allSteps.length - curIdx;

                // How many steps fit with DEFAULT_GAP
                let count = 0;
                for (let c = 1; c <= rem; c++) {
                    if (calcHeight(curIdx, c, DEFAULT_GAP) <= availH) {
                        count = c;
                    } else {
                        break;
                    }
                }
                if (count === 0) count = 1;

                let usedGap = DEFAULT_GAP;
                const overflow = rem - count;

                // Never leave a single orphan row or the last 1–2 rows alone on a new page
                // if they fit by reducing the gap between rows to the minimum (6px).
                if (overflow > 0 && overflow <= 2) {
                    const testCount = count + overflow;
                    if (calcHeight(curIdx, testCount, MIN_GAP) <= availH) {
                        count = testCount;
                        usedGap = MIN_GAP;
                    }
                }

                // If some rows remain, test if reducing gap to MIN_GAP fits more rows or all remaining
                if (count < rem && usedGap === DEFAULT_GAP) {
                    for (let c = count + 1; c <= rem; c++) {
                        if (calcHeight(curIdx, c, MIN_GAP) <= availH) {
                            count = c;
                            usedGap = MIN_GAP;
                        } else {
                            break;
                        }
                    }
                    const newOverflow = rem - count;
                    if (newOverflow > 0 && newOverflow <= 2) {
                        const testCount = count + newOverflow;
                        if (calcHeight(curIdx, testCount, MIN_GAP) <= availH) {
                            count = testCount;
                            usedGap = MIN_GAP;
                        }
                    }
                }

                chunks.push({
                    steps: allSteps.slice(curIdx, curIdx + count),
                    startIndex: curIdx,
                    gap: usedGap
                });

                curIdx += count;
                pageNum++;
            }

            return chunks;
        }

        if (mapSnapshotDataUrl) {
            const p1MapHeight = (mapSnapshotWidth && mapSnapshotHeight)
                ? Math.min(805, Math.round(710 * (mapSnapshotHeight / mapSnapshotWidth)))
                : 795;

            // Estimated heights
            const estTimelineHeight = isWalkOnly ? 120 : 190;
            const estNonMapP1Height = 250;
            const p1RemainingSpace = 1033 - (estNonMapP1Height + p1MapHeight);

            // Move timeline to Page 1 only if visible map area was short and timeline fits on Page 1
            const timelineFitsOnPage1 = p1RemainingSpace >= estTimelineHeight + 15;
            const p1TimelineHtml = timelineFitsOnPage1 ? timelineRowsHtml : '';
            const p2TimelineHtml = timelineFitsOnPage1 ? '' : timelineRowsHtml;

            // Page 1
            pageConfigs.push({
                isContinuation: false,
                mapSnapshotDataUrl: mapSnapshotDataUrl,
                mapSnapshotWidth: mapSnapshotWidth,
                mapSnapshotHeight: mapSnapshotHeight,
                mapIsOffline: mapIsOffline,
                timelineRowsHtml: p1TimelineHtml,
                directionsListHtml: '',
                steps: []
            });

            // Page 2+: Directions (and Timeline if not on Page 1)
            const chunks = paginateContinuationSteps(steps, !!p2TimelineHtml);
            if (chunks.length === 0) {
                if (p2TimelineHtml) {
                    pageConfigs.push({
                        isContinuation: true,
                        mapSnapshotDataUrl: null,
                        timelineRowsHtml: p2TimelineHtml,
                        directionsListHtml: '',
                        steps: []
                    });
                }
            } else {
                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    pageConfigs.push({
                        isContinuation: true,
                        mapSnapshotDataUrl: null,
                        timelineRowsHtml: (i === 0) ? p2TimelineHtml : '',
                        directionsListHtml: buildDirectionsList({ ...routeData, activeRouteSteps: chunk.steps }, chunk.startIndex, chunk.gap),
                        steps: chunk.steps
                    });
                }
            }
        } else {
            // No map snapshot available
            const chunks = paginateContinuationSteps(steps, false);
            if (chunks.length === 0) {
                pageConfigs.push({
                    isContinuation: false,
                    mapSnapshotDataUrl: null,
                    timelineRowsHtml: timelineRowsHtml,
                    directionsListHtml: '',
                    steps: []
                });
            } else {
                // First chunk on Page 1 with summary and timeline
                pageConfigs.push({
                    isContinuation: false,
                    mapSnapshotDataUrl: null,
                    timelineRowsHtml: timelineRowsHtml,
                    directionsListHtml: buildDirectionsList({ ...routeData, activeRouteSteps: chunks[0].steps }, chunks[0].startIndex, chunks[0].gap),
                    steps: chunks[0].steps
                });
                for (let i = 1; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    pageConfigs.push({
                        isContinuation: true,
                        mapSnapshotDataUrl: null,
                        timelineRowsHtml: '',
                        directionsListHtml: buildDirectionsList({ ...routeData, activeRouteSteps: chunk.steps }, chunk.startIndex, chunk.gap),
                        steps: chunk.steps
                    });
                }
            }
        }

        const totalPages = pageConfigs.length;
        const pageElements = pageConfigs.map((cfg, idx) => {
            return createPageElement({
                logoDataUrl,
                routeTitle,
                generatedDateText,
                originLabel,
                destLabel,
                modeLabel,
                timesLabel,
                totalDurationText,
                totalDistanceText,
                fareSummaryText,
                mapSnapshotDataUrl: cfg.mapSnapshotDataUrl,
                mapSnapshotWidth: cfg.mapSnapshotWidth,
                mapSnapshotHeight: cfg.mapSnapshotHeight,
                mapIsOffline: cfg.mapIsOffline,
                timelineRowsHtml: cfg.timelineRowsHtml,
                directionsListHtml: cfg.directionsListHtml,
                isTl,
                isContinuation: cfg.isContinuation,
                pageNumber: idx + 1,
                totalPages
            });
        });

        // Offscreen container
        const offscreenContainer = document.createElement('div');
        offscreenContainer.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1000;width:794px;';
        pageElements.forEach(el => offscreenContainer.appendChild(el));
        document.body.appendChild(offscreenContainer);

        try {
            const p1 = pageElements[0];
            const p1MapBox = p1 ? p1.querySelector('#pdfMapSnapshotBox') : null;
            if (p1MapBox) {
                const mapWrap = p1MapBox.parentElement;
                const footer = p1.lastElementChild;
                if (mapWrap && footer) {
                    window._calzadaLastPage1BlankSpace = Math.round(footer.getBoundingClientRect().top - mapWrap.getBoundingClientRect().bottom);
                }
            }
        } catch (_) {}

        const pdfW = 210;
        const pdfH = 297;

        // Await all images inside offscreenContainer to decode
        const imgs = Array.from(offscreenContainer.querySelectorAll('img'));
        await Promise.all(imgs.map(async (img) => {
            if (img.complete && img.naturalWidth > 0) return;
            if (typeof img.decode === 'function') {
                try { await img.decode(); return; } catch (_) {}
            }
            await new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 300); });
        }));

        const isWebKit = /iP(hone|ad|od)/i.test(navigator.userAgent) || 
                         (/Safari\//i.test(navigator.userAgent) && !/Chrome|Chromium|Android/i.test(navigator.userAgent));

        const opts = {
            pixelRatio: 2,
            fontEmbedCSS: fontEmbedCSS || undefined,
            skipFonts: !fontEmbedCSS,
            backgroundColor: '#FFFFFF',
            quality: 0.90
        };

        try {
            const doc = new JsPdfCtor({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            window._calzadaLastPdfPages = [];
            for (let i = 0; i < pageElements.length; i++) {
                const pageEl = pageElements[i];
                if (i > 0) doc.addPage();

                // Safari draws images only from the second render: warm up once (the first page loads
                // the fonts and images for the rest), not on every page, which doubled the time.
                if (isWebKit && i === 0) {
                    try { await htmlToImage.toCanvas(pageEl, opts); } catch (_) {}
                }

                const canvas = await htmlToImage.toCanvas(pageEl, opts);
                const jpeg = canvas.toDataURL('image/jpeg', 0.90);
                window._calzadaLastPdfPages.push(jpeg);
                doc.addImage(jpeg, 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');

                // DIRECT jsPDF INJECTION FOR MAP SNAPSHOT (if on this page)
                const mapBox = pageEl.querySelector('#pdfMapSnapshotBox');
                if (mapSnapshotDataUrl && mapBox) {
                    const pR = pageEl.getBoundingClientRect();
                    const r = mapBox.getBoundingClientRect();
                    if (pR.width > 0 && pR.height > 0) {
                        const mx = ((r.left - pR.left) / pR.width) * pdfW;
                        const my = ((r.top - pR.top) / pR.height) * pdfH;
                        const mw = (r.width / pR.width) * pdfW;
                        const mh = (r.height / pR.height) * pdfH;
                        try {
                            doc.addImage(mapSnapshotDataUrl, mapIsOffline ? 'PNG' : 'JPEG', mx, my, mw, mh, undefined, 'FAST');
                        } catch (e) {
                            console.warn('Direct map image injection failed:', e);
                        }
                    }
                }

                // DIRECT jsPDF INJECTION FOR LOGO
                const logoBox = pageEl.querySelector('#pdfLogoBox, .pdf-logo-box');
                if (logoDataUrl && logoBox) {
                    const pR = pageEl.getBoundingClientRect();
                    const r = logoBox.getBoundingClientRect();
                    if (pR.width > 0 && pR.height > 0) {
                        const lx = ((r.left - pR.left) / pR.width) * pdfW;
                        const ly = ((r.top - pR.top) / pR.height) * pdfH;
                        const lw = (r.width / pR.width) * pdfW;
                        const lh = (r.height / pR.height) * pdfH;
                        try {
                            doc.addImage(logoDataUrl, 'PNG', lx, ly, lw, lh, undefined, 'FAST');
                        } catch (_) {}
                    }
                }
            }

            return doc.output('blob');
        } finally {
            offscreenContainer.remove();
        }
    }

    function setButtonsBusy(on) {
        document.querySelectorAll('.save-route-pdf-btn').forEach(btn => {
            btn.disabled = on;
            btn.classList.toggle('is-busy', on);
            btn.setAttribute('aria-busy', on ? 'true' : 'false');
            const txt = btn.querySelector('.save-pdf-text');
            if (txt) {
                if (on) {
                    txt.setAttribute('data-prev-text', txt.textContent);
                    const prepText = (window.t ? window.t('planner.preparing_pdf') : null) || 'Preparing PDF…';
                    txt.textContent = prepText;
                } else {
                    const prev = txt.getAttribute('data-prev-text');
                    const def = (window.t ? window.t('planner.save_pdf') : null) || 'Save as PDF';
                    txt.textContent = prev || def;
                }
            }
        });
    }

    async function exportCurrentRoute() {
        const getRouteData = window._calzadaGetRouteExportData;
        if (typeof getRouteData !== 'function') {
            throw new Error('Route export data unavailable');
        }

        const data = getRouteData();
        if (!data || (!data.destName && !data.destCoords)) {
            throw new Error('No active route to export');
        }

        setButtonsBusy(true);

        let prepToastHandle = null;
        if (typeof window.showToast === 'function') {
            const prepMsg = (window.t ? window.t('planner.preparing_pdf') : null) || 'Preparing your PDF…';
            prepToastHandle = window.showToast(prepMsg, 'loading');
        }

        let timeoutId = null;
        let blob = null;

        try {
            // PDF generation with a 60 s limit. 20 s was too short on phones: waiting for map tiles
            // on mobile data plus drawing each page in Safari often took longer.
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const err = new Error('PDF generation timed out');
                    err.name = 'TimeoutError';
                    reject(err);
                }, 60000);
            });

            blob = await Promise.race([
                generateRoutePdfBlob(data),
                timeoutPromise
            ]);

            if (prepToastHandle && typeof prepToastHandle.dismiss === 'function') {
                prepToastHandle.dismiss();
                prepToastHandle = null;
            }
        } catch (err) {
            console.error('Export route to PDF failed:', err);
            if (prepToastHandle && typeof prepToastHandle.dismiss === 'function') {
                prepToastHandle.dismiss();
                prepToastHandle = null;
            }
            if (typeof window.showToast === 'function') {
                const slow = err && err.name === 'TimeoutError';
                const key = slow ? 'planner.pdf_slow' : 'planner.pdf_failed';
                const tr = window.t ? window.t(key) : null;
                const failMsg = (tr && tr !== key) ? tr : (slow
                    ? 'The PDF is taking too long. Check your connection and try again.'
                    : "Couldn't create the PDF. Try again.");
                window.showToast(failMsg, 'error');
            }
            return;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (!blob) {
                setButtonsBusy(false);
            }
        }

        if (!blob) return;

        try {
            const fileName = buildPdfFileName(data.destName);
            const isDesktop = window.innerWidth > 768;

            let shared = false;
            // Web Share API on mobile only (with 3s timeout fallback so button never hangs)
            if (!isDesktop && typeof navigator.share === 'function') {
                try {
                    const file = new File([blob], fileName, { type: 'application/pdf' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await Promise.race([
                            navigator.share({
                                files: [file],
                                title: `Calzada - ${fileName.replace('.pdf', '')}`
                            }),
                            new Promise((_, reject) => setTimeout(() => reject(new Error('Share timed out')), 3000))
                        ]);
                        shared = true;
                    }
                } catch (e) {
                    if (e && e.name === 'AbortError') {
                        // User explicitly cancelled share sheet
                        return;
                    }
                }
            }

            if (!shared) {
                // Download file
                downloadBlob(blob, fileName);
            }

            if (typeof window.showToast === 'function') {
                const msg = (window.t ? window.t('planner.pdf_saved') : null) || 'PDF saved';
                window.showToast(msg, 'success');
            }
        } catch (err) {
            console.error('Save/share PDF failed:', err);
            if (typeof window.showToast === 'function') {
                const failMsg = (window.t ? window.t('planner.pdf_failed') : null) || "Couldn't create the PDF. Try again.";
                window.showToast(failMsg, 'error');
            }
        } finally {
            setButtonsBusy(false);
        }
    }

    return {
        exportCurrentRoute,
        generateRoutePdfBlob,
        buildPdfFileName,
        captureRouteMapSnapshot
    };
}));
