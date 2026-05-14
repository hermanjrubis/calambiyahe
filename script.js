document.addEventListener('DOMContentLoaded', () => {

    const CHAT_API = 'https://calambiyahe-7i9b.onrender.com';

    // Warm up the server on page load
    fetch(`${CHAT_API}/api/ping`, { method: 'GET' }).catch(() => { });
    setInterval(() => {
        fetch(`${CHAT_API}/api/ping`, { method: 'GET' }).catch(() => { });
    }, 5 * 60 * 1000); // Reduced to 5 mins for Render free tier

    const isDev = window.location.protocol === 'file:' || window.location.hostname === 'localhost';

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

    // === HIDE FEATURES BAR & DYIPTOK ON SCROLL (Desktop & Mobile) ===
    const heroSection = document.querySelector('.hero-section');
    const chatWidget = document.querySelector('.chat-widget-container');
    
    if ((featuresBar || chatWidget) && heroSection) {
        const heroObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    if (featuresBar) featuresBar.classList.add('hide-on-scroll');
                    if (chatWidget) chatWidget.classList.add('hide-on-scroll');
                } else {
                    if (featuresBar) featuresBar.classList.remove('hide-on-scroll');
                    if (chatWidget) chatWidget.classList.remove('hide-on-scroll');
                }
            });
        }, {
            threshold: 0.95
        });

        heroObserver.observe(heroSection);
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

    // === NAVBAR SCROLL EFFECT ===
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (navbar) {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }
    });

    // === FAQ ACCORDION LOGIC ===
    const faqItems = document.querySelectorAll('.faq-item');
    if (faqItems.length > 0) {
        faqItems.forEach(item => {
            const questionBtn = item.querySelector('.faq-question');
            questionBtn.addEventListener('click', () => {
                const isActive = item.classList.contains('active');
                faqItems.forEach(otherItem => { otherItem.classList.remove('active'); });
                if (!isActive) { item.classList.add('active'); }
            });
        });
    }

    // === TRANSPORT CHIP SELECTION ===
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
        });
    });

    // === SEARCH BAR FUNCTIONALITY ===
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResults = document.getElementById('searchResults');

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

    // === MOBILE MENU TOGGLE ===
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const navLinks = document.getElementById('navLinks');
    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            const icon = mobileMenuBtn.querySelector('ion-icon');
            if (icon) { icon.name = navLinks.classList.contains('active') ? 'close-outline' : 'menu-outline'; }
        });
        navLinks.querySelectorAll('.nav-link, .btn-plan-route').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                const icon = mobileMenuBtn.querySelector('ion-icon');
                if (icon) icon.name = 'menu-outline';
            });
        });
    }

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
    const dyipTokLink = document.getElementById('dyipTokLink');
    const drawerDyipTokLink = document.getElementById('drawerDyipTokLink');

    let inactivityTimer;
    const INACTIVITY_LIMIT = 120000;

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (chatWindow && chatWindow.classList.contains('open')) {
            inactivityTimer = setTimeout(() => {
                chatWindow.classList.remove('open');
                document.body.classList.remove('chat-active');
                if (chatToggleBtn) {
                    const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
                    if (pulseRing) pulseRing.style.animation = '';
                }
                const cancelBtn = document.getElementById('cancelMicBtn');
                if (cancelBtn) cancelBtn.click();
                addMessage(window.t('js.session_ended'), false);
            }, INACTIVITY_LIMIT);
        }
    }

    if (chatWindow) {
        chatWindow.addEventListener('click', resetInactivityTimer);
        chatWindow.addEventListener('input', resetInactivityTimer);
    }

    if (chatToggleBtn) {
        const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
        chatToggleBtn.addEventListener('click', () => {
            // Pre-warm the server when button is clicked
            fetch(`${CHAT_API}/api/ping`, { method: 'GET' }).catch(() => { });
            
            document.body.classList.add('chat-active');
            if (chatWindow) chatWindow.classList.add('open');
            if (pulseRing) pulseRing.style.animation = 'none';
            if (chatInput) setTimeout(() => chatInput.focus(), 350);
            resetInactivityTimer();
        });
    }

    const openChat = (e) => {
        if (e) e.preventDefault();
        
        // Pre-warm the server when chat is opened from other links
        fetch(`${CHAT_API}/api/ping`, { method: 'GET' }).catch(() => { });

        document.body.classList.add('chat-active');
        if (chatWindow) {
            chatWindow.classList.add('open');
            if (chatInput) setTimeout(() => chatInput.focus(), 350);
            resetInactivityTimer();
        }
        const sideDrawer = document.getElementById('sideDrawer');
        const overlay = document.getElementById('sideDrawerOverlay');
        if (sideDrawer) sideDrawer.classList.remove('open');
        if (overlay) overlay.classList.remove('visible');
    };

    if (dyipTokLink) dyipTokLink.addEventListener('click', openChat);
    if (drawerDyipTokLink) drawerDyipTokLink.addEventListener('click', openChat);

    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            document.body.classList.remove('chat-active');
            if (chatWindow) chatWindow.classList.remove('open');
            if (chatToggleBtn) {
                const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
                if (pulseRing) pulseRing.style.animation = '';
            }
            if (typeof inactivityTimer !== 'undefined' && inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = null;
            }
        });
    }

    // Chat History Persistence
    let chatHistory = JSON.parse(sessionStorage.getItem('calzadaChatHistory')) || [];

    function addMessage(text, isUser = false, save = true) {
        if (!chatMessages) return;

        const wrapper = document.createElement('div');
        wrapper.className = `message-wrapper ${isUser ? 'user-wrapper' : 'bot-wrapper'}`;

        if (!isUser) {
            const avatar = document.createElement('div');
            avatar.className = 'bot-avatar';
            avatar.innerHTML = '<img src="assets/DyipTok-icon.png" alt="DyipTok">';
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

    // Load History on Startup
    function loadChatHistory() {
        if (!chatMessages) return;
        if (chatHistory.length === 0) return;
        chatMessages.innerHTML = '';
        chatHistory.forEach(msg => addMessage(msg.text, msg.isUser, false));
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
        avatar.innerHTML = '<img src="assets/DyipTok-icon.png" alt="DyipTok">';
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

        addMessage(text, true);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.classList.remove('scrolling');
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
` : '[ROUTE INFO] none';

        const fullMessageWithContext = `${routeInfo}\n\nUser Message: ${text}`;
        const payload = { message: fullMessageWithContext };

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

    if (sendMessageBtn) sendMessageBtn.addEventListener('click', handleChatSend);

    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.scrollHeight >= 120) { this.classList.add('scrolling'); }
        else { this.classList.remove('scrolling'); }
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); }
    });

    function triggerAutoExpand() {
        if (chatInput) {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
            if (chatInput.scrollHeight >= 120) { chatInput.classList.add('scrolling'); }
            else { chatInput.classList.remove('scrolling'); }
        }
    }

    // === VOICE MESSAGING (Web Speech API + Visualizer) ===
    const micBtn = document.getElementById('micBtn');
    const recordingControls = document.getElementById('recordingControls');
    const cancelMicBtn = document.getElementById('cancelMicBtn');
    const stopMicBtn = document.getElementById('stopMicBtn');
    const pauseMicBtn = document.getElementById('pauseMicBtn');
    const pauseMicIcon = document.getElementById('pauseMicIcon');
    let recognition = null;
    let isRecording = false;
    let visualizerFrame = null;

    function startVisualizer() {
        const canvases = document.querySelectorAll('#voiceVisualizer');
        const bufferLength = 32;
        let dataArray = new Uint8Array(bufferLength);
        function draw() {
            visualizerFrame = requestAnimationFrame(draw);
            if (!isRecording || isPaused) {
                canvases.forEach(canvas => {
                    const ctx2d = canvas.getContext('2d');
                    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
                    ctx2d.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx2d.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
                });
                return;
            }
            for (let i = 0; i < bufferLength; i++) { dataArray[i] = Math.random() * 200 + 50; }
            canvases.forEach(canvas => {
                const ctx2d = canvas.getContext('2d');
                ctx2d.clearRect(0, 0, canvas.width, canvas.height);
                const barWidth = (canvas.width / bufferLength) * 1.8;
                let x = 0;
                const mid = canvas.width / 2;
                for (let i = 0; i < bufferLength; i++) {
                    let barHeight = (dataArray[i] / 255) * (canvas.height * 0.8);
                    if (barHeight < 3) barHeight = 3;
                    ctx2d.fillStyle = 'rgba(255,255,255,0.9)';
                    ctx2d.fillRect(mid + x, (canvas.height - barHeight) / 2, barWidth - 1, barHeight);
                    if (i !== 0) { ctx2d.fillRect(mid - x, (canvas.height - barHeight) / 2, barWidth - 1, barHeight); }
                    x += barWidth;
                }
            });
        }
        draw();
    }

    function stopVisualizer() {
        if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
        visualizerFrame = null;
    }

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'fil';

        let finalTranscript = '';
        let interimTranscript = '';
        let sessionTranscript = '';
        let isPaused = false;
        let isCanceled = false;

        const formatTranscript = (text) => {
            if (!text) return '';
            return text.charAt(0).toUpperCase() + text.slice(1);
        };

        recognition.onstart = () => {
            isRecording = true; isPaused = false; isCanceled = false;
            if (chatInput) chatInput.style.display = 'none';
            const toolbar = document.querySelector('.chat-input-toolbar');
            if (toolbar) toolbar.style.display = 'none';
            if (recordingControls) recordingControls.style.display = 'flex';
            if (pauseMicIcon) pauseMicIcon.name = 'pause-outline';
            startVisualizer();
        };

        recognition.onresult = (event) => {
            if (isCanceled) return;
            interimTranscript = ''; finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) { finalTranscript += event.results[i][0].transcript; }
                else { interimTranscript += event.results[i][0].transcript; }
            }
        };

        recognition.onend = () => {
            if (isCanceled) { stopRecordingUI(); isCanceled = false; return; }
            if (isPaused) { isRecording = false; stopVisualizer(); if (pauseMicIcon) pauseMicIcon.name = 'mic-outline'; return; }
            isRecording = false;
            const fullText = (sessionTranscript + ' ' + finalTranscript + ' ' + interimTranscript).trim();
            if (fullText && chatInput) { chatInput.value = formatTranscript(fullText); triggerAutoExpand(); chatInput.focus(); }
            stopRecordingUI();
        };

        recognition.onerror = (event) => {
            if (isDev) console.error('Speech recognition error:', event.error);
            if (event.error !== 'aborted') { stopRecordingUI(); }
        };

        function stopRecordingUI() {
            isRecording = false; isPaused = false;
            sessionTranscript = ''; finalTranscript = ''; interimTranscript = '';
            stopVisualizer();
            if (chatInput) chatInput.style.display = '';
            const toolbar = document.querySelector('.chat-input-toolbar');
            if (toolbar) toolbar.style.display = 'flex';
            if (recordingControls) recordingControls.style.display = 'none';
        }

        if (micBtn) {
            micBtn.addEventListener('click', () => {
                if (!isRecording) {
                    try { resetInactivityTimer(); recognition.start(); }
                    catch (err) { if (isDev) console.error('Microphone start error:', err); addMessage(window.t('js.error_mic'), false); }
                }
            });
        }

        if (pauseMicBtn) {
            pauseMicBtn.addEventListener('click', () => {
                if (!isRecording && isPaused) {
                    isPaused = false; recognition.start();
                } else if (isRecording && !isPaused) {
                    isPaused = true;
                    if (finalTranscript || interimTranscript) { sessionTranscript += ' ' + finalTranscript + ' ' + interimTranscript; }
                    finalTranscript = ''; interimTranscript = '';
                    recognition.stop();
                    if (pauseMicIcon) pauseMicIcon.name = 'mic-outline';
                }
            });
        }

        if (stopMicBtn) {
            stopMicBtn.addEventListener('click', () => {
                const wasPaused = isPaused; isPaused = false;
                if (isRecording) { recognition.stop(); }
                else if (wasPaused) {
                    if (chatInput && sessionTranscript.trim().length > 0) {
                        chatInput.value = formatTranscript(sessionTranscript.trim());
                        triggerAutoExpand(); chatInput.focus();
                    }
                    stopRecordingUI();
                }
            });
        }

        if (cancelMicBtn) {
            cancelMicBtn.addEventListener('click', () => {
                isCanceled = true;
                if (isRecording) recognition.abort();
                else stopRecordingUI();
            });
        }
    } else {
        if (micBtn) { micBtn.style.display = 'none'; if (isDev) console.warn("Speech Recognition API not supported in this browser."); }
    }

    window.addEventListener('calzada_lang_changed', () => {
        const chatMsgs = document.getElementById('chatMessages');
        if (chatMsgs && chatMsgs.children.length === 1) {
            const firstMsg = chatMsgs.querySelector('.bot-message');
            if (firstMsg) firstMsg.textContent = window.t('chat.greeting');
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

function switchAuth(type) {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const formLogin = document.getElementById('formLogin');
    const formRegister = document.getElementById('formRegister');
    if (!tabLogin || !formRegister) return;
    
    // Clear forms when switching tabs
    formLogin.reset();
    formRegister.reset();

    if (type === 'login') {
        tabLogin.classList.add('active'); tabRegister.classList.remove('active');
        formLogin.classList.add('active'); formRegister.classList.remove('active');
    } else {
        tabRegister.classList.add('active'); tabLogin.classList.remove('active');
        formRegister.classList.add('active'); formLogin.classList.remove('active');
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const icon = input.nextElementSibling;
    if (input.type === 'password') { input.type = 'text'; icon.name = 'eye-off-outline'; }
    else { input.type = 'password'; icon.name = 'eye-outline'; }
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
