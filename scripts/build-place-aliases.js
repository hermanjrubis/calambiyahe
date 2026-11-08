// scripts/build-place-aliases.js — builds server/data/place-aliases.json from server/data/places.json plus the
// curated lists below. Run after places.json changes:  node scripts/build-place-aliases.js
// (optional arguments: <places.json> <out.json>). Then run node scripts/test-routie.mjs.
const fs = require('fs');
const path = require('path');
const places = JSON.parse(fs.readFileSync(process.argv[2] || path.join(__dirname, '../server/data/places.json'), 'utf8'));
const OUT = process.argv[3] || path.join(__dirname, '../server/data/place-aliases.json');

const norm = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Words that must never be an alias on their own (barangays, area names, common words)
const RESERVED = new Set([
    'real', 'halang', 'uno', 'lecheria', 'bucal', 'parian', 'canlubang', 'calamba', 'calamba city', 'crossing',
    'calamba crossing', 'bayan', 'poblacion', 'uplb', 'los banos', 'sta rosa', 'balibago', 'tagaytay', 'tanauan',
    'sm', 'terminal', 'school', 'bank', 'cafe', 'coffee', 'hotel', 'clinic', 'pharmacy', 'grocery', 'canteen',
    'kitchen', 'restaurant', 'building', 'parking', 'center', 'centre', 'hall', 'market', 'palengke', 'mall',
    'dulo', 'tara', 'kape', 'south', 'star', 'smiles', 'mercury', 'pamana', 'but first', 'go', 'ok', 'news',
    'meat', 'agape', 'kupi', 'dear', 'why', 'macks', 'bigstop', 'pitcrew', 'aroma', 'army', 'navy',
    'medical center', 'executive center', 'executives', 'gateway', 'multi purpose building', 'store', 'depot', 'kia'
]);

