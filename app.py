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
SYSTEM_PROMPT = """You are "DyipTok Assistant", a specialized commuting and route-planning AI for Calamba City.
Your goal is to help users find the best public transport routes (jeepney, bus, P2P, etc.) and explain fares or ETAs.

=== YOUR SCOPE ===
- Only answer questions about public transport, routes, fares, and directions in the Calamba area.
- You have access to [ROUTE INFO] if the user has searched for a route. Use this data to answer specific questions about their current trip.
- If no [ROUTE INFO] is provided, ask the user where they want to go.

=== BEHAVIOR RULES ===
- Be friendly, concise, and conversational.
- Use a mix of English and Tagalog (Taglish).
- NEVER pretend to know the user's personal schedule, tasks, or calendar.
- If asked about something non-transport related, politely say you are only here to help with their biyahe."""

@app.route('/api/chat', methods=['POST'])
def chat():
    if not os.environ.get("GROQ_API_KEY"):
        return jsonify({"error": "API Key not configured"}), 500
    
    data = request.json
    user_message_with_context = data.get("message", "")

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message_with_context}
            ],
            temperature=0.7,
            max_tokens=1024
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
