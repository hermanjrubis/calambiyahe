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

    // Every range must end after it starts ("24:00" = midnight at the end of the day)
    function isValidOpenHours(openHours) {
        if (!openHours || typeof openHours !== 'object') return false;
        const toMin = (t) => {
            const m = /^(\d{2}):(\d{2})$/.exec(String(t || ''));
            return m ? (+m[1]) * 60 + (+m[2]) : NaN;
        };
        return DAYS_ORDER.every((d) => {
            const ranges = openHours[d] || [];
            if (!Array.isArray(ranges) || ranges.length > 2) return false;
            let prevEnd = -1;
            return ranges.every((r) => {
                const a = toMin(r && r.open), b = toMin(r && r.close);
                const ok = a >= 0 && b <= 1440 && a < b && a >= prevEnd;
                prevEnd = b;
                return ok;
            });
        });
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
     * Render the 7-day Open Hours Editor
     */
    function renderOpenHoursEditor(container, { initialHours = null, onChange = () => {} } = {}) {
        let hours = JSON.parse(JSON.stringify(initialHours || getDefaultHours()));
        const timeOptions = getTimeOptions();
        // Closing times may also be midnight at the end of the day
        const closeOptions = [...timeOptions.slice(1), { value: '24:00', label: '12:00 AM (midnight)' }];

        function updateUI() {
            container.innerHTML = `
                <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px;">
                    <button type="button" id="btnShortcutSame" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #378ADD; cursor: pointer; font-family: 'Outfit', sans-serif;">
                        Same hours every day
                    </button>
                    <button type="button" id="btnShortcut24" style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #378ADD; cursor: pointer; font-family: 'Outfit', sans-serif;">
                        Open 24 hours
                    </button>
                </div>
                <div id="daysRowsContainer" style="display: flex; flex-direction: column; gap: 8px;"></div>
            `;

            container.querySelector('#btnShortcutSame').addEventListener('click', () => {
                const monRanges = hours.mon ? JSON.parse(JSON.stringify(hours.mon)) : [{ open: '08:00', close: '18:00' }];
                DAYS_ORDER.forEach(d => {
                    hours[d] = JSON.parse(JSON.stringify(monRanges));
                });
                updateUI();
                onChange(hours);
            });

            container.querySelector('#btnShortcut24').addEventListener('click', () => {
                DAYS_ORDER.forEach(d => {
                    hours[d] = [{ open: '00:00', close: '24:00' }];
                });
                updateUI();
                onChange(hours);
            });

            const rowsContainer = container.querySelector('#daysRowsContainer');

            DAYS_ORDER.forEach(dayKey => {
                const dayRanges = hours[dayKey] || [];
                const isOpen = Array.isArray(dayRanges) && dayRanges.length > 0;
                const range1 = isOpen ? dayRanges[0] : { open: '08:00', close: '18:00' };
                const range2 = (isOpen && dayRanges.length > 1) ? dayRanges[1] : null;

                const row = document.createElement('div');
                row.style.cssText = 'background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;';

                row.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
                        <span style="font-weight: 600; font-size: 14px; color: #042C53; min-width: 90px;">${DAY_NAMES.en[dayKey]}</span>
                        <div style="display: flex; align-items: center; gap: 12px; flex: 1; justify-content: flex-end; flex-wrap: wrap;">
                            <label style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: #042C53; cursor: pointer;">
                                <input type="checkbox" class="day-toggle" data-day="${dayKey}" ${isOpen ? 'checked' : ''} style="width: 16px; height: 16px; accent-color: #378ADD;" />
                                <span>${isOpen ? 'Open' : 'Closed'}</span>
                            </label>
                            ${isOpen ? `
                                <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; max-width: 100%;">
                                    <select class="time-select-open-1" data-day="${dayKey}" style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 6px; font-size: 13px; color: #042C53; background: #FFFFFF; font-family: 'Outfit', sans-serif;">
                                        ${timeOptions.map(t => `<option value="${t.value}" ${t.value === range1.open ? 'selected' : ''}>${t.label}</option>`).join('')}
                                    </select>
                                    <span style="color: #64748B; font-size: 13px;">to</span>
                                    <select class="time-select-close-1" data-day="${dayKey}" style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 6px; font-size: 13px; color: #042C53; background: #FFFFFF; font-family: 'Outfit', sans-serif;">
                                        ${closeOptions.map(t => `<option value="${t.value}" ${t.value === range1.close ? 'selected' : ''}>${t.label}</option>`).join('')}
                                    </select>
                                    ${!range2 ? `
                                        <button type="button" class="btn-add-range" data-day="${dayKey}" style="background: transparent; border: none; color: #378ADD; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 6px; white-space: nowrap;">
                                            + Second range
                                        </button>
                                    ` : ''}
                                </div>
                            ` : '<span style="font-size: 13px; color: #94A3B8;">Closed all day</span>'}
                        </div>
                    </div>
                    ${range2 ? `
                        <div style="display: flex; align-items: center; justify-content: flex-end; gap: 6px; padding-top: 4px; border-top: 1px dashed #E2E8F0; flex-wrap: wrap;">
                            <span style="font-size: 12px; color: #64748B;">Range 2:</span>
                            <select class="time-select-open-2" data-day="${dayKey}" style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 6px; font-size: 13px; color: #042C53; background: #FFFFFF; font-family: 'Outfit', sans-serif;">
                                ${timeOptions.map(t => `<option value="${t.value}" ${t.value === range2.open ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select>
                            <span style="color: #64748B; font-size: 13px;">to</span>
                            <select class="time-select-close-2" data-day="${dayKey}" style="border: 1px solid #E2E8F0; border-radius: 6px; padding: 4px 6px; font-size: 13px; color: #042C53; background: #FFFFFF; font-family: 'Outfit', sans-serif;">
                                ${closeOptions.map(t => `<option value="${t.value}" ${t.value === range2.close ? 'selected' : ''}>${t.label}</option>`).join('')}
                            </select>
                            <button type="button" class="btn-remove-range-2" data-day="${dayKey}" style="background: transparent; border: none; color: #DC2626; font-size: 12px; font-weight: 600; cursor: pointer; padding: 4px 6px;">
                                Remove
                            </button>
                        </div>
                    ` : ''}
                `;

                // Wire event listeners for row
                const chk = row.querySelector('.day-toggle');
                if (chk) {
                    chk.addEventListener('change', () => {
                        if (chk.checked) {
                            hours[dayKey] = [{ open: '08:00', close: '18:00' }];
                        } else {
                            hours[dayKey] = [];
                        }
                        updateUI();
                        onChange(hours);
                    });
                }

                const selOpen1 = row.querySelector('.time-select-open-1');
                const selClose1 = row.querySelector('.time-select-close-1');
                if (selOpen1 && selClose1) {
                    selOpen1.addEventListener('change', () => {
                        if (!hours[dayKey] || hours[dayKey].length === 0) hours[dayKey] = [{ open: '08:00', close: '18:00' }];
                        hours[dayKey][0].open = selOpen1.value;
                        onChange(hours);
                    });
                    selClose1.addEventListener('change', () => {
                        if (!hours[dayKey] || hours[dayKey].length === 0) hours[dayKey] = [{ open: '08:00', close: '18:00' }];
                        hours[dayKey][0].close = selClose1.value;
                        onChange(hours);
                    });
                }

                const btnAdd2 = row.querySelector('.btn-add-range');
                if (btnAdd2) {
                    btnAdd2.addEventListener('click', () => {
                        if (!hours[dayKey]) hours[dayKey] = [];
                        if (hours[dayKey].length === 1) {
                            hours[dayKey].push({ open: '13:00', close: '19:00' });
                            updateUI();
                            onChange(hours);
                        }
                    });
                }

                const btnRem2 = row.querySelector('.btn-remove-range-2');
                if (btnRem2) {
                    btnRem2.addEventListener('click', () => {
                        if (hours[dayKey] && hours[dayKey].length > 1) {
                            hours[dayKey].splice(1, 1);
                            updateUI();
                            onChange(hours);
                        }
                    });
                }

                const selOpen2 = row.querySelector('.time-select-open-2');
                const selClose2 = row.querySelector('.time-select-close-2');
                if (selOpen2 && selClose2) {
                    selOpen2.addEventListener('change', () => {
                        if (hours[dayKey] && hours[dayKey][1]) {
                            hours[dayKey][1].open = selOpen2.value;
                            onChange(hours);
                        }
                    });
                    selClose2.addEventListener('change', () => {
                        if (hours[dayKey] && hours[dayKey][1]) {
                            hours[dayKey][1].close = selClose2.value;
                            onChange(hours);
                        }
                    });
                }

                rowsContainer.appendChild(row);
            });
        }

        updateUI();

        return {
            getHours: () => JSON.parse(JSON.stringify(hours)),
            getOpenHours: () => JSON.parse(JSON.stringify(hours)),
            setHours: (newHours) => {
                hours = JSON.parse(JSON.stringify(newHours || getDefaultHours()));
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
