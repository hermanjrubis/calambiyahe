/**
 * ==========================================================================
 * CALZADA 360° STREET VIEW VIEWER
 * Full-screen photosphere viewer. Thin arrows lie on the road where you can
 * move, the current street is shown top-left, and there is no mini map.
 * ==========================================================================
 */

(function() {
    'use strict';

    // Camera height above the road for the car-mounted captures (meters).
    // Used to project road guides onto the ground plane.
    const CAMERA_HEIGHT_M = 2.0;
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // State
    let manifestData = null;
    let placeLinksData = null;
    let pannellumViewer = null;
    let currentNodeId = null;
    // Where we just came from, so a mis-calibrated forward click doesn't
    // silently snap the viewer back the way it came.
    let previousNodeId = null;
    let scenesConfig = {};
    let isTransitioning = false;
    let isNavLocked = false;
    let navLockTimer = null;
    let hintDismissTimer = null;
    let rafDrawId = null;

    // Pointer state
    let activeHoverConnection = null;
    let isMouseDown = false;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let rafCursorId = null;
    let lastCursorEvent = null;
    let touchStartX = 0;
    let touchStartY = 0;
    // Screen positions of the chevrons drawn last frame, for tap/click hit-testing
    let drawnChevrons = [];

    // DOM
    let overlayEl = null;
    let containerEl = null;
    let roadCanvasEl = null;
    let fadeCurtainEl = null;
    let infoTitleEl = null;
    let infoSubEl = null;
    let hudHintEl = null;
    let closeBtnEl = null;
    let compassBtnEl = null;
    let compassNeedleEl = null;
    let datePillEl = null;
    let dateTextEl = null;

    function cleanupPannellumFadeImages() {
        if (!containerEl) return;
        containerEl.querySelectorAll('.pnlm-fade-img').forEach(img => {
            img.style.opacity = '0';
            img.style.display = 'none';
            if (img.parentNode) img.parentNode.removeChild(img);
        });
    }

    async function loadData() {
        if (manifestData && placeLinksData) return;
        try {
            const [mRes, pRes] = await Promise.all([
                fetch('../assets/360/manifest.json', { cache: 'no-cache' }),
                fetch('../assets/360/place-links.json', { cache: 'no-cache' })
            ]);
            if (mRes.ok) manifestData = await mRes.json();
            if (pRes.ok) placeLinksData = await pRes.json();
        } catch (err) {
            console.error('[StreetView] Failed to load 360 manifest or place-links:', err);
        }
    }

    function initDOM() {
        if (document.getElementById('calzadaStreetviewOverlay')) {
            cacheDOMElements();
            return;
        }

        const overlayHTML = `
            <div id="calzadaStreetviewOverlay" class="calzada-streetview-overlay" style="display:none;" aria-modal="true" role="dialog" aria-label="360 street view">
                <div id="calzadaPannellumContainer" class="calzada-pannellum-container"></div>
                <canvas id="calzadaRoadCanvas" class="sv-road-canvas" aria-hidden="true"></canvas>
                <div id="streetviewFadeCurtain" class="streetview-fade-curtain"></div>

                <div class="sv-date-pill" id="svDatePill" hidden>
                    <img class="sv-date-logo" src="../assets/logo-white-64.png" width="18" height="18" alt="" aria-hidden="true">
                    <span id="svDateText"></span>
                </div>

                <div class="sv-actions">
                    <button type="button" class="sv-icon-btn sv-compass" id="svCompassBtn" aria-label="Face north" title="Face north">
                        <svg id="svCompassNeedle" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 3 L15.2 12 L8.8 12 Z" fill="#F87171"></path>
                            <path d="M12 21 L8.8 12 L15.2 12 Z" fill="#FFFFFF"></path>
                        </svg>
                    </button>
                    <button type="button" class="sv-icon-btn" id="streetviewCloseBtn" aria-label="Exit 360 view" title="Exit (Esc)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="sv-info-card" id="svInfoCard">
                    <div class="sv-info-grip" aria-hidden="true"></div>
                    <div class="sv-info-title" id="svInfoTitle"></div>
                    <div class="sv-info-sub" id="svInfoSub"></div>
                </div>

                <div class="sv-hint" id="streetviewControlsHud">Drag to look around · Tap the arrows on the road to move</div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', overlayHTML);
        cacheDOMElements();
        bindEvents();
    }

    function cacheDOMElements() {
        overlayEl = document.getElementById('calzadaStreetviewOverlay');
        containerEl = document.getElementById('calzadaPannellumContainer');
        roadCanvasEl = document.getElementById('calzadaRoadCanvas');
        fadeCurtainEl = document.getElementById('streetviewFadeCurtain');
        infoTitleEl = document.getElementById('svInfoTitle');
        infoSubEl = document.getElementById('svInfoSub');
        hudHintEl = document.getElementById('streetviewControlsHud');
        closeBtnEl = document.getElementById('streetviewCloseBtn');
        compassBtnEl = document.getElementById('svCompassBtn');
        compassNeedleEl = document.getElementById('svCompassNeedle');
        datePillEl = document.getElementById('svDatePill');
        dateTextEl = document.getElementById('svDateText');
    }

    function bindEvents() {
        if (closeBtnEl) {
            closeBtnEl.onclick = (e) => { e.preventDefault(); closeViewer(); };
        }
        if (compassBtnEl) {
            compassBtnEl.onclick = (e) => {
                e.preventDefault();
                const node = getCurrentNode();
                if (!pannellumViewer || !node) return;
                try { pannellumViewer.setYaw(normYaw(-(node.northOffset || 0)), 600); } catch (_) {}
            };
        }

        window.addEventListener('keydown', (e) => {
            if (!overlayEl || !overlayEl.classList.contains('active')) return;
            if (e.key === 'Escape') {
                closeViewer();
            } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
                // Move along the road the camera is facing
                const conn = connectionFacingCamera();
                if (conn) {
                    e.preventDefault();
                    transitionToNode(conn.targetId, conn.bearing);
                }
            }
        });

        if (containerEl) {
            containerEl.addEventListener('mousemove', onContainerMouseMove);
            containerEl.addEventListener('mouseleave', onContainerMouseLeave);
            containerEl.addEventListener('mousedown', onContainerMouseDown);
            containerEl.addEventListener('mouseup', onContainerMouseUp);
            containerEl.addEventListener('click', onContainerClick, true);
            containerEl.addEventListener('touchstart', onContainerTouchStart, { passive: true });
            containerEl.addEventListener('touchend', onContainerTouchEnd);
        }
    }

    // ── Small helpers ──────────────────────────────────────────────────────────

    function normYaw(y) {
        let v = y % 360;
        if (v > 180) v -= 360;
        if (v < -180) v += 360;
        return v;
    }

    function getCurrentNode() {
        return manifestData?.nodes?.find(n => n.id === currentNodeId) || null;
    }

    function nodeById(id) {
        return manifestData?.nodes?.find(n => n.id === id) || null;
    }

    function photoYawOf(node, bearing) {
        return normYaw(bearing - (node.northOffset || 0));
    }

    /**
     * Connections to offer as arrows. Two links pointing almost the same way
     * (e.g. two shots taken a few meters apart) would draw overlapping arrows,
     * so keep only the nearest one in each direction.
     */
    const navCache = new Map();
    function navConnections(node) {
        if (!node) return [];
        if (navCache.has(node.id)) return navCache.get(node.id);
        const kept = [];
        const sorted = [...(node.connections || [])].sort((a, b) => (a.distance || 0) - (b.distance || 0));
        for (const conn of sorted) {
            if (!nodeById(conn.targetId)) continue;
            const y = photoYawOf(node, conn.bearing);
            if (kept.every(k => Math.abs(normYaw(photoYawOf(node, k.bearing) - y)) >= 30)) kept.push(conn);
        }
        navCache.set(node.id, kept);
        return kept;
    }

    function capturedLabel(node) {
        const m = /_(\d{4})(\d{2})\d{2}_/.exec(node?.source || '');
        if (!m) return '';
        const month = MONTHS[parseInt(m[2], 10) - 1];
        return month ? `${month} ${m[1]}` : '';
    }

    function connectionFacingCamera() {
        const node = getCurrentNode();
        if (!node || !pannellumViewer) return null;
        const camYaw = pannellumViewer.getYaw();
        let best = null;
        let bestDiff = 50; // must be within 50° of where you're looking
        for (const conn of navConnections(node)) {
            const d = Math.abs(normYaw(photoYawOf(node, conn.bearing) - camYaw));
            if (d < bestDiff) { bestDiff = d; best = conn; }
        }
        return best;
    }

    // ── Projection: ground point → screen ──────────────────────────────────────

    function getCamera() {
        if (!pannellumViewer || !containerEl) return null;
        const rect = containerEl.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        let yaw = 0, pitch = 0, hfov = 100;
        try {
            yaw = pannellumViewer.getYaw();
            pitch = pannellumViewer.getPitch();
            hfov = pannellumViewer.getHfov();
        } catch (_) { return null; }
        const W = rect.width, H = rect.height;
        return { yaw, pitch, W, H, f: (W / 2) / Math.tan(hfov * Math.PI / 360) };
    }

    // Project a photo-space direction (yaw/pitch in degrees) onto the screen.
    function projectDir(cam, yawDeg, pitchDeg) {
        const r = Math.PI / 180;
        const y = yawDeg * r, p = pitchDeg * r, cy = cam.yaw * r, cp = cam.pitch * r;
        const x0 = Math.cos(p) * Math.sin(y);
        const y0 = Math.sin(p);
        const z0 = Math.cos(p) * Math.cos(y);
        const x1 = x0 * Math.cos(cy) - z0 * Math.sin(cy);
        const z1 = x0 * Math.sin(cy) + z0 * Math.cos(cy);
        const y2 = y0 * Math.cos(cp) - z1 * Math.sin(cp);
        const z2 = y0 * Math.sin(cp) + z1 * Math.cos(cp);
        if (z2 <= 0.08) return null;
        return { x: cam.W / 2 + cam.f * x1 / z2, y: cam.H / 2 - cam.f * y2 / z2, z: z2 };
    }

    // A point on the road: `fwd` meters ahead along the photo yaw, `lat` meters to the right.
    function projectGround(cam, baseYaw, fwd, lat, height) {
        if (fwd <= 0.2) return null;
        const yaw = baseYaw + Math.atan2(lat, fwd) * 180 / Math.PI;
        const pitch = -Math.atan2(CAMERA_HEIGHT_M - (height || 0), Math.hypot(fwd, lat)) * 180 / Math.PI;
        return projectDir(cam, yaw, pitch);
    }

    // ── Road guides (canvas) ───────────────────────────────────────────────────

    // Chevron outline in road meters: [forward, lateral]. Thick arms, like a painted road arrow.
    const CHEVRON = [[0.55, 0], [-0.25, 0.95], [-0.62, 0.62], [0.02, 0.0], [-0.62, -0.62], [-0.25, -0.95]];
    const CHEVRON_RAISE = 0.12; // metres: the white top sits a little above the grey base

    function drawRoadGuides() {
        rafDrawId = null;
        if (!overlayEl || !overlayEl.classList.contains('active')) return;
        rafDrawId = requestAnimationFrame(drawRoadGuides);

        const canvas = roadCanvasEl;
        const cam = getCamera();
        const node = getCurrentNode();
        if (!canvas || !cam || !node) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = Math.round(cam.W * dpr), ch = Math.round(cam.H * dpr);
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
        }
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cam.W, cam.H);

        // Compass needle follows where the camera faces
        if (compassNeedleEl) {
            const heading = (cam.yaw + (node.northOffset || 0) + 360) % 360;
            compassNeedleEl.style.transform = `rotate(${-heading}deg)`;
        }

        if (isTransitioning) { drawnChevrons = []; return; }

        // Street names painted on the road first, arrows on top
        for (const lab of streetLabelsFor(node, cam)) drawStreetLabel(ctx, cam, lab.text, lab.yaw, dpr);

        const chevrons = [];
        for (const conn of navConnections(node)) {
            const baseYaw = photoYawOf(node, conn.bearing);
            const hovered = !!(activeHoverConnection && activeHoverConnection.targetId === conn.targetId);
            drawArrow(ctx, cam, conn, baseYaw, hovered, chevrons);
        }
        drawnChevrons = chevrons;
    }

    function polyAt(cam, baseYaw, dist, scale, height) {
        const pts = CHEVRON.map(([f, l]) => projectGround(cam, baseYaw, dist + f * scale, l * scale, height));
        return pts.every(Boolean) ? pts : null;
    }

    function fillPoly(ctx, pts, style) {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.closePath();
        ctx.fillStyle = style;
        ctx.fill();
    }

    // Raised white chevron on the road: soft shadow, grey sides, white top. Blue when hovered.
    function drawArrow(ctx, cam, conn, baseYaw, hovered, chevrons) {
        // Phones show more ground per pixel, so bring the arrow closer and make it larger
        const narrow = cam.W < 600;
        const dist = narrow ? 3.3 : 4.0;
        const scale = (narrow ? 1.15 : 0.95) * (hovered ? 1.08 : 1);
        const base = polyAt(cam, baseYaw, dist, scale, 0);
        const top = polyAt(cam, baseYaw, dist, scale, CHEVRON_RAISE);
        if (!base || !top) return;
        ctx.save();
        ctx.lineJoin = 'round';
        // shadow on the road
        ctx.filter = 'blur(3px)';
        fillPoly(ctx, polyAt(cam, baseYaw, dist + 0.06, scale * 1.04, 0) || base, 'rgba(0, 0, 0, 0.28)');
        ctx.filter = 'none';
        // sides: join the base and the top outline
        const side = hovered ? '#2B6CB0' : '#9AA3AE';
        for (let i = 0; i < base.length; i++) {
            const j = (i + 1) % base.length;
            fillPoly(ctx, [base[i], base[j], top[j], top[i]], side);
        }
        fillPoly(ctx, top, hovered ? '#5EA2EA' : '#FFFFFF');
        ctx.restore();
        const c = projectGround(cam, baseYaw, dist, 0);
        if (!c) return;
        const span = Math.hypot(top[1].x - top[5].x, top[1].y - top[5].y);
        chevrons.push({ conn, x: c.x, y: c.y, r: Math.max(30, span * 0.75) });
    }

    // ── Street names painted on the road ───────────────────────────────────────

    // Which name goes along which road: one label per street, on the branch you are most
    // nearly facing, and only when that branch is in front of you.
    function streetLabelsFor(node, cam) {
        const byName = new Map();
        for (const conn of navConnections(node)) {
            const target = nodeById(conn.targetId);
            const yaw = photoYawOf(node, conn.bearing);
            // Straight on (or back) you stay on this street; a branch that turns off gets its own name
            const straight = typeof node.heading !== 'number'
                || Math.abs(normYaw(yaw - node.heading)) < 35 || Math.abs(normYaw(yaw - node.heading)) > 145;
            const name = (!straight && target && target.street) || node.street || (target && target.street);
            if (!name) continue;
            const off = Math.abs(normYaw(yaw - cam.yaw));
            if (off > 75) continue;
            const prev = byName.get(name);
            if (!prev || off < prev.off) byName.set(name, { text: name, yaw, off });
        }
        return [...byName.values()].slice(0, 2);
    }

    const labelCache = new Map();
    function labelTexture(text) {
        if (labelCache.has(text)) return labelCache.get(text);
        const px = 96;
        const font = `700 ${px}px 'Sora', 'Outfit', system-ui, sans-serif`;
        const m = document.createElement('canvas').getContext('2d');
        m.font = font;
        const w = Math.ceil(m.measureText(text).width) + px * 0.6;
        const h = Math.ceil(px * 1.45);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.font = font;
        g.textBaseline = 'middle';
        g.lineJoin = 'round';
        // dark edge underneath (the "thickness"), then a dark outline, then white
        g.fillStyle = 'rgba(15, 23, 42, 0.55)';
        g.fillText(text, px * 0.3 + 4, h / 2 + 7);
        g.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        g.lineWidth = px * 0.14;
        g.strokeText(text, px * 0.3, h / 2);
        g.fillStyle = '#FFFFFF';
        g.fillText(text, px * 0.3, h / 2);
        const tex = { c, w, h, px };
        labelCache.set(text, tex);
        return tex;
    }

    // Lay the text flat on the road, reading away from you along `yaw` (letters' tops to the left,
    // like the road names in Google Street View). Drawn in thin slices so the perspective is right.
    function drawStreetLabel(ctx, cam, text, yaw, dpr) {
        const tex = labelTexture(text);
        const narrow = cam.W < 600;
        const letterM = narrow ? 1.7 : 1.5;            // letter height on the road (metres)
        let mPerPx = letterM / tex.px;
        let lenM = tex.w * mPerPx;
        const maxLen = 24;
        if (lenM > maxLen) { mPerPx *= maxLen / lenM; lenM = maxLen; }
        const f0 = narrow ? 3.0 : 2.9;                  // starts beside the arrow, close to you
        const latC = narrow ? -1.9 : -2.1;              // left of the arrow, over the middle of the road (we drive on the right)
        const widthM = tex.h * mPerPx;
        const P = (u, v) => projectGround(cam, yaw, f0 + u * mPerPx, latC + (v - tex.h / 2) * mPerPx);
        const N = 24;
        ctx.save();
        ctx.globalAlpha = 0.96;
        for (let i = 0; i < N; i++) {
            const u0 = tex.w * i / N, u1 = tex.w * (i + 1) / N;
            const a = P(u0, 0), b = P(u1, 0), c = P(u1, tex.h), d = P(u0, tex.h);
            if (!a || !b || !c || !d) continue;
            drawTri(ctx, tex.c, [u0, 0, u1, 0, u1, tex.h], [a, b, c], dpr);
            drawTri(ctx, tex.c, [u0, 0, u1, tex.h, u0, tex.h], [a, c, d], dpr);
        }
        ctx.restore();
        void widthM;
    }

    // Affine-map one triangle of the texture onto the screen triangle
    function drawTri(ctx, img, s, d, dpr) {
        const [u0, v0, u1, v1, u2, v2] = s;
        const X0 = d[0].x, Y0 = d[0].y, X1 = d[1].x, Y1 = d[1].y, X2 = d[2].x, Y2 = d[2].y;
        const den = u0 * v1 + v0 * u2 + u1 * v2 - v1 * u2 - v0 * u1 - u0 * v2;
        if (!den) return;
        const ma = (X0 * v1 + v0 * X2 + X1 * v2 - v1 * X2 - v0 * X1 - X0 * v2) / den;
        const mb = (u0 * X1 + X0 * u2 + u1 * X2 - X1 * u2 - X0 * u1 - u0 * X2) / den;
        const mc = (u0 * v1 * X2 + v0 * X1 * u2 + X0 * u1 * v2 - X0 * v1 * u2 - v0 * u1 * X2 - u0 * X1 * v2) / den;
        const md = (Y0 * v1 + v0 * Y2 + Y1 * v2 - v1 * Y2 - v0 * Y1 - Y0 * v2) / den;
        const me = (u0 * Y1 + Y0 * u2 + u1 * Y2 - Y1 * u2 - Y0 * u1 - u0 * Y2) / den;
        const mf = (u0 * v1 * Y2 + v0 * Y1 * u2 + Y0 * u1 * v2 - Y0 * v1 * u2 - v0 * u1 * Y2 - u0 * Y1 * v2) / den;
        ctx.save();
        // grow the clip a hair so the slices meet without hairline gaps
        const cx = (X0 + X1 + X2) / 3, cy = (Y0 + Y1 + Y2) / 3, k = 1.02;
        ctx.beginPath();
        ctx.moveTo(cx + (X0 - cx) * k, cy + (Y0 - cy) * k);
        ctx.lineTo(cx + (X1 - cx) * k, cy + (Y1 - cy) * k);
        ctx.lineTo(cx + (X2 - cx) * k, cy + (Y2 - cy) * k);
        ctx.closePath();
        ctx.clip();
        ctx.setTransform(dpr * ma, dpr * md, dpr * mb, dpr * me, dpr * mc, dpr * mf);
        ctx.drawImage(img, 0, 0);
        ctx.restore();
    }

    function startDrawing() {
        if (!rafDrawId) rafDrawId = requestAnimationFrame(drawRoadGuides);
    }

    function stopDrawing() {
        if (rafDrawId) cancelAnimationFrame(rafDrawId);
        rafDrawId = null;
        if (roadCanvasEl) {
            const ctx = roadCanvasEl.getContext('2d');
            ctx.clearRect(0, 0, roadCanvasEl.width, roadCanvasEl.height);
        }
    }

    // ── Pointer → road connection ──────────────────────────────────────────────

    function calculateCursorSphericalCoords(e) {
        if (!containerEl || !pannellumViewer) return null;
        if (typeof pannellumViewer.mouseEventToCoords === 'function') {
            try {
                const coords = pannellumViewer.mouseEventToCoords(e);
                if (coords && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                    return { pitch: coords[0], yaw: coords[1] };
                }
            } catch (_) {}
        }
        const cam = getCamera();
        if (!cam) return null;
        const rect = containerEl.getBoundingClientRect();
        const dx = (e.clientX - rect.left) - cam.W / 2;
        const dy = cam.H / 2 - (e.clientY - rect.top);
        const yaw = normYaw(cam.yaw + Math.atan2(dx, cam.f) * 180 / Math.PI);
        const pitch = Math.max(-90, Math.min(90, cam.pitch + Math.atan2(dy, Math.hypot(dx, cam.f)) * 180 / Math.PI));
        return { pitch, yaw };
    }

    /**
     * Which road (connection) is under the pointer: a drawn chevron first, else
     * the ground area below the horizon in that road's direction.
     */
    function detectNavigableConnectionAtScreen(clientX, clientY) {
        if (!containerEl || !manifestData || !currentNodeId || isTransitioning || isNavLocked) return null;
        const node = getCurrentNode();
        if (!node || !node.connections || node.connections.length === 0) return null;

        const rect = containerEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

        for (const c of drawnChevrons) {
            if (Math.hypot(x - c.x, y - c.y) <= c.r) return { connection: c.conn };
        }

        const spherical = calculateCursorSphericalCoords({ clientX, clientY });
        if (!spherical || spherical.pitch > -4) return null; // only the road, below the horizon

        // Wider tolerance the closer to your feet
        const tolerance = 12 + Math.min(20, (-spherical.pitch - 4) * 0.6);
        const BACKTRACK_RATIO_PENALTY = 1.6;
        let best = null;
        let bestRatio = Infinity;
        for (const conn of navConnections(node)) {
            const diff = Math.abs(normYaw(spherical.yaw - photoYawOf(node, conn.bearing)));
            if (diff > tolerance) continue;
            let ratio = diff / tolerance;
            if (previousNodeId && conn.targetId === previousNodeId) ratio *= BACKTRACK_RATIO_PENALTY;
            if (ratio < bestRatio) { bestRatio = ratio; best = conn; }
        }
        return best ? { connection: best } : null;
    }

    function updateHoverAtCursor(e) {
        if (isDragging || isTransitioning || isNavLocked) { clearHover(); return; }
        const match = detectNavigableConnectionAtScreen(e.clientX, e.clientY);
        if (!match) { clearHover(); return; }
        activeHoverConnection = match.connection;
        if (containerEl) containerEl.classList.add('zone-hovered');
    }

    function clearHover() {
        activeHoverConnection = null;
        if (containerEl) containerEl.classList.remove('zone-hovered');
    }

    function onContainerMouseMove(e) {
        if (isTransitioning || isNavLocked) { clearHover(); return; }
        if (isMouseDown && Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 6) {
            isDragging = true;
            clearHover();
            return;
        }
        lastCursorEvent = e;
        if (!rafCursorId) {
            rafCursorId = requestAnimationFrame(() => {
                rafCursorId = null;
                if (lastCursorEvent && !isTransitioning && !isNavLocked) updateHoverAtCursor(lastCursorEvent);
            });
        }
    }

    function onContainerMouseLeave() {
        clearHover();
        isMouseDown = false;
        isDragging = false;
    }

    function onContainerMouseDown(e) {
        if (isTransitioning || isNavLocked) return;
        isMouseDown = true;
        isDragging = false;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
    }

    function onContainerMouseUp() {
        isMouseDown = false;
    }

    function onContainerClick(e) {
        if (isDragging || isTransitioning || isNavLocked) {
            isDragging = false;
            return;
        }
        // A click that arrives without a mouse move first (e.g. a pen or a quick tap) still finds the arrow
        if (!activeHoverConnection) {
            const match = detectNavigableConnectionAtScreen(e.clientX, e.clientY);
            if (match) activeHoverConnection = match.connection;
        }
        if (activeHoverConnection) {
            const conn = activeHoverConnection;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            clearHover();
            transitionToNode(conn.targetId, conn.bearing, e);
        }
    }

    function onContainerTouchStart(e) {
        if (isTransitioning || isNavLocked) return;
        if (e.touches && e.touches[0]) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }

    function onContainerTouchEnd(e) {
        if (isTransitioning || isNavLocked) return;
        if (e.changedTouches && e.changedTouches[0]) {
            const tX = e.changedTouches[0].clientX;
            const tY = e.changedTouches[0].clientY;
            if (Math.hypot(tX - touchStartX, tY - touchStartY) < 10) {
                const match = detectNavigableConnectionAtScreen(tX, tY);
                if (match && match.connection) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    transitionToNode(match.connection.targetId, match.connection.bearing, { clientX: tX, clientY: tY });
                }
            }
        }
    }

    // ── Hint ───────────────────────────────────────────────────────────────────

    function scheduleHintDismiss() {
        if (hudHintEl) hudHintEl.classList.remove('fade-out');
        if (hintDismissTimer) clearTimeout(hintDismissTimer);
        hintDismissTimer = setTimeout(dismissHint, 4500);
        const onFirstInteraction = () => {
            dismissHint();
            window.removeEventListener('pointerdown', onFirstInteraction, true);
            window.removeEventListener('wheel', onFirstInteraction, { passive: true });
        };
        window.addEventListener('pointerdown', onFirstInteraction, true);
        window.addEventListener('wheel', onFirstInteraction, { passive: true });
    }

    function dismissHint() {
        if (hintDismissTimer) {
            clearTimeout(hintDismissTimer);
            hintDismissTimer = null;
        }
        if (hudHintEl) hudHintEl.classList.add('fade-out');
    }

    // ── Scenes ─────────────────────────────────────────────────────────────────

    function buildScenesConfig() {
        if (!manifestData || !manifestData.nodes) return;
        scenesConfig = {};
        // Portrait phones: a narrower horizontal field of view avoids a stretched, fish-eye look
        const hfov = window.innerWidth < 600 ? 80 : 100;
        manifestData.nodes.forEach(node => {
            scenesConfig[node.id] = {
                type: 'equirectangular',
                panorama: `../assets/360/${encodeURIComponent(node.file)}`,
                autoLoad: true,
                showControls: false,
                showFullscreenCtrl: false,
                hfov: hfov,
                minHfov: 45,
                maxHfov: 120,
                pitch: -10,
                yaw: 0,
                // Road arrows are drawn on the canvas overlay instead of hotspots
                hotSpots: []
            };
        });
    }

    // Face down the road, in the direction the car was travelling
    function defaultYawFor(node) {
        if (typeof node.heading === 'number') return normYaw(node.heading);
        let best = 0;
        let bestDiff = Infinity;
        for (const conn of navConnections(node)) {
            const y = photoYawOf(node, conn.bearing);
            if (Math.abs(y) < bestDiff) { bestDiff = Math.abs(y); best = y; }
        }
        return best;
    }

    /**
     * Resolve once Pannellum has finished drawing the scene (or failed, or timed out),
     * so the dark curtain can cover loading instead of Pannellum's "Loading..." box.
     */
    function waitForSceneLoad(timeoutMs) {
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                try {
                    pannellumViewer.off('load', finish);
                    pannellumViewer.off('error', finish);
                } catch (_) {}
                resolve();
            };
            try {
                pannellumViewer.on('load', finish);
                pannellumViewer.on('error', finish);
            } catch (_) {}
            setTimeout(finish, timeoutMs || 10000);
        });
    }

    // Warm the browser cache with the photos you can walk to next, so moving feels instant
    const prefetched = new Set();
    function prefetchNeighbors(node) {
        for (const conn of navConnections(node)) {
            const t = nodeById(conn.targetId);
            if (!t || prefetched.has(t.file)) continue;
            prefetched.add(t.file);
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = `../assets/360/${encodeURIComponent(t.file)}`;
        }
    }

    async function transitionToNode(targetId, forwardBearing, clickEvent) {
        if (!targetId || targetId === currentNodeId || isTransitioning || isNavLocked) return;

        const targetNode = nodeById(targetId);
        if (!targetNode) {
            console.warn('[StreetView] Target node not found:', targetId);
            return;
        }

        isTransitioning = true;
        isNavLocked = true;
        if (navLockTimer) {
            clearTimeout(navLockTimer);
            navLockTimer = null;
        }

        dismissHint();
        clearHover();
        if (rafCursorId) {
            cancelAnimationFrame(rafCursorId);
            rafCursorId = null;
        }
        lastCursorEvent = null;
        cleanupPannellumFadeImages();

        // Short dolly toward where you clicked
        if (containerEl) {
            if (clickEvent && typeof clickEvent.clientX === 'number') {
                const rect = containerEl.getBoundingClientRect();
                const ox = Math.max(0, Math.min(rect.width, clickEvent.clientX - rect.left));
                const oy = Math.max(0, Math.min(rect.height, clickEvent.clientY - rect.top));
                containerEl.style.transformOrigin = `${ox}px ${oy}px`;
            } else {
                containerEl.style.transformOrigin = '50% 65%';
            }
            containerEl.classList.add('dolly-forward');
        }

        await new Promise(r => setTimeout(r, 100));
        if (fadeCurtainEl) fadeCurtainEl.classList.add('fading');
        await new Promise(r => setTimeout(r, 100));

        previousNodeId = currentNodeId;
        currentNodeId = targetId;

        if (containerEl) {
            containerEl.classList.remove('dolly-forward');
            containerEl.style.transformOrigin = 'center center';
        }

        // Keep facing the direction of travel
        let targetYaw = 0;
        if (typeof forwardBearing === 'number') targetYaw = photoYawOf(targetNode, forwardBearing);
        let targetPitch = -10;
        try { targetPitch = Math.min(-4, pannellumViewer.getPitch()); } catch (_) {}

        updateInfoCard(targetNode);

        if (pannellumViewer) {
            const loaded = waitForSceneLoad(8000);
            pannellumViewer.loadScene(targetId, targetPitch, targetYaw);
            await loaded;
            cleanupPannellumFadeImages();
        }
        prefetchNeighbors(targetNode);

        if (fadeCurtainEl) fadeCurtainEl.classList.remove('fading');
        await new Promise(r => setTimeout(r, 220));
        cleanupPannellumFadeImages();
        isTransitioning = false;

        navLockTimer = setTimeout(() => {
            isNavLocked = false;
            navLockTimer = null;
        }, 400);
    }

    /**
     * Top-left card: linked establishment name if there is one, otherwise the street.
     * Second line: barangay and month captured.
     */
    function updateInfoCard(node) {
        if (!node || !infoTitleEl || !infoSubEl) return;
        const matchedPlace = (placeLinksData?.links || []).find(l => l.nodeId === node.id);
        const title = (matchedPlace && matchedPlace.placeName) || node.street || 'Street view';
        const parts = [];
        if (matchedPlace && node.street) parts.push(node.street);
        parts.push(node.area ? `${node.area}, Calamba` : 'Calamba');
        const when = capturedLabel(node);
        infoTitleEl.textContent = title;
        infoSubEl.textContent = parts.join(' · ');
        if (dateTextEl && datePillEl) {
            dateTextEl.textContent = when;
            datePillEl.hidden = !when;
        }
    }

    // ── Launch / close ─────────────────────────────────────────────────────────

    function parseNodeIdToCoords(nodeId) {
        if (typeof nodeId !== 'string') return null;
        const parts = nodeId.split('_');
        if (parts.length !== 2) return null;
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat, lng };
    }

    function haversineMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const toRad = Math.PI / 180;
        const dLat = (lat2 - lat1) * toRad;
        const dLon = (lon2 - lon1) * toRad;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function findNearestManifestNode(lat, lng) {
        if (!manifestData || !manifestData.nodes || manifestData.nodes.length === 0) return null;
        let best = null;
        let bestDist = Infinity;
        for (const n of manifestData.nodes) {
            const d = haversineMeters(lat, lng, n.lat, n.lng);
            if (d < bestDist) { bestDist = d; best = n; }
        }
        return best;
    }

    async function launch360Viewer(startNodeId) {
        initDOM();
        await loadData();

        if (!manifestData || !manifestData.nodes || manifestData.nodes.length === 0) {
            console.error('[StreetView] No nodes available to display.');
            return;
        }

        // Exact id first; otherwise snap to the closest node by coordinates
        // (never silently fall back to an unrelated first node).
        let node = nodeById(startNodeId);
        if (!node) {
            const parsed = parseNodeIdToCoords(startNodeId);
            if (parsed) node = findNearestManifestNode(parsed.lat, parsed.lng);
            if (node) {
                console.warn(`[StreetView] Node id "${startNodeId}" not found verbatim; using nearest node by coordinates instead: ${node.id}`);
            } else {
                console.warn(`[StreetView] Node "${startNodeId}" not found and could not be parsed as coordinates; defaulting to first node.`);
                node = manifestData.nodes[0];
            }
        }

        currentNodeId = node.id;
        previousNodeId = null;
        buildScenesConfig();

        document.body.style.overflow = 'hidden';
        overlayEl.style.display = 'block';
        requestAnimationFrame(() => overlayEl.classList.add('active'));

        updateInfoCard(node);
        scheduleHintDismiss();

        // Keep the curtain up until the photo is ready; no loading box
        if (fadeCurtainEl) fadeCurtainEl.classList.add('fading');
        isTransitioning = true;

        const startYaw = defaultYawFor(node);
        let loaded;
        if (!pannellumViewer) {
            containerEl.innerHTML = '';
            scenesConfig[node.id].yaw = startYaw;
            pannellumViewer = pannellum.viewer('calzadaPannellumContainer', {
                default: {
                    firstScene: node.id,
                    sceneFadeDuration: 0,
                    autoLoad: true,
                    showControls: false
                },
                scenes: scenesConfig
            });
            loaded = waitForSceneLoad(10000);
        } else {
            loaded = waitForSceneLoad(10000);
            pannellumViewer.loadScene(node.id, -10, startYaw);
        }

        startDrawing();
        await loaded;
        cleanupPannellumFadeImages();
        isTransitioning = false;
        if (fadeCurtainEl) fadeCurtainEl.classList.remove('fading');
        prefetchNeighbors(node);
    }

    function closeViewer() {
        if (!overlayEl) return;

        dismissHint();
        clearHover();
        if (rafCursorId) {
            cancelAnimationFrame(rafCursorId);
            rafCursorId = null;
        }
        if (navLockTimer) {
            clearTimeout(navLockTimer);
            navLockTimer = null;
        }
        isTransitioning = false;
        isNavLocked = false;
        cleanupPannellumFadeImages();
        stopDrawing();

        overlayEl.classList.remove('active');
        setTimeout(() => {
            overlayEl.style.display = 'none';
            document.body.style.overflow = '';
        }, 280);

        console.log('[StreetView] Exited 360 viewer. Returned to map.');
    }

    window.launch360Viewer = launch360Viewer;
    window.close360Viewer = closeViewer;
    window._open360Viewer = launch360Viewer;

    window.addEventListener('calzada:open-360', (e) => {
        if (e.detail && e.detail.nodeId) launch360Viewer(e.detail.nodeId);
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initDOM();
            loadData();
        });
    } else {
        initDOM();
        loadData();
    }
})();
