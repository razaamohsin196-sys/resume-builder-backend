#!/bin/bash

# Initial server setup script
# Run this ONCE on your Digital Ocean server after first SSH login
# Assumes Node.js and PM2 are already installed

echo "🔧 Setting up server environment..."

# Verify Node.js and PM2 are installed
echo "Checking Node.js..."
node --version || echo "⚠️  Node.js not found!"
npm --version || echo "⚠️  npm not found!"

echo "Checking PM2..."
pm2 --version || echo "⚠️  PM2 not found!"

# Create app directory
mkdir -p /var/www/resume-backend
cd /var/www/resume-backend

# Setup firewall (if not already configured)
if ! command -v ufw &> /dev/null; then
    apt-get update
    apt-get install -y ufw
fi

ufw allow 22/tcp   # SSH
ufw allow 3001/tcp # Backend port
ufw --force enable

echo "✅ Server setup complete!"
echo "📝 Next steps:"
echo "   1. Create .env file: nano /var/www/resume-backend/.env"
echo "   2. Add your API keys to .env"
echo "   3. Run setup-pm2.sh to setup PM2"
echo "   4. Deploy your code using deploy.sh from your local machine"
