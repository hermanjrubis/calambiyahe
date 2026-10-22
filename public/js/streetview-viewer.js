/**
 * ==========================================================================
 * CALZADA 360° STREET VIEW VIEWER
 * Full-screen photosphere viewer. The road you can move along is drawn on the
 * asphalt itself (a soft guide stripe, a chevron and the street name), the
 * current street sits in a small card top-left, and there is no mini map.
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
                fetch('../assets/360/manifest.json'),
                fetch('../assets/360/place-links.json')
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

                <div class="sv-info-card" id="svInfoCard">
                    <div class="sv-info-title" id="svInfoTitle"></div>
                    <div class="sv-info-sub" id="svInfoSub"></div>
                </div>

                <div class="sv-actions">
                    <button type="button" class="sv-icon-btn" id="streetviewCloseBtn" aria-label="Exit 360 view" title="Exit (Esc)">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                    <button type="button" class="sv-icon-btn sv-compass" id="svCompassBtn" aria-label="Face north" title="Face north">
                        <svg id="svCompassNeedle" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 3 L15.2 12 L8.8 12 Z" fill="#378ADD"></path>
                            <path d="M12 21 L8.8 12 L15.2 12 Z" fill="#CBD5E1"></path>
                        </svg>
                    </button>
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
    function projectGround(cam, baseYaw, fwd, lat) {
        if (fwd <= 0.2) return null;
        const yaw = baseYaw + Math.atan2(lat, fwd) * 180 / Math.PI;
        const pitch = -Math.atan2(CAMERA_HEIGHT_M, Math.hypot(fwd, lat)) * 180 / Math.PI;
        return projectDir(cam, yaw, pitch);
    }

    // ── Road guides (canvas) ───────────────────────────────────────────────────

    // Chevron outline in road meters: [forward, lateral]
    const CHEVRON = [[0.62, 0], [-0.34, 0.98], [-0.6, 0.74], [0.1, 0.06], [0.1, -0.06], [-0.6, -0.74], [-0.34, -0.98]];

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

        const chevrons = [];
        for (const conn of navConnections(node)) {
            const baseYaw = photoYawOf(node, conn.bearing);
            const hovered = activeHoverConnection && activeHoverConnection.targetId === conn.targetId;
            const reach = Math.max(6, Math.min(conn.distance || 20, 24));

            // 1. Soft guide stripe along the road
            const left = [], right = [];
            for (let i = 0; i <= 14; i++) {
                const d = 3.6 + (reach - 3.6) * (i / 14);
                const a = projectGround(cam, baseYaw, d, -0.45);
                const b = projectGround(cam, baseYaw, d, 0.45);
                if (a && b) { left.push(a); right.push(b); }
            }
            if (left.length > 1) {
                ctx.beginPath();
                ctx.moveTo(left[0].x, left[0].y);
                for (const p of left) ctx.lineTo(p.x, p.y);
                for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
                ctx.closePath();
                ctx.fillStyle = hovered ? 'rgba(55, 138, 221, 0.42)' : 'rgba(255, 255, 255, 0.18)';
                ctx.fill();
            }

            // 2. Chevron painted on the asphalt
            const cDist = 5.2;
            const pts = CHEVRON.map(([f, l]) => projectGround(cam, baseYaw, cDist + f * 1.15, l * 1.15));
            if (pts.every(Boolean)) {
                ctx.beginPath();
                ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.closePath();
                ctx.fillStyle = hovered ? '#378ADD' : 'rgba(255, 255, 255, 0.94)';
                ctx.strokeStyle = hovered ? '#FFFFFF' : 'rgba(15, 23, 42, 0.35)';
                ctx.lineWidth = hovered ? 2 : 1.2;
                ctx.lineJoin = 'round';
                ctx.fill();
                ctx.stroke();
                const c = projectGround(cam, baseYaw, cDist, 0);
                if (c) {
                    const span = Math.hypot(pts[1].x - pts[6].x, pts[1].y - pts[6].y);
                    chevrons.push({ conn, x: c.x, y: c.y, r: Math.max(26, span * 0.7) });
                }
            }

            // 3. Street name written along the road
            const target = nodeById(conn.targetId);
            const label = (target && target.street) || node.street || '';
            if (label) {
                const p1 = projectGround(cam, baseYaw, 8.5, 0);
                const p2 = projectGround(cam, baseYaw, 13, 0);
                if (p1 && p2) {
                    let ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                    if (ang > Math.PI / 2) ang -= Math.PI;
                    if (ang < -Math.PI / 2) ang += Math.PI;
                    // A road running straight ahead would give vertical text; lay it flat instead
                    if (Math.abs(ang) > Math.PI * 0.3) ang = 0;
                    const size = Math.max(11, Math.min(19, cam.f * 0.75 / Math.hypot(10.5, CAMERA_HEIGHT_M)));
                    ctx.save();
                    ctx.translate((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
                    ctx.rotate(ang);
                    ctx.font = `600 ${size.toFixed(1)}px Sora, Outfit, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.lineWidth = 3.5;
                    ctx.strokeStyle = 'rgba(15, 23, 42, 0.62)';
                    ctx.lineJoin = 'round';
                    ctx.strokeText(label, 0, 0);
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillText(label, 0, 0);
                    ctx.restore();
                }
            }
        }
        drawnChevrons = chevrons;
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
        manifestData.nodes.forEach(node => {
            scenesConfig[node.id] = {
                type: 'equirectangular',
                panorama: `../assets/360/${encodeURIComponent(node.file)}`,
                autoLoad: true,
                showControls: false,
                showFullscreenCtrl: false,
                hfov: 100,
                minHfov: 45,
                maxHfov: 120,
                pitch: -10,
                yaw: 0,
                // Road arrows are drawn on the canvas overlay instead of hotspots
                hotSpots: []
            };
        });
    }

    // Face the road the camera was pointing along when the photo was taken
    function defaultYawFor(node) {
        let best = 0;
        let bestDiff = Infinity;
        for (const conn of navConnections(node)) {
            const y = photoYawOf(node, conn.bearing);
            if (Math.abs(y) < bestDiff) { bestDiff = Math.abs(y); best = y; }
        }
        return best;
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
            pannellumViewer.loadScene(targetId, targetPitch, targetYaw);
            await new Promise(r => setTimeout(r, 150));
            cleanupPannellumFadeImages();
        }

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
        if (when) parts.push(when);
        infoTitleEl.textContent = title;
        infoSubEl.textContent = parts.join(' · ');
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

        const startYaw = defaultYawFor(node);
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
        } else {
            pannellumViewer.loadScene(node.id, -10, startYaw);
        }

        startDrawing();
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
