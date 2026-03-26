document.addEventListener('DOMContentLoaded', () => {

    // === NAVBAR SCROLL EFFECT ===
    const navbar = document.getElementById('navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 20) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
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
        const popularPlaces = [
            { name: "SM City Calamba", type: "Terminal" },
            { name: "Turbina Terminal", type: "Hub" },
            { name: "Pansol Hot Springs", type: "Destination" },
            { name: "Calamba City Hall", type: "Landmark" },
            { name: "Mayapa Crossing", type: "Stop" },
            { name: "Bucal Bypass Road", type: "Route" },
            { name: "Letran Calamba", type: "School" },
            { name: "Liana's Supermarket", type: "Landmark" },
            { name: "Real", type: "Barangay" },
            { name: "Halang", type: "Barangay" },
            { name: "National University Calamba", type: "School" },
            { name: "Pamana", type: "Barangay" },
            { name: "Canlubang", type: "Destination" }
        ];

        function handleSearch() {
            const val = searchInput.value.toLowerCase().trim();
            searchResults.innerHTML = '';

            if (val.length > 0) {
                const matches = popularPlaces.filter(p => p.name.toLowerCase().includes(val));

                if (matches.length > 0) {
                    matches.forEach(match => {
                        const item = document.createElement('div');
                        item.className = 'result-item';
                        item.innerHTML = `
                            <ion-icon name="location-outline" class="result-icon"></ion-icon>
                            <div>
                                <div class="result-name">${match.name}</div>
                                <div class="result-type">${match.type}</div>
                            </div>
                        `;
                        item.addEventListener('click', () => {
                            searchInput.value = match.name;
                            searchResults.classList.remove('active');
                        });
                        searchResults.appendChild(item);
                    });
                } else {
                    const item = document.createElement('div');
                    item.className = 'result-item';
                    item.innerHTML = `<em style="color:#aab4c5; font-size:0.9rem;">No places found. Try another keyword.</em>`;
                    searchResults.appendChild(item);
                }
                searchResults.classList.add('active');
            } else {
                searchResults.classList.remove('active');
            }
        }

        searchInput.addEventListener('input', handleSearch);

        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') if (searchBtn) searchBtn.click();
        });

        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (searchInput.value.trim() !== '') {
                    searchResults.classList.remove('active');
                    console.log("Searching for:", searchInput.value);
                }
            });
        }

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });
    }


    // === CHATBOT ===
    const chatToggleBtn = document.getElementById('chatToggleBtn');
    const chatWindow = document.getElementById('chatWindow');
    const closeChatBtn = document.getElementById('closeChatBtn');
    const chatInput = document.getElementById('chatInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const chatMessages = document.getElementById('chatMessages');
    const jeepTokLink = document.getElementById('jeepTokLink');

    if (chatToggleBtn) {
        const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
        chatToggleBtn.addEventListener('click', () => {
            if (chatWindow) chatWindow.classList.add('open');
            if (pulseRing) pulseRing.style.animation = 'none';
            if (chatInput) setTimeout(() => chatInput.focus(), 350);
        });
    }

    if (jeepTokLink) {
        jeepTokLink.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('JeepTok link clicked');
            if (chatWindow) {
                chatWindow.classList.add('open');
                if (chatInput) setTimeout(() => chatInput.focus(), 350);
            }
        });
    }

    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', () => {
            if (chatWindow) chatWindow.classList.remove('open');
            // Resume pulse if button exists
            if (chatToggleBtn) {
                const pulseRing = chatToggleBtn.querySelector('.pulse-ring');
                if (pulseRing) pulseRing.style.animation = '';
            }
        });
    }

    const GROQ_API_KEY = "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"; // Groq API key
    const SYSTEM_PROMPT = `You are JeepTok, the friendly AI commuting assistant of CalamBiyahe.

Here is what you know about CalamBiyahe (including FAQs):
CalamBiyahe is a commuter-focused website designed to provide clear, reliable, and accessible information about public transportation in Calamba and nearby areas.
It covers 50+ routes, 6 transit modes (jeepneys, buses, P2P, UV Express, tricycles, and trains), and 54 barangays.
It offers a route suggestion feature showing different travel options based on departure/arrival times, estimated duration, fare cost, and walking distance. How to use it: simply enter your starting point and destination in the search bar, then click the button to begin.
It emphasizes fare transparency. The platform provides estimated fares based on available data. Actual fares may vary slightly depending on operator policies, but the goal is to give commuters a clear idea of expected costs.
It supports multi-modal navigation, allowing commuters to combine different transport modes.
It is completely free to use for commuters and does not require any subscription.
It has a responsive design accessible on mobile devices, tablets, and desktops.
The goal is to empower commuters by centralizing transport data, reducing commuting stress, and promoting informed decision-making to improve mobility.

Your role:
Answer questions about CalamBiyahe and its FAQs accurately using the info above.
Help commuters with route suggestions, fares, and transport directions in the Philippines.
You can speak fluently in Tagalog and English — switch based on what the user speaks.
Keep answers short, conversational, and friendly. Avoid large markdown blocks.
IMPORTANT: If the user greets you (e.g., "Hello", "Hi", "Kumusta"), you must respond exactly with a warm greeting: "Mabuhay! Do you need some help with your destination today?". For other regular questions, go straight to answering without greetings. ALWAYS refer to CalamBiyahe as a "website", never call it an "app" or "application".`;

    function addMessage(text, isUser = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${isUser ? 'user-message' : 'bot-message'}`;
        msgDiv.textContent = text;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    let typingIndicatorEl = null;
    function showTyping() {
        if(!chatMessages) return;
        typingIndicatorEl = document.createElement('div');
        typingIndicatorEl.classList.add('typing-indicator');
        typingIndicatorEl.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
        chatMessages.appendChild(typingIndicatorEl);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTyping() {
        if(typingIndicatorEl && typingIndicatorEl.parentNode) {
            typingIndicatorEl.parentNode.removeChild(typingIndicatorEl);
        }
        typingIndicatorEl = null;
    }

    async function handleChatSend() {
        const text = chatInput.value.trim();
        if (!text) return;

        // User Message
        addMessage(text, true);
        chatInput.value = '';
        chatInput.style.height = 'auto'; 
        chatInput.classList.remove('scrolling');

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

            if(data.choices && data.choices.length > 0) {
                const botReply = data.choices[0].message.content;
                addMessage(botReply, false);
            } else {
                console.error("Groq API Error:", data);
                let errMsg = "Pasensya na, may error sa aking system. Try again later.";
                if(data.error && data.error.message) {
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
    
    // Auto-expanding logic & Enter key
    chatInput.addEventListener('input', function() {
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
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        
        navigator.mediaDevices.getUserMedia({ audio: true, video: false })
            .then(stream => {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();
                microphone = audioContext.createMediaStreamSource(stream);
                microphone.connect(analyser);
                analyser.fftSize = 64; 
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                
                const canvases = document.querySelectorAll('#voiceVisualizer');
                
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
                    
                    analyser.getByteFrequencyData(dataArray);
                    
                    canvases.forEach(canvas => {
                        const canvasCtx = canvas.getContext('2d');
                        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
                        
                        const barWidth = (canvas.width / bufferLength) * 1.8;
                        let barHeight;
                        let x = 0;
                        const mid = canvas.width / 2;
                        
                        for(let i = 0; i < bufferLength; i++) {
                            barHeight = (dataArray[i] / 255) * canvas.height;
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
            })
            .catch(err => console.error("Mic error:", err));
    }
    
    function stopVisualizer() {
        if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
        if (microphone) microphone.disconnect();
        if (audioContext && audioContext.state !== 'closed') audioContext.close();
        audioContext = null;
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
            speechRecognitionList.addFromString(grammar, 1);
            recognition.grammars = speechRecognitionList;
        }

        // Tagalog (Philippines) provides the best accuracy for Taglish sentences
        recognition.lang = 'tl-PH'; 
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
            if (event.error !== 'aborted') stopRecordingUI();
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
            text = text.replace(/(^\s*\w|[\.\!\?]\s*\w)/g, function(c) { return c.toUpperCase(); });
            
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
                if (!isRecording) recognition.start();
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

});
