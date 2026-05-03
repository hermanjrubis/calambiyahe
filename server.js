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

const SYSTEM_PROMPT = `You are "DyipTok Assistant", a specialized commuting and route-planning AI for Calamba City.
Your goal is to help users find the best public transport routes (jeepney, bus, P2P, etc.) and explain fares or ETAs.

=== YOUR SCOPE ===
- Only answer questions about public transport, routes, fares, and directions in the Calamba area.
- You have access to [ROUTE INFO] if the user has searched for a route. Use this data to answer specific questions about their current trip.
- If no [ROUTE INFO] is provided, politely ask the user for their origin and destination.

=== BEHAVIOR RULES ===
- Be friendly, concise, and conversational.
- Use a mix of English and Tagalog (Taglish).
- NEVER mention calendars, tasks, meetings, or personal schedules.
- If asked about something non-transport related, politely say you are only here to help with their biyahe.`;

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
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            max_tokens: 1024,
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
