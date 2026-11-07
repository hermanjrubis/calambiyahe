// Knowledge engine and live data resolver for Routie (Calzada AI Commuting Guide).
//
// Complies with all core rules:
// Rule 1: Answer only from our data. If not in data, say not sure and point to calzadaph.com/planner or thecalzada@gmail.com.
// Rule 2: Fares and travel times come from the real fare table or Planner, not model's guess. Always call fare an estimate.
// Rule 3: Opening hours, addresses, and business info fetched live from database (places.json + live Firestore businesses).
// Rule 4: If ambiguous (e.g. just "SM" or missing origin for directions), ask where user is starting from and going.
// Rule 5: Scope is Calamba only. Politely decline out-of-scope inquiries.

const path = require('path');
const fs = require('fs');

const { getFareData, fareFactsSection, MODERN_JEEPNEY_MINIMUM } = require('./fare-info');
const routiePlanner = require('./routie-planner');
let fareCalc = null;
try {
    fareCalc = require('../public/js/fare-calc.js');
} catch (_) {}

let transitEngine = null;
let transitPlanner = null;
let transitRoutesData = null;
let barangaysData = null;

let defaultPlacesData = [];
try {
    const pPath = path.resolve(__dirname, 'data/places.json');
    if (fs.existsSync(pPath)) {
        defaultPlacesData = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    }
} catch (_) {}

try {
    transitEngine = require('../public/js/transit-engine.js');
    transitRoutesData = require('../public/data/transit-routes.json');
    barangaysData = require('../public/data/barangays.json');
    if (transitEngine && transitRoutesData && barangaysData) {
        transitPlanner = transitEngine.createPlanner(transitRoutesData, barangaysData);
    }
} catch (err) {
    console.error('Failed to initialize transit engine in routie-knowledge:', err.message);
}

