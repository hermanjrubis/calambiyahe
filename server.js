const express = require('express');
const { Groq } = require('groq-sdk');
const cors = require('cors');
const https = require('https');
const { Pool } = require('pg');
require('dotenv').config();

// Database Pool Setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 4, // Limit connection pool size for serverless environments to prevent db connection limits
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

const app = express();
app.use(cors());
app.use(express.json());

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

const SYSTEM_PROMPT = `You are "DyipTok Assistant", a commuting AI for Calzada – a web-based GIS-integrated multimodal transit navigation and fare information system designed specifically for commuters in Calamba City.

ABOUT CALZADA:
- The name "Calzada" (Spanish for road/street) symbolizes a modern digital road that connects people and places.
- It addresses fragmented transit info by providing a centralized platform for route details, fare estimates, and travel time predictions.
- It consolidates info for tricycles, jeepneys, buses, modern jeepneys, and van/UV Express.

KEY FEATURES:
- Mapped route visualization (inter-city and intra-city).
- Fare computation based on official structures.
- Travel time estimation using traffic and historical data.
- All services are free.

YOUR SCOPE & PERSONA:
- Answer questions about Calzada, its history, features, and transit info in Calamba.
- Be friendly, use Taglish, and keep answers **very short (1-2 sentences)** to improve speed.
- **Avoid repeating greetings** like "Kumusta" or "Hello" in every reply. Direct at agad na sagutin ang tanong.
- When suggesting routes, use known fare rules (jeep minimum ₱14, modern jeep ₱17, etc.).

RESTRICTIONS:
- NEVER mention that "there is no active route" or "wala pang pinaplanong ruta" unless the user explicitly asks for navigation, directions, or routing help. Act naturally.
- NEVER mention personal calendars, tasks, or schedules.
- If asked something unrelated to Calzada or commuting in Calamba, politely decline.`;

// === HELPER: RETRY LOGIC ===
const callGroqWithRetry = async (messages, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
        try {
            // Groq API call with timeout protection
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Groq Timeout')), 45000)
            );

            const completionPromise = groq.chat.completions.create({
                messages,
                model: "llama-3.1-8b-instant",
                temperature: 0.5,
                max_tokens: 256,
            });

            return await Promise.race([completionPromise, timeoutPromise]);
        } catch (error) {
            if (i === retries) throw error;
            console.log(`Retrying Groq call... (${i + 1}/${retries})`);
            await new Promise(res => setTimeout(res, 1000)); // wait 1s before retry
        }
    }
};

app.get('/api/ping', (req, res) => res.json({ status: 'ok' }));

app.post('/api/chat', async (req, res) => {
    const { message, route } = req.body;

    let routeInfo = "";
    if (route && route.origin && route.destination) {
        routeInfo = `[ROUTE INFO]\nOrigin: ${route.origin}\nDestination: ${route.destination}\nETA: ${route.eta}\nFare: ${route.fare}\nDistance: ${route.distance}\n\n`;
    }

    const fullUserMessage = `${routeInfo}${message}`;

    try {
        const chatCompletion = await callGroqWithRetry([
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: fullUserMessage },
        ]);

        const reply = chatCompletion.choices[0]?.message?.content || "Sorry, hindi ko naintindihan.";
        res.json({ choices: [{ message: { content: reply } }] });
    } catch (error) {
        console.error('Final Error Handler:', error.message);
        
        if (error.message === 'Groq Timeout') {
            return res.status(504).json({ error: "Masyadong matagal ang response mula sa AI. Maaring cold start ito o busy ang server. Pakisubukan ulit." });
        }
        
        res.status(500).json({ error: "May problema sa AI assistant. Subukan ulit mamaya." });
    }
});

// =============================================
// TRANSIT DATABASE ENDPOINTS (PostGIS)
// =============================================

