const express = require('express');
const { Groq } = require('groq-sdk');
const cors = require('cors');
require('dotenv').config();

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
- When suggesting routes, use known fare rules (jeep minimum ₱13, modern jeep ₱15, etc.).

RESTRICTIONS:
- NEVER mention personal calendars, tasks, or schedules.
- If asked something unrelated to Calzada or commuting in Calamba, politely decline.`;

app.post('/api/chat', async (req, res) => {
    const { message, route } = req.body;

    // Construct the context-aware message
    let routeInfo = "[ROUTE INFO]\nNo active route searched.";
    if (route && route.origin && route.destination) {
        routeInfo = `[ROUTE INFO]
Origin: ${route.origin}
Destination: ${route.destination}
ETA: ${route.eta}
Fare: ${route.fare}
Distance: ${route.distance}`;
    }

    const fullUserMessage = `${routeInfo}\n\nUser message: ${message}`;

    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: fullUserMessage },
            ],
            model: "llama3-8b-8192",
            temperature: 0.5,
            max_tokens: 512,
        });

        const reply = chatCompletion.choices[0]?.message?.content || "Sorry, hindi ko naintindihan.";
        res.json({ reply });
    } catch (error) {
        console.error('Groq API Error:', error);
        res.status(500).json({ error: "May problema sa AI assistant. Subukan ulit mamaya." });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