// ── Verified FAQ Knowledge Base (from faq.html and i18n.js) ───────────────────────────
const FAQS = [
    {
        id: 'what_is_calzada',
        triggers: ['what is calzada', 'ano ang calzada', 'about calzada', 'tungkol sa calzada', 'what is this site', 'ano itong website'],
        en: 'Calzada helps you discover places worth visiting around Calamba and shows you how to get there by jeepney or on foot, with fares and directions in one place.',
        tl: 'Ang Calzada ay tumutulong sa iyo na tumuklas ng mga lugar sa Calamba at nagpapakita kung paano makarating doon gamit ang jeep o paglalakad, kasama ang pamasahe at direksyon sa iisang website.'
    },
    {
        id: 'route_search',
        triggers: ['how do i use the route search', 'paano gamitin ang route search', 'how to use planner', 'paano gamitin ang planner', 'route search feature'],
        en: 'Enter your starting point and destination in the Planner (calzadaph.com/planner), then tap the button to begin. For a jeepney trip, the planner shows options (Recommended, Cheapest, Fastest) with travel time, fare, and walking distance. For a short trip, it shows the walking route.',
        tl: 'Ilagay ang iyong simula at destinasyon sa Planner (calzadaph.com/planner), tapos pindutin ang button para simulan. Para sa biyahe sa jeep, ipapakita nito ang mga opsyon (Recommended, Pinakamura, Pinakamabilis) kasama ang travel time, pamasahe, at lakad. Para sa maikling biyahe, lakad ang ipapakita.'
    },
    {
        id: 'exact_fares',
        triggers: ['exact fares', 'eksakto ba ang pamasahe', 'accurate ba ang fare', 'are fares exact', 'does the website show exact fares'],
        en: 'Calzada provides estimated fares based on the LTFRB fare guide. Actual fares may vary slightly depending on operator policies, but it gives commuters a clear idea of expected costs before traveling.',
        tl: 'Tantiya lang ang mga pamasahe sa Calzada base sa LTFRB fare guide. Maaaring mag-iba nang kaunti depende sa patakaran ng drayber o operator, pero layunin nitong bigyan ka ng malinaw na inaasahang gastos bago bumiyahe.'
    },
    {
        id: 'fare_computation',
        triggers: ['how are jeepney fares computed', 'paano kinakalkula ang pamasahe', 'paano kino-compute ang pamasahe', 'computation of fare', 'formula ng pamasahe'],
        en: 'Jeepney fares follow the official LTFRB fare guide: a minimum base fare for the first 4 km, plus an additional rate for each succeeding km, rounded to the nearest 25 centavos. Students, senior citizens, and PWDs receive a 20% discount.',
        tl: 'Sumusunod ang pamasahe sa LTFRB fare guide: may minimum base fare para sa unang 4 km, dagdag sa bawat sumunod na km, at niroround sa pinakamalapit na 25 centavos. May 20% diskwento ang mga estudyante, senior citizen, at PWD.'
    },
    {
        id: 'mobile_access',
        triggers: ['mobile', 'cellphone', 'smartphone', 'can i access calzada on mobile', 'magagamit ba sa cellphone', 'may app ba'],
        en: 'Yes. Calzada is fully responsive and adjusts automatically to any screen size, whether on desktop, laptop, tablet, or smartphone.',
        tl: 'Oo. Responsive ang Calzada kaya maayos itong gamitin sa kahit anong screen — desktop, laptop, tablet, o cellphone.'
    },
    {
        id: 'transport_modes',
        triggers: ['transport options', 'modes of transport', 'transport options does calzada support', 'anong sasakyan', 'mga transportasyon'],
        en: 'Calzada currently supports jeepney routes and walking directions within its covered areas in Calamba.',
        tl: 'Jeepney at paglalakad ang sinusuportahang transportasyon ng Calzada sa mga sakop na lugar sa Calamba.'
    },
    {
        id: 'what_is_routie',
        triggers: ['what is routie', 'ano si routie', 'who is routie', 'sino si routie'],
        en: 'Routie is your friendly chat assistant on Calzada — ask me to help you find places in Calamba, check jeepney fares, or figure out how to get somewhere by jeepney or on foot.',
        tl: 'Ako si Routie, ang iyong assistant sa Calzada — puwede mo akong tanungin tungkol sa mga lugar sa Calamba, pamasahe sa jeep, o kung paano makapunta sa isang lugar sakay ng jeep o maglakad.'
    },
    {
        id: 'is_free',
        triggers: ['free to use', 'libre ba', 'may bayad ba', 'is calzada free', 'libre ba gamitin ang calzada'],
        en: 'Yes. Finding places, checking fare estimates, and planning routes on Calzada is completely free.',
        tl: 'Oo. Libreng-libre gamitin ang Calzada para maghanap ng lugar, tumingin ng pamasahe, at magplano ng ruta.'
    },
    {
        id: 'main_goal',
        triggers: ['main goal', 'purpose', 'layunin', 'goal of calzada', 'bakit ginawa ang calzada'],
        en: 'Calzada helps commuters discover places worth visiting in Calamba and get there easily by jeepney or on foot, with clear directions, fares, and travel times in one place.',
        tl: 'Ang layunin ng Calzada ay tulungan ang mga commuter na tumuklas ng mga lugar sa Calamba at makabiyahe nang madali sakay ng jeep o maglakad, na may malinaw na direksyon, pamasahe, at travel time.'
    },
    {
        id: 'business_register',
        triggers: [
            'list my business', 'register business', 'ilista ang negosyo', 'mailista', 'maililista',
            'maglista', 'magrehistro ng negosyo', 'rehistro ng negosyo', 'magparehistro',
            'how to register my business', 'how do i list my business'
        ],
        en: 'Sign in to Calzada, click "Register your business" from your profile menu, and fill in your business name, category, address, and map pin. Each account can register one business.',
        tl: 'Mag-sign in, buksan ang "Register your business" mula sa profile menu, at punan ang pangalan ng negosyo, kategorya, address, at map pin. Isang negosyo bawat account.'
    },
    {
        id: 'business_approval',
        triggers: ['how long does approval take', 'gaano katagal ang approval', 'business approval time'],
        en: 'Every business registration is reviewed by the Calzada team before it appears publicly. You can check the status anytime on your My Business page.',
        tl: 'Bawat rehistrasyon ay nirerepaso ng Calzada team bago lumabas sa publiko. Puwede mong tingnan ang status anumang oras sa iyong My Business page.'
    },
    {
        id: 'business_rejected',
        triggers: ['why was my registration rejected', 'bakit na-reject ang business', 'rejected registration'],
        en: 'If your business details could not be verified, your My Business page will show the reason. You can correct the information and register again.',
        tl: 'Kung hindi ma-verify ang mga detalye, ipapakita sa iyong My Business page ang dahilan. Puwede mong iwasto ang impormasyon at mag-submit muli.'
    },
    {
        id: 'business_edit',
        triggers: ['what can i change after business is approved', 'ano puwedeng palitan kapag approved', 'edit business details'],
        en: 'After approval, you can update your profile photo, description, and social links anytime. Verified details (business name, category, address, map pin) cannot be edited directly from your account.',
        tl: 'Kapag approved na, puwede mong palitan ang photo, description, at social links anumang oras. Ang mga verified na detalye (pangalan, kategorya, address, pin) ay hindi mababago nang direkta sa account.'
    },
    {
        id: 'business_updates_feed',
        triggers: ['updates feed', 'how does updates feed decide', 'paano lumalabas ang posts'],
        en: 'Posts from approved businesses appear newest first on the Updates feed. Pinned posts from featured businesses appear at the top.',
        tl: 'Lumalabas ang mga post ng approved businesses mula sa pinakabago sa Updates feed. Ang mga naka-pin na post ay nauuna sa itaas.'
    },
    {
        id: 'business_post_limits',
        triggers: ['what can i post', 'ano puwede i-post', 'post limits', 'how many photos per post'],
        en: 'Approved businesses can post up to 5 photos per post with a caption of up to 500 characters. You can edit the caption or delete posts later.',
        tl: 'Puwede kang mag-post ng hanggang 5 larawan bawat post at caption na hanggang 500 characters. Puwede mong i-edit ang caption o burahin ang post kinalaunan.'
    },
    {
        id: 'suggested_terminals',
        triggers: [
            'suggested terminals', 'suggested terminal', 'terminal choices',
            'mga terminal sa calamba', 'saan ang mga terminal', 'saan sasakay',
            'terminals in calamba', 'anong mga terminal', 'anong terminal',
            'ano ang mga terminal', 'terminal sa calamba', 'inner rd terminal',
            'sm inner rd terminal', 'sm transport terminal'
        ],
        en: `In Calzada, "Suggested Terminals" helps commuters choose the best boarding terminal for destinations served by multiple hubs (such as Brgy. Real and Brgy. Halang):

• For Brgy. Real destinations:
  - SM Calamba Inner Rd Terminal (Terminal papuntang Real, Cinema side) [Recommended / Fastest]
  - Crossing Grand Terminal (North of Crossing triangle)
  - New Calamba Transport Terminal (near CMC Avenue)

• For Brgy. Halang destinations:
  - SM City Calamba Transport Terminal (Terminal papuntang Halang, East side) [Recommended]
  - Crossing Grand Terminal (North of Crossing triangle)

Key Curated Terminals in Calamba:
1. SM City Calamba Transport Terminal (East side): Terminal papuntang Halang at Los Baños (UPLB).
2. SM Calamba Inner Rd Terminal (West inner road by SM Cinema): Terminal papuntang Real (jeeps to Tagaytay and Tanauan via Real).
3. Crossing Grand Terminal: Boarding for jeeps to Real, Halang, and Sta. Rosa.
4. New Calamba Transport Terminal (near CMC): Boarding for jeeps to Real.

When using the Planner, if you are within 60 meters of any terminal, it automatically recognizes your location and starts your route there without asking.`,
        tl: `Sa Calzada, ang "Suggested Terminals" ay tumutulong sa commuter na pumili ng pinakamabilis o pinakamalapit na sakayan para sa mga rutang may iba't ibang terminal (tulad ng papuntang Brgy. Real at Brgy. Halang):

• Papuntang Brgy. Real:
  - SM Calamba Inner Rd Terminal (Terminal papuntang Real, Cinema side) [Recommended / Pinakamabilis]
  - Crossing Grand Terminal (Hilaga ng Crossing triangle)
  - New Calamba Transport Terminal (malapit sa CMC Avenue)

• Papuntang Brgy. Halang:
  - SM City Calamba Transport Terminal (Terminal papuntang Halang, East side) [Recommended]
  - Crossing Grand Terminal (Hilaga ng Crossing triangle)

Pangunahing verified terminals sa Calamba:
1. SM City Calamba Transport Terminal (East side): Terminal papuntang Halang at Los Baños (UPLB).
2. SM Calamba Inner Rd Terminal (West inner road tabi ng SM Cinema): Terminal papuntang Real (sakayan ng jeep papuntang Tagaytay at Tanauan via Real).
3. Crossing Grand Terminal: Sakayan ng jeep papuntang Real, Halang, at Sta. Rosa.
4. New Calamba Transport Terminal (malapit sa CMC): Sakayan ng jeep papuntang Real.

Sa Calzada Planner, kapag nasa loob ka ng 60 metro mula sa terminal, awtomatiko itong ituturing na simula ng iyong biyahe nang hindi na kailangang tanungin.`
    },
    {
        id: 'terminal_real',
        triggers: [
            'terminal papuntang real', 'sakayan papuntang real', 'terminal to real',
            'saan sasakay papuntang real', 'saan ang sakayan papuntang real', 'saan ang terminal papuntang real',
            'paano sumakay papuntang real', 'saan terminal papuntang real'
        ],
        en: 'The primary terminal for Brgy. Real is the SM Calamba Inner Rd Terminal (located by SM Cinema on the west inner road of SM City Calamba, jeeps to Tagaytay/Tanauan via Real). You can also board at Crossing Grand Terminal (north of Crossing triangle) or New Calamba Transport Terminal (near CMC Avenue).',
        tl: 'Ang pangunahing sakayan papuntang Brgy. Real ay ang SM Calamba Inner Rd Terminal (nasa SM Cinema side / west inner road ng SM City Calamba, sakayan ng jeep pa-Tagaytay/Tanauan via Real). Maaari ka ring sumakay sa Crossing Grand Terminal o New Calamba Transport Terminal (malapit sa CMC Avenue).'
    },
    {
        id: 'terminal_halang',
        triggers: [
            'terminal papuntang halang', 'sakayan papuntang halang', 'terminal to halang',
            'saan sasakay papuntang halang', 'saan ang sakayan papuntang halang', 'saan ang terminal papuntang halang',
            'paano sumakay papuntang halang', 'saan terminal papuntang halang'
        ],
        en: 'The primary terminal for Brgy. Halang is the SM City Calamba Transport Terminal (located on the east side of SM City Calamba, jeeps to Halang and Los Baños/UPLB). You can also board at Crossing Grand Terminal (north of Crossing triangle).',
        tl: 'Ang pangunahing sakayan papuntang Brgy. Halang ay ang SM City Calamba Transport Terminal (nasa east side ng SM City Calamba, sakayan ng jeep pa-Halang at Los Baños/UPLB). Maaari ka ring sumakay sa Crossing Grand Terminal (hilaga ng Crossing triangle).'
    }
];

