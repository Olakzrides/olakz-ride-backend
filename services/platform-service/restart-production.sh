#!/bin/bash

# Platform Service Production Restart Script
echo "🔄 Restarting Platform Service with Environment Variables..."

# Stop the current service
echo "⏹️  Stopping platform-service..."
pm2 stop platform-service

# Delete the process (to ensure clean restart)
echo "🗑️  Deleting old process..."
pm2 delete platform-service

# Start with explicit environment file
echo "🚀 Starting platform-service with .env file..."
cd /home/deploy/olakz-ride-backend/services/platform-service

# Start PM2 with explicit environment
pm2 start dist/server.js --name platform-service --env-file .env

# Show status
echo "📊 Service Status:"
pm2 show platform-service

echo "✅ Platform Service restarted!"
echo "🔍 Check logs with: pm2 logs platform-service"
echo "🧪 Test endpoint: curl https://olakzride.duckdns.org/api/store/init"