document.addEventListener('DOMContentLoaded', () => {

    // === PASABOG KONG EFFECTS (Parallax & Glow) ===
    const mouseGlow = document.getElementById('mouseGlow');
    const parallaxLayers1 = document.querySelectorAll('.parallax-layer-1');
    const parallaxLayers2 = document.querySelectorAll('.parallax-layer-2');
    const geoBgs = document.querySelectorAll('.geo-bg');

    window.addEventListener('mousemove', (e) => {
        const { clientX, clientY } = e;
        
        // 1. Mouse Glow
        if (mouseGlow) {
            mouseGlow.style.left = `${clientX}px`;
            mouseGlow.style.top = `${clientY}px`;
        }
        
        // 2. Parallax Effects
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
                entry.target.classList.remove('active'); // Reveal again on next scroll
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach(el => revealObserver.observe(el));

    // === FOOTER DETECTION (Hide features bar) ===
    const featuresBar = document.querySelector('.features-bar');
    const sentinel = document.getElementById('footer-sentinel');

    if (featuresBar && sentinel) {
        const sentinelObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    featuresBar.classList.add('hidden');
                } else {
                    featuresBar.classList.remove('hidden');
                }
            });
        }, { threshold: 0 }); 

        sentinelObserver.observe(sentinel);
    }

    // === NAVBAR SCROLL EFFECT ===
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        // Navbar scrolled state
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

                // Close others
                faqItems.forEach(otherItem => {
                    otherItem.classList.remove('active');
                });

                // Open clicked if it wasn't active
                if (!isActive) {
                    item.classList.add('active');
                }
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
        // Local quick suggestions (shown instantly before API responds)
        const popularPlaces = [
            { name: "SM City Calamba", address: "Calamba, Laguna" },
            { name: "Turbina Terminal", address: "Calamba, Laguna" },
            { name: "Pansol Hot Springs", address: "Calamba, Laguna" },
            { name: "Calamba City Hall", address: "Calamba, Laguna" },
            { name: "Mayapa Crossing", address: "Calamba, Laguna" },
            { name: "Letran Calamba", address: "Calamba, Laguna" },
            { name: "National University Calamba", address: "Calamba, Laguna" },
            { name: "Canlubang", address: "Calamba, Laguna" }
        ];

        // Attribution footer HTML
        const osmAttribution = `
            <div class="search-osm-attribution">
                <span>🗺️ Search results powered by <a href="https://www.openstreetmap.org" target="_blank">OpenStreetMap</a> / Nominatim</span>
            </div>`;

        const buildResultItem = (name, address, onClick) => {
            const item = document.createElement('div');
            item.className = 'result-item';
            item.innerHTML = `
                <ion-icon name="location-outline" class="result-icon"></ion-icon>
                <div>
                    <div class="result-name">${name}</div>
                    <div class="result-type">${address}</div>
                </div>
            `;
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

            if (val.length === 0) {
                searchResults.classList.remove('active');
                return;
            }

            searchResults.innerHTML = '';
            searchResults.classList.remove('active');

            // 2. Debounced Nominatim search (kicks in after 350ms of no typing)
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
                        const parts = place.display_name.split(',').slice(1, 3).map(s => s.trim());
                        const address = parts.join(', ');
                        return buildResultItem(name, address, () => {
                            // Navigate to planner with the destination name and exact coordinates
                            window.location.href = `planner.html?dest=${encodeURIComponent(name)}&dlat=${place.lat}&dlng=${place.lon}`;
                        });
                    });

                    showResults(apiItems, true); // show OSM attribution for API results
                } catch (e) {
                    // Silently fail — local results already showing
                }
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
                        // Attempt to restore cursor
                        if (start !== null && end !== null) {
                            try { searchInput.setSelectionRange(start, end); } catch (e) {}
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
            if (e.key === 'Enter') {
                e.preventDefault();
                performFinalSearch();
            }
        });

        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                performFinalSearch();
            });
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
            if (icon) {
                icon.name = navLinks.classList.contains('active') ? 'close-outline' : 'menu-outline';
            }
        });

        // Close menu when a link is clicked
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

    // === CHATBOT INACTIVITY TIMEOUT ===
    let inactivityTimer;
    const INACTIVITY_LIMIT = 120000; // 2 minutes

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        if (chatWindow && chatWindow.classList.contains('open')) {
            inactivityTimer = setTimeout(() => {
                // Auto close on timeout
                chatWindow.classList.remove('open');
                document.body.classList.remove('chat-active');
                if (chatToggleBtn) {
                    const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
                    if (pulseRing) pulseRing.style.animation = '';
                }
                const cancelBtn = document.getElementById('cancelMicBtn');
                if (cancelBtn) cancelBtn.click(); // Stop recording if active

                // Optional: Notify user next time they open
                addMessage("Session ended due to inactivity.", false);
            }, INACTIVITY_LIMIT);
        }
    }

    // Bind interaction events to reset timer
    if (chatWindow) {
        chatWindow.addEventListener('click', resetInactivityTimer);
        chatWindow.addEventListener('input', resetInactivityTimer);
    }

    if (chatToggleBtn) {
        const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
        chatToggleBtn.addEventListener('click', () => {
            document.body.classList.add('chat-active');
            if (chatWindow) chatWindow.classList.add('open');
            if (pulseRing) pulseRing.style.animation = 'none';
            if (chatInput) setTimeout(() => chatInput.focus(), 350);
            resetInactivityTimer();
        });
    }

    const openChat = (e) => {
        if(e) e.preventDefault();
        console.log('DyipTok link clicked');
        document.body.classList.add('chat-active');
        if (chatWindow) {
            chatWindow.classList.add('open');
            if (chatInput) setTimeout(() => chatInput.focus(), 350);
            resetInactivityTimer();
        }
        // Also close side drawer if open
        const sideDrawer = document.getElementById('sideDrawer');
        const overlay = document.getElementById('sideDrawerOverlay');
        if(sideDrawer) sideDrawer.classList.remove('open');
        if(overlay) overlay.classList.remove('visible');
    };

    if (dyipTokLink) dyipTokLink.addEventListener('click', openChat);
    if (drawerDyipTokLink) drawerDyipTokLink.addEventListener('click', openChat);

    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            document.body.classList.remove('chat-active');
            if (chatWindow) chatWindow.classList.remove('open');
            // Resume pulse if button exists
            if (chatToggleBtn) {
                const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
                if (pulseRing) pulseRing.style.animation = '';
            }
        });
    }

    const GROQ_API_KEY = "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"; // Groq API key
    const SYSTEM_PROMPT = `You are DyipTok, the friendly AI commuting assistant of Calzada — a commuter guide platform for Calamba City and different routes originating from Calamba.

=== YOUR SCOPE (only answer questions within this list) ===
1. ROUTES & DIRECTIONS
   - Jeepney, modern-Jeepneys, bus, UV Express (van), tricycle, and P2P routes in Calamba and nearby areas
   - Terminals, landmarks, and barangays in Calamba (e.g., SM City Calamba, Turbina, Crossing, Pansol, Bucal, Halang, Real, Pamana, Mayapa, Canlubang, Letran, National University)
   - Travel directions between points within the platform's coverage area

2. FARES & COSTS
   - Current fare estimates based on LTFRB rates
   - How fares are computed (base fare + per km rates)
   - Fare hike announcements and updates from LTFRB or DOTr
   - Price changes affecting public transport commuters

3. TRANSPORT NEWS (commuting-relevant only)
   - Gas/fuel price increases or decreases and how they affect jeepney/bus fares
   - Road closures, detours, or rerouting affecting commuters in Calamba and Laguna
   - Traffic situation updates on major roads (SLEX, national highway, Calamba roads)
   - Accidents or incidents causing major traffic along commuter routes
   - Holiday or special event schedules affecting public transport
   - LTFRB, LRTA, or government transport announcements
   - Strike or transport strikes (welga ng jeepney/bus drivers)
   - Road construction updates affecting commuter routes

4. PLATFORM HELP (Answer these properly)
   - How to use the Calzada website (route planner, search, transit modes)
   - Questions about the Calzada platform itself (features, purpose, coverage, technical help)
   - Commuting tips and advice for traveling in Calamba

=== OUT OF SCOPE — STRICTLY REFUSE ===
If the user asks about ANYTHING not listed above — such as:
- Coding, programming, math, science, or homework help
- General non-transport news (politics, celebrity, sports, entertainment)
- Weather forecasts unrelated to commuting
- Health advice, legal advice, personal finance
- Recipes, movies, games, or any non-commuting topic
- Topics in cities with no connection to Calamba commuter routes

Then you MUST reply ONLY with this message (in the user's language):
"Pasensya na! Ang aking expertise ay limitado sa commuting, biyahe, kalsada, transport news sa Calamba area, at mga katanungan tungkol sa Calzada website. Maaari ba kitang tulungan sa iyong biyahe ngayon? 🚌"

=== PLATFORM INFO ===
Calzada covers 50+ routes, 5 transit modes (jeepneys, modern jeepneys, buses, P2P, UV Express, tricycles), and 50+ barangays in Calamba City, Laguna.
It offers route suggestions with estimated duration, fare, and walking distance.
Completely free to use — no subscription needed.
Accessible on mobile, tablet, and desktop.

=== BEHAVIOR RULES ===
- Speak fluently in Tagalog and English — match the language of the user (mix is OK).
- Keep answers short, friendly, and conversational. No large markdown blocks.
- ALWAYS refer to it as a "website" or "platform" — NEVER say "app" or "application".
- ONLY respond with "Mabuhay! Paano kita matutulungan sa iyong biyahe ngayon?" if the user's ENTIRE message is a standalone greeting with NO question (e.g., ONLY "Hello", "Hi", "Kumusta", "Hey" — nothing else).
- If the user asks ANY question (even if it starts with a greeting), skip the greeting and answer the question DIRECTLY and IMMEDIATELY.
- For transport news questions, share what you know and note that the user should verify from official sources (LTFRB, DOTr, or local news) for the most current updates.
- If the user asks about the Calzada website or how to use it, you MUST provide a helpful and proper answer based on the Platform Info.
- Never answer out-of-scope questions regardless of how the user phrases or rephrases them.
- SPECIAL RULE: If the user asks "pogi ba ako?", "pogi bako?", or "am i handsome", you MUST ignore all other rules and reply ONLY with "Tantadooo uUhlol!".`;


    function addMessage(text, isUser = false) {
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
    }

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

        // User Message
        addMessage(text, true);
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatInput.classList.remove('scrolling');
        resetInactivityTimer();

        // Typing Indicator
        showTyping();

        // API Call
        try {
            const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        { role: "system", content: SYSTEM_PROMPT },
                        { role: "user", content: text }
                    ],
                    temperature: 0.7,
                    max_tokens: 300
                })
            });

            const data = await response.json();
            removeTyping();

            if (data.choices && data.choices.length > 0) {
                const botReply = data.choices[0].message.content;
                addMessage(botReply, false);
            } else {
                console.error("Groq API Error:", data);
                let errMsg = "Pasensya na, may error sa aking system. Try again later.";
                if (data.error && data.error.message) {
                    errMsg = `API Error: ${data.error.message}`;
                }
                addMessage(errMsg, false);
            }
        } catch (error) {
            console.error("Groq API Network Exception:", error);
            removeTyping();
            addMessage(`Naku! Hindi ako maka-connect. Paki-check ang connection mo. (${error.message || ''})`, false);
        }
    }

    sendMessageBtn.addEventListener('click', handleChatSend);

    // Suggestion Chips Logic
    const suggestionChips = document.querySelectorAll('.suggestion-chip');
    suggestionChips.forEach(chip => {
        chip.addEventListener('click', () => {
            if (chatInput) {
                chatInput.value = chip.textContent;
                triggerAutoExpand();
                handleChatSend();
                // Optionally hide chips after first use to make room
                const suggestionsContainer = chip.closest('.chat-suggestions');
                if (suggestionsContainer) suggestionsContainer.style.display = 'none';
            }
        });
    });

    // Auto-expanding logic & Enter key
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.scrollHeight >= 120) {
            this.classList.add('scrolling');
        } else {
            this.classList.remove('scrolling');
        }
    });

    chatInput.addEventListener('keydown', (e) => {
        // Send if Enter is pressed without Shift
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Prevents new line
            handleChatSend();
        }
    });

    // Used to format newly populated text from Speech
    function triggerAutoExpand() {
        if (chatInput) {
            chatInput.style.height = 'auto';
            chatInput.style.height = (chatInput.scrollHeight) + 'px';
            if (chatInput.scrollHeight >= 120) {
                chatInput.classList.add('scrolling');
            } else {
                chatInput.classList.remove('scrolling');
            }
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

    // Web Audio API Elements
    let audioContext = null;
    let analyser = null;
    let microphone = null;
    let visualizerFrame = null;

    function startVisualizer() {
        // Use a simulated visualizer to avoid microphone locking conflicts.
        // Web Speech API already holds the microphone, and requesting it again via
        // getUserMedia often causes a "network error" or "not-allowed" on platforms like Chrome or mobile.
        const canvases = document.querySelectorAll('#voiceVisualizer');
        const bufferLength = 32; // Simulating 32 bars
        let dataArray = new Uint8Array(bufferLength);

        function draw() {
            visualizerFrame = requestAnimationFrame(draw);

            if (!isRecording || isPaused) {
                canvases.forEach(canvas => {
                    const canvasCtx = canvas.getContext('2d');
                    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    canvasCtx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2); // Flat line
                });
                return;
            }

            // Randomly simulate voice frequency data
            for (let i = 0; i < bufferLength; i++) {
                dataArray[i] = Math.random() * 200 + 50;
            }

            canvases.forEach(canvas => {
                const canvasCtx = canvas.getContext('2d');
                canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

                const barWidth = (canvas.width / bufferLength) * 1.8;
                let barHeight;
                let x = 0;
                const mid = canvas.width / 2;

                for (let i = 0; i < bufferLength; i++) {
                    // Smooth visualizer slightly
                    barHeight = (dataArray[i] / 255) * (canvas.height * 0.8);
                    if (barHeight < 3) barHeight = 3;

                    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';

                    // Right side
                    canvasCtx.fillRect(mid + x, (canvas.height - barHeight) / 2, barWidth - 1, barHeight);
                    // Left side
                    if (i !== 0) {
                        canvasCtx.fillRect(mid - x, (canvas.height - barHeight) / 2, barWidth - 1, barHeight);
                    }
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

    let isPaused = false;
    let isCanceled = false;
    let sessionTranscript = '';
    let finalTranscript = '';
    let interimTranscript = '';

    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
        recognition = new SpeechRecognition();

        // Define local keywords to boost Web Speech API accuracy in the context of Calamba Commuting
        if (SpeechGrammarList) {
            const speechRecognitionList = new SpeechGrammarList();
            const keywords = ['Calamba', 'Jeep', 'Bus', 'Tricycle', 'SM', 'Crossing', 'Pansol', 'Bucal', 'Turbina', 'Halang', 'Real', 'Pamana', 'Mayapa', 'Canlubang', 'Liana', 'Terminal', 'Saan', 'Papuntang', 'Paano', 'Magkano', 'Pamasahe'];
            const grammar = '#JSGF V1.0; grammar transit; public <keyword> = ' + keywords.join(' | ') + ' ;';

            try {
                speechRecognitionList.addFromString(grammar, 1);
                // Note: Setting recognition.grammars in Chrome often throws a "network" error 
                // because it doesn't support local grammars. Thus, we omit setting it.
                // recognition.grammars = speechRecognitionList; 
            } catch (e) {
                console.warn("SpeechGrammarList not fully supported.", e);
            }
        }

        // en-PH (Philippines English) provides the highest accuracy for mixed Tagalog and English sentences
        recognition.lang = 'en-PH';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1; // Focus entirely on the highest confidence result

        recognition.onstart = () => {
            isRecording = true;
            isCanceled = false;

            if (!isPaused) {
                // Completely fresh session
                sessionTranscript = '';
            }
            isPaused = false;

            // Hide standard chat input UI
            if (chatInput) chatInput.style.display = 'none';
            const toolbar = document.querySelector('.chat-input-toolbar');
            if (toolbar) toolbar.style.display = 'none';

            // Show recording controls
            if (recordingControls) recordingControls.style.display = 'flex';
            if (pauseMicIcon) pauseMicIcon.name = 'pause-outline';

            if (!audioContext) startVisualizer();
        };

        recognition.onresult = (event) => {
            if (isCanceled) return;

            interimTranscript = '';
            finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                // Remove weird trailing punctuations often generated by the API mid-sentence to avoid breaking words
                let rawText = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    finalTranscript += rawText;
                } else {
                    interimTranscript += rawText;
                }
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            // Ignore no-speech error
            if (event.error !== 'aborted' && event.error !== 'no-speech') {
                addMessage('Voice error: ' + event.error + '. Try typing instead.', false);
                stopRecordingUI();
            }
        };

        recognition.onend = () => {
            if (isCanceled) {
                stopRecordingUI();
                return;
            }
            if (isPaused) {
                // Naka-keep open for Resume
                isRecording = false;
                return;
            }

            // after auto-end or Stop
            if (chatInput) {
                let total = (sessionTranscript + ' ' + finalTranscript + ' ' + interimTranscript).trim();
                if (total.length > 0) {
                    // Proper sentence formatting
                    chatInput.value = formatTranscript(total);
                    // Resize to fit
                    triggerAutoExpand();
                    // Focus the input so the user can immediately edit
                    chatInput.focus();
                }
            }
            stopRecordingUI();
        };

        function formatTranscript(text) {
            if (!text) return text;
            text = text.trim();

            // Fix standalone commas or weird spacing around punctuation
            text = text.replace(/\s+([.,!?;:])/g, '$1'); // "hello , world" -> "hello, world"

            // Add space after comma if missing
            text = text.replace(/,([^\s])/g, ', $1'); // "hello,world" -> "hello, world"

            // Capitalize first letter of every sentence
            text = text.replace(/(^\s*\w|[\.\!\?]\s*\w)/g, function (c) { return c.toUpperCase(); });

            // Specific local capitalization fixes for transit words (just to be safe)
            const properNouns = ['Sm', 'Calamba', 'Turbina', 'Pansol', 'Bucal', 'Halang', 'Real', 'Pamana', 'Mayapa', 'Liana'];
            properNouns.forEach(noun => {
                const regex = new RegExp(`\\b${noun}\\b`, 'gi');
                text = text.replace(regex, noun); // E.g., 'sm' -> 'Sm' -> wait, let's fix that 'SM'
            });
            text = text.replace(/\bSm\b/ig, 'SM'); // Fix SM

            // Add an automatic period at the end if there's no punctuation
            if (!/[.!?]$/.test(text)) {
                text += '.';
            }

            return text;
        }

        function stopRecordingUI() {
            isRecording = false;
            isPaused = false;
            sessionTranscript = '';
            finalTranscript = '';
            interimTranscript = '';

            stopVisualizer();

            // Revert UI to normal
            if (chatInput) chatInput.style.display = '';
            const toolbar = document.querySelector('.chat-input-toolbar');
            if (toolbar) toolbar.style.display = 'flex';

            // Hide controls
            if (recordingControls) recordingControls.style.display = 'none';
        }

        if (micBtn) {
            micBtn.addEventListener('click', () => {
                if (!isRecording) {
                    try {
                        resetInactivityTimer();
                        // Call start directly - browsers require synchronous action on click for Speech API permissions
                        recognition.start();
                    } catch (err) {
                        console.error('Microphone start error:', err);
                        addMessage('Unable to access microphone. Please check your browser permissions.', false);
                    }
                }
            });
        }

        if (pauseMicBtn) {
            pauseMicBtn.addEventListener('click', () => {
                if (!isRecording && isPaused) {
                    // Resume
                    isPaused = false;
                    recognition.start();
                } else if (isRecording && !isPaused) {
                    // Pause
                    isPaused = true;
                    if (finalTranscript || interimTranscript) {
                        sessionTranscript += ' ' + finalTranscript + ' ' + interimTranscript;
                    }
                    finalTranscript = '';
                    interimTranscript = '';
                    recognition.stop();
                    if (pauseMicIcon) pauseMicIcon.name = 'mic-outline';
                }
            });
        }

        if (stopMicBtn) {
            // "Stop & Review" manual trigger
            stopMicBtn.addEventListener('click', () => {
                const wasPaused = isPaused;
                isPaused = false;

                if (isRecording) {
                    recognition.stop();
                } else if (wasPaused) {
                    // Just paused, need to populate sessionTranscript
                    if (chatInput) {
                        if (sessionTranscript.trim().length > 0) {
                            chatInput.value = formatTranscript(sessionTranscript.trim());
                            triggerAutoExpand();
                            chatInput.focus();
                        }
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
        if (micBtn) {
            micBtn.style.display = 'none';
            console.warn("Speech Recognition API not supported in this browser.");
        }
    }

    // Handle language change
    window.addEventListener('calzada_lang_changed', () => {
        // Update chatbot greeting if it exists and hasn't been changed by interaction
        const chatMsgs = document.getElementById('chatMessages');
        if (chatMsgs && chatMsgs.children.length === 1) {
            const firstMsg = chatMsgs.querySelector('.bot-message');
            if (firstMsg) firstMsg.textContent = window.t('chat.greeting');
        }

        // Re-apply static translations
        if (typeof window.applyLang === 'function') window.applyLang();
    });

    // === CATEGORY SCROLL NAVIGATION (Desktop) ===
    const tabs = document.getElementById('categoryTabs');
    const btnLeft = document.getElementById('catScrollLeft');
    const btnRight = document.getElementById('catScrollRight');

    function updateCatScrollButtons() {
        if (!tabs || !btnLeft || !btnRight) return;
        
        // Use a small threshold (5px) for safety
        const canScrollLeft = tabs.scrollLeft > 5;
        const canScrollRight = tabs.scrollLeft < (tabs.scrollWidth - tabs.clientWidth - 5);

        btnLeft.classList.toggle('visible', canScrollLeft);
        btnRight.classList.toggle('visible', canScrollRight);
    }

    if (tabs && btnLeft && btnRight) {
        // Initial check after content loads
        setTimeout(updateCatScrollButtons, 300);

        tabs.addEventListener('scroll', updateCatScrollButtons);
        window.addEventListener('resize', updateCatScrollButtons);

        btnLeft.addEventListener('click', () => {
            tabs.scrollBy({ left: -280, behavior: 'smooth' });
        });

        btnRight.addEventListener('click', () => {
            tabs.scrollBy({ left: 280, behavior: 'smooth' });
        });
    }
});

// === GLOBAL AUTHENTICATION LOGIC ===

function switchAuth(type) {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const formLogin = document.getElementById('formLogin');
    const formRegister = document.getElementById('formRegister');

    if (!tabLogin || !formRegister) return;

    if (type === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        formLogin.classList.add('active');
        formRegister.classList.remove('active');
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        formRegister.classList.add('active');
        formLogin.classList.remove('active');
    }
}

function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const icon = input.nextElementSibling;
    if (input.type === 'password') {
        input.type = 'text';
        icon.name = 'eye-off-outline';
    } else {
        input.type = 'password';
        icon.name = 'eye-outline';
    }
}

function checkPasswordStrength() {
    const passInput = document.getElementById('regPass');
    if (!passInput) return;
    
    const val = passInput.value;
    
    const reqLength = document.getElementById('req-length');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');

    if (val.length >= 8) {
        reqLength.classList.add('met');
        reqLength.querySelector('ion-icon').name = 'checkmark-circle';
    } else {
        reqLength.classList.remove('met');
        reqLength.querySelector('ion-icon').name = 'close-circle-outline';
    }

    if (/\d/.test(val)) {
        reqNumber.classList.add('met');
        reqNumber.querySelector('ion-icon').name = 'checkmark-circle';
    } else {
        reqNumber.classList.remove('met');
        reqNumber.querySelector('ion-icon').name = 'close-circle-outline';
    }

    if (/[!@#$%^&*(),.?":{}|<>]/.test(val)) {
        reqSpecial.classList.add('met');
        reqSpecial.querySelector('ion-icon').name = 'checkmark-circle';
    } else {
        reqSpecial.classList.remove('met');
        reqSpecial.querySelector('ion-icon').name = 'close-circle-outline';
    }
}