// Curated aliases. common = widely used / official short forms. confirm = local nicknames Drei should confirm
// before they are used (they are stored but not loaded until moved to common).
const CURATED = {
    'sm-city-calamba': { common: ['sm', 'sm calamba', 'sm city', 'sm mall', 'sm kalamba', 'sm city calamba'], confirm: ['esem'] },
    'citymall-calamba': { common: ['citymall', 'city mall', 'city mall calamba'], confirm: ['citymall lecheria'] },
    'puregold-halang': { common: ['puregold halang'], confirm: [] },
    'sti-calamba': { common: ['sti', 'sti calamba', 'sti college', 'sti college calamba'], confirm: [] },
    'letran-calamba': { common: ['letran', 'letran calamba', 'san juan de letran', 'colegio de san juan de letran'], confirm: ['csjl'] },
    'saint-benilde': { common: ['saint benilde real', 'st benilde real'], confirm: ['sbis', 'sbis real'] },
    'saint-benilde-crossing': { common: ['saint benilde crossing', 'st benilde crossing', 'benilde crossing campus', 'saint benilde crossing campus'], confirm: ['sbis crossing'] },
    'jollibee-real': { common: ['jollibee real', 'jabee real'], confirm: [] },
    'jollibee-calamba-crossing': { common: ['jollibee crossing', 'jabee crossing', 'jollibee calamba crossing'], confirm: [] },
    'mang-inasal-halang': { common: ['mang inasal halang'], confirm: [] },
    'mang-inasal-calamba-crossing': { common: ['mang inasal crossing', 'mang inasal calamba crossing'], confirm: [] },
    'mcdonalds': { common: ['mcdo', 'mcdonalds', 'mc donalds', 'mcdo halang', 'mcdonalds halang'], confirm: [] },
    'kfc-halang': { common: ['kfc', 'kfc halang'], confirm: [] },
    'shakeys': { common: ['shakeys', 'shakeys halang'], confirm: [] },
    'yellow-cab-pizza-co': { common: ['yellow cab', 'yellow cab pizza'], confirm: [] },
    'angels-pizza': { common: ['angels pizza'], confirm: [] },
    'burger-king': { common: ['burger king', 'burger king halang'], confirm: ['bk'] },
    'calamba-medical-center': { common: ['cmc', 'calamba medical', 'calamba medical center', 'cmc hospital'], confirm: [] },
    'seattles-best-coffee-cmc': { common: ['seattles best', 'seattles best coffee', 'seattles best cmc'], confirm: ['sbc cmc'] },
    'calamba-city-hall': { common: ['city hall', 'calamba city hall', 'city hall ng calamba'], confirm: ['munisipyo'] },
    'rizal-monument': { common: ['rizal monument', 'rizal statue', 'monumento ni rizal'], confirm: ['bantayog ni rizal'] },
    'jose-rizal-coliseum': { common: ['rizal coliseum', 'jose rizal coliseum', 'coliseum'], confirm: [] },
    'laguna-provincial-capitol': { common: ['capitol', 'kapitolyo', 'laguna capitol', 'provincial capitol'], confirm: [] },
    'philhealth-lhio-calamba': { common: ['philhealth', 'philhealth calamba', 'philhealth office'], confirm: [] },
    'meralco-calamba': { common: ['meralco', 'meralco calamba', 'meralco office'], confirm: [] },
    'mercury-drug-crossing': { common: ['mercury drug', 'mercury drug crossing'], confirm: [] },
    'andoks-crossing': { common: ['andoks', 'andoks crossing'], confirm: [] },
    '7-eleven': { common: ['7 eleven', 'seven eleven', '711'], confirm: [] },
    'lbc': { common: ['lbc', 'lbc express'], confirm: [] },
    '2go': { common: ['2go'], confirm: [] },
    'landbank': { common: ['landbank', 'land bank'], confirm: ['lbp'] },
    'aub': { common: ['aub', 'asia united bank'], confirm: [] },
    'rcbc': { common: ['rcbc'], confirm: [] },
    'chinabank': { common: ['chinabank crossing'], confirm: [] },
    'china-bank-savings': { common: ['china bank savings', 'chinabank savings'], confirm: ['cbs halang'] },
    'eastwest-bank-crossing': { common: ['eastwest', 'eastwest bank', 'east west bank'], confirm: [] },
    'card-sme-bank': { common: ['card sme bank', 'card sme'], confirm: [] },
    'planbank-calamba': { common: ['planbank'], confirm: [] },
    'rural-bank-of-bay-inc': { common: ['rural bank of bay', 'rural bank'], confirm: [] },
    'western-union-crossing': { common: ['western union'], confirm: [] },
    'jrs-express-crossing': { common: ['jrs', 'jrs express'], confirm: [] },
    'everfirst-crossing': { common: ['everfirst'], confirm: [] },
    'philippine-womens-university-calamba': { common: ['pwu', 'pwu calamba', 'philippine womens university', 'philippine womens'], confirm: [] },
    'saint-john-paul-colleges': { common: ['saint john and paul', 'st john and paul', 'saint john and paul colleges', 'st john paul colleges'], confirm: ['sjpc'] },
    'halang-elementary': { common: ['halang elementary', 'halang elem', 'halang es'], confirm: [] },
    'crossing-elementary-school': { common: ['crossing elementary', 'crossing elem', 'crossing es'], confirm: [] },
    'new-calamba-transport-terminal': { common: ['new calamba transport terminal', 'new calamba terminal', 'cmc terminal'], confirm: ['nct'] },
    'sm-calamba-inner-rd-terminal': { common: ['sm inner rd terminal', 'inner rd terminal', 'inner road terminal', 'sm inner road terminal', 'tagaytay terminal'], confirm: [] },
    'sm-transport-term': { common: ['sm transport terminal', 'sm terminal', 'sm calamba transport terminal'], confirm: [] },
    'lli-bus-terminal': { common: ['lli', 'lli bus', 'lli terminal', 'lli bus terminal'], confirm: [] },
    'hm-transport-inc': { common: ['hm transport', 'hm bus'], confirm: [] },
    'saint-rose-transit': { common: ['saint rose transit', 'st rose transit'], confirm: [] },
    'mb-parking': { common: ['mb parking', 'morales bercasio parking'], confirm: [] },
    'wilcon-depot': { common: ['wilcon', 'wilcon depot'], confirm: [] },
    'mr-diy': { common: ['mr diy', 'mister diy'], confirm: [] },
    'btc-samgyup-wings': { common: ['btc samgyup', 'btc'], confirm: [] },
    'dulo-kitchen-grill': { common: ['dulo kitchen', 'dulo kitchen and grill'], confirm: [] },
    'ton-tons-sisig': { common: ['ton tons', 'tonton sisig', 'ton tons sisig'], confirm: [] },
    'teng-tengs': { common: ['teng tengs'], confirm: [] },
    'ramen-grill-station': { common: ['ramen and grill station', 'ramen grill station', 'ramen and grill'], confirm: [] },
    'chicken-joo-halang': { common: ['chicken joo'], confirm: [] },
    'lola-nenas': { common: ['lola nenas'], confirm: [] },
    'tudings-original-porkchop-haus': { common: ['tudings', 'tudings porkchop'], confirm: [] },
    'hotel-marciano': { common: ['marciano', 'hotel marciano'], confirm: [] },
    'smiles-hotel': { common: ['smiles hotel'], confirm: [] },
    'green-glass-hotel': { common: ['green glass', 'green glass hotel'], confirm: [] },
    'astrotel-calamba': { common: ['astrotel'], confirm: [] },
    'amsi-doctors-medical-center': { common: ['amsi', 'amsi hospital', 'amsi doctors'], confirm: [] },
    'pamana-medical-center': { common: ['pamana medical', 'pamana hospital', 'pamana medical center'], confirm: [] },
    'laguna-diagnostic-center-multi-specialty-clinic': { common: ['laguna diagnostic', 'laguna diagnostic center'], confirm: ['ldc'] },
    'coca-cola-europacific-aboitiz-calamba-distribution-center': { common: ['coca cola calamba', 'coca cola distribution center'], confirm: ['coke plant'] },
    'kia-calamba-gateway': { common: ['kia calamba', 'kia gateway'], confirm: [] },
    'jetour-calamba': { common: ['jetour'], confirm: [] },
    'but-first-coffee': { common: ['but first coffee'], confirm: [] },
    'tara-kape': { common: ['tara kape'], confirm: [] },
    'barangay-uno-hall': { common: ['barangay uno hall', 'brgy uno hall', 'uno barangay hall'], confirm: [] },
    'barangay-real-hall': { common: ['barangay real hall', 'brgy real hall', 'real barangay hall'], confirm: [] },
    'barangay-halang-hall': { common: ['barangay halang hall', 'brgy halang hall', 'halang barangay hall', 'halang multi purpose building'], confirm: [] },
    'calamba-executive-center': { common: ['calamba executive center', 'calamba executive'], confirm: [] },
    'walters-bakery': { common: ['walters bakery', 'walters'], confirm: [] },
    'shop-a-lot-crossing': { common: ['shop a lot', 'shopalot'], confirm: [] },
    'why-chicken-crossing': { common: ['why chicken'], confirm: [] },
    'dear-hotpot': { common: ['dear hotpot'], confirm: [] },
    'meat-here': { common: ['meat here', 'meat here korean bbq'], confirm: [] },
    'krav-cafe': { common: ['krav', 'krav cafe'], confirm: [] },
    'kupi': { common: ['kupi cafe', 'kupi coffee'], confirm: [] },
    'lambac-coffee-roastery': { common: ['lambac', 'lambac coffee'], confirm: [] },
    'south-supermarket': { common: ['south supermarket'], confirm: [] }
};

