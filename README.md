# Calambiyahe (Calzada)

Commuting guide and AI assistant for Calamba City.

## Setup & Running Instructions

### 1. Install Dependencies
`ash
npm install
`

### 2. Environment Configuration
Copy .env.example to create your local .env file:
`ash
cp .env.example .env
`
Open .env and fill in your actual credentials:
- PORT=5000
- DATABASE_URL=postgresql://user:password@localhost:5432/calambiyahe
- GROQ_API_KEY=your_actual_groq_api_key
- NODE_ENV=development

> [!WARNING]
> Do NOT commit your real .env file to version control. It is automatically ignored in .gitignore.

### 3. Start Local Server
`ash
npm start
`
This starts the Express server on http://localhost:5000.

### 4. Open in Browser
Open your browser and navigate to:
`
http://localhost:5000/
`

> [!CAUTION]
> **DO NOT** double-click or open HTML files directly via ile:/// protocol (e.g. ile:///C:/.../public/pages/index.html).
> Modern browsers block ile:// API requests due to CORS security policies, which will prevent the Routie chatbot from connecting to the server.
