/**
 * public/js/business-fields.js
 *
 * Shared UI and logic components for Calzada business registration and management:
 * - Offerings chip editor (1..10 chips, comma/enter to add, x to remove)
 * - Open hours 7-day editor with 30-min steps, lunch breaks, and shortcuts
 * - Open now / Closed Manila-time calculator
 * - Client-side image compression
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CalzadaBusinessFields = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {

    const DAYS_ORDER = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
    const DAY_NAMES = {
        en: {
            mon: 'Monday',
            tue: 'Tuesday',
            wed: 'Wednesday',
            thu: 'Thursday',
            fri: 'Friday',
            sat: 'Saturday',
            sun: 'Sunday'
        },
        tl: {
            mon: 'Lunes',
            tue: 'Martes',
            wed: 'Miyerkules',
            thu: 'Huwebes',
            fri: 'Biyernes',
            sat: 'Sabado',
            sun: 'Linggo'
        }
    };

    /**
     * Compress an image file in the browser before upload (max 1600px, JPEG quality 0.82)
     */
    async function compressImageFile(file, { maxSide = 1600, quality = 0.82, maxBytes = 850 * 1024 } = {}) {
        if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type || '')) return file;
        if (file.size <= 400 * 1024) return file;

        let source = null;
        let objectUrl = null;
        try {
            if (typeof createImageBitmap === 'function') {
                source = await createImageBitmap(file, { imageOrientation: 'from-image' });
            }
        } catch (_) {
            source = null;
        }
        if (!source) {
            objectUrl = URL.createObjectURL(file);
            source = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Could not read photo. Try a JPG or PNG.'));
                img.src = objectUrl;
            });
        }

        try {
            const w = source.width || source.naturalWidth;
            const h = source.height || source.naturalHeight;
            if (!w || !h) return file;
            const scale = Math.min(1, maxSide / Math.max(w, h));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(w * scale));
            canvas.height = Math.max(1, Math.round(h * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

            const toBlob = (q) => new Promise(res => canvas.toBlob(res, 'image/jpeg', q));
            let q = quality;
            let blob = await toBlob(q);
            while (blob && blob.size > maxBytes && q > 0.5) {
                q -= 0.08;
                blob = await toBlob(q);
            }
            if (!blob || blob.size >= file.size) return file;
            const baseName = (file.name || 'photo').replace(/\.[^.]+$/, '');
            return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
        } finally {
            if (source && typeof source.close === 'function') source.close();
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        }
    }

    /**
     * 30-minute time step options (00:00 to 23:30)
     */
    function getTimeOptions() {
        const options = [];
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 30) {
                const hh = String(h).padStart(2, '0');
                const mm = String(m).padStart(2, '0');
                const time24 = `${hh}:${mm}`;
                const period = h >= 12 ? 'PM' : 'AM';
                const h12 = h % 12 === 0 ? 12 : h % 12;
                const label = `${h12}:${mm} ${period}`;
                options.push({ value: time24, label });
            }
        }
        return options;
    }

    function formatTime12(time24) {
        if (!time24 || typeof time24 !== 'string') return '';
        const [hh, mm] = time24.split(':').map(Number);
        if (isNaN(hh) || isNaN(mm)) return time24;
        if (hh === 24 && mm === 0) return '12:00 AM';
        const period = hh >= 12 ? 'PM' : 'AM';
        const h12 = hh % 12 === 0 ? 12 : hh % 12;
        return `${h12}:${String(mm).padStart(2, '0')} ${period}`;
    }

    // Every open day has a single continuous range that ends after it starts, and at least 1 day is open
    function isValidOpenHours(openHours) {
        if (!openHours || typeof openHours !== 'object') return false;
        const toMin = (t) => {
            const m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
            return m ? (+m[1]) * 60 + (+m[2]) : NaN;
        };
        let openDaysCount = 0;
        const everyDayValid = DAYS_ORDER.every((d) => {
            const ranges = openHours[d] || [];
            if (!Array.isArray(ranges) || ranges.length > 2) return false;
            if (ranges.length > 0) openDaysCount++;
            let prevEnd = -1;
            return ranges.every((r) => {
                const a = toMin(r && r.open), b = toMin(r && r.close);
                const ok = a >= 0 && b <= 1440 && a < b && a >= prevEnd;
                prevEnd = b;
                return ok;
            });
        });
        return everyDayValid && openDaysCount > 0;
    }

    function ensureHoursStyles() {
        if (typeof document === 'undefined' || document.getElementById('calzada-hours-editor-styles')) return;
        const style = document.createElement('style');
        style.id = 'calzada-hours-editor-styles';
        style.textContent = `
            .cz-hours-toolbar {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                margin-bottom: 14px;
            }
            .cz-hours-preset-btn {
                min-height: 44px;
                padding: 8px 14px;
                background: #FFFFFF;
                border: 1px solid #CBD5E1;
                border-radius: 8px;
                font-family: 'Outfit', sans-serif;
                font-size: 13px;
                font-weight: 600;
                color: #042C53;
                cursor: pointer;
                transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .cz-hours-preset-btn:hover {
                border-color: #378ADD;
                color: #378ADD;
                background: #F8FAFC;
            }
            .cz-hours-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .cz-hours-row {
                background: #FFFFFF;
                border: 1px solid #E2E8F0;
                border-radius: 10px;
                padding: 12px 16px;
                transition: border-color 0.15s ease, background-color 0.15s ease;
            }
            .cz-hours-row.is-closed {
                background: #F8FAFC;
            }
            .cz-hours-row.has-error {
                border-color: #DC2626;
                background: #FEF2F2;
            }
            .cz-hours-row-main {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            @media (min-width: 768px) {
                .cz-hours-row-main {
                    flex-direction: row;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                }
            }
            .cz-hours-day-toggle-group {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                min-width: 210px;
            }
            @media (min-width: 768px) {
                .cz-hours-day-toggle-group {
                    justify-content: flex-start;
                }
            }
            .cz-hours-day-label {
                font-weight: 600;
                font-size: 14px;
                color: #042C53;
                min-width: 96px;
            }
            .cz-switch-label {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                min-height: 44px;
                cursor: pointer;
                user-select: none;
            }
            .cz-switch-input {
                position: absolute;
                opacity: 0;
                width: 0;
                height: 0;
            }
            .cz-switch-track {
                position: relative;
                width: 44px;
                height: 24px;
                background: #CBD5E1;
                border-radius: 9999px;
                transition: background-color 0.18s ease;
                flex-shrink: 0;
            }
            .cz-switch-thumb {
                position: absolute;
                top: 2px;
                left: 2px;
                width: 20px;
                height: 20px;
                background: #FFFFFF;
                border-radius: 50%;
                box-shadow: 0 1px 2px rgba(4, 44, 83, 0.2);
                transition: transform 0.18s ease;
            }
            .cz-switch-input:checked + .cz-switch-track {
                background: #378ADD;
            }
            .cz-switch-input:checked + .cz-switch-track .cz-switch-thumb {
                transform: translateX(20px);
            }
            .cz-switch-input:focus-visible + .cz-switch-track {
                outline: 2px solid #378ADD;
                outline-offset: 2px;
            }
            .cz-switch-state-text {
                font-size: 13px;
                font-weight: 600;
                color: #042C53;
                min-width: 46px;
            }
            .cz-hours-row.is-closed .cz-switch-state-text {
                color: #64748B;
                font-weight: 500;
            }
            .cz-hours-time-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: 100%;
            }
            @media (min-width: 640px) {
                .cz-hours-time-group {
                    flex-direction: row;
                    align-items: center;
                    width: auto;
                }
            }
            .cz-time-field-wrap {
                display: flex;
                align-items: center;
                gap: 8px;
                flex: 1;
            }
            .cz-time-input {
                min-height: 44px;
                width: 100%;
                min-width: 132px;
                padding: 8px 12px;
                border: 1px solid #CBD5E1;
                border-radius: 8px;
                background: #FFFFFF;
                color: #042C53;
                font-family: 'Outfit', sans-serif;
                font-size: 14px;
                font-weight: 500;
                outline: none;
                transition: border-color 0.15s ease;
            }
            .cz-time-input:focus {
                border-color: #378ADD;
            }
            .cz-time-sep {
                font-size: 13px;
                color: #64748B;
                font-weight: 500;
                text-align: center;
                padding: 0 2px;
            }
            .cz-closed-badge {
                font-size: 13px;
                color: #64748B;
                padding: 8px 0;
            }
            .cz-hours-row-error {
                font-size: 12px;
                color: #DC2626;
                margin-top: 8px;
                font-weight: 500;
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Parse open hours or return sensible default
     */
    function getDefaultHours() {
        return {
            mon: [{ open: '08:00', close: '18:00' }],
            tue: [{ open: '08:00', close: '18:00' }],
            wed: [{ open: '08:00', close: '18:00' }],
            thu: [{ open: '08:00', close: '18:00' }],
            fri: [{ open: '08:00', close: '18:00' }],
            sat: [{ open: '08:00', close: '18:00' }],
            sun: []
        };
    }

    /**
     * Render the Offerings Chip Input into container
     */
    function renderOfferingsInput(container, { initialOfferings = [], onChange = () => {} } = {}) {
        let offerings = [...(initialOfferings || [])].slice(0, 10);

        // Adds what was typed; keeps the cursor in the box so the next one can be typed at once
        function addTyped(raw, keepFocus) {
            const parts = String(raw || '').split(',').map(v => v.trim()).filter(Boolean);
            let added = false;
            for (const val of parts) {
                if (val.length <= 40 && !offerings.includes(val) && offerings.length < 10) {
                    offerings.push(val);
                    added = true;
                }
            }
            if (added) {
                updateUI(keepFocus);
                onChange(offerings);
            }
            return added;
        }

        function updateUI(focusInput = false) {
            container.innerHTML = `
                <div class="offerings-editor-box" style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px; background: #FFFFFF; min-height: 48px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
                    <div id="offeringsChipsList" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
                    <input type="text" id="offeringsTextInput" placeholder="${offerings.length >= 10 ? 'Maximum 10 items reached' : 'Type offering & press Enter or comma...'}"
                        ${offerings.length >= 10 ? 'disabled' : ''}
                        style="border: none; outline: none; font-family: 'Outfit', sans-serif; font-size: 14px; color: #042C53; flex: 1; min-width: 140px; padding: 4px;"
                        maxlength="40"
                    />
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 12px; color: #64748B;">
                    <span>Press Enter or comma to add. 1–10 items, 40 chars max.</span>
                    <span id="offeringsCountText">${offerings.length} / 10</span>
                </div>
            `;

            const chipsList = container.querySelector('#offeringsChipsList');
            const input = container.querySelector('#offeringsTextInput');

            chipsList.innerHTML = '';
            offerings.forEach((item, idx) => {
                const chip = document.createElement('span');
                chip.style.cssText = 'display: inline-flex; align-items: center; gap: 6px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 8px; font-size: 13px; color: #042C53; font-weight: 500;';
                chip.textContent = item;

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.innerHTML = '&times;';
                removeBtn.setAttribute('aria-label', `Remove ${item}`);
                removeBtn.style.cssText = 'background: transparent; border: none; font-size: 16px; line-height: 1; cursor: pointer; color: #64748B; padding: 0 2px;';
                removeBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    offerings.splice(idx, 1);
                    updateUI();
                    onChange(offerings);
                });

                chip.appendChild(removeBtn);
                chipsList.appendChild(chip);
            });

            if (input && offerings.length < 10) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ',') {
                        e.preventDefault();
                        addTyped(input.value, true);
                    } else if (e.key === 'Backspace' && !input.value && offerings.length > 0) {
                        offerings.pop();
                        updateUI(true);
                        onChange(offerings);
                    }
                });
                // Phone keyboards often do not report the comma key: split on input instead
                input.addEventListener('input', () => {
                    if (input.value.includes(',')) addTyped(input.value, true);
                });
                input.addEventListener('blur', () => {
                    addTyped(input.value, false);
                });
                if (focusInput) input.focus();
            } else if (focusInput) {
                const first = container.querySelector('button');
                if (first) first.focus();
            }
        }

        updateUI();

        return {
            getOfferings: () => [...offerings],
            setOfferings: (newOfferings) => {
                offerings = [...(newOfferings || [])].slice(0, 10);
                updateUI();
                onChange(offerings);
            }
        };
    }

    /**
     * Normalize openHours so each day has at most 1 continuous range with HH:MM (00:00..23:59)
     */
    function normalizeSingleRangeHours(rawHours) {
        const base = rawHours && typeof rawHours === 'object' ? rawHours : getDefaultHours();
        const normalized = {};
        DAYS_ORDER.forEach(d => {
            const arr = Array.isArray(base[d]) ? base[d] : [];
            if (arr.length === 0) {
                normalized[d] = [];
            } else {
                const openVal = (arr[0] && arr[0].open) ? String(arr[0].open) : '08:00';
                let closeVal = (arr[arr.length - 1] && arr[arr.length - 1].close) ? String(arr[arr.length - 1].close) : '17:00';
                if (closeVal === '24:00') closeVal = '23:59';
                normalized[d] = [{ open: openVal, close: closeVal }];
            }
        });
        return normalized;
    }

    /**
     * Render the 7-day Open Hours Editor
     * - Toggle switches (Open / Closed) per day
     * - Single continuous time range per day (no second range / split shift)
     * - Standard <input type="time"> manual & picker inputs
     * - Mobile: stacked vertically; Desktop: aligned in a clean row
     */
    function renderOpenHoursEditor(container, { initialHours = null, onChange = () => {} } = {}) {
        ensureHoursStyles();
        let hours = normalizeSingleRangeHours(initialHours || getDefaultHours());

        function parseTimeMin(t) {
            const m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
            return m ? (+m[1]) * 60 + (+m[2]) : NaN;
        }

        function isRangeValid(r) {
            if (!r) return false;
            const o = parseTimeMin(r.open);
            const c = parseTimeMin(r.close === '24:00' ? '23:59' : r.close);
            return !isNaN(o) && !isNaN(c) && o >= 0 && c <= 1440 && o < c;
        }

        function updateUI() {
            const anyDayOpen = DAYS_ORDER.some(d => Array.isArray(hours[d]) && hours[d].length > 0);

            container.innerHTML = `
                <div class="cz-hours-toolbar">
                    <button type="button" id="btnShortcutSame" class="cz-hours-preset-btn">
                        Apply Monday hours to all days
                    </button>
                    <button type="button" id="btnShortcutWeekdays" class="cz-hours-preset-btn">
                        Mon–Fri (8:00 AM – 5:00 PM)
                    </button>
                    <button type="button" id="btnShortcut24" class="cz-hours-preset-btn">
                        Open 24 hours
                    </button>
                </div>
                <div id="daysRowsContainer" class="cz-hours-list"></div>
                <div id="hoursGlobalError" style="display: ${anyDayOpen ? 'none' : 'block'}; margin-top: 10px; font-size: 13px; color: #DC2626; font-weight: 500;">
                    Please set at least one open day for your business.
                </div>
            `;

            container.querySelector('#btnShortcutSame').addEventListener('click', () => {
                const monRanges = (hours.mon && hours.mon.length > 0)
                    ? [{ open: hours.mon[0].open, close: hours.mon[0].close === '24:00' ? '23:59' : hours.mon[0].close }]
                    : [{ open: '08:00', close: '17:00' }];
                DAYS_ORDER.forEach(d => {
                    hours[d] = [{ open: monRanges[0].open, close: monRanges[0].close }];
                });
                updateUI();
                onChange(hours);
            });

            container.querySelector('#btnShortcutWeekdays').addEventListener('click', () => {
                DAYS_ORDER.forEach(d => {
                    hours[d] = (d === 'sat' || d === 'sun') ? [] : [{ open: '08:00', close: '17:00' }];
                });
                updateUI();
                onChange(hours);
            });

            container.querySelector('#btnShortcut24').addEventListener('click', () => {
                DAYS_ORDER.forEach(d => {
                    hours[d] = [{ open: '00:00', close: '23:59' }];
                });
                updateUI();
                onChange(hours);
            });

            const rowsContainer = container.querySelector('#daysRowsContainer');

            DAYS_ORDER.forEach(dayKey => {
                const dayRanges = hours[dayKey] || [];
                const isOpen = Array.isArray(dayRanges) && dayRanges.length > 0;
                const rawRange = isOpen ? dayRanges[0] : { open: '08:00', close: '17:00' };
                const openTime = rawRange.open || '08:00';
                const closeTime = (rawRange.close === '24:00' ? '23:59' : rawRange.close) || '17:00';
                const validRange = !isOpen || isRangeValid({ open: openTime, close: closeTime });

                const row = document.createElement('div');
                row.className = `cz-hours-row ${!isOpen ? 'is-closed' : ''} ${!validRange ? 'has-error' : ''}`;
                row.setAttribute('data-day-row', dayKey);

                row.innerHTML = `
                    <div class="cz-hours-row-main">
                        <div class="cz-hours-day-toggle-group">
                            <span class="cz-hours-day-label">${DAY_NAMES.en[dayKey]}</span>
                            <label class="cz-switch-label" for="toggle-day-${dayKey}">
                                <input
                                    type="checkbox"
                                    id="toggle-day-${dayKey}"
                                    role="switch"
                                    aria-checked="${isOpen ? 'true' : 'false'}"
                                    class="cz-switch-input day-toggle"
                                    data-day="${dayKey}"
                                    ${isOpen ? 'checked' : ''}
                                />
                                <span class="cz-switch-track" aria-hidden="true">
                                    <span class="cz-switch-thumb"></span>
                                </span>
                                <span class="cz-switch-state-text">${isOpen ? 'Open' : 'Closed'}</span>
                            </label>
                        </div>

                        ${isOpen ? `
                            <div class="cz-hours-time-group">
                                <div class="cz-time-field-wrap">
                                    <input
                                        type="time"
                                        class="cz-time-input time-input-open"
                                        data-day="${dayKey}"
                                        value="${openTime}"
                                        aria-label="${DAY_NAMES.en[dayKey]} opening time"
                                        required
                                    />
                                </div>
                                <span class="cz-time-sep">to</span>
                                <div class="cz-time-field-wrap">
                                    <input
                                        type="time"
                                        class="cz-time-input time-input-close"
                                        data-day="${dayKey}"
                                        value="${closeTime}"
                                        aria-label="${DAY_NAMES.en[dayKey]} closing time"
                                        required
                                    />
                                </div>
                            </div>
                        ` : `
                            <div class="cz-closed-badge">Closed all day</div>
                        `}
                    </div>
                    <div class="cz-hours-row-error" data-day-error="${dayKey}" style="display: ${validRange ? 'none' : 'block'};">
                        Closing time must be later than opening time (e.g., 08:00 AM to 05:00 PM).
                    </div>
                `;

                const chk = row.querySelector('.day-toggle');
                if (chk) {
                    chk.addEventListener('change', () => {
                        if (chk.checked) {
                            hours[dayKey] = [{ open: '08:00', close: '17:00' }];
                        } else {
                            hours[dayKey] = [];
                        }
                        updateUI();
                        onChange(hours);
                    });
                }

                const inpOpen = row.querySelector('.time-input-open');
                const inpClose = row.querySelector('.time-input-close');
                const errEl = row.querySelector(`[data-day-error="${dayKey}"]`);

                const handleTimeInput = () => {
                    if (! inpOpen || !inpClose) return;
                    const newOpen = inpOpen.value || '08:00';
                    const newClose = inpClose.value || '17:00';
                    hours[dayKey] = [{ open: newOpen, close: newClose }];
                    const ok = isRangeValid(hours[dayKey][0]);
                    row.classList.toggle('has-error', !ok);
                    if (errEl) errEl.style.display = ok ? 'none' : 'block';
                    onChange(hours);
                };

                if (inpOpen && inpClose) {
                    inpOpen.addEventListener('input', handleTimeInput);
                    inpOpen.addEventListener('change', handleTimeInput);
                    inpClose.addEventListener('input', handleTimeInput);
                    inpClose.addEventListener('change', handleTimeInput);
                }

                rowsContainer.appendChild(row);
            });
        }

        updateUI();

        return {
            getHours: () => JSON.parse(JSON.stringify(hours)),
            getOpenHours: () => JSON.parse(JSON.stringify(hours)),
            setHours: (newHours) => {
                hours = normalizeSingleRangeHours(newHours || getDefaultHours());
                updateUI();
                onChange(hours);
            }
        };
    }

    /**
     * Compute if business is currently open in Asia/Manila
     */
    function getOpenStatus(openHours, nowInput = new Date()) {
        if (!openHours || typeof openHours !== 'object') {
            return {
                isOpen: false,
                statusText: 'Closed',
                statusTextTl: 'Sarado',
                formattedText: 'Closed'
            };
        }

        // Get Asia/Manila day of week and time
        const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
        const manilaFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        const parts = manilaFormatter.formatToParts(now);
        let weekdayShort = '';
        let hourStr = '00';
        let minuteStr = '00';
        for (const p of parts) {
            if (p.type === 'weekday') weekdayShort = p.value.toLowerCase();
            if (p.type === 'hour') hourStr = p.value;
            if (p.type === 'minute') minuteStr = p.value;
        }

        const dayMap = {
            'mon': 'mon',
            'tue': 'tue',
            'wed': 'wed',
            'thu': 'thu',
            'fri': 'fri',
            'sat': 'sat',
            'sun': 'sun'
        };
        const currentDayKey = dayMap[weekdayShort] || 'mon';
        const currentTimeMinutes = parseInt(hourStr, 10) * 60 + parseInt(minuteStr, 10);

        function parseMinutes(tStr) {
            if (!tStr) return 0;
            const [h, m] = tStr.split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
        }

        const todayRanges = openHours[currentDayKey] || [];
        if (!Array.isArray(todayRanges) || todayRanges.length === 0) {
            // Find next opening day
            const dayIndex = DAYS_ORDER.indexOf(currentDayKey);
            for (let i = 1; i <= 7; i++) {
                const nextKey = DAYS_ORDER[(dayIndex + i) % 7];
                const nextRanges = openHours[nextKey] || [];
                if (nextRanges.length > 0) {
                    const opensAt = formatTime12(nextRanges[0].open);
                    const dayName = i === 1 ? 'tomorrow' : DAY_NAMES.en[nextKey];
                    return {
                        isOpen: false,
                        statusText: `Closed · Opens ${opensAt}`,
                        statusTextTl: `Sarado · Magbubukas ${opensAt}`,
                        formattedText: `Closed · Opens ${opensAt} (${dayName})`
                    };
                }
            }
            return {
                isOpen: false,
                statusText: 'Closed',
                statusTextTl: 'Sarado',
                formattedText: 'Closed'
            };
        }

        if (todayRanges.length === 1 && todayRanges[0].open === '00:00' && (todayRanges[0].close === '24:00' || todayRanges[0].close === '23:59')) {
            return { isOpen: true, statusText: 'Open 24 hours', statusTextTl: 'Bukas 24 oras', formattedText: 'Open 24 hours' };
        }

        // Check if current time falls within any range today
        for (const r of todayRanges) {
            const startM = parseMinutes(r.open);
            const endM = parseMinutes(r.close);
            if (currentTimeMinutes >= startM && currentTimeMinutes < endM) {
                const closeStr = formatTime12(r.close);
                return {
                    isOpen: true,
                    statusText: `Open now · Closes ${closeStr}`,
                    statusTextTl: `Bukas ngayon · Magpapasara ng ${closeStr}`,
                    formattedText: `Open now · Closes ${closeStr}`
                };
            }
        }

        // Check if opening later today
        for (const r of todayRanges) {
            const startM = parseMinutes(r.open);
            if (currentTimeMinutes < startM) {
                const openStr = formatTime12(r.open);
                return {
                    isOpen: false,
                    statusText: `Closed · Opens ${openStr}`,
                    statusTextTl: `Sarado · Magbubukas ng ${openStr}`,
                    formattedText: `Closed · Opens ${openStr}`
                };
            }
        }

        // Closed for the day, check tomorrow
        const dayIndex = DAYS_ORDER.indexOf(currentDayKey);
        const nextKey = DAYS_ORDER[(dayIndex + 1) % 7];
        const tomorrowRanges = openHours[nextKey] || [];
        if (tomorrowRanges.length > 0) {
            const opensAt = formatTime12(tomorrowRanges[0].open);
            return {
                isOpen: false,
                statusText: `Closed · Opens ${opensAt}`,
                statusTextTl: `Sarado · Magbubukas ${opensAt}`,
                formattedText: `Closed · Opens ${opensAt} tomorrow`
            };
        }

        return {
            isOpen: false,
            statusText: 'Closed',
            statusTextTl: 'Sarado',
            formattedText: 'Closed'
        };
    }

    /**
     * Format full weekly hours list
     */
    function formatWeeklyHours(openHours, lang = 'en') {
        const names = DAY_NAMES[lang] || DAY_NAMES.en;
        return DAYS_ORDER.map(dKey => {
            const ranges = openHours && openHours[dKey];
            if (!Array.isArray(ranges) || ranges.length === 0) {
                return {
                    dayKey: dKey,
                    dayName: names[dKey],
                    hoursText: lang === 'tl' ? 'Sarado' : 'Closed'
                };
            }
            const text = ranges.map(r => `${formatTime12(r.open)} – ${formatTime12(r.close)}`).join(', ');
            return {
                dayKey: dKey,
                dayName: names[dKey],
                hoursText: text
            };
        });
    }

    return {
        DAYS_ORDER,
        DAY_NAMES,
        getDefaultHours,
        getTimeOptions,
        formatTime12,
        compressImageFile,
        renderOfferingsInput,
        renderOpenHoursEditor,
        getOpenStatus,
        isValidOpenHours,
        formatWeeklyHours
    };
});
