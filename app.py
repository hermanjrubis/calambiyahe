import os
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq

# 1. Load the environment variables from .env
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# 2. Initialize Groq Client
client = Groq(api_key=os.environ.get("GROQ_API_KEY"))

# 3. System Prompt for "DyipTok Assistant"
SYSTEM_PROMPT = """You are "DyipTok Assistant", a commuting AI for Calzada – a web-based GIS-integrated multimodal transit navigation and fare information system designed specifically for commuters in Calamba City.

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
- If asked something unrelated to Calzada or commuting in Calamba, politely decline."""

@app.route('/api/chat', methods=['POST'])
def chat():
    if not os.environ.get("GROQ_API_KEY"):
        return jsonify({"error": "API Key not configured"}), 500
    
    data = request.json
    user_message_with_context = data.get("message", "")

    try:
        completion = client.chat.completions.create(
            model="llama3-8b-8192",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message_with_context}
            ],
            temperature=0.5,
            max_tokens=512
        )
        
        reply = completion.choices[0].message.content
        return jsonify({"choices": [{"message": {"content": reply}}]})
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    # Get port from environment variable for deployment, default to 5000 for local dev
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)