// Ambiguous short names: the planner should ask which one (like AMBIGUOUS_TARGETS).
const AMBIGUOUS = {
    'jollibee': ['jollibee-real', 'jollibee-calamba-crossing'],
    'jabee': ['jollibee-real', 'jollibee-calamba-crossing'],
    'mang inasal': ['mang-inasal-halang', 'mang-inasal-calamba-crossing'],
    'saint benilde': ['saint-benilde', 'saint-benilde-crossing'],
    'st benilde': ['saint-benilde', 'saint-benilde-crossing'],
    'benilde': ['saint-benilde', 'saint-benilde-crossing'],
    'dali': ['dali-everyday-grocery', 'dali-everyday-grocery-halang'],
    'dali grocery': ['dali-everyday-grocery', 'dali-everyday-grocery-halang'],
    'dali everyday grocery': ['dali-everyday-grocery', 'dali-everyday-grocery-halang'],
    'china bank': ['chinabank', 'china-bank-savings'],
    'tita chus': ['tita-chus-lutong-bahay', 'tita-chus-events-place']
};

// Auto aliases from the official name: drop a " – branch" suffix, "Calamba", "Inc.", "Co.", "Corp."
function autoAliases(p) {
    const out = new Set();
    const name = p.name;
    out.add(norm(name));
    const base = name.split(/\s+[–-]\s+/)[0];               // "Puregold – Halang, Calamba" -> "Puregold"
    out.add(norm(base));
    const noParen = name.replace(/\s*\([^)]*\)\s*/g, ' ');   // "Calamba Medical Center (CMC)" -> "Calamba Medical Center"
    out.add(norm(noParen));
    const paren = (name.match(/\(([^)]+)\)/) || [])[1];      // "(CMC)" -> "cmc", "(Dunlop Tires)"
    if (paren && paren.split(/\s+/).length <= 2) out.add(norm(paren));
    for (let pass = 0; pass < 3; pass++) {
        for (const s of [...out]) {
            out.add(s.replace(/\b(calamba city|calamba)\b/g, '').replace(/\s+/g, ' ').trim());
            out.add(s.replace(/\s(inc|co|corp|corporation)$/, '').trim());
            out.add(s.replace(/\bsaint\b/g, 'st'));
        }
    }
    return [...out].filter(Boolean);
}

