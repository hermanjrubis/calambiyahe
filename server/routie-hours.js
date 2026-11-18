// Opening hours "right now" for Routie, in Calamba's time (Asia/Manila).
//
// Places store hours per day: { mon: "6:00 AM - 9:00 PM", ..., sun: "Closed" | "Open 24 hours" }. A range may run past
// midnight ("5:00 PM - 12:00 AM", "8:00 PM - 2:00 AM"). Anything else (a free-text string, another shape) is treated as
// unknown, so Routie says it can't tell instead of guessing.

'use strict';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = {
    en: { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' },
    tl: { sun: 'Linggo', mon: 'Lunes', tue: 'Martes', wed: 'Miyerkules', thu: 'Huwebes', fri: 'Biyernes', sat: 'Sabado' }
};

// The time in Calamba: { day: 'wed', minutes: 1334, label: 'Wednesday, November 18, 2026, 10:14 PM' }
function manilaNow(date = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false
    }).formatToParts(date).map(p => [p.type, p.value]));
    const hour = Number(parts.hour) % 24;
    const label = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
    return { day: String(parts.weekday).slice(0, 3).toLowerCase(), minutes: hour * 60 + Number(parts.minute), label };
}

// "6:00 AM" → 360; "12:00 AM" → 0; null if not a time
function toMinutes(t) {
    const m = String(t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?$/);
    if (!m) return null;
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    const min = Number(m[2] || 0);
    return h > 23 || min > 59 ? null : h * 60 + min;
}

// One day's text → { closed } | { always } | { open, close (may be > 1440 past midnight), text } | null
function parseDay(text) {
    const t = String(text || '').trim();
    if (!t) return null;
    if (/^closed$/i.test(t)) return { closed: true, text: t };
    if (/^open 24 hours$|^24 hours$|^24\/7$/i.test(t)) return { always: true, text: t };
    const m = t.match(/^(.+?)\s*[-–]\s*(.+)$/);
    if (!m) return null;
    const open = toMinutes(m[1]);
    let close = toMinutes(m[2]);
    if (open == null || close == null) return null;
    if (close <= open) close += 1440; // past midnight ("5:00 PM - 12:00 AM")
    return { open, close, text: t };
}

// Is the place open at `now`? { known, open, today, closesAt?, opensAt?, opensDay? }
function openStatus(hours, now) {
    if (!hours || typeof hours !== 'object') return { known: false };
    const idx = DAYS.indexOf(now.day);
    if (idx === -1) return { known: false };
    const today = parseDay(hours[now.day]);
    const yesterday = parseDay(hours[DAYS[(idx + 6) % 7]]);
    if (!today) return { known: false };
    const fmt = (min) => {
        const m = ((min % 1440) + 1440) % 1440;
        const h = Math.floor(m / 60), mm = m % 60;
        return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    };
    if (today.always) return { known: true, open: true, always: true, today: today.text };
    // Still open from yesterday's range that runs past midnight
    if (yesterday && yesterday.close > 1440 && now.minutes < yesterday.close - 1440) {
        return { known: true, open: true, today: today.text, closesAt: fmt(yesterday.close) };
    }
    if (!today.closed && now.minutes >= today.open && now.minutes < today.close) {
        return { known: true, open: true, today: today.text, closesAt: fmt(today.close) };
    }
    if (!today.closed && now.minutes < today.open) {
        return { known: true, open: false, today: today.text, opensAt: fmt(today.open), opensDay: 'today' };
    }
    // Closed for the rest of today: the next day it opens
    for (let i = 1; i <= 7; i++) {
        const day = DAYS[(idx + i) % 7];
        const d = parseDay(hours[day]);
        if (!d) return { known: true, open: false, today: today.text };
        if (d.always) return { known: true, open: false, today: today.text, opensAt: '12:00 AM', opensDay: day, tomorrow: i === 1 };
        if (!d.closed) return { known: true, open: false, today: today.text, opensAt: fmt(d.open), opensDay: day, tomorrow: i === 1 };
    }
    return { known: true, open: false, today: today.text };
}

// One sentence for a commuter: "Bukas ngayon ang X (hanggang 9:00 PM)." / "Sarado na ngayon ang X. Bubukas ulit bukas, 6:00 AM."
function openStatusText(name, status, now, lang) {
    const tl = lang === 'tl';
    const names = DAY_NAMES[tl ? 'tl' : 'en'];
    const hhmm = (() => {
        const h = Math.floor(now.minutes / 60), m = now.minutes % 60;
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    })();
    const at = tl ? `(${names[now.day]}, ${hhmm})` : `(${names[now.day]}, ${hhmm})`;
    if (!status || !status.known) {
        return tl
            ? `Wala sa data ng Calzada ang oras ng ${name}, kaya hindi ko masabi kung bukas ito ngayon.`
            : `Calzada has no opening hours for ${name}, so I can't tell whether it is open right now.`;
    }
    if (status.open) {
        if (status.always) return tl ? `Bukas ngayon ang ${name}: bukas ito 24 oras.` : `${name} is open now: it is open 24 hours.`;
        return tl
            ? `Bukas ngayon ang ${name} ${at}, hanggang ${status.closesAt}.`
            : `${name} is open now ${at}, until ${status.closesAt}.`;
    }
    let next = '';
    if (status.opensAt) {
        const when = status.opensDay === 'today' ? (tl ? 'mamaya' : 'later today')
            : status.tomorrow ? (tl ? 'bukas' : 'tomorrow') : (tl ? `sa ${names[status.opensDay]}` : `on ${names[status.opensDay]}`);
        next = tl ? ` Bubukas ito ${when}, ${status.opensAt}.` : ` It opens ${when} at ${status.opensAt}.`;
    }
    const todayHours = status.today && !/^closed$/i.test(status.today)
        ? (tl ? ` Ang oras nito ngayong araw: ${status.today}.` : ` Today's hours: ${status.today}.`)
        : '';
    return tl
        ? `Sarado ngayon ang ${name} ${at}.${next}${todayHours}`
        : `${name} is closed right now ${at}.${next}${todayHours}`;
}

// Short questions about whether a place is open ("ngayon 'yan?", "bukas pa ba?", "open now?", "hanggang anong oras?")
const OPEN_WORDS = new Set('bukas open opened opens sarado closed close closes closing nagsasara magsasara sasara nagbubukas magbubukas ngayon now today still pa hanggang until oras time anong what hours schedule'.split(' '));
const OPEN_FILLER = new Set('ba po yan iyan yun iyon na ang the is it are they will does do at sa nga ulit again kaya siya sya ito this that eh e so and right mga hanggang'.split(' '));
const OPEN_CORE = new Set('bukas open opened opens sarado closed close closes closing nagsasara magsasara sasara nagbubukas magbubukas ngayon now hanggang until hours schedule'.split(' '));
function isOpenNowAsk(text) {
    const words = String(text || '').split(' ').filter(Boolean);
    if (!words.length || words.length > 8) return false;
    return words.every(w => OPEN_WORDS.has(w) || OPEN_FILLER.has(w)) && words.some(w => OPEN_CORE.has(w));
}

module.exports = { manilaNow, parseDay, openStatus, openStatusText, isOpenNowAsk, DAY_NAMES };