// ── Known Terminals in Calamba ────────────────────────────────────────────────────────
const TERMINALS_INFO = [
    {
        name: 'Crossing Grand Terminal',
        aliases: ['crossing terminal', 'crossing grand terminal', 'grand terminal', 'crossing'],
        barangay: 'Uno',
        coords: [14.2061875, 121.1545625],
        note: 'Located on the west side of National Highway 1, north of the Crossing triangle. Boarding terminal for jeeps to Real and Halang. Jeeps from Sta. Rosa drop off passengers here.'
    },
    {
        name: 'SM City Calamba Transport Terminal',
        aliases: ['sm transport terminal', 'sm calamba transport terminal', 'sm city calamba transport terminal', 'sm calamba terminal', 'sm terminal', 'sm east terminal', 'terminal papuntang halang', 'sm terminal halang', 'sakayan papuntang halang'],
        barangay: 'Uno',
        coords: [14.202953, 121.15715],
        note: 'Located on the east side of SM City Calamba. Terminal papuntang Halang at Los Baños (UPLB).'
    },
    {
        name: 'SM Calamba Inner Rd Terminal',
        aliases: ['sm calamba inner rd terminal', 'sm inner rd terminal', 'sm calamba inner road terminal', 'sm inner road terminal', 'sm inner rd', 'sm inner road', 'calamba tagaytay terminal', 'tagaytay terminal', 'uv terminal sm', 'sm cinema terminal', 'terminal papuntang real', 'sm real terminal', 'sakayan papuntang real'],
        barangay: 'Uno',
        coords: [14.2032625, 121.1547031],
        note: 'Located along SM City Calamba inner road / bypass road by SM Cinema. Terminal papuntang Real (jeeps to Tagaytay and Tanauan via Real load here).'
    },
    {
        name: 'SM Calamba (Cinema side Drop-off)',
        aliases: ['sm cinema drop off', 'sm west side', 'sm calamba west'],
        barangay: 'Uno',
        coords: [14.203297, 121.154669],
        note: 'West side driveway of SM City Calamba by SM Cinema. Primary drop-off point for incoming jeeps from Sta. Rosa and Los Baños.'
    },
    {
        name: 'New Calamba Transport Terminal',
        aliases: ['new calamba transport terminal', 'cmc terminal', 'new calamba terminal'],
        barangay: 'Real',
        coords: [14.207417, 121.154333],
        note: 'Located near Calamba Medical Center (CMC Avenue / National Highway 1). Boarding terminal for jeeps to Real.'
    }
];

// ── Key Barangays and Points of Interest in Calamba ──────────────────────────────────
const CALAMBA_AREAS = {
    'real': { name: 'Brgy. Real, Calamba', coords: [14.201, 121.148] },
    'halang': { name: 'Brgy. Halang, Calamba', coords: [14.192, 121.166] },
    'uno': { name: 'Brgy. Uno (Poblacion / Crossing), Calamba', coords: [14.206, 121.155] },
    'lecheria': { name: 'Brgy. Lecheria, Calamba', coords: [14.198, 121.161] },
    'bucal': { name: 'Brgy. Bucal, Calamba', coords: [14.188, 121.166] },
    'parian': { name: 'Brgy. Parian, Calamba', coords: [14.215, 121.147] },
    'canlubang': { name: 'Brgy. Canlubang, Calamba', coords: [14.218, 121.105] },
    'uplb': { name: 'Los Baños (UPLB)', coords: [14.167, 121.243] },
    'los banos': { name: 'Los Baños', coords: [14.175, 121.220] },
    'sta rosa': { name: 'Sta. Rosa (Balibago)', coords: [14.298, 121.109] },
    'balibago': { name: 'Sta. Rosa (Balibago)', coords: [14.298, 121.109] },
    'tagaytay': { name: 'Tagaytay', coords: [14.115, 120.962] },
    'tanauan': { name: 'Tanauan, Batangas', coords: [14.085, 121.150] }
};

// ── Out-of-Scope Geographic Keywords ─────────────────────────────────────────────────
const OUT_OF_SCOPE_LOCATIONS = [
    'manila', 'makati', 'quezon city', 'pasay', 'taguig', 'bgc', 'bonifacio global city',
    'mandaluyong', 'pasig', 'marikina', 'paranaque', 'las pinas', 'valenzuela', 'navotas',
    'malabon', 'caloocan', 'moa', 'mall of asia', 'monumento', 'cubao', 'edsa',
    'cebu', 'davao', 'baguio', 'iloilo', 'bacolod', 'cagayan de oro', 'pampanga',
    'angeles', 'subic', 'clark', 'bataan', 'bulacan', 'cavite city', 'dasmarinas',
    'bacoor', 'imus', 'batangas city', 'lipa', 'lucena', 'naga', 'tokyo', 'japan', 'america'
];

