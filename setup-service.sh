#!/bin/bash

# Setup script to run ON THE SERVER
# This sets up PM2 to keep the backend running

APP_DIR="/var/www/resume-backend"

echo "🔧 Setting up PM2 service..."

cd $APP_DIR

# Start the app with PM2
pm2 start dist/server.js --name resume-backend

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup

echo "✅ PM2 service setup complete!"
echo "📝 Useful commands:"
echo "   pm2 status                    # Check status"
echo "   pm2 restart resume-backend    # Restart service"
echo "   pm2 stop resume-backend       # Stop service"
echo "   pm2 logs resume-backend       # View logs"
echo "   pm2 monit                     # Monitor resources"
