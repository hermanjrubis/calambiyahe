// Test runner for Routie AI Assistant with 25 evaluation questions.
// 20 from data (places, routes, fares, FAQs, Tagalog/English/Taglish)
// 5 not in data (admitting unknowns, scope boundaries, ambiguity)

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Groq } = require('groq-sdk');
const { getFirestore } = require('firebase-admin/firestore');

const { getPlacesData, getLiveBusinesses, mergeBusinessesIntoPlaces } = (() => {
    const fs = require('fs');
    const placesDataPath = path.resolve(__dirname, '../server/data/places.json');
    let cachedPlaces = [];
    try {
        cachedPlaces = JSON.parse(fs.readFileSync(placesDataPath, 'utf8'));
    } catch (e) {
        console.error('Error loading places.json:', e);
    }
    return {
        getPlacesData: () => cachedPlaces,
        getLiveBusinesses: async () => {
            try {
                const db = getFirestore();
                const snap = await db.collection('businesses').where('status', '==', 'approved').get();
                const list = [];
                snap.forEach(doc => {
                    const d = doc.data();
                    list.push({
                        id: 'biz_' + doc.id,
                        businessId: doc.id,
                        name: d.name || '',
                        category: d.category || '',
                        lat: d.location?.lat || d.lat || null,
                        lng: d.location?.lng || d.lng || null,
                        barangay: d.barangay || '',
                        address: d.address || '',
                        full_address: d.address || '',
                        phone: d.contactNumber || null,
                        description: d.description || '',
                        openHours: d.openHours || null
                    });
                });
                return list;
            } catch (_) {
                return [];
            }
        },
        mergeBusinessesIntoPlaces: (staticPlaces, businesses) => {
            return [...staticPlaces, ...businesses];
        }
    };
})();

// Initialize Firebase Admin if not already initialized
try {
    const { getAuth } = require('../server/auth.js');
} catch (_) {}

const { resolveRoutieContext, buildRoutieSystemPrompt } = require('../server/routie-knowledge');
const { interpretModelOutput } = require('../server/chat-reply');

const QUESTIONS = [
    // --- 20 DATA QUESTIONS ---
    { id: 1, category: 'Places - Malls & Hours (TL)', q: 'Saan banda ang SM City Calamba at anong oras ito bukas?' },
    { id: 2, category: 'Places - Coffee Shops (TL)', q: 'May mga coffee shops ba sa Calamba?' },
    { id: 3, category: 'Places - Schools (EN)', q: 'Where is Colegio de San Juan de Letran located in Calamba?' },
    { id: 4, category: 'Places - Health/Hospital (Taglish)', q: 'May hospital ba malapit sa Crossing?' },
    { id: 5, category: 'Places - Eateries (TL)', q: 'Saan may masarap na kainan or fast food sa Real, Calamba?' },
    { id: 6, category: 'Places - Banks (Taglish)', q: 'Saan may mga bangko sa Calamba?' },
    { id: 7, category: 'Places - Hotels (EN)', q: 'What hotels or places to stay are in Barangay Uno?' },
    { id: 8, category: 'Places - Opening Hours (EN)', q: 'What are the opening hours of CityMall Calamba?' },
    { id: 9, category: 'Places - Live Firestore Business (TL)', q: 'Saan matatagpuan ang Tranquility Serviced Homes?' },
    { id: 10, category: 'Routes - SM to CityMall (EN)', q: 'How do I get to CityMall from SM Calamba?' },
    { id: 11, category: 'Routes - Crossing to Real (Taglish)', q: 'Paano mag-commute papuntang Real galing Crossing Grand Terminal?' },
    { id: 12, category: 'Routes - SM to Letran (TL)', q: 'Paano pumunta sa Letran Calamba mula SM Calamba?' },
    { id: 13, category: 'Routes - Tagaytay Terminal (TL)', q: 'Saan ang sakayan papuntang Tagaytay galing SM Calamba?' },
    { id: 14, category: 'Fares - Minimum Traditional (TL)', q: 'Magkano ang minimum fare sa traditional jeep sa Calamba?' },
    { id: 15, category: 'Fares - Distance 8km (EN)', q: 'How much is the regular jeepney fare for an 8 km trip?' },
    { id: 16, category: 'Fares - Student Discount 5km (Taglish)', q: 'Magkano ang student fare kung 5 km ang biyahe?' },
    { id: 17, category: 'Fares - Modern Jeepney (TL)', q: 'Magkano ang minimum fare sa modern jeep?' },
    { id: 18, category: 'FAQs - What is Calzada (TL)', q: 'Ano ang Calzada?' },
    { id: 19, category: 'FAQs - Free to Use (EN)', q: 'Is Calzada free to use?' },
    { id: 20, category: 'FAQs - Business Registration (TL)', q: 'Paano ko maililista ang aking negosyo sa Calzada?' },

    // --- 5 NOT-IN-DATA / GUARDRAIL QUESTIONS ---
    { id: 21, category: 'Not In Data - Fictitious Place (TL)', q: 'Nasaan ang Tokyo Grill sa Calamba at ano ang menu nila?' },
    { id: 22, category: 'Not In Data - Fictitious Hotel (EN)', q: 'What are the room rates and opening hours for Grand Hyatt Calamba?' },
    { id: 23, category: 'Out of Scope - Metro Manila (TL)', q: 'Paano pumunta sa SM Mall of Asia galing Monumento?' },
    { id: 24, category: 'Out of Scope - Baguio Route (TL)', q: 'May direct jeep ba mula Calamba papuntang Baguio City?' },
    { id: 25, category: 'Ambiguous Query - Bare Keyword (Ambiguous)', q: 'SM' }
];

