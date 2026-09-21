document.addEventListener('DOMContentLoaded', () => {

    const isDev = window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    // In production the Express API is served from this same origin (vercel.json rewrites /api/* to api/index.js),
    // so the base stays empty and every call below is same-origin: no CORS preflight, and the page can never end up
    // talking to a different deployment than the one that served it. Dev still points at the local server.
    const CHAT_API = isDev ? 'http://localhost:5000' : '';

    // Warm up the server briefly on page load (helpful for DB wakeups)
    if (CHAT_API !== '') {
        fetch(`${CHAT_API}/api/ping`, { method: 'GET' }).catch(() => { });
    } else {
        fetch('/api/ping', { method: 'GET' }).catch(() => { });
    }

    // === PASABOG KONG EFFECTS (Parallax & Glow) ===
    const mouseGlow = document.getElementById('mouseGlow');
    const parallaxLayers1 = document.querySelectorAll('.parallax-layer-1');
    const parallaxLayers2 = document.querySelectorAll('.parallax-layer-2');
    const geoBgs = document.querySelectorAll('.geo-bg');

    window.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        if (mouseGlow) {
            mouseGlow.style.left = `${clientX}px`;
            mouseGlow.style.top = `${clientY}px`;
        }
        const moveX = (clientX - window.innerWidth / 2) / 60;
        const moveY = (clientY - window.innerHeight / 2) / 60;
        parallaxLayers1.forEach(layer => {
            layer.style.transform = `translate(${moveX}px, ${moveY}px)`;
        });
        parallaxLayers2.forEach(layer => {
            layer.style.transform = `translate(${moveX * 0.5}px, ${moveY * 0.5}px)`;
        });
        geoBgs.forEach((bg, i) => {
            const factor = (i + 1) * 0.3;
            bg.style.transform = `translate(${moveX * factor}px, ${moveY * factor}px)`;
        });
    });

    // === SCROLL REVEAL ANIMATION ===
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            } else {
                entry.target.classList.remove('active');
            }
        });
    }, { threshold: 0.1 });
    revealElements.forEach(el => revealObserver.observe(el));

    // === FEATURES BAR TOGGLE (Mobile) ===
    const featuresBar = document.querySelector('.features-bar');

    if (featuresBar) {
        featuresBar.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                // Toggle expansion
                featuresBar.classList.toggle('expanded');

                // Add quick haptic-like scale effect on click
                featuresBar.style.transform = 'scale(0.95)';
                setTimeout(() => {
                    featuresBar.style.transform = '';
                }, 100);
            }
        });
    }

    // === PERSISTENT ROUTIE FLOATING CHATBOT ===
    const chatWidget = document.querySelector('.chat-widget-container');
    if (chatWidget) {
        chatWidget.classList.remove('hide-on-scroll');
    }

    // === AUTO-COLLAPSE FEATURES BAR WHEN CLICKING OUTSIDE (Mobile only) ===
    document.addEventListener('click', function (e) {
        if (!featuresBar) return;

        // Only apply on mobile and when the bar is expanded
        if (window.innerWidth <= 768 && featuresBar.classList.contains('expanded')) {
            // If the click target is NOT inside the features bar, collapse it
            if (!featuresBar.contains(e.target)) {
                featuresBar.classList.remove('expanded');
                if (window.featuresInactivityTimer) {
                    clearTimeout(window.featuresInactivityTimer);
                }
                localStorage.setItem('featuresBarExpanded', 'false');
            }
        }
    });

    // === NAVBAR SCROLL EFFECT (Floating Pill on Scroll) ===
    const navbar = document.getElementById('navbar');
    function handleNavbarScroll() {
        if (!navbar) return;
        if (window.scrollY > 10) {
            navbar.classList.add('navbar-scrolled');
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
            navbar.classList.remove('scrolled');
        }
    }
    window.addEventListener('scroll', handleNavbarScroll, { passive: true });
    handleNavbarScroll(); // Initial check

    // === FAQ ACCORDION LOGIC & FILTERING ===
    const faqItems = document.querySelectorAll('.faq-item');
    const faqSearchInput = document.getElementById('faqSearchInput');
    const faqPills = document.querySelectorAll('.faq-pill');
    const faqNoResults = document.getElementById('faqNoResults');

    if (faqItems.length > 0) {
        faqItems.forEach(item => {
            const questionBtn = item.querySelector('.faq-question');
            if (questionBtn) {
                questionBtn.addEventListener('click', () => {
                    const isActive = item.classList.contains('active');
                    faqItems.forEach(otherItem => { otherItem.classList.remove('active'); });
                    if (!isActive) { item.classList.add('active'); }
                });
            }
        });

        let activeCategory = 'all';

        function filterFaqs() {
            const query = faqSearchInput ? faqSearchInput.value.toLowerCase().trim() : '';
            let visibleCount = 0;

            faqItems.forEach(item => {
                const category = item.getAttribute('data-category');
                const text = item.textContent.toLowerCase();

                const categoryMatch = (activeCategory === 'all' || category === activeCategory);
                const searchMatch = !query || text.includes(query);

                if (categoryMatch && searchMatch) {
                    item.style.display = 'block';
                    visibleCount++;
                } else {
                    item.style.display = 'none';
                }
            });

            if (faqNoResults) {
                faqNoResults.style.display = (visibleCount === 0) ? 'block' : 'none';
            }
        }

        if (faqSearchInput) {
            faqSearchInput.addEventListener('input', filterFaqs);
        }

        if (faqPills.length > 0) {
            faqPills.forEach(pill => {
                pill.addEventListener('click', () => {
                    faqPills.forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    activeCategory = pill.getAttribute('data-category');
                    filterFaqs();
                });
            });
        }
    }

    // === TRANSPORT CHIP SELECTION ===
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });



    // === SEARCH BAR LOGIC ===
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');
    const searchBtn = document.getElementById('searchBtn');

    if (searchInput && searchResults) {
        const osmAttribution = `<div class="search-osm-attribution"><span>${window.t('js.osm_attribution')}</span></div>`;

        const buildResultItem = (name, address, onClick) => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `<ion-icon name="location-outline" class="result-icon"></ion-icon><div><div class="result-name">${name}</div><div class="result-type">${address}</div></div>`;
            item.addEventListener('click', onClick);
            return item;
        };

        const showResults = (items, showAttribution = false) => {
            searchResults.innerHTML = '';
            items.forEach(el => searchResults.appendChild(el));
            if (showAttribution && items.length > 0) {
                searchResults.insertAdjacentHTML('beforeend', osmAttribution);
            }
            searchResults.classList.add('active');
        };

        let nominatimDebounce;

        const handleSearch = async () => {
            const val = searchInput.value.trim();
            if (val.length === 0) { searchResults.classList.remove('active'); return; }
            searchResults.innerHTML = '';
            searchResults.classList.remove('active');
            clearTimeout(nominatimDebounce);
            if (val.length < 3) return;
            nominatimDebounce = setTimeout(async () => {
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&addressdetails=1&limit=6&countrycodes=ph`,
                        { headers: { 'Accept-Language': 'en' } }
                    );
                    const data = await res.json();
                    if (!data.length) return;
                    const apiItems = data.map(place => {
                        const name = place.name || place.display_name.split(',')[0];
                        const parts = place.display_name.split(',').slice(1, 4).map(s => s.trim());
                        const address = parts.join(', ');
                        return buildResultItem(name, address, () => {
                            window.location.href = `planner.html?dest=${encodeURIComponent(name)}&dlat=${place.lat}&dlng=${place.lon}`;
                        });
                    });
                    showResults(apiItems, true);
                } catch (e) { /* Silently fail */ }
            }, 350);
        };

        const cleanInputName = (str) => {
            if (!str) return "";
            let cleaned = str.replace(/[^a-zA-Z0-9\s,\.\-ñÑéÉáÁíÍóÓúÚ]/g, '');
            cleaned = cleaned.replace(/\s+/g, ' ').trim();
            if (!cleaned) return "";
            const words = cleaned.toLowerCase().split(' ');
            const prepositions = ["ng", "sa", "at", "de", "the", "of", "in"];
            for (let i = 0; i < words.length; i++) {
                if (i === 0 || !prepositions.includes(words[i])) {
                    words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);
                }
            }
            return words.join(' ');
        };

        let cleanDebounce;
        searchInput.setAttribute('autocomplete', 'off');
        searchInput.addEventListener('input', () => {
            clearTimeout(cleanDebounce);
            cleanDebounce = setTimeout(() => {
                if (searchInput.value.trim().length > 0) {
                    const currentVal = searchInput.value;
                    const cleanedVal = cleanInputName(currentVal);
                    if (currentVal !== cleanedVal) {
                        const start = searchInput.selectionStart;
                        const end = searchInput.selectionEnd;
                        searchInput.value = cleanedVal;
                        if (start !== null && end !== null) {
                            try { searchInput.setSelectionRange(start, end); } catch (e) { }
                        }
                    }
                }
            }, 600);
            handleSearch();
        });

        const performFinalSearch = async () => {
            const rawVal = searchInput.value;
            const cleanedVal = cleanInputName(rawVal);
            if (!cleanedVal) return;
            try {
                const res = await fetch(
                    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanedVal)}&format=json&addressdetails=1&limit=1&countrycodes=ph`,
                    { headers: { 'Accept-Language': 'en' } }
                );
                const data = await res.json();
                let finalDest = cleanedVal;
                if (data && data.length > 0) {
                    finalDest = data[0].name || data[0].display_name.split(',')[0];
                }
                window.location.href = `planner.html?dest=${encodeURIComponent(finalDest)}`;
            } catch (e) {
                window.location.href = `planner.html?dest=${encodeURIComponent(cleanedVal)}`;
            }
        };

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); performFinalSearch(); }
        });

        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => { e.preventDefault(); performFinalSearch(); });
        }

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });
    }

    // === MOBILE MENU / SIDE DRAWER TOGGLE WITH SCROLL-LOCK ===
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    const sideDrawer = document.getElementById('sideDrawer');
    const sideDrawerOverlay = document.getElementById('sideDrawerOverlay');
    const drawerCloseBtn = document.getElementById('drawerCloseBtn');

    function updateActiveDrawerNav() {
        const pathParts = window.location.pathname.split('/');
        const rawPath = pathParts.pop().split('?')[0].split('#')[0];
        const currentPath = (!rawPath || rawPath === '' || rawPath === '/') ? 'index.html' : rawPath;

        const drawerItems = document.querySelectorAll('.drawer-nav-item, .drawer-links a');
        drawerItems.forEach(item => {
            const rawHref = item.getAttribute('href') || '';
            if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) {
                item.classList.remove('active');
                return;
            }
            const href = rawHref.split('/').pop().split('?')[0].split('#')[0];
            if (!href) {
                item.classList.remove('active');
                return;
            }
            const isMatch = (
                href === currentPath ||
                (currentPath === 'index.html' && href === 'index.html') ||
                (currentPath === 'places.html' && href === 'places.html') ||
                (currentPath === 'about.html' && href === 'about.html') ||
                (currentPath === 'planner.html' && href === 'planner.html') ||
                (currentPath === 'faq.html' && href === 'faq.html') ||
                (currentPath === 'feedback.html' && href === 'feedback.html')
            );
            if (isMatch) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // Determine which mobile menu system this page uses:
    // Pages WITH sideDrawer (index, about, places, faq, feedback, planner) → use side-drawer only
    // Pages WITHOUT sideDrawer (terms, privacy, business) → use navLinks floating card
    const hasSideDrawer = !!sideDrawer;

    function setMobileMenuState(isOpen) {
        if (hasSideDrawer && sideDrawer && sideDrawerOverlay) {
            // Use the glassmorphism side-drawer as the sole mobile menu
            sideDrawer.style.transition = '';
            sideDrawerOverlay.style.transition = '';
            sideDrawer.style.transform = '';
            sideDrawerOverlay.style.opacity = '';
            void sideDrawer.offsetWidth;

            sideDrawer.classList.toggle('open', isOpen);
            sideDrawerOverlay.classList.toggle('visible', isOpen);

            if (isOpen) {
                updateActiveDrawerNav();
            }
        } else if (!hasSideDrawer && navLinks) {
            // Fallback: use the nav-center floating card (terms, privacy, business pages)
            navLinks.classList.toggle('active', isOpen);
        }
        if (mobileMenuBtn) {
            const menuIcon = mobileMenuBtn.querySelector('.menu-toggle-icon');
            if (menuIcon) {
                menuIcon.classList.toggle('open', isOpen);
            }
        }
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }

    function isMobileMenuOpen() {
        if (hasSideDrawer) {
            return sideDrawer && sideDrawer.classList.contains('open');
        }
        return navLinks && navLinks.classList.contains('active');
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            setMobileMenuState(!isMobileMenuOpen());
        });
    }

    if (drawerCloseBtn) {
        drawerCloseBtn.addEventListener('click', () => setMobileMenuState(false));
    }
    if (sideDrawerOverlay) {
        sideDrawerOverlay.addEventListener('click', () => setMobileMenuState(false));
    }

    // Close nav-center floating card on link click (only when it's the active mobile menu)
    if (!hasSideDrawer && navLinks) {
        navLinks.querySelectorAll('.nav-link, .btn-plan-route, a').forEach(link => {
            link.addEventListener('click', (e) => {
                if (link.id === 'exploreDropdownBtn' || link.closest('#exploreDropdownBtn')) {
                    return;
                }
                setMobileMenuState(false);
            });
        });
    }

    if (sideDrawer) {
        sideDrawer.querySelectorAll('.drawer-nav-item, .drawer-links a').forEach(link => {
            link.addEventListener('click', () => {
                if (link.id === 'drawerRoutieLink') return;
                setMobileMenuState(false);
            });
        });

        // Touch swipe-to-close on sideDrawer
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

            const delta = Math.max(0, x - drawerTouchStartX);
            sideDrawer.style.transform = `translateX(${delta}px)`;

            if (sideDrawerOverlay) {
                const drawerWidth = sideDrawer.offsetWidth;
                const progress = delta / drawerWidth;
                sideDrawerOverlay.style.opacity = (1 - progress).toString();
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!drawerDragging) return;
            drawerDragging = false;

            const swipedFarRight = drawerTouchLastX - drawerTouchStartX > sideDrawer.offsetWidth * 0.4;
            const flingRight = drawerVelocityX > 0.5;

            sideDrawer.style.transition = 'transform 0.42s cubic-bezier(0.32, 0.72, 0, 1)';
            if (sideDrawerOverlay) sideDrawerOverlay.style.transition = 'opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1)';

            if (swipedFarRight || flingRight) {
                setMobileMenuState(false);
                setTimeout(() => {
                    sideDrawer.style.transition = '';
                    if (sideDrawerOverlay) sideDrawerOverlay.style.transition = '';
                }, 450);
            } else {
                sideDrawer.style.transform = 'translateX(0)';
                if (sideDrawerOverlay) sideDrawerOverlay.style.opacity = '1';
                setTimeout(() => {
                    sideDrawer.style.transition = '';
                    if (sideDrawerOverlay) {
                        sideDrawerOverlay.style.transition = '';
                        sideDrawerOverlay.style.opacity = '';
                    }
                    sideDrawer.style.transform = '';
                }, 450);
            }
        });
    }

    // Close mobile drawer on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (isMobileMenuOpen()) {
                setMobileMenuState(false);
            }
        }
    });

    // Initialize active drawer nav
    updateActiveDrawerNav();

    // Ensure body scroll lock is cleared if navigating away
    window.addEventListener('pagehide', () => {
        document.body.style.overflow = '';
    });
    window.addEventListener('beforeunload', () => {
        document.body.style.overflow = '';
    });

    // === VIRTUAL KEYBOARD DETECT (Mobile UI Fix) ===
    const focusableInputs = document.querySelectorAll('input, textarea');
    focusableInputs.forEach(input => {
        input.addEventListener('focus', () => document.body.classList.add('keyboard-open'));
        input.addEventListener('blur', () => document.body.classList.remove('keyboard-open'));
    });

    // === CHATBOT ===
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatWindow = document.getElementById('chatWindow');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatInput = document.getElementById('chatInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const chatMessages = document.getElementById('chatMessages');
    const routieLink = document.getElementById('routieLink');
    const drawerRoutieLink = document.getElementById('drawerRoutieLink');

    let inactivityTimer;
    const INACTIVITY_LIMIT = 120000;

    // === ROUTIE ATTENTION WIGGLE ANIMATION ===
    let routieAttentionInterval = null;
    const routieAvatar = chatToggleBtn ? chatToggleBtn.querySelector('.chat-pill-avatar') : null;

    function triggerRoutieAttention() {
        if (!routieAvatar) return;
        if (chatWindow && chatWindow.classList.contains('open')) return;
        routieAvatar.classList.remove('attention-wiggle');
        void routieAvatar.offsetWidth; // Force CSS reflow to retrigger cleanly
        routieAvatar.classList.add('attention-wiggle');
        setTimeout(() => {
            if (routieAvatar) routieAvatar.classList.remove('attention-wiggle');
        }, 650);
    }

    function startRoutieAttentionLoop() {
        stopRoutieAttentionLoop();
        // Trigger periodic attention wiggle every 5 seconds while chat is closed
        routieAttentionInterval = setInterval(triggerRoutieAttention, 5000);
    }

    function stopRoutieAttentionLoop() {
        if (routieAttentionInterval) {
            clearInterval(routieAttentionInterval);
            routieAttentionInterval = null;
        }
        if (routieAvatar) {
            routieAvatar.classList.remove('attention-wiggle');
        }
    }

    startRoutieAttentionLoop();

    // === AUTO-CLOSE ON OUTSIDE CLICK & PAGE SCROLL ===
    let isAutoCloseAttached = false;
    let lastViewportResizeTime = 0;
    let lastChatInputFocusTime = 0;

    function isMobileOrTouch() {
        const isSmallScreen = window.innerWidth <= 768;
        const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        return isSmallScreen || (isCoarsePointer && hasTouch);
    }

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            lastViewportResizeTime = Date.now();
        });
    }

    if (chatInput) {
        chatInput.addEventListener('focus', () => {
            lastChatInputFocusTime = Date.now();
        });
    }

    function handleOutsideClick(e) {
        if (!chatWindow || !chatWindow.classList.contains('open')) return;
        if (!e) return;

        // Resolve element target (handle text nodes, SVGs, etc.)
        let target = e.target;
        if (target && target.nodeType === 3) {
            target = target.parentElement;
        }
        if (!target || !(target instanceof Element)) return;

        // 1. If clicked/tapped element is inside chatWindow, do NOT close
        if (chatWindow.contains(target)) return;

        // 2. If clicked/tapped element is inside chatToggleBtn, do NOT close
        if (chatToggleBtn && chatToggleBtn.contains(target)) return;

        // 3. If clicked/tapped element is inside any Routie open trigger, do NOT close
        if (target.closest && (
            target.closest('#chatToggleBtn') || 
            target.closest('#routieLink') || 
            target.closest('#drawerRoutieLink') || 
            target.closest('#routieBannerBtn') || 
            target.closest('#faqRoutieCtaBtn') || 
            target.closest('#routieFeatureBtn')
        )) {
            return;
        }

        // 4. Exclude keyboard-induced layout shifts and focus transitions:
        // When on-screen keyboard appears, visualViewport fires resize and coordinates shift.
        // Ignore any clicks/taps during active keyboard transition (< 450ms).
        if (Date.now() - lastViewportResizeTime < 450) return;
        if (Date.now() - lastChatInputFocusTime < 450) return;

        // Genuine outside click or tap — close the chat
        closeChat();
    }

    function handlePageScroll(e) {
        // 1. NEVER close on scroll for mobile or touch devices.
        // On mobile, opening/closing the virtual keyboard and touch rubber-banding/momentum
        // constantly fire window scroll events, which must NEVER close the chat window.
        if (isMobileOrTouch()) return;

        // 2. If scroll originated from within the chat window (e.g. scrolling messages), ignore it
        if (e && e.target && chatWindow && chatWindow.contains(e.target)) return;

        // 3. Ignore if chat is not open
        if (!chatWindow || !chatWindow.classList.contains('open')) return;

        // Desktop only: genuine scroll of the outer page closes the chat
        closeChat();
    }

    function attachAutoCloseListeners() {
        if (isAutoCloseAttached) return;
        isAutoCloseAttached = true;
        // Delay slightly so the triggering click doesn't close the chat immediately
        setTimeout(() => {
            if (!isAutoCloseAttached) return;
            // Listen for pointerdown / tap outside
            document.addEventListener('pointerdown', handleOutsideClick, true);

            // On DESKTOP ONLY: close when the page outside the chat is scrolled.
            // On mobile / touch devices: scroll-to-close is disabled.
            if (!isMobileOrTouch()) {
                window.addEventListener('scroll', handlePageScroll, { passive: true });
            }
        }, 150);
    }

    function detachAutoCloseListeners() {
        isAutoCloseAttached = false;
        document.removeEventListener('pointerdown', handleOutsideClick, true);
        window.removeEventListener('scroll', handlePageScroll);
    }

    // Stop internal chat scroll from bubbling up as a window scroll
    if (chatWindow) {
        chatWindow.addEventListener('scroll', (e) => e.stopPropagation(), { passive: true });
    }
    if (chatMessages) {
        chatMessages.addEventListener('scroll', (e) => e.stopPropagation(), { passive: true });
    }

    const closeChat = () => {
        if (!chatWindow || !chatWindow.classList.contains('open')) return;
        // Cleanly blur input so virtual keyboard dismisses
        if (chatInput && document.activeElement === chatInput) {
            chatInput.blur();
        }
        interruptTyping();
        document.body.classList.remove('chat-active');
        document.body.classList.remove('keyboard-open');
        chatWindow.classList.remove('open');
        if (chatToggleBtn) {
            const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
            if (pulseRing) pulseRing.style.animation = '';
        }
        if (typeof inactivityTimer !== 'undefined' && inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }
        detachAutoCloseListeners();
        startRoutieAttentionLoop();
    };

    window.closeChat = closeChat;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (chatWindow && chatWindow.classList.contains('open')) {
            inactivityTimer = setTimeout(() => {
                const cancelBtn = document.getElementById('cancelMicBtn');
                if (cancelBtn) cancelBtn.click();
                addMessage(window.t('js.session_ended'), false);
                closeChat();
            }, INACTIVITY_LIMIT);
        }
    }

    if (chatWindow) {
        chatWindow.addEventListener('click', resetInactivityTimer);
        chatWindow.addEventListener('input', resetInactivityTimer);
    }

    const openChat = (e) => {
        if (e) e.preventDefault();
        
        // Pre-warm the server when chat is opened
        fetch(`${CHAT_API}/api/ping`, { method: 'GET' }).catch(() => { });

        stopRoutieAttentionLoop();
        document.body.classList.add('chat-active');
        if (chatWindow) {
            chatWindow.classList.add('open');
            // Auto-focus on desktop; on mobile let user tap the input deliberately
            if (chatInput && !isMobileOrTouch()) {
                setTimeout(() => chatInput.focus(), 350);
            }
            resetInactivityTimer();
            attachAutoCloseListeners();
        }
        const sideDrawer = document.getElementById('sideDrawer');
        const overlay = document.getElementById('sideDrawerOverlay');
        if (sideDrawer) sideDrawer.classList.remove('open');
        if (overlay) overlay.classList.remove('visible');
    };

    window.openChat = openChat;

    if (chatToggleBtn) {
        chatToggleBtn.addEventListener('click', (e) => {
            if (chatWindow && chatWindow.classList.contains('open')) {
                closeChat();
            } else {
                openChat(e);
            }
        });
    }

    if (routieLink) routieLink.addEventListener('click', openChat);
    if (drawerRoutieLink) drawerRoutieLink.addEventListener('click', openChat);
    const routieBannerBtn = document.getElementById('routieBannerBtn');
    if (routieBannerBtn) routieBannerBtn.addEventListener('click', openChat);
    const faqRoutieCtaBtn = document.getElementById('faqRoutieCtaBtn');
    if (faqRoutieCtaBtn) faqRoutieCtaBtn.addEventListener('click', openChat);
    const routieFeatureBtn = document.getElementById('routieFeatureBtn');
    if (routieFeatureBtn) routieFeatureBtn.addEventListener('click', openChat);

    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            closeChat();
        });
    }

    // Chat History Persistence & Typing Effect State
    let chatHistory = JSON.parse(sessionStorage.getItem('calzadaChatHistory')) || [];
    let currentTypingState = null;

    // Interrupt typing effect: instantly jump to full content and stop cursor
    function interruptTyping() {
        if (!currentTypingState) return;

        const { timerId, fullText, textNode, msgDiv, cursorSpan, save } = currentTypingState;
        if (timerId) clearTimeout(timerId);

        if (textNode) {
            textNode.nodeValue = fullText;
        } else if (msgDiv) {
            msgDiv.textContent = fullText;
        }

        if (cursorSpan && cursorSpan.parentNode) {
            cursorSpan.parentNode.removeChild(cursorSpan);
        }

        if (save) {
            chatHistory.push({ text: fullText, isUser: false });
            sessionStorage.setItem('calzadaChatHistory', JSON.stringify(chatHistory));
        }

        currentTypingState = null;

        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    function addMessage(text, isUser = false, save = true, animate = true) {
        if (!chatMessages) return;

        // Immediately complete any ongoing bot typing when user sends message or history is restored
        if (isUser || !animate) {
            interruptTyping();
        }

        if (!isUser && animate) {
            addBotMessageWithTyping(text, save);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isUser ? 'user-wrapper' : 'bot-wrapper'}`;

        if (!isUser) {
            const avatar = document.createElement('div');
            avatar.className = 'bot-avatar';
            avatar.innerHTML = '<img src="../assets/DyipTok-icon.png" alt="Routie">';
            wrapper.appendChild(avatar);
        }

        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
        msgDiv.textContent = text;
        wrapper.appendChild(msgDiv);
        chatMessages.appendChild(wrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (save) {
            chatHistory.push({ text, isUser });
            sessionStorage.setItem('calzadaChatHistory', JSON.stringify(chatHistory));
        }
    }

    function addBotMessageWithTyping(fullText, save = true, speed = 18) {
        if (!chatMessages) return;

        // Ensure any previous bot typing is resolved first
        interruptTyping();

        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper bot-wrapper';

        const avatar = document.createElement('div');
        avatar.className = 'bot-avatar';
        avatar.innerHTML = '<img src="../assets/DyipTok-icon.png" alt="Routie">';
        wrapper.appendChild(avatar);

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message bot-message';

        const textNode = document.createTextNode('');
        const cursorSpan = document.createElement('span');
        cursorSpan.className = 'typing-cursor';

        msgDiv.appendChild(textNode);
        msgDiv.appendChild(cursorSpan);
        wrapper.appendChild(msgDiv);
        chatMessages.appendChild(wrapper);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        let currentIndex = 0;
        const punctuationChars = new Set(['.', ',', '\n', '?', '!', ':', ';']);

        currentTypingState = {
            timerId: null,
            fullText,
            msgDiv,
            textNode,
            cursorSpan,
            save
        };

        function typeNextChar() {
            if (!currentTypingState) return;

            if (currentIndex >= fullText.length) {
                // Completed typing out full text
                if (cursorSpan && cursorSpan.parentNode) {
                    cursorSpan.parentNode.removeChild(cursorSpan);
                }
                if (save) {
                    chatHistory.push({ text: fullText, isUser: false });
                    sessionStorage.setItem('calzadaChatHistory', JSON.stringify(chatHistory));
                }
                currentTypingState = null;
                if (chatMessages) {
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                return;
            }

            const char = fullText[currentIndex];
            currentIndex++;

            textNode.nodeValue = fullText.substring(0, currentIndex);

            // Auto-scroll on every character addition
            if (chatMessages) {
                chatMessages.scrollTop = chatMessages.scrollHeight;
            }

            // Punctuation Pause (natural cadence: 65ms for punctuation, 18ms per character)
            let delay = speed;
            if (punctuationChars.has(char)) {
                delay = 65;
            }

            currentTypingState.timerId = setTimeout(typeNextChar, delay);
        }

        typeNextChar();
    }

    // Load History on Startup (Instant rendering without animation)
    function loadChatHistory() {
        if (!chatMessages) return;
        if (chatHistory.length === 0) return;
        chatMessages.innerHTML = '';
        chatHistory.forEach(msg => addMessage(msg.text, msg.isUser, false, false));
    }
    loadChatHistory();

    let typingIndicatorEl = null;
    let typingWrapperEl = null;

    function showTyping() {
        if (!chatMessages) return;
        typingWrapperEl = document.createElement('div');
        typingWrapperEl.className = 'message-wrapper bot-wrapper';
        const avatar = document.createElement('div');
        avatar.className = 'bot-avatar';
        avatar.innerHTML = '<img src="../assets/DyipTok-icon.png" alt="Routie">';
        typingWrapperEl.appendChild(avatar);
        typingIndicatorEl = document.createElement('div');
        typingIndicatorEl.classList.add('typing-indicator');
        typingIndicatorEl.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        typingWrapperEl.appendChild(typingIndicatorEl);
        chatMessages.appendChild(typingWrapperEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTyping() {
        if (typingWrapperEl && typingWrapperEl.parentNode) {
            typingWrapperEl.parentNode.removeChild(typingWrapperEl);
        }
        typingIndicatorEl = null;
        typingWrapperEl = null;
    }

    async function handleChatSend() {
        const text = chatInput.value.trim();
        if (!text) return;

        interruptTyping();
        addMessage(text, true);
        try {
            if (window.CalzadaActivity && typeof window.CalzadaActivity.addChatMessage === 'function') {
                window.CalzadaActivity.addChatMessage('user', text);
            }
        } catch (_) {}

        chatInput.value = '';
        updateChatInputHeight();
        updateSendButtonState();
        clearVoiceError();
        resetInactivityTimer();

        showTyping();

        const ctx = window._calzadaRouteContext || {};
        const routeInfo = (ctx && ctx.origin) ? `
[ROUTE INFO]
Origin: ${ctx.origin}
Destination: ${ctx.destination}
ETA: ${ctx.eta || 'unknown'}
Fare: \u20b1${ctx.totalFare || 'unknown'}
Distance: ${ctx.totalDistance || 'unknown'} km
` : '';

        const fullMessageWithContext = `${routeInfo}\n\nUser Message: ${text}`;
        const payload = {
            message: fullMessageWithContext,
            lang: typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'en'
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s for Render cold starts

        try {
            const response = await fetch(`${CHAT_API}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const data = await response.json();
            removeTyping();

            let botReply = null;
            if (data.choices && data.choices[0]?.message?.content) {
                botReply = data.choices[0].message.content;
            } else if (data.reply) {
                botReply = data.reply;
            }

            if (botReply) {
                addMessage(botReply, false);
                try {
                    if (window.CalzadaActivity && typeof window.CalzadaActivity.addChatMessage === 'function') {
                        window.CalzadaActivity.addChatMessage('routie', botReply);
                    }
                } catch (_) {}
            } else {
                if (isDev) console.error("API Error:", data);
                let errMsg = window.t('js.error_system');
                if (data.error && data.error.message) { errMsg = `API Error: ${data.error.message}`; }
                addMessage(errMsg, false);
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (isDev) console.error("API Network Exception:", error);
            removeTyping();
            if (error.name === 'AbortError') {
                addMessage(window.t('js.server_wakeup'), false);
            } else {
                addMessage(window.t('js.error_connection'), false);
            }
        }
    }

    // === CHAT INPUT AUTO-GROW & SEND STATE ===
    function updateSendButtonState() {
        if (!sendMessageBtn || !chatInput) return;
        const text = chatInput.value.trim();
        sendMessageBtn.disabled = !text;
    }

    function updateChatInputHeight() {
        if (!chatInput) return;
        chatInput.style.height = 'auto';
        const scrollH = chatInput.scrollHeight;
        const maxHeight = 96; // auto-grows up to ~4 rows
        if (scrollH > maxHeight) {
            chatInput.style.height = maxHeight + 'px';
            chatInput.classList.add('scrolling');
            chatInput.style.overflowY = 'auto';
        } else {
            chatInput.style.height = Math.max(24, scrollH) + 'px';
            chatInput.classList.remove('scrolling');
            chatInput.style.overflowY = 'hidden';
        }
    }

    function triggerAutoExpand() {
        updateChatInputHeight();
    }

    if (chatInput) {
        chatInput.addEventListener('input', function () {
            updateChatInputHeight();
            updateSendButtonState();
            clearVoiceError();
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim()) {
                    handleChatSend();
                }
            }
        });

        const inputArea = chatInput.closest('.chat-input-area');
        if (inputArea) {
            inputArea.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    chatInput.focus();
                }
            });
        }
    }

    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (chatInput && chatInput.value.trim()) {
                handleChatSend();
            }
        });
        updateSendButtonState();
    }

    // === VOICE MESSAGING (Minimal, robust SpeechRecognition) ===
    const micBtn = document.getElementById('micBtn');
    const voiceErrorEl = document.getElementById('chatVoiceError');
    let recognition = null;
    let isListening = false;
    let preVoiceText = '';

    function showVoiceError(key, fallback) {
        if (!voiceErrorEl) return;
        const msg = (typeof window.t === 'function' ? window.t(key) : '') || fallback;
        voiceErrorEl.textContent = msg;
        voiceErrorEl.style.display = 'block';
    }

    function clearVoiceError() {
        if (voiceErrorEl) {
            voiceErrorEl.textContent = '';
            voiceErrorEl.style.display = 'none';
        }
    }

    function stopListeningUI() {
        isListening = false;
        if (micBtn) {
            micBtn.classList.remove('recording');
            micBtn.setAttribute('aria-pressed', 'false');
            const label = (typeof window.t === 'function' ? window.t('chat.voice_input') : 'Voice input');
            micBtn.setAttribute('aria-label', label);
            micBtn.setAttribute('title', label);
        }
    }

    function stopListening() {
        if (recognition) {
            try { recognition.stop(); } catch (_) {}
        }
        stopListeningUI();
    }

    function startListening() {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            showVoiceError('chat.voice_err_unsupported', "Voice input isn't available in this browser. Try Chrome or Edge.");
            return;
        }

        clearVoiceError();

        try {
            recognition = new SpeechRec();
            recognition.continuous = false;
            recognition.interimResults = true;

            const curLang = (typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'en');
            recognition.lang = (curLang === 'tl' ? 'fil-PH' : 'en-PH');

            preVoiceText = chatInput ? chatInput.value : '';

            recognition.onstart = () => {
                isListening = true;
                resetInactivityTimer();
                if (micBtn) {
                    micBtn.classList.add('recording');
                    micBtn.setAttribute('aria-pressed', 'true');
                    const stopLabel = (typeof window.t === 'function' ? window.t('chat.voice_stop') : 'Stop listening');
                    micBtn.setAttribute('aria-label', stopLabel);
                    micBtn.setAttribute('title', stopLabel);
                }
            };

            recognition.onresult = (event) => {
                let interim = '';
                let final = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const trans = event.results[i][0].transcript;
                    if (event.results[i].isFinal) final += trans;
                    else interim += trans;
                }
                const speechPart = (final || interim).trim();
                if (chatInput && speechPart) {
                    const base = preVoiceText.trim();
                    chatInput.value = base ? base + ' ' + speechPart : speechPart;
                    updateChatInputHeight();
                    updateSendButtonState();
                }
            };

            recognition.onerror = (event) => {
                stopListeningUI();
                const err = event.error;
                if (err === 'not-allowed' || err === 'service-not-allowed') {
                    showVoiceError('chat.voice_err_permission', "Microphone access was denied. Please allow microphone access in your browser settings.");
                } else if (err === 'no-speech') {
                    showVoiceError('chat.voice_err_no_speech', "No speech was detected. Please try speaking again.");
                } else if (err === 'network') {
                    showVoiceError('chat.voice_err_network', "Network error during speech recognition. Please check your connection.");
                } else if (err !== 'aborted') {
                    showVoiceError('chat.voice_err_generic', "Voice input error occurred. Please try again.");
                }
            };

            recognition.onend = () => {
                stopListeningUI();
            };

            recognition.start();
        } catch (err) {
            stopListeningUI();
            showVoiceError('chat.voice_err_generic', "Voice input error occurred. Please try again.");
        }
    }

    if (micBtn) {
        micBtn.setAttribute('type', 'button');
        micBtn.setAttribute('aria-label', (window.t ? window.t('chat.voice_input') : 'Voice input'));
        micBtn.setAttribute('aria-pressed', 'false');
        micBtn.addEventListener('click', (e) => {
            e.preventDefault();
            resetInactivityTimer();
            if (isListening) {
                stopListening();
            } else {
                startListening();
            }
        });
    }

    window.addEventListener('calzada_lang_changed', () => {
        const chatMsgs = document.getElementById('chatMessages');
        if (chatMsgs && chatMsgs.children.length === 1) {
            const firstMsg = chatMsgs.querySelector('.bot-message');
            if (firstMsg) firstMsg.textContent = window.t('chat.greeting');
        }
        if (micBtn) {
            const label = isListening
                ? (window.t ? window.t('chat.voice_stop') : 'Stop listening')
                : (window.t ? window.t('chat.voice_input') : 'Voice input');
            micBtn.setAttribute('aria-label', label);
            micBtn.setAttribute('title', label);
        }
        if (sendMessageBtn) {
            const sendLabel = (window.t ? window.t('chat.send') : 'Send message');
            sendMessageBtn.setAttribute('aria-label', sendLabel);
            sendMessageBtn.setAttribute('title', sendLabel);
        }
        if (typeof window.applyLang === 'function') window.applyLang();
    });

    // === CATEGORY SCROLL NAVIGATION (Desktop) ===
    const tabs = document.getElementById('categoryTabs');
    const btnLeft = document.getElementById('catScrollLeft');
    const btnRight = document.getElementById('catScrollRight');

    function updateCatScrollButtons() {
        if (!tabs || !btnLeft || !btnRight) return;
        const canScrollLeft = tabs.scrollLeft > 5;
        const canScrollRight = tabs.scrollLeft < (tabs.scrollWidth - tabs.clientWidth - 5);
        btnLeft.classList.toggle('visible', canScrollLeft);
        btnRight.classList.toggle('visible', canScrollRight);
    }

    if (tabs && btnLeft && btnRight) {
        setTimeout(updateCatScrollButtons, 300);
        tabs.addEventListener('scroll', updateCatScrollButtons);
        window.addEventListener('resize', updateCatScrollButtons);
        btnLeft.addEventListener('click', () => { tabs.scrollBy({ left: -280, behavior: 'smooth' }); });
        btnRight.addEventListener('click', () => { tabs.scrollBy({ left: 280, behavior: 'smooth' }); });
    }
});

