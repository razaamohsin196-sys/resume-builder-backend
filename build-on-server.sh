#!/bin/bash

# Script to build and setup on server
# Upload this file and the source code to the server, then run it

APP_DIR="/var/www/resume-backend"

echo "🔧 Building on server..."

cd $APP_DIR

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the project
echo "🔨 Building TypeScript..."
npm run build

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  WARNING: .env file not found!"
    echo "   Create it with: nano /var/www/resume-backend/.env"
    echo "   Add: GEMINI_API_KEY=your_key"
    echo "        OPENAI_API_KEY=your_key"
    echo "        PORT=3001"
fi

# Start with PM2
echo "🚀 Starting with PM2..."
pm2 start dist/server.js --name resume-backend
pm2 save

echo "✅ Build and setup complete!"
echo "📝 Check status: pm2 status"
echo "📝 View logs: pm2 logs resume-backend"