async function callGroqSafe(groq, messages, retries = 3) {
    const models = ['qwen/qwen3.8-27b', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];
    for (let attempt = 0; attempt < retries; attempt++) {
        for (const model of models) {
            try {
                const completion = await groq.chat.completions.create({
                    model,
                    messages,
                    temperature: 0.2,
                    max_tokens: 400,
                    response_format: { type: 'json_object' }
                });
                const first = completion.choices && completion.choices[0];
                if (first && first.message && first.message.content) {
                    return { completion, model };
                }
            } catch (err) {
                if (err.status === 429) {
                    // console.log(`[Rate limit on ${model}, trying next or sleeping...]`);
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                // Try next model
            }
        }
        await new Promise(r => setTimeout(r, 2500));
    }
    throw new Error('All models rate-limited or failed');
}

async function runTests() {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const liveBusinesses = await getLiveBusinesses();
    const activePlaces = mergeBusinessesIntoPlaces(getPlacesData(), liveBusinesses);
    let adminDb = null;
    try { adminDb = getFirestore(); } catch (_) {}

    console.log(`Starting Routie 25-Question Test Suite...`);
    console.log(`Active places: ${activePlaces.length} (including ${liveBusinesses.length} live businesses)\n`);

    const results = [];

    for (let i = 0; i < QUESTIONS.length; i++) {
        const item = QUESTIONS[i];
        const started = Date.now();
        try {
            const ctx = await resolveRoutieContext({
                message: item.q,
                lang: 'auto',
                places: activePlaces,
                adminDb
            });

            const prompt = buildRoutieSystemPrompt(ctx);

            const { completion, model } = await callGroqSafe(groq, [
                { role: 'system', content: prompt },
                { role: 'user', content: item.q }
            ]);

            const rawText = completion.choices[0].message.content;
            const parsed = interpretModelOutput(rawText, { lang: ctx.lang });
            const duration = Date.now() - started;

            results.push({
                id: item.id,
                category: item.category,
                question: item.q,
                type: ctx.type,
                lang: ctx.lang,
                modelUsed: model,
                reply: parsed.reply,
                source: parsed.source,
                durationMs: duration,
                passed: true
            });

            console.log(`[Q${item.id}/25] PASS (${duration}ms) [${model} / ${ctx.type}]: ${item.q}`);
            console.log(`Reply: ${parsed.reply}\n`);

            // Pace requests to respect rate limits
            await new Promise(r => setTimeout(r, 1500));
        } catch (err) {
            console.error(`[Q${item.id}/25] FAIL: ${item.q}`);
            console.error(`Error:`, err.message);
            results.push({
                id: item.id,
                category: item.category,
                question: item.q,
                passed: false,
                error: err.message
            });
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    const passedCount = results.filter(r => r.passed).length;
    console.log(`\n========================================`);
    console.log(`Test Run Complete: ${passedCount}/${QUESTIONS.length} Passed`);
    console.log(`========================================\n`);

    // Output JSON report for detailed evaluation
    const fs = require('fs');
    fs.writeFileSync(path.resolve(__dirname, 'routie-test-results.json'), JSON.stringify(results, null, 2));
    console.log(`Saved detailed report to scripts/routie-test-results.json`);
}

runTests().catch(console.error);
