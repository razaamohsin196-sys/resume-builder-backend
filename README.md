# Resume Builder Backend Service

A Node.js backend service for generating professional resumes using AI.

## Features

- **AI-Powered Generation**: Uses Gemini or OpenAI to generate complete HTML/CSS resumes from scratch
- **No Hardcoded Templates**: LLM generates responsive, well-formatted HTML/CSS based on data
- **Caching**: 5-minute cache to reduce API calls and improve performance
- **Multiple Template Styles**: Support for various resume styles (modern, classic, minimalist, etc.)

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and add your API keys:
```bash
cp .env.example .env
```

3. Add your API keys:
```
GEMINI_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
PORT=3001
```

## Running

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## API Endpoints

### POST /api/generate-resume

Generate a resume HTML from profile data.

**Request Body:**
```json
{
  "profile": {
    "personal": { "name": "John Doe", "location": "New York" },
    "contact": { "email": "john@example.com" },
    "summary": "Experienced developer...",
    "items": [...]
  },
  "intent": {
    "targetRole": "Senior Developer",
    "targetLocation": "San Francisco"
  },
  "templateStyle": "modern professional",
  "options": {
    "fitToOnePage": false,
    "hasPhoto": false
  }
}
```

**Response:**
```json
{
  "html": "<!DOCTYPE html>...",
  "metadata": {
    "generatedAt": "2024-01-01T00:00:00.000Z",
    "templateStyle": "modern professional",
    "generationTimeMs": 2500
  }
}
```

### GET /api/template-styles

Get available template styles.

### GET /health

Health check endpoint.