const bySlug = new Map(places.map((p) => [p.slug, p]));
for (const slug of Object.keys(CURATED)) if (!bySlug.has(slug)) throw new Error('Unknown slug in CURATED: ' + slug);
for (const [a, slugs] of Object.entries(AMBIGUOUS)) for (const s of slugs) if (!bySlug.has(s)) throw new Error(`Unknown slug in AMBIGUOUS ${a}: ${s}`);

const owner = new Map(); // alias -> Set(slug)
const add = (alias, slug) => { if (!owner.has(alias)) owner.set(alias, new Set()); owner.get(alias).add(slug); };
for (const p of places) {
    for (const a of autoAliases(p)) add(a, p.slug);
    for (const a of (CURATED[p.slug] || {}).common || []) add(norm(a), p.slug);
}

const result = {};
const ambiguous = { ...AMBIGUOUS };
const collisions = [];
for (const p of places) result[p.slug] = { name: p.name, barangay: p.barangay, aliases: [], confirm: [] };
for (const [alias, slugs] of owner) {
    if (alias.length < 2) continue;
    if (RESERVED.has(alias) && !(CURATED[[...slugs][0]] || {}).common?.map(norm).includes(alias)) continue;
    if (ambiguous[alias]) continue;
    if (slugs.size > 1) { ambiguous[alias] = [...slugs]; collisions.push(alias); continue; }
    const slug = [...slugs][0];
    result[slug].aliases.push(alias);
}
for (const [slug, c] of Object.entries(CURATED)) result[slug].confirm = (c.confirm || []).map(norm);
for (const r of Object.values(result)) r.aliases.sort((a, b) => b.length - a.length || a.localeCompare(b));

const doc = {
    about: 'Other names for the places in server/data/places.json, keyed by slug, used by Routie to find a place in a message. ' +
        'All text is normalized (lowercase, no accents, "&" -> "and", apostrophes removed, other punctuation -> space). ' +
        '"aliases" are safe to use: the official name, the name without its branch or "Calamba", well-known short forms. ' +
        '"confirm" are local nicknames Drei has not confirmed yet: they are NOT loaded until moved into "aliases". ' +
        '"ambiguous" maps a short name to every place it could mean: Routie asks which one. ' +
        'Rebuild after places.json changes and re-run scripts/test-routie.mjs (it checks every slug exists and no alias is listed twice).',
    generated: new Date().toISOString().slice(0, 10),
    places: result,
    ambiguous
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1) + '\n');
const total = Object.values(result).reduce((n, r) => n + r.aliases.length, 0);
const conf = Object.values(result).reduce((n, r) => n + r.confirm.length, 0);
console.log(`places ${places.length}, aliases ${total}, confirm ${conf}, ambiguous ${Object.keys(ambiguous).length}`);
console.log('auto collisions moved to ambiguous:', collisions.join(' | '));
