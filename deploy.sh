#!/bin/bash

# Deployment script for Digital Ocean
# Run this script on your local machine to deploy to the server

SERVER_IP="143.198.231.83"
SERVER_USER="root"
APP_DIR="/var/www/resume-backend"

echo "🚀 Starting deployment to Digital Ocean..."

# Build the project locally
echo "📦 Building the project..."
cd "$(dirname "$0")"
npm run build

# Create deployment archive
echo "📦 Creating deployment archive..."
tar -czf deploy.tar.gz dist package.json package-lock.json

# Upload to server
echo "📤 Uploading to server..."
scp deploy.tar.gz $SERVER_USER@$SERVER_IP:/tmp/

# SSH into server and deploy
echo "🔧 Deploying on server..."
ssh $SERVER_USER@$SERVER_IP << 'ENDSSH'
    # Create app directory if it doesn't exist
    mkdir -p /var/www/resume-backend
    
    # Extract files
    cd /var/www/resume-backend
    tar -xzf /tmp/deploy.tar.gz
    
    # Install/update dependencies
    npm install --production
    
    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        echo "⚠️  WARNING: .env file not found. Please create it with your API keys."
        echo "   Run: nano /var/www/resume-backend/.env"
        echo "   Add: GEMINI_API_KEY=your_key"
        echo "        OPENAI_API_KEY=your_key"
        echo "        PORT=3001"
    fi
    
    # Restart PM2 service
    pm2 restart resume-backend || pm2 start dist/server.js --name resume-backend || echo "PM2 not set up yet. Run setup-pm2.sh on server."
    
    # Cleanup
    rm /tmp/deploy.tar.gz
    
    echo "✅ Deployment complete!"
ENDSSH

# Cleanup local archive
rm deploy.tar.gz

echo "✅ Deployment finished!"
