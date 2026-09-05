/**
 * ==========================================================================
 * CALZADA 360° STREET VIEW VIEWER COMPONENT
 * Immersive Street-View-style photosphere viewer with directional chevrons,
 * MapLibre mini-map tracking, and smooth scene transitions.
 * ==========================================================================
 */

(function() {
    'use strict';

    // State Variables
    let manifestData = null;
    let placeLinksData = null;
    let pannellumViewer = null;
    let minimapInstance = null;
    let minimapCurrentMarker = null;
    let minimapNodeMarkers = [];
    let currentNodeId = null;
    // Tracks where we just came from, so a mis-detected/mis-calibrated forward click
    // doesn't silently snap the viewer back the way it came (the "bumabalik" bug).
    let previousNodeId = null;
    let isMinimapExpanded = true;
    let rafHeadingId = null;
    let scenesConfig = {};
    let isInitialized = false;
    let isTransitioning = false;
    let isNavLocked = false;
    let navLockTimer = null;
    let hintDismissTimer = null;

    /**
     * Remove any orphaned Pannellum fade snapshot images from the DOM
     * to eliminate ghosting / double exposure.
     */
    function cleanupPannellumFadeImages() {
        if (!containerEl) return;
        const fadeImgs = containerEl.querySelectorAll('.pnlm-fade-img');
        fadeImgs.forEach(img => {
            img.style.opacity = '0';
            img.style.display = 'none';
            if (img.parentNode) {
                img.parentNode.removeChild(img);
            }
        });
    }

    // Cursor Ground Indicator State
    let groundArrowEl = null;
    let groundArrowIconEl = null;
    let groundArrowTooltipEl = null;
    let activeHoverConnection = null;
    let isMouseDown = false;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let rafCursorId = null;
    let lastCursorEvent = null;
    let touchStartX = 0;
    let touchStartY = 0;

    // DOM Elements Cache
    let overlayEl = null;
    let containerEl = null;
    let fadeCurtainEl = null;
    let placePillEl = null;
    let placeNameEl = null;
    let hudHintEl = null;
    let closeBtnEl = null;
    let minimapCardEl = null;
    let minimapToggleEl = null;

    /**
     * Fetch manifest.json and place-links.json
     */
    async function loadData() {
        if (manifestData && placeLinksData) return;

        try {
            const [mRes, pRes] = await Promise.all([
                fetch('../assets/360/manifest.json'),
                fetch('../assets/360/place-links.json')
            ]);

            if (mRes.ok) {
                manifestData = await mRes.json();
            }
            if (pRes.ok) {
                placeLinksData = await pRes.json();
            }
        } catch (err) {
            console.error('[StreetView] Failed to load 360 manifest or place-links:', err);
        }
    }

    /**
     * Build the DOM overlay shell
     */
    function initDOM() {
        if (document.getElementById('calzadaStreetviewOverlay')) {
            cacheDOMElements();
            return;
        }

        const overlayHTML = `
            <div id="calzadaStreetviewOverlay" class="calzada-streetview-overlay" style="display:none;" aria-modal="true" role="dialog">
                <!-- Main Panorama Container with Dolly-Forward Zoom capability -->
                <div id="calzadaPannellumContainer" class="calzada-pannellum-container"></div>

                <!-- Cursor-Tracking Ground Arrow Indicator (Google Street View style) -->
                <div id="calzadaGroundArrow" class="calzada-ground-arrow-cursor">
                    <svg class="calzada-ground-arrow-icon" id="calzadaGroundArrowIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="18 14 12 8 6 14"></polyline>
                    </svg>
                    <div class="calzada-ground-arrow-tooltip" id="calzadaGroundArrowTooltip"></div>
                </div>

                <!-- Scene Crossfade Curtain -->
                <div id="streetviewFadeCurtain" class="streetview-fade-curtain"></div>

                <!-- Top Header Bar (Clean Google Street View style) -->
                <div class="streetview-top-bar">
                    <!-- Floating Place Pill: only displayed when linked to an actual establishment -->
                    <div class="streetview-place-pill" id="streetviewPlacePill" style="display:none;">
                        <svg class="streetview-place-pin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        <span class="streetview-place-name" id="streetviewPlaceName"></span>
                    </div>

                    <div class="streetview-top-actions">
                        <button type="button" class="streetview-close-btn" id="streetviewCloseBtn" aria-label="Exit 360 View" title="Exit 360 View (Esc)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Bottom-Left Mini-Map (Google Street View convention) -->
                <div class="streetview-minimap-card" id="streetviewMinimapCard">
                    <div class="streetview-minimap-header" id="streetviewMinimapHeader">
                        <span class="streetview-minimap-label">Mini Map</span>
                        <button type="button" class="streetview-minimap-toggle" id="streetviewMinimapToggle" aria-label="Toggle Mini Map">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                    </div>
                    <div id="streetviewMinimap" class="streetview-minimap-body"></div>
                </div>

                <!-- Bottom HUD Hint Pill (Auto-fading after 4-5s or first interaction) -->
                <div class="streetview-controls-hud" id="streetviewControlsHud">
                    <div class="streetview-hud-pill">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="m10 15 5-3-5-3v6Z"/>
                        </svg>
                        <span>Drag to look around · Click road arrows to move</span>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', overlayHTML);
        cacheDOMElements();
        bindEvents();
    }

    function cacheDOMElements() {
        overlayEl = document.getElementById('calzadaStreetviewOverlay');
        containerEl = document.getElementById('calzadaPannellumContainer');
        groundArrowEl = document.getElementById('calzadaGroundArrow');
        groundArrowIconEl = document.getElementById('calzadaGroundArrowIcon');
        groundArrowTooltipEl = document.getElementById('calzadaGroundArrowTooltip');
        fadeCurtainEl = document.getElementById('streetviewFadeCurtain');
        placePillEl = document.getElementById('streetviewPlacePill');
        placeNameEl = document.getElementById('streetviewPlaceName');
        hudHintEl = document.getElementById('streetviewControlsHud');
        closeBtnEl = document.getElementById('streetviewCloseBtn');
        minimapCardEl = document.getElementById('streetviewMinimapCard');
        minimapToggleEl = document.getElementById('streetviewMinimapToggle');
    }

    function bindEvents() {
        if (closeBtnEl) {
            closeBtnEl.onclick = (e) => {
                e.preventDefault();
                closeViewer();
            };
        }

        const minimapHeader = document.getElementById('streetviewMinimapHeader');
        if (minimapHeader) {
            minimapHeader.onclick = () => {
                isMinimapExpanded = !isMinimapExpanded;
                if (minimapCardEl) {
                    minimapCardEl.classList.toggle('minimized', !isMinimapExpanded);
                }
                if (minimapInstance && isMinimapExpanded) {
                    setTimeout(() => minimapInstance.resize(), 300);
                }
            };
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && overlayEl && overlayEl.classList.contains('active')) {
                closeViewer();
            }
        });

        // Attach mouse & touch tracking to the panorama container
        if (containerEl) {
            containerEl.addEventListener('mousemove', onContainerMouseMove);
            containerEl.addEventListener('mouseleave', onContainerMouseLeave);
            containerEl.addEventListener('mousedown', onContainerMouseDown);
            containerEl.addEventListener('mouseup', onContainerMouseUp);
            containerEl.addEventListener('click', onContainerClick, true);

            // Touch device tap-to-navigate fallback
            containerEl.addEventListener('touchstart', onContainerTouchStart, { passive: true });
            containerEl.addEventListener('touchend', onContainerTouchEnd);
        }
    }

    /**
     * Calculate spherical pitch & yaw from screen cursor position
     */
    function calculateCursorSphericalCoords(e) {
        if (!containerEl || !pannellumViewer) return null;

        // Try Pannellum's native mouseEventToCoords first if available
        if (typeof pannellumViewer.mouseEventToCoords === 'function') {
            try {
                const coords = pannellumViewer.mouseEventToCoords(e);
                if (coords && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                    return { pitch: coords[0], yaw: coords[1] };
                }
            } catch (_) {}
        }

        // Analytical rectilinear projection calculation
        const rect = containerEl.getBoundingClientRect();
        const W = rect.width;
        const H = rect.height;
        if (!W || !H) return null;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const camYaw = typeof pannellumViewer.getYaw === 'function' ? pannellumViewer.getYaw() : 0;
        const camPitch = typeof pannellumViewer.getPitch === 'function' ? pannellumViewer.getPitch() : 0;
        const hfov = typeof pannellumViewer.getHfov === 'function' ? pannellumViewer.getHfov() : 100;

        const focal = (W / 2) / Math.tan((hfov * Math.PI) / 360);
        const dx = x - (W / 2);
        const dy = (H / 2) - y;

        const deltaYawDeg = Math.atan2(dx, focal) * (180 / Math.PI);
        let yaw = (camYaw + deltaYawDeg) % 360;
        if (yaw > 180) yaw -= 360;
        if (yaw < -180) yaw += 360;

        const deltaPitchDeg = Math.atan2(dy, Math.hypot(dx, focal)) * (180 / Math.PI);
        const pitch = Math.max(-90, Math.min(90, camPitch + deltaPitchDeg));

        return { pitch, yaw };
    }

    /**
     * Detect if screen position falls within any connection's navigable ground cone
     * The cone widens toward the bottom of the screen to simulate a road receding into the distance
     */
    function detectNavigableConnectionAtScreen(clientX, clientY) {
        if (!containerEl || !manifestData || !currentNodeId || isTransitioning || isNavLocked) return null;
        const currentNode = manifestData.nodes?.find(n => n.id === currentNodeId);
        if (!currentNode || !currentNode.connections || currentNode.connections.length === 0) return null;

        const rect = containerEl.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const W = rect.width;
        const H = rect.height;

        if (x < 0 || x > W || y < 0 || y > H) return null;

        // Ground region: only valid in the lower portion of the screen (horizon to bottom)
        const normY = y / H;
        const topZone = 0.44; // near horizon
        const bottomZone = 0.96; // near viewer's feet

        if (normY < topZone || normY > bottomZone) {
            return null;
        }

        // Depth parameter t: 0 at horizon (far away), 1 at bottom of screen (closest)
        const t = Math.max(0, Math.min(1, (normY - topZone) / (bottomZone - topZone)));

        // Cone angular tolerance: widens toward the bottom of the screen (11° at top -> 31° at bottom)
        const deltaTolerance = 11 + 20 * t;

        const spherical = calculateCursorSphericalCoords({ clientX, clientY });
        if (!spherical) return null;

        let bestConn = null;
        let minRatio = Infinity;
        let bestDiffYaw = 0;

        // Backtrack penalty: if the northOffset calibration for this node is off,
        // the connection pointing back to previousNodeId can wrongly appear as the
        // "best" forward match. We don't hide it outright (you should still be able
        // to turn around on purpose), but we require a clearly tighter alignment
        // before it's allowed to win over a legitimate forward connection.
        const BACKTRACK_RATIO_PENALTY = 1.6;

        for (const conn of currentNode.connections) {
            // Apply northOffset calibration: photo yaw where connection appears
            let connPhotoYaw = (conn.bearing - (currentNode.northOffset || 0)) % 360;
            if (connPhotoYaw > 180) connPhotoYaw -= 360;
            if (connPhotoYaw < -180) connPhotoYaw += 360;

            let diffYaw = (spherical.yaw - connPhotoYaw) % 360;
            if (diffYaw > 180) diffYaw -= 360;
            if (diffYaw < -180) diffYaw += 360;

            const absDiff = Math.abs(diffYaw);
            if (absDiff <= deltaTolerance) {
                let ratio = absDiff / deltaTolerance;
                if (previousNodeId && conn.targetId === previousNodeId) {
                    ratio *= BACKTRACK_RATIO_PENALTY;
                }
                if (ratio < minRatio) {
                    minRatio = ratio;
                    bestConn = conn;
                    bestDiffYaw = diffYaw;
                }
            }
        }

        if (!bestConn) return null;

        // Perspective scale factor: 0.6x near horizon up to 1.4x near bottom of screen
        const scale = 0.6 + 0.8 * t;

        return {
            connection: bestConn,
            x,
            y,
            scale,
            diffYaw: bestDiffYaw,
            t
        };
    }

    /**
     * Update position, scale, and active state of the ground cursor arrow
     */
    function updateGroundArrowAtCursor(e) {
        if (!groundArrowEl || isDragging || isTransitioning || isNavLocked) {
            hideGroundArrow();
            return;
        }

        const match = detectNavigableConnectionAtScreen(e.clientX, e.clientY);
        if (!match) {
            hideGroundArrow();
            return;
        }

        activeHoverConnection = match.connection;

        // Update floating tooltip content
        if (groundArrowTooltipEl) {
            const targetPlace = (placeLinksData?.links || []).find(l => l.nodeId === match.connection.targetId);
            const tooltipText = targetPlace
                ? `${targetPlace.placeName} · ${Math.round(match.connection.distance)}m`
                : `${Math.round(match.connection.distance)}m`;
            groundArrowTooltipEl.textContent = tooltipText;
        }

        // Slight chevron rotation matching travel direction
        if (groundArrowIconEl) {
            const rotateDeg = Math.max(-28, Math.min(28, -match.diffYaw * 0.75));
            groundArrowIconEl.style.transform = `rotate(${rotateDeg}deg)`;
        }

        // Position at exact cursor coordinate with depth perspective scaling
        groundArrowEl.style.transform = `translate3d(${match.x}px, ${match.y}px, 0) translate(-50%, -50%) scale(${match.scale.toFixed(3)})`;
        groundArrowEl.classList.add('active');

        if (containerEl) {
            containerEl.classList.add('zone-hovered');
        }
    }

    function hideGroundArrow() {
        activeHoverConnection = null;
        if (groundArrowEl) {
            groundArrowEl.classList.remove('active');
        }
        if (containerEl) {
            containerEl.classList.remove('zone-hovered');
        }
    }

    function onContainerMouseMove(e) {
        if (isTransitioning || isNavLocked) {
            hideGroundArrow();
            return;
        }

        if (isMouseDown) {
            const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
            if (dist > 6) {
                isDragging = true;
                hideGroundArrow();
                return;
            }
        }

        lastCursorEvent = e;
        if (!rafCursorId) {
            rafCursorId = requestAnimationFrame(() => {
                rafCursorId = null;
                if (lastCursorEvent && !isTransitioning && !isNavLocked) {
                    updateGroundArrowAtCursor(lastCursorEvent);
                }
            });
        }
    }

    function onContainerMouseLeave() {
        hideGroundArrow();
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

    function onContainerMouseUp(e) {
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
            hideGroundArrow();
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
            const dist = Math.hypot(tX - touchStartX, tY - touchStartY);
            if (dist < 10) {
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

    /**
     * Hint Pill Auto-Dismissal
     * Fades out automatically after ~4.5 seconds OR on first user interaction (drag or click)
     */
    function scheduleHintPillDismiss() {
        if (hudHintEl) {
            hudHintEl.classList.remove('fade-out');
        }

        if (hintDismissTimer) {
            clearTimeout(hintDismissTimer);
            hintDismissTimer = null;
        }

        // Auto-dismiss after 4.5 seconds
        hintDismissTimer = setTimeout(() => {
            dismissHintPill();
        }, 4500);

        // Also dismiss on first user interaction (drag, wheel, or arrow click)
        const onFirstInteraction = () => {
            dismissHintPill();
            window.removeEventListener('pointerdown', onFirstInteraction, true);
            window.removeEventListener('wheel', onFirstInteraction, { passive: true });
        };

        window.addEventListener('pointerdown', onFirstInteraction, true);
        window.addEventListener('wheel', onFirstInteraction, { passive: true });
    }

    function dismissHintPill() {
        if (hintDismissTimer) {
            clearTimeout(hintDismissTimer);
            hintDismissTimer = null;
        }
        if (hudHintEl) {
            hudHintEl.classList.add('fade-out');
        }
    }

    /**
     * Build scene configurations for all nodes in manifest
     * Directional arrows are rendered as flat ground-level chevrons
     */
    function buildScenesConfig() {
        if (!manifestData || !manifestData.nodes) return;

        scenesConfig = {};
        manifestData.nodes.forEach(node => {
            const matchedPlace = (placeLinksData?.links || []).find(l => l.nodeId === node.id);
            const title = matchedPlace ? matchedPlace.placeName : '';

            // Map each connection to a flat road chevron hotspot
            const hotSpots = (node.connections || []).map(conn => {
                // Convert 0-360° bearing to Pannellum's -180° to +180° yaw accounting for northOffset
                let yaw = (conn.bearing - (node.northOffset || 0)) % 360;
                if (yaw > 180) yaw -= 360;
                if (yaw < -180) yaw += 360;

                // Fixed negative pitch places the chevron flat on the asphalt road surface
                const pitch = -21;

                return {
                    pitch: pitch,
                    yaw: yaw,
                    cssClass: 'calzada-streetview-hotspot',
                    createTooltipFunc: (hotSpotDiv) => {
                        const targetPlace = (placeLinksData?.links || []).find(l => l.nodeId === conn.targetId);
                        const tooltipText = targetPlace
                            ? `${targetPlace.placeName} · ${Math.round(conn.distance)}m`
                            : `${Math.round(conn.distance)}m`;

                        hotSpotDiv.innerHTML = `
                            <div class="calzada-nav-chevron-wrap">
                                <div class="calzada-flat-chevron" title="Move forward">
                                    <svg class="calzada-chevron-svg" viewBox="0 0 58 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path class="calzada-chevron-path" d="M29 3L54 27L48 33L29 15L10 33L4 27L29 3Z" />
                                    </svg>
                                </div>
                                <div class="calzada-chevron-tooltip">${tooltipText}</div>
                            </div>
                        `;

                        hotSpotDiv.onclick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            e.stopImmediatePropagation();
                            if (isTransitioning || isNavLocked) return;
                            transitionToNode(conn.targetId, conn.bearing, e);
                        };
                    }
                };
            });

            scenesConfig[node.id] = {
                type: 'equirectangular',
                panorama: `../assets/360/${encodeURIComponent(node.file)}`,
                title: title,
                autoLoad: true,
                showControls: true,
                showFullscreenCtrl: false,
                hfov: 100,
                minHfov: 45,
                maxHfov: 120,
                pitch: -5,
                yaw: 0,
                hotSpots: hotSpots
            };
        });
    }

    /**
     * Transition smoothly to target node with dolly-forward zoom effect
     * Sequenced as a single controlled animation with 100% opaque curtain
     * and a navigation lock to completely eliminate ghosting and back-navigation.
     * @param {string} targetId
     * @param {number} [forwardBearing]
     * @param {MouseEvent|{clientX:number, clientY:number}} [clickEvent]
     */
    async function transitionToNode(targetId, forwardBearing, clickEvent) {
        if (!targetId || targetId === currentNodeId || isTransitioning || isNavLocked) {
            return;
        }

        const targetNode = manifestData?.nodes?.find(n => n.id === targetId);
        if (!targetNode) {
            console.warn('[StreetView] Target node not found:', targetId);
            return;
        }

        // 1. Engage navigation locks immediately
        isTransitioning = true;
        isNavLocked = true;
        if (navLockTimer) {
            clearTimeout(navLockTimer);
            navLockTimer = null;
        }

        // Immediately dismiss HUD, clear hover state and cancel pending cursor RAF
        dismissHintPill();
        hideGroundArrow();
        if (rafCursorId) {
            cancelAnimationFrame(rafCursorId);
            rafCursorId = null;
        }
        lastCursorEvent = null;

        // Clean up any lingering fade snapshot images before starting
        cleanupPannellumFadeImages();

        // 2. Dolly-forward zoom effect: scale toward clicked chevron direction (~180ms)
        if (containerEl) {
            if (clickEvent && typeof clickEvent.clientX === 'number') {
                const rect = containerEl.getBoundingClientRect();
                const originX = Math.max(0, Math.min(rect.width, clickEvent.clientX - rect.left));
                const originY = Math.max(0, Math.min(rect.height, clickEvent.clientY - rect.top));
                containerEl.style.transformOrigin = `${originX}px ${originY}px`;
            } else {
                containerEl.style.transformOrigin = '50% 65%';
            }
            containerEl.classList.add('dolly-forward');
        }

        // 3. Start curtain fade to full 1.0 opacity (~100ms into zoom)
        await new Promise(r => setTimeout(r, 100));
        if (fadeCurtainEl) {
            fadeCurtainEl.classList.add('fading');
        }

        // Wait for dolly zoom and curtain to achieve full opacity (~100ms)
        await new Promise(r => setTimeout(r, 100));

        // 4. Update state synchronously before loading new scene
        previousNodeId = currentNodeId;
        currentNodeId = targetId;

        // Reset dolly zoom scale cleanly while curtain is 100% opaque
        if (containerEl) {
            containerEl.classList.remove('dolly-forward');
            containerEl.style.transformOrigin = 'center center';
        }

        // 5. Orient initial camera view toward travel direction
        let targetYaw = 0;
        if (typeof forwardBearing === 'number') {
            targetYaw = (forwardBearing - (targetNode.northOffset || 0)) % 360;
            if (targetYaw > 180) targetYaw -= 360;
            if (targetYaw < -180) targetYaw += 360;
        }

        // 6. Update place pill and mini-map position synchronously
        updateHeaderMeta(targetNode);
        updateMinimapPosition(targetNode);

        // 7. Load new scene in Pannellum
        if (pannellumViewer) {
            let sceneLoaded = false;
            const onSceneReady = () => {
                if (sceneLoaded) return;
                sceneLoaded = true;
                cleanupPannellumFadeImages();
            };

            try {
                pannellumViewer.on('load', onSceneReady);
            } catch (_) {}

            pannellumViewer.loadScene(targetId, -5, targetYaw);

            // Wait a brief tick for the WebGL texture initialization
            await new Promise(r => setTimeout(r, 150));
            try {
                pannellumViewer.off('load', onSceneReady);
            } catch (_) {}
            cleanupPannellumFadeImages();
        }

        // 8. Fade out curtain smoothly revealing the ready scene
        if (fadeCurtainEl) {
            fadeCurtainEl.classList.remove('fading');
        }

        // Wait for curtain transition to complete (~220ms)
        await new Promise(r => setTimeout(r, 220));
        cleanupPannellumFadeImages();
        isTransitioning = false;

        // 9. Keep navigation lock active for an additional 400ms safety window
        // to prevent rapid double-clicks or accidental immediate reverse triggers
        navLockTimer = setTimeout(() => {
            isNavLocked = false;
            navLockTimer = null;
        }, 400);
    }

    /**
     * Update header place pill
     * Displays actual establishment name if linked; otherwise completely hides the pill
     * so no inaccurate hardcoded street title is ever shown.
     */
    function updateHeaderMeta(node) {
        if (!node || !placePillEl || !placeNameEl) return;
        const matchedPlace = (placeLinksData?.links || []).find(l => l.nodeId === node.id);

        if (matchedPlace && matchedPlace.placeName) {
            placeNameEl.textContent = matchedPlace.placeName;
            placePillEl.style.display = 'inline-flex';
        } else {
            // Remove the title entirely rather than showing an inaccurate hardcoded label
            placePillEl.style.display = 'none';
        }
    }

    /**
     * Initialize MapLibre Mini-Map in bottom-left corner
     */
    function initMinimap(initialNode) {
        const minimapContainer = document.getElementById('streetviewMinimap');
        if (!minimapContainer || typeof maplibregl === 'undefined') return;

        if (!minimapInstance) {
            minimapInstance = new maplibregl.Map({
                container: 'streetviewMinimap',
                style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
                center: [initialNode.lng, initialNode.lat],
                zoom: 16.8,
                attributionControl: false,
                dragRotate: false
            });

            minimapInstance.on('load', () => {
                // Plot all 19 nodes on the mini-map
                (manifestData.nodes || []).forEach(n => {
                    const dotEl = document.createElement('div');
                    dotEl.className = 'streetview-minimap-node-dot';
                    dotEl.setAttribute('title', `Jump to node: ${n.id}`);

                    dotEl.onclick = (e) => {
                        e.stopPropagation();
                        if (isTransitioning || isNavLocked) return;
                        transitionToNode(n.id);
                    };

                    const marker = new maplibregl.Marker({
                        element: dotEl,
                        anchor: 'center'
                    })
                        .setLngLat([n.lng, n.lat])
                        .addTo(minimapInstance);

                    minimapNodeMarkers.push({ id: n.id, marker, el: dotEl });
                });

                // Create current position glowing beacon with direction cone
                const beaconEl = document.createElement('div');
                beaconEl.className = 'streetview-current-beacon';
                beaconEl.innerHTML = `
                    <div class="streetview-beacon-cone" id="streetviewBeaconCone"></div>
                    <div class="streetview-beacon-ring"></div>
                    <div class="streetview-beacon-dot"></div>
                `;

                minimapCurrentMarker = new maplibregl.Marker({
                    element: beaconEl,
                    anchor: 'center'
                })
                    .setLngLat([initialNode.lng, initialNode.lat])
                    .addTo(minimapInstance);

                updateMinimapPosition(initialNode);
            });
        } else {
            minimapInstance.resize();
            updateMinimapPosition(initialNode);
        }

        startHeadingTracking();
    }

    /**
     * Update mini-map center and active beacon marker
     */
    function updateMinimapPosition(node) {
        if (!minimapInstance || !node) return;

        if (minimapCurrentMarker) {
            minimapCurrentMarker.setLngLat([node.lng, node.lat]);
        }

        minimapInstance.easeTo({
            center: [node.lng, node.lat],
            zoom: 16.8,
            duration: 400
        });

        minimapNodeMarkers.forEach(({ id, el }) => {
            if (id === node.id) {
                el.classList.add('active-current-node');
            } else {
                el.classList.remove('active-current-node');
            }
        });
    }

    /**
     * Continuously sync the camera yaw with the mini-map direction cone
     */
    function startHeadingTracking() {
        if (rafHeadingId) cancelAnimationFrame(rafHeadingId);

        function track() {
            if (pannellumViewer && overlayEl && overlayEl.classList.contains('active')) {
                try {
                    const yaw = pannellumViewer.getYaw();
                    const coneEl = document.getElementById('streetviewBeaconCone');
                    if (coneEl) {
                        const currentNode = manifestData?.nodes?.find(n => n.id === currentNodeId);
                        const northOffset = currentNode?.northOffset || 0;
                        const compassHeading = (yaw + northOffset + 360) % 360;
                        coneEl.style.transform = `rotate(${compassHeading}deg)`;
                    }
                } catch (_) {}
                rafHeadingId = requestAnimationFrame(track);
            }
        }

        rafHeadingId = requestAnimationFrame(track);
    }

    function stopHeadingTracking() {
        if (rafHeadingId) {
            cancelAnimationFrame(rafHeadingId);
            rafHeadingId = null;
        }
    }

    /**
     * Parses a manifest node id of the form "{lat}_{lng}" back into numeric coords.
     * Returns null if it doesn't look like a coordinate-based id.
     */
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
            if (d < bestDist) {
                bestDist = d;
                best = n;
            }
        }
        return best;
    }

    /**
     * Main Entry Point: Launch Full-Screen 360 Viewer
     * @param {string} startNodeId
     */
    async function launch360Viewer(startNodeId) {
        initDOM();
        await loadData();

        if (!manifestData || !manifestData.nodes || manifestData.nodes.length === 0) {
            console.error('[StreetView] No nodes available to display.');
            return;
        }

        // Validate starting node.
        // BUG FIX ("bumabalik sa STI building"): this used to silently fall back to
        // manifestData.nodes[0] whenever the exact id string didn't match (e.g. a
        // trailing/rounding difference between place-links.json's nodeId and the
        // id actually stored in manifest.json). Because node[0] happens to be
        // STI College - Calamba, ANY lookup miss anywhere in the app quietly
        // teleported the viewer back to STI with no error — which is exactly the
        // symptom being reported. Instead, if the exact id isn't found we now
        // parse the "{lat}_{lng}" id and snap to the closest real node by actual
        // GPS distance, so we land near where the user actually clicked/asked for.
        let node = manifestData.nodes.find(n => n.id === startNodeId);
        if (!node) {
            const parsed = parseNodeIdToCoords(startNodeId);
            if (parsed) {
                node = findNearestManifestNode(parsed.lat, parsed.lng);
            }
            if (node) {
                console.warn(`[StreetView] Node id "${startNodeId}" not found verbatim; using nearest node by coordinates instead: ${node.id}`);
            } else {
                console.warn(`[StreetView] Node "${startNodeId}" not found and could not be parsed as coordinates; defaulting to first node.`);
                node = manifestData.nodes[0];
            }
        }

        currentNodeId = node.id;
        buildScenesConfig();

        // Lock background body scroll
        document.body.style.overflow = 'hidden';

        // Reveal overlay
        overlayEl.style.display = 'block';
        requestAnimationFrame(() => {
            overlayEl.classList.add('active');
        });

        updateHeaderMeta(node);
        scheduleHintPillDismiss();

        // Initialize Pannellum if not already running
        if (!pannellumViewer) {
            containerEl.innerHTML = '';
            pannellumViewer = pannellum.viewer('calzadaPannellumContainer', {
                default: {
                    firstScene: node.id,
                    sceneFadeDuration: 0,
                    autoLoad: true
                },
                scenes: scenesConfig
            });
        } else {
            // Already initialized, load target scene directly
            pannellumViewer.loadScene(node.id, -5, 0);
        }

        // Initialize / sync mini-map
        initMinimap(node);
    }

    /**
     * Close Viewer & Return cleanly to map
     */
    function closeViewer() {
        if (!overlayEl) return;

        dismissHintPill();
        hideGroundArrow();
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

        overlayEl.classList.remove('active');
        stopHeadingTracking();

        setTimeout(() => {
            overlayEl.style.display = 'none';
            document.body.style.overflow = '';
        }, 280);

        console.log('[StreetView] Exited 360 viewer. Returned to map.');
    }

    // Expose globally on window for seamless access across components
    window.launch360Viewer = launch360Viewer;
    window.close360Viewer = closeViewer;
    window._open360Viewer = launch360Viewer;

    // Listen for custom launch events
    window.addEventListener('calzada:open-360', (e) => {
        if (e.detail && e.detail.nodeId) {
            launch360Viewer(e.detail.nodeId);
        }
    });

    // Auto-init on script load
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