// 1. Get all terminals with extended info
app.get('/api/terminals', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id, p.name, p.barangay, p.municipality,
                   ST_AsGeoJSON(p.location) as geojson,
                   t.terminal_code, t.operator, t.transport_types,
                   t.operating_hours, t.coverage_radius_m,
                   t.has_waiting_area, t.has_comfort_room
            FROM places p
            JOIN terminals t ON t.place_id = p.id
            WHERE p.is_active = true
            ORDER BY p.municipality, p.name
        `);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching terminals:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 2. Get all stops dependent on a terminal
app.get('/api/terminals/:id/stops', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.name, p.category, p.barangay, p.municipality,
                   ST_AsGeoJSON(p.location) as geojson,
                   ts.avg_travel_time_mins, ts.avg_fare, ts.frequency_mins
            FROM terminal_stops ts
            JOIN places p ON p.id = ts.stop_id
            WHERE ts.terminal_id = $1
            ORDER BY ts.avg_travel_time_mins ASC
        `, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching terminal stops:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 3. Get all routes served by a terminal
app.get('/api/terminals/:id/routes', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.id, r.name, r.highway_ref, r.transport_type, r.base_fare,
                   tr.is_origin, tr.is_terminal_end,
                   ST_AsGeoJSON(r.path) as geojson
            FROM terminal_routes tr
            JOIN routes r ON r.id = tr.route_id
            WHERE tr.terminal_id = $1
        `, [req.params.id]);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching terminal routes:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 4. Given a stop ID, return its parent terminal and travel info
app.get('/api/stops/:id/terminal', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.name AS terminal_name,
                   p.barangay, p.municipality,
                   ST_AsGeoJSON(p.location) as geojson,
                   t.terminal_code, t.operating_hours,
                   ts.avg_travel_time_mins, ts.avg_fare, ts.frequency_mins
            FROM terminal_stops ts
            JOIN terminals t ON t.id = ts.terminal_id
            JOIN places p ON p.id = t.place_id
            WHERE ts.stop_id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'No parent terminal found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching parent terminal:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 5. Find the nearest terminal to a coordinate (Destination-aware)
app.get('/api/terminals/nearest', async (req, res) => {
    const { lat, lng, destLat, destLng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: 'Missing lat or lng' });
    
    try {
        let query, params;
        if (destLat && destLng) {
            // Destination-aware sorting: minimize (dist to terminal + dist from terminal to destination)
            // This favors terminals that are "on the way" to the destination
            query = `
                SELECT p.name, p.municipality,
                       t.terminal_code, t.transport_types, t.operating_hours,
                       ST_Distance(p.location, ST_GeogFromText('POINT(' || $2 || ' ' || $1 || ')')) AS dist_meters,
                       ST_AsGeoJSON(p.location) as geojson
                FROM places p
                JOIN terminals t ON t.place_id = p.id
                WHERE p.is_active = true
                ORDER BY (
                    ST_Distance(p.location, ST_GeogFromText('POINT(' || $2 || ' ' || $1 || ')')) +
                    ST_Distance(p.location, ST_GeogFromText('POINT(' || $4 || ' ' || $3 || ')'))
                ) ASC
                LIMIT 3
            `;
            params = [lat, lng, destLat, destLng];
        } else {
            // Standard nearest sorting
            query = `
                SELECT p.name, p.municipality,
                       t.terminal_code, t.transport_types, t.operating_hours,
                       ST_Distance(p.location, ST_GeogFromText('POINT(' || $2 || ' ' || $1 || ')')) AS dist_meters,
                       ST_AsGeoJSON(p.location) as geojson
                FROM places p
                JOIN terminals t ON t.place_id = p.id
                WHERE p.is_active = true
                ORDER BY p.location <-> ST_GeogFromText('POINT(' || $2 || ' ' || $1 || ')')
                LIMIT 3
            `;
            params = [lat, lng];
        }

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching nearest terminal:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 6. Get the terminal's coverage polygon as GeoJSON
app.get('/api/terminals/:id/coverage', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.name, t.terminal_code, t.coverage_radius_m,
                   ST_AsGeoJSON(t.coverage_area) as coverage_geojson,
                   ST_AsGeoJSON(
                       ST_Buffer(p.location::geometry, t.coverage_radius_m / 111320.0)
                   ) as computed_circle
            FROM terminals t
            JOIN places p ON p.id = t.place_id
            WHERE t.id = $1
        `, [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Terminal not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error fetching terminal coverage:', err);
        res.status(500).json({ error: 'Database error' });
    }
});

const PORT = process.env.PORT || 5000;

// Only listen when NOT deployed on Vercel Serverless
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// Export the app for Vercel Serverless
module.exports = app;