// === GLOBAL AUTHENTICATION LOGIC ===

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = input.parentElement
        ? input.parentElement.querySelector('.btn-toggle-pass')
        : input.nextElementSibling;

    if (input.type === 'password') {
        // Switch to visible plain text: icon must be OPEN
        input.type = 'text';
        if (icon) {
            icon.setAttribute('name', 'eye-outline');
            icon.name = 'eye-outline';
        }
    } else {
        // Switch to hidden dots: icon must be CLOSED/SLASHED
        input.type = 'password';
        if (icon) {
            icon.setAttribute('name', 'eye-off-outline');
            icon.name = 'eye-off-outline';
        }
    }
}

function checkPasswordStrength() {
    const passInput = document.getElementById('regPass');
    if (!passInput) return;
    const val = passInput.value;
    const reqLength = document.getElementById('req-length');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');
    if (val.length >= 8) { reqLength.classList.add('met'); reqLength.querySelector('ion-icon').name = 'checkmark-circle'; }
    else { reqLength.classList.remove('met'); reqLength.querySelector('ion-icon').name = 'close-circle-outline'; }
    if (/\d/.test(val)) { reqNumber.classList.add('met'); reqNumber.querySelector('ion-icon').name = 'checkmark-circle'; }
    else { reqNumber.classList.remove('met'); reqNumber.querySelector('ion-icon').name = 'close-circle-outline'; }
    if (/[!@#$%^&*(),.?":{}|<>]/.test(val)) { reqSpecial.classList.add('met'); reqSpecial.querySelector('ion-icon').name = 'checkmark-circle'; }
    else { reqSpecial.classList.remove('met'); reqSpecial.querySelector('ion-icon').name = 'close-circle-outline'; }
}

// === GLOBAL NAVBAR & MOBILE OVERLAY INTERACTIVITY ===
(function () {
    function initGlobalNavbar() {
        // --- Mobile Search Overlay ---
        const overlay = document.getElementById('mobileSearchOverlay');
        const openBtn = document.getElementById('mobileSearchBtn');
        const closeBtn = document.getElementById('mobileSearchClose');
        const backdrop = document.getElementById('mobileSearchBackdrop');
        const mobileInput = document.getElementById('mobileSearchInput');
        const mobileResults = document.getElementById('mobileSearchResults');
        const mobileSubmit = document.getElementById('mobileSearchSubmit');

        function openOverlay() {
            if (!overlay) return;
            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
            setTimeout(() => mobileInput && mobileInput.focus(), 120);
        }
        function closeOverlay() {
            if (!overlay) return;
            overlay.classList.remove('open');
            document.body.style.overflow = '';
            if (mobileInput) mobileInput.value = '';
            if (mobileResults) { mobileResults.innerHTML = ''; mobileResults.style.display = 'none'; }
        }

        if (openBtn) openBtn.addEventListener('click', openOverlay);
        if (closeBtn) closeBtn.addEventListener('click', closeOverlay);
        if (backdrop) backdrop.addEventListener('click', closeOverlay);

        function doMobileSearch() {
            const q = mobileInput ? mobileInput.value.trim() : '';
            if (q) {
                try {
                    if (window.CalzadaActivity && typeof window.CalzadaActivity.addSearchHistory === 'function') {
                        window.CalzadaActivity.addSearchHistory(q);
                    }
                } catch (_) {}
                window.location.href = 'places.html?q=' + encodeURIComponent(q);
            }
        }
        if (mobileSubmit) mobileSubmit.addEventListener('click', doMobileSearch);
        if (mobileInput) {
            mobileInput.addEventListener('keydown', e => { if (e.key === 'Enter') doMobileSearch(); });
            let mobileDebounce = null;
            mobileInput.addEventListener('input', function () {
                clearTimeout(mobileDebounce);
                const q = this.value.trim();
                if (!q) { if (mobileResults) { mobileResults.innerHTML = ''; mobileResults.style.display = 'none'; } return; }
                mobileDebounce = setTimeout(async () => {
                    try {
                        const res = await fetch('/api/places/search?q=' + encodeURIComponent(q));
                        const data = await res.json();
                        const places = Array.isArray(data) ? data : (data.places || data.results || []);
                        if (!places.length) { if (mobileResults) mobileResults.style.display = 'none'; return; }
                        if (mobileResults) {
                            mobileResults.innerHTML = places.slice(0, 6).map(p => `
                                <div class="search-result-item" data-name="${(p.name || p.place_name || '').replace(/"/g, '&quot;')}" data-href="places.html?q=${encodeURIComponent(p.name || p.place_name || '')}">
                                    <ion-icon name="location-outline"></ion-icon>
                                    <div>
                                        <div class="result-name">${p.name || p.place_name || ''}</div>
                                        <div class="result-addr">${p.address || p.barangay || ''}</div>
                                    </div>
                                </div>`).join('');
                            mobileResults.querySelectorAll('.search-result-item').forEach(el => {
                                el.addEventListener('click', () => {
                                    const placeQuery = el.getAttribute('data-name') || '';
                                    if (placeQuery) {
                                        try {
                                            if (window.CalzadaActivity && typeof window.CalzadaActivity.addSearchHistory === 'function') {
                                                window.CalzadaActivity.addSearchHistory(placeQuery);
                                            }
                                        } catch (_) {}
                                    }
                                    window.location.href = el.dataset.href;
                                });
                            });
                            mobileResults.style.display = 'block';
                        }
                    } catch (_) { if (mobileResults) mobileResults.style.display = 'none'; }
                }, 280);
            });
        }
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeOverlay(); });

        // --- Universal Close Helper ---
        const closeAllNavDropdowns = () => {
            const alertsMenu = document.getElementById('alertsDropdownMenu');
            if (alertsMenu) alertsMenu.classList.remove('open');
            const exploreMenu = document.getElementById('exploreDropdown');
            if (exploreMenu) exploreMenu.classList.remove('open');
            const userPill = document.getElementById('userAvatarPill');
            const userMenu = document.getElementById('userProfileMenu');
            if (userPill) userPill.classList.remove('open');
            if (userMenu) userMenu.classList.remove('open');
        };
        window._calzadaCloseAllDropdowns = closeAllNavDropdowns;

        // --- Explore Dropdown Toggle ---
        const exploreDropdown = document.getElementById('exploreDropdown');
        const exploreBtn = document.getElementById('exploreDropdownBtn');
        if (exploreDropdown && exploreBtn) {
            exploreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = exploreDropdown.classList.contains('open');
                closeAllNavDropdowns();
                if (!isOpen) {
                    exploreDropdown.classList.add('open');
                    exploreBtn.setAttribute('aria-expanded', 'true');
                } else {
                    exploreDropdown.classList.remove('open');
                    exploreBtn.setAttribute('aria-expanded', 'false');
                }
            });
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#exploreDropdown')) {
                    exploreDropdown.classList.remove('open');
                    if (exploreBtn) exploreBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // --- Mobile Bell Badge Sync ---
        const desktopBadge = document.getElementById('notificationBadge') || document.querySelector('.notification-badge');
        const mobileBellBadge = document.getElementById('mobileBellBadge') || document.querySelector('.mobile-bell-badge');
        if (desktopBadge && mobileBellBadge) {
            const syncBadge = () => {
                const count = desktopBadge.textContent.trim();
                const visible = desktopBadge.style.display !== 'none' && count !== '0';
                mobileBellBadge.style.display = visible ? 'flex' : 'none';
            };
            new MutationObserver(syncBadge).observe(desktopBadge, { childList: true, attributes: true, attributeFilter: ['style'] });
            syncBadge();
        }

        // --- Mobile Sign In Sync ---
        const mobileSignIn = document.getElementById('mobileSignInBtn');
        const userAvatarPill = document.getElementById('userAvatarPill');
        if (mobileSignIn && userAvatarPill) {
            const checkAuth = () => {
                const loggedIn = userAvatarPill.style.display !== 'none';
                mobileSignIn.style.display = loggedIn ? 'none' : 'flex';
            };
            new MutationObserver(checkAuth).observe(userAvatarPill, { attributes: true, attributeFilter: ['style'] });
            checkAuth();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initGlobalNavbar);
    } else {
        initGlobalNavbar();
    }
})();