function normalize(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectTagalog(text) {
    const t = ' ' + normalize(text) + ' ';
    const markers = [
        ' ano ', ' paano ', ' saan ', ' nasaan ', ' kailan ', ' magkano ', ' bakit ',
        ' meron ', ' may ', ' ba ', ' po ', ' ang ', ' mga ', ' ng ', ' sa ',
        ' galing ', ' mula ', ' papunta ', ' papuntang ', ' byahe ', ' biyahe ',
        ' pamasahe ', ' pasahe ', ' sakay ', ' sakayan ', ' babaan ', ' oras ',
        ' bukas ', ' libre ', ' kainan ', ' tindahan ', ' kamusta ', ' kumusta ',
        ' salamat ', ' sige ', ' ako ', ' ikaw ', ' kami ', ' dito ', ' doon '
    ];
    let score = 0;
    for (const m of markers) {
        if (t.includes(m)) score++;
    }
    return score >= 1;
}

// Check if a question is about something clearly outside Calamba or non-commuting
function checkScope(text) {
    const norm = normalize(text);

    // Check for clearly out of scope locations (unless it's Tagaytay/Tanauan terminal trips originating in Calamba)
    for (const loc of OUT_OF_SCOPE_LOCATIONS) {
        const regex = new RegExp(`\\b${loc}\\b`, 'i');
        if (regex.test(norm)) {
            // Exceptions: "Calamba to Tagaytay", "Tagaytay terminal in SM"
            if ((loc === 'tagaytay' || loc === 'tanauan') && (norm.includes('calamba') || norm.includes('sm') || norm.includes('terminal') || norm.includes('sakayan'))) {
                continue;
            }
            // If it's a local shop/restaurant inquiry (e.g. "Tokyo Grill", "Japan Surplus", "Manila Teachers")
            if (/\b(grill|restaurant|resto|ramen|cafe|coffee|store|shop|surplus|bank|hotel|bbq|bakeshop)\b/i.test(norm)) {
                continue;
            }
            return {
                outOfScope: true,
                reason: 'location',
                location: loc
            };
        }
    }

    // Check for general off-topic queries (weather, coding, math, general trivia, cooking, homework)
    const offTopicPatterns = [
        /\b(weather|panahon|ulan|bagyo|forecast)\b/i,
        /\b(python|javascript|code|programming|algorithm|sql|html|css|debug|compile)\b/i,
        /\b(who is the president|sino ang presidente|celebrity|nba|basketball champion)\b/i,
        /\b(solve|derivative|integral|square root|\d+\s*[\+\-\*\/]\s*\d+)\b/i,
        /\b(recipe|lutuin|sangkap|ingredients|how to cook|paano magluto)\b/i,
        /\b(homework|essay|assignment|tula|poem|joke|biro|kanta|song lyrics)\b/i,
        /\b(cryptocurrency|bitcoin|stocks|forex|investing|trading)\b/i
    ];
    for (const pat of offTopicPatterns) {
        if (pat.test(text)) {
            return { outOfScope: true, reason: 'off_topic' };
        }
    }

    return { outOfScope: false };
}

// Rule 4: Ambiguity Detection
function checkAmbiguity(text) {
    const t = text.trim();
    const norm = normalize(t);

    // Bare keywords like just "SM", "Letran", "CityMall", "Crossing", "Puregold"
    const bareKeywords = ['sm', 'sm calamba', 'sm city calamba', 'letran', 'citymall', 'crossing', 'puregold', 'jollibee'];
    if (bareKeywords.includes(norm)) {
        return {
            isAmbiguous: true,
            subType: 'bare_keyword',
            keyword: t
        };
    }

    // Asking for a route with only destination specified and no origin:
    // e.g. "paano pumunta sa SM Calamba?", "directions to Letran", "papunta sa CityMall"
    const destOnlyPatterns = [
        /^(?:paano\s+(?:ba\s+)?pumunta\s+(?:sa\s+)?|how\s+(?:do\s+i\s+)?get\s+to\s+|directions?\s+to\s+|papunta(?:ng)?\s+(?:sa\s+)?)(.+)$/i,
        /^(?:sakayan\s+papunta(?:ng)?\s+(?:sa\s+)?|anong\s+jeep\s+papunta(?:ng)?\s+(?:sa\s+)?)(.+)$/i
    ];

    for (const pat of destOnlyPatterns) {
        const m = t.match(pat);
        if (m) {
            const destCandidate = m[1].trim().replace(/[\?\.\!]+$/, '');
            // If the phrase DOES NOT contain an origin marker like "galing", "mula", "from"
            if (!/\b(galing|mula|from)\b/i.test(destCandidate)) {
                return {
                    isAmbiguous: true,
                    subType: 'missing_origin',
                    destination: destCandidate
                };
            }
        }
    }

    return { isAmbiguous: false };
}

// ── Match Place by Name or Slug or Aliases ───────────────────────────────────────────
function findPlaceByName(query, places) {
    if (!places || !Array.isArray(places) || places.length === 0) {
        places = defaultPlacesData;
    }
    if (!query) return null;
    const qNorm = normalize(query);
    if (!qNorm) return null;

    // Special aliases
    if (qNorm === 'sm' || qNorm === 'sm calamba' || qNorm === 'sm city') {
        const sm = places.find(p => p.name === 'SM City Calamba' || p.slug === 'sm-city-calamba');
        if (sm) return sm;
    }
    if (qNorm === 'citymall') {
        const cm = places.find(p => p.slug === 'citymall-calamba' || p.name.toLowerCase().includes('citymall'));
        if (cm) return cm;
    }
    if (qNorm.includes('letran')) {
        const let_ = places.find(p => p.name.toLowerCase().includes('letran'));
        if (let_) return let_;
    }
    if (qNorm.includes('cmc') || qNorm.includes('calamba medical center')) {
        const cmc = places.find(p => p.name.toLowerCase().includes('calamba medical center'));
        if (cmc) return cmc;
    }
    if (qNorm.includes('city hall')) {
        const ch = places.find(p => p.name.toLowerCase().includes('city hall'));
        if (ch) return ch;
    }
    if (qNorm.includes('sti')) {
        const sti = places.find(p => p.name.toLowerCase().includes('sti college'));
        if (sti) return sti;
    }

    // Exact match on name or slug
    let found = places.find(p => normalize(p.name) === qNorm || (p.slug && normalize(p.slug) === qNorm));
    if (found) return found;

    // Substring match
    found = places.find(p => normalize(p.name).includes(qNorm) || (p.slug && normalize(p.slug).includes(qNorm)));
    if (found) return found;

    // Reverse substring (if place name is inside query, e.g. "hours ng Tranquility Serviced Homes")
    found = places.find(p => qNorm.includes(normalize(p.name)));
    return found || null;
}

// ── Resolve Coordinates for Origin/Destination ────────────────────────────────────────
function resolveLocationCoords(query, places) {
    if (!query) return null;
    const qNorm = normalize(query);

    // 1. Check known terminals
    for (const term of TERMINALS_INFO) {
        for (const alias of term.aliases) {
            if (qNorm === alias || qNorm.includes(alias)) {
                return { name: term.name, coords: term.coords, barangay: term.barangay };
            }
        }
    }

    // 2. Check places
    const p = findPlaceByName(query, places);
    if (p && p.lat != null && p.lng != null) {
        return { name: p.name, coords: [p.lat, p.lng], barangay: p.barangay, place: p };
    }

    // 3. Check Calamba areas / barangays / endpoints
    for (const [key, val] of Object.entries(CALAMBA_AREAS)) {
        if (qNorm === key || qNorm.includes(key) || key.includes(qNorm)) {
            return { name: val.name, coords: val.coords, barangay: key };
        }
    }

    return null;
}

// ── Extract Origin and Destination from Route Inquiries ───────────────────────────────
function extractOriginAndDestination(text) {
    const t = text.replace(/[\?\.\!]+$/, '').trim();

    // 1. "paano pumunta sa Y galing (sa) X" / "how to get to Y from X" / "directions to Y from X"
    let m = t.match(/(?:paano\s+(?:ba\s+)?pumunta\s+(?:sa\s+)?|how\s+(?:do\s+i\s+)?get\s+to\s+|directions?\s+to\s+|papunta(?:ng)?\s+(?:sa\s+)?|byahe\s+papunta(?:ng)?\s+(?:sa\s+)?)(.+?)\s+(?:galing\s+(?:sa\s+)?|mula\s+(?:sa\s+)?|from\s+)(.+)/i);
    if (m) {
        return { dest: m[1].trim(), origin: m[2].trim() };
    }

    // 2. "galing (sa) X papunta (sa) Y" / "mula (sa) X hanggang (sa) Y" / "from X to Y"
    m = t.match(/(?:galing\s+(?:sa\s+)?|mula\s+(?:sa\s+)?|from\s+)(.+?)\s+(?:papunta(?:ng)?\s+(?:sa\s+)?|hanggang\s+(?:sa\s+)?|to\s+)(.+)/i);
    if (m) {
        return { origin: m[1].trim(), dest: m[2].trim() };
    }

    // 3. "X to Y" / "X papuntang Y" (strict: exclude interrogative and non-routing phrases)
    m = t.match(/^(.+?)\s+(?:to|papunta(?:ng)?(?:\s+sa)?)\s+(.+)$/i);
    if (m && !/\b(what|ano|sino|who|can|pwede|may|is|are|which|how|places\s+to|where\s+to|want\s+to|magkano|how\s+much|oras|hours|saan|where)\b/i.test(t)) {
        return { origin: m[1].trim(), dest: m[2].trim() };
    }

    return null;
}

// ── Match FAQs ────────────────────────────────────────────────────────────────────────
function matchFaq(text) {
    const norm = normalize(text);
    for (const faq of FAQS) {
        for (const trigger of faq.triggers) {
            const trigNorm = normalize(trigger);
            if (norm.includes(trigNorm) || trigNorm.includes(norm)) {
                return faq;
            }
        }
    }
    return null;
}

// ── Format Opening Hours nicely ───────────────────────────────────────────────────────
function formatOpeningHours(hours) {
    if (!hours) return 'Hours not listed';
    if (typeof hours === 'string') return hours;
    if (typeof hours === 'object') {
        const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
        const values = days.map(d => hours[d]).filter(Boolean);
        const allSame = values.length === 7 && values.every(v => v === values[0]);
        if (allSame) {
            return `Monday to Sunday: ${values[0]}`;
        }
        return Object.entries(hours)
            .map(([d, h]) => `${d.toUpperCase()}: ${h}`)
            .join(' | ');
    }
    return 'Hours not listed';
}

// ── Category Names in User-friendly Terms ─────────────────────────────────────────────
const CATEGORY_MAP = {
    malls: 'Malls & Shopping Centers',
    schools: 'Schools & Universities',
    terminals: 'Transport Terminals',
    eateries: 'Eateries & Restaurants',
    coffee: 'Coffee Shops & Cafes',
    banks: 'Banks & Financial Services',
    establishments: 'Shops & Services',
    government: 'Government & Landmarks',
    health: 'Hospitals, Clinics & Pharmacies',
    hotels: 'Hotels & Accommodations'
};

const CATEGORY_TRIGGERS = [
    { cat: 'coffee', terms: ['coffee', 'cafe', 'kape', 'coffee shop', 'coffee shops'] },
    { cat: 'malls', terms: ['mall', 'malls', 'shopping center', 'supermarket'] },
    { cat: 'eateries', terms: ['kainan', 'eatery', 'eateries', 'restaurant', 'restaurants', 'fast food', 'food'] },
    { cat: 'schools', terms: ['school', 'schools', 'university', 'college', 'eskwelahan', 'paaralan'] },
    { cat: 'terminals', terms: ['terminal', 'terminals', 'sakayan', 'transport terminal'] },
    { cat: 'health', terms: ['hospital', 'hospitals', 'clinic', 'clinics', 'pharmacy', 'botika', 'pagamutan', 'doktor'] },
    { cat: 'banks', terms: ['bank', 'banks', 'bangko', 'atm'] },
    { cat: 'hotels', terms: ['hotel', 'hotels', 'stay', 'stays', 'places to stay', 'place to stay', 'matutuluyan', 'motel', 'resort'] },
    { cat: 'government', terms: ['city hall', 'barangay hall', 'government', 'gobyerno', 'landmark'] },
    { cat: 'establishments', terms: ['shop', 'shops', 'services', 'tindahan', 'hardware', 'auto shop'] }
];

function detectCategoryQuery(text) {
    const norm = normalize(text);
    for (const item of CATEGORY_TRIGGERS) {
        for (const term of item.terms) {
            const regex = new RegExp(`\\b${term}\\b`, 'i');
            if (regex.test(norm)) {
                return item.cat;
            }
        }
    }
    return null;
}

function cleanUserMessage(raw) {
    const text = String(raw || '');
    const marker = text.lastIndexOf('User Message:');
    return (marker === -1 ? text : text.slice(marker + 'User Message:'.length)).trim();
}

function extractRouteFromText(raw) {
    const text = String(raw || '');
    if (!text.includes('[ROUTE INFO]')) return null;
    const originM = text.match(/Origin:\s*([^\n]+)/i);
    const destM = text.match(/Destination:\s*([^\n]+)/i);
    const etaM = text.match(/ETA:\s*([^\n]+)/i);
    const fareM = text.match(/Fare:\s*([^\n]+)/i);
    const distM = text.match(/Distance:\s*([^\n]+)/i);
    if (originM && destM) {
        return {
            origin: originM[1].trim(),
            destination: destM[1].trim(),
            eta: etaM ? etaM[1].trim() : '',
            fare: fareM ? fareM[1].trim().replace(/^₱/, '') : '',
            distance: distM ? distM[1].trim() : ''
        };
    }
    return null;
}

// ── Main Knowledge Query Function ─────────────────────────────────────────────────────
async function resolveRoutieContext({ message, route, lang, places, adminDb, history, lastTrip, sessionId }) {
    if (!places || !Array.isArray(places) || places.length === 0) {
        places = defaultPlacesData;
    }
    const rawText = cleanUserMessage(message);
    const routeData = route || extractRouteFromText(message);
    const userLang = lang === 'tl' ? 'tl' : (detectTagalog(rawText) ? 'tl' : 'en');

    // 0. Follow-up Inquiry using previous trip (Requirement 7)
    if (lastTrip) {
        const followUp = routiePlanner.handleFollowUp(rawText, lastTrip, places, userLang);
        if (followUp) {
            return {
                type: 'follow_up',
                lang: userLang,
                planResult: followUp.planResult || lastTrip,
                directReply: followUp.reply,
                instruction: followUp.reply
            };
        }
    }

    // 1. Attached Route Info from the Planner UI
    if (routeData && routeData.origin && routeData.destination) {
        return {
            type: 'planned_route_context',
            lang: userLang,
            data: {
                origin: routeData.origin,
                destination: routeData.destination,
                eta: routeData.eta,
                fare: routeData.fare,
                distance: routeData.distance
            },
            instruction: userLang === 'tl'
                ? `Sagutin ang tanong ng commuter batay sa nakaplanong biyahe: Mula ${routeData.origin} papuntang ${routeData.destination}, ETA: ${routeData.eta}, Pamasahe: ₱${routeData.fare} (tantiya base sa LTFRB fare guide), Distansya: ${routeData.distance}. Maikli at magiliw ang tono.`
                : `Answer the commuter's question based on their planned trip: From ${routeData.origin} to ${routeData.destination}, ETA: ${routeData.eta}, Fare: ₱${routeData.fare} (estimate based on LTFRB fare guide), Distance: ${routeData.distance}. Keep it short and friendly.`
        };
    }

    // 2. Calamba Scope Check (Rule 5)
    const scope = checkScope(rawText);
    if (scope.outOfScope) {
        const isTl = userLang === 'tl';
        const replyText = scope.reason === 'location'
            ? (isTl 
                ? `Paumanhin po, ang sakop lamang ni Routie at ng Calzada ay ang lungsod ng Calamba, Laguna. Hindi po sakop ang ${scope.location ? scope.location.toUpperCase() : 'ibang lugar'} o mga biyahe sa labas ng aming service area. Handa po akong tumulong para sa mga sakayan at lugar sa Calamba!`
                : `Sorry, Routie and Calzada strictly cover Calamba, Laguna only. Trips in ${scope.location ? scope.location.toUpperCase() : 'other areas'} outside our service coverage are not supported. I am glad to assist with routes and places within Calamba!`)
            : (isTl
                ? `Paumanhin po, ang sakop lamang ni Routie ay ang pag-commute, pamasahe sa jeep, at mga lugar sa Calamba, Laguna. Hindi po ako makakasagot sa mga usaping walang kinalaman sa biyahe o lokal na gabay sa Calamba.`
                : `Sorry, Routie is strictly a commuting assistant for Calamba, Laguna. I cannot assist with topics outside commuting and places in Calamba.`);

        return {
            type: 'out_of_scope',
            lang: userLang,
            data: scope,
            directReply: replyText,
            instruction: replyText
        };
    }

    // 3. Ambiguity Check (Rule 4)
    const amb = checkAmbiguity(rawText);
    if (amb.isAmbiguous) {
        const isTl = userLang === 'tl';
        let ambReply = '';
        if (amb.subType === 'bare_keyword') {
            ambReply = isTl
                ? `Nabanggit po ninyo ang "${amb.keyword}". Naghahanap po ba kayo ng sakayan/direksyon papunta rito, o kaya ay opening hours at address? Kung nais ninyong bumiyahe, saan po kayo manggagaling?`
                : `You mentioned "${amb.keyword}". Are you looking for directions to get there, opening hours, or address? If you are planning a trip, where will you be coming from?`;
        } else if (amb.subType === 'missing_origin') {
            ambReply = isTl
                ? `Nais po ninyong pumunta sa "${amb.destination}". Saan po kayo manggagaling para maibigay ko ang tamang sakayan, jeep, at pamasahe?`
                : `You want to go to "${amb.destination}". Where will you be starting from so I can give you the right boarding point and jeepney route?`;
        }

        return {
            type: 'ambiguous',
            lang: userLang,
            data: amb,
            directReply: ambReply,
            instruction: ambReply
        };
    }

    // 4. Origin & Destination Route Planning (Priority over general fare inquiries)
    const od = routiePlanner.extractOriginAndDestination(rawText) || extractOriginAndDestination(rawText);
    if (od && od.origin && od.dest) {
        const asksDiscount = /\b(student|estudyante|senior|pwd|discount|diskwento)\b/i.test(rawText);
        const planRes = routiePlanner.plan_route(od.origin, od.dest, {
            places,
            passengerType: asksDiscount ? 'discounted' : 'regular'
        });
        const formattedReply = routiePlanner.formatRouteReply(planRes, userLang);

        if (planRes.success) {
            return {
                type: 'route_plan',
                lang: userLang,
                planResult: planRes,
                directReply: formattedReply,
                instruction: formattedReply
            };
        } else if (planRes.reason === 'ambiguous') {
            return {
                type: 'ambiguous',
                lang: userLang,
                directReply: formattedReply,
                instruction: formattedReply
            };
        } else {
            return {
                type: 'route_not_found',
                lang: userLang,
                planResult: planRes,
                directReply: formattedReply,
                instruction: formattedReply
            };
        }
    }

    // 5. FAQ Match
    const faqMatch = matchFaq(rawText);
    if (faqMatch) {
        const answer = userLang === 'tl' ? faqMatch.tl : faqMatch.en;
        return {
            type: 'faq',
            lang: userLang,
            data: { faq: faqMatch, answer },
            directReply: answer,
            instruction: userLang === 'tl'
                ? `Sagutin ang tanong gamit ang opisyal na FAQ ng Calzada: "${answer}". Magiliw, maikli, at huwag mag-imbento.`
                : `Answer the question using Calzada's official FAQ: "${answer}". Keep it friendly, clear, and commuter-focused.`
        };
    }

    // 6. Fare Calculation Inquiry (General distance or minimum fare)
    const isFareQuestion = /\b(magkano|how much|pamasahe|pasahe|fare|fares|bayad|price|cost)\b/i.test(rawText);
    const distanceMatch = rawText.match(/(\d+(?:[.,]\d+)?)\s*(?:km|kms|kilometers?|kilometres?|kilometro)\b/i);
    const asksModernJeep = /\bmodern\s*(?:jeep|jeepney|dyip)\b/i.test(rawText);
    const asksStudentDiscount = /\b(student|students|estudyante|senior|pwd|discount|diskwento)\b/i.test(rawText);

    if (isFareQuestion) {
        const { data: fareData } = getFareData();
        if (asksModernJeep) {
            return {
                type: 'fare_info',
                lang: userLang,
                data: { modernMin: MODERN_JEEPNEY_MINIMUM },
                instruction: userLang === 'tl'
                    ? `Ang minimum fare sa modern jeep ay ₱${MODERN_JEEPNEY_MINIMUM}. Sabihing ito ay tantiya base sa LTFRB guidelines.`
                    : `The minimum fare for modern jeepneys is ₱${MODERN_JEEPNEY_MINIMUM}. State that this is an estimate based on LTFRB announcements.`
            };
        }

        if (distanceMatch) {
            const km = parseFloat(distanceMatch[1].replace(',', '.'));
            const counted = fareCalc ? fareCalc.countedKm(km) : Math.max(1, Math.ceil(km));
            const regFare = fareCalc ? fareCalc.fareFor(km, 'regular', fareData) : 14;
            const discFare = fareCalc ? fareCalc.fareFor(km, 'discounted', fareData) : 11.25;

            return {
                type: 'fare_info',
                lang: userLang,
                data: { km, counted, regFare, discFare },
                instruction: userLang === 'tl'
                    ? `Para sa ${km} km (binibilang bilang ${counted} km): Regular fare ay ₱${regFare.toFixed(2)}, at ang may discount (estudyante, senior, PWD) ay ₱${discFare.toFixed(2)}. Sabihing ito ay tantiya base sa LTFRB fare guide.`
                    : `For a distance of ${km} km (counted as ${counted} km): Regular fare is ₱${regFare.toFixed(2)}, and student/senior/PWD fare is ₱${discFare.toFixed(2)}. State that this is an estimate based on the LTFRB fare guide.`
            };
        }

        // General minimum fare inquiry
        const minReg = fareData.regular.baseFare;
        const minDisc = 11.25; // rounded student minimum
        return {
            type: 'fare_info',
            lang: userLang,
            data: { minReg, minDisc, baseKm: fareData.baseKm },
            instruction: userLang === 'tl'
                ? `Ang minimum fare sa tradisyunal na jeep para sa unang ${fareData.baseKm} km ay ₱${minReg.toFixed(2)} (regular) at ₱${minDisc.toFixed(2)} (estudyante, senior, PWD). Tantiya ito base sa LTFRB fare guide. Para sa mas mahabang biyahe, depende ito sa distansya.`
                : `The minimum fare for traditional jeepneys for the first ${fareData.baseKm} km is ₱${minReg.toFixed(2)} (regular) and ₱${minDisc.toFixed(2)} (student, senior, PWD). State that fares are estimates based on the LTFRB fare guide.`
        };
    }

    // 7. Specific Place Details (Hours, Address, Location, Contact)
    const matchedPlace = findPlaceByName(rawText, places);
    if (matchedPlace) {
        const hoursFormatted = formatOpeningHours(matchedPlace.opening_hours || matchedPlace.openHours);
        const address = matchedPlace.full_address || matchedPlace.address || `Brgy. ${matchedPlace.barangay || 'Calamba City'}`;
        const phone = matchedPlace.phone ? `Phone: ${matchedPlace.phone}` : '';
        const desc = matchedPlace.description || '';

        return {
            type: 'place_details',
            lang: userLang,
            data: {
                name: matchedPlace.name,
                category: CATEGORY_MAP[matchedPlace.category] || matchedPlace.category,
                barangay: matchedPlace.barangay,
                address,
                hours: hoursFormatted,
                phone,
                desc
            },
            instruction: userLang === 'tl'
                ? `Ibigay ang live na impormasyon tungkol sa ${matchedPlace.name}:\n- Kategorya: ${CATEGORY_MAP[matchedPlace.category] || matchedPlace.category}\n- Address: ${address}\n- Opening Hours: ${hoursFormatted}\n${phone ? `- Contact: ${matchedPlace.phone}\n` : ''}${desc ? `- Impormasyon: ${desc}\n` : ''}Maikli, magiliw, at commuter-friendly.`
                : `Give the live verified details for ${matchedPlace.name}:\n- Category: ${CATEGORY_MAP[matchedPlace.category] || matchedPlace.category}\n- Address: ${address}\n- Opening Hours: ${hoursFormatted}\n${phone ? `- Contact: ${matchedPlace.phone}\n` : ''}${desc ? `- Info: ${desc}\n` : ''}Keep it short, friendly, and commuter-focused.`
        };
    }

    // 8. Category / Barangay Place Search
    const cat = detectCategoryQuery(rawText);
    if (cat) {
        let matching = places.filter(p => p.category === cat);
        // Filter by barangay if mentioned
        for (const [bKey, bVal] of Object.entries(CALAMBA_AREAS)) {
            if (rawText.toLowerCase().includes(bKey)) {
                const sub = matching.filter(p => (p.barangay || '').toLowerCase().includes(bKey));
                if (sub.length > 0) matching = sub;
                break;
            }
        }

        const topMatches = matching.slice(0, 4).map(p => ({
            name: p.name,
            barangay: p.barangay,
            address: p.full_address || p.address || `Brgy. ${p.barangay}`,
            hours: formatOpeningHours(p.opening_hours || p.openHours)
        }));

        if (topMatches.length > 0) {
            return {
                type: 'category_places',
                lang: userLang,
                data: { categoryName: CATEGORY_MAP[cat] || cat, places: topMatches },
                instruction: userLang === 'tl'
                    ? `Ilista ang ilan sa mga verified na ${CATEGORY_MAP[cat] || cat} sa Calzada database:\n${topMatches.map(p => `• ${p.name} (Brgy. ${p.barangay || 'Calamba'} - ${p.hours})`).join('\n')}\nSabihin na puwede nilang bisitahin ang Places page (calzadaph.com/places) para sa kumpletong listahan.`
                    : `List some verified ${CATEGORY_MAP[cat] || cat} from Calzada's database:\n${topMatches.map(p => `• ${p.name} (Brgy. ${p.barangay || 'Calamba'} - ${p.hours})`).join('\n')}\nMention they can check the Places page (calzadaph.com/places) to explore all places.`
            };
        }
    }

    // 9. Business Updates / Posts Lookup (from Firestore)
    const isPostsQuery = /\b(post|posts|updates?|promo|promos|balita|anunsyo)\b/i.test(rawText);
    if (isPostsQuery && adminDb) {
        try {
            const postsSnap = await adminDb.collection('posts')
                .where('status', '==', 'active')
                .limit(3)
                .get();

            if (!postsSnap.empty) {
                const postsList = [];
                postsSnap.forEach(d => {
                    const data = d.data();
                    postsList.push({
                        business: data.businessName || 'Local Business',
                        caption: data.caption || ''
                    });
                });

                return {
                    type: 'business_posts',
                    lang: userLang,
                    data: { posts: postsList },
                    instruction: userLang === 'tl'
                        ? `Ibahagi ang pinakabagong update mula sa mga lokal na negosyo sa Calzada:\n${postsList.map(p => `• ${p.business}: "${p.caption}"`).join('\n')}\nMaaari nilang tingnan ang Discover feed para sa iba pang updates.`
                        : `Share recent updates from local businesses on Calzada:\n${postsList.map(p => `• ${p.business}: "${p.caption}"`).join('\n')}\nSuggest checking the Discover feed for more.`
                };
            }
        } catch (err) {
            console.error('Error fetching posts in routie-knowledge:', err.message);
        }
    }

    // 10. Greetings or Small Talk
    const isGreeting = /^(hi|hello|hey|kumusta|kamusta|good morning|good afternoon|good evening|magandang umaga|magandang hapon|magandang gabi)\b/i.test(rawText);
    if (isGreeting) {
        return {
            type: 'greeting',
            lang: userLang,
            instruction: userLang === 'tl'
                ? 'Bumati nang maikli at magiliw bilang si Routie, ang guide sa Calamba. Itanong kung saan nila gustong pumunta o ano ang nais nilang malaman tungkol sa mga lugar at pamasahe sa Calamba.'
                : 'Greet warmly in one or two short sentences as Routie, Calzada\'s commuting guide for Calamba. Ask where they would like to go or how you can help them navigate Calamba.'
        };
    }

    const isThanks = /\b(thank you|thanks|salamat|maraming salamat|ty|ok|sige|got it|ayos)\b/i.test(rawText);
    if (isThanks) {
        return {
            type: 'acknowledgement',
            lang: userLang,
            instruction: userLang === 'tl'
                ? 'Sumagot ng maikli at masiglang pasasalamat o "Walang anuman! Ingat sa biyahe!" nang isa o dalawang pangungusap lamang.'
                : 'Reply with a short, warm "You\'re welcome! Safe travels!" in just one sentence.'
        };
    }

    // 11. Fallback: Not in Data (Rule 1)
    return {
        type: 'not_in_data',
        lang: userLang,
        data: { query: rawText },
        instruction: userLang === 'tl'
            ? 'Ipaalam sa commuter na hindi mo tiyak ang sagot dahil wala pa ito sa verified data ng Calzada. Huwag mag-imbento ng lugar, ruta, presyo, o oras. Imungkahi na gamitin ang Planner sa calzadaph.com/planner o mag-email sa thecalzada@gmail.com upang maidagdag ito.'
            : 'Inform the commuter that you are not sure because this is not in Calzada\'s verified data yet. Do NOT invent places, routes, prices, or hours. Point them to the Planner (calzadaph.com/planner) or email thecalzada@gmail.com so the team can add it.'
    };
}

// ── Build Clean System Prompt for Routie ───────────────────────────────────────────────
function buildRoutieSystemPrompt(context) {
    const isTl = context.lang === 'tl';

    return `You are Routie, the friendly, helpful AI text-chat commuting assistant for Calzada (calzadaph.com), the commuting guide for Calamba, Laguna.

YOUR PERSONALITY & TONE:
- Friendly, warm, short, and clear.
- Commuter-friendly, practical, and direct. No technical jargon.
- Reply in ${isTl ? 'casual Tagalog / Taglish' : 'natural, clear English'} matching the commuter.

CORE OPERATING RULES (STRICT):
1. ANSWER ONLY FROM THE PROVIDED DATA. If something is not in the data, honestly say you're not sure and point the user to the Planner (calzadaph.com/planner) or thecalzada@gmail.com. NEVER invent routes, boarding points, prices, or operating hours.
2. FARES & TRAVEL TIMES: Fares must come only from the provided calculation. Always mention that fares are estimates based on the LTFRB fare guide.
3. OPENING HOURS & ADDRESSES: State only the live values provided in the context.
4. AMBIGUOUS QUERIES: If a user only provides a destination or keyword, ask where they are starting from and where they are going.
5. CALAMBA SCOPE ONLY: Calzada is strictly for Calamba, Laguna. Politely decline questions outside Calamba or off-topic general questions.
6. NO MARKDOWN LINKS OR URL SCHEMES: Do not write [link](url) or http:// or https://. Write plain text URLs like calzadaph.com/planner and email like thecalzada@gmail.com.

DATA & INSTRUCTION FOR THIS QUERY:
${context.instruction}

OUTPUT FORMAT:
Respond with exactly ONE valid JSON object:
{"reply": "<your friendly response in plain text>"}
Do not wrap in markdown codeblocks. Do not include any other text outside the JSON object.`;
}

module.exports = {
    resolveRoutieContext,
    buildRoutieSystemPrompt,
    checkScope,
    checkAmbiguity,
    findPlaceByName,
    resolveLocationCoords,
    extractOriginAndDestination,
    matchFaq,
    detectTagalog,
    FAQS,
    TERMINALS_INFO,
    CALAMBA_AREAS
};
