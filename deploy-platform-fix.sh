#!/bin/bash

echo "🚀 Deploying platform service fix..."

# Build the service
echo "📦 Building platform service..."
cd services/platform-service
npm run build

# Copy files to server
echo "📤 Uploading files to server..."
scp -r dist package.json package-lock.json prisma deploy@olakzride.duckdns.org:~/olakz-ride-backend/services/platform-service/

# Connect to server and restart service
echo "🔄 Restarting platform service on server..."
ssh deploy@olakzride.duckdns.org << 'EOF'
cd ~/olakz-ride-backend/services/platform-service

# Install dependencies if needed
npm install --production

# Generate Prisma client
npm run prisma:generate

# Restart the service
pm2 restart platform-service

# Check status
pm2 status platform-service

echo "✅ Platform service deployment completed!"
EOF

echo "🎉 Deployment finished!"