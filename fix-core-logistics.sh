#!/bin/bash

# Quick fix for Core Logistics service
echo "🔧 Fixing Core Logistics Service..."

# Stop the problematic core-logistics process
echo "Stopping core-logistics..."
pm2 stop core-logistics 2>/dev/null || echo "No existing core-logistics process found"
pm2 delete core-logistics 2>/dev/null || echo "No existing core-logistics process to delete"

# Check if port 3001 is still occupied
echo "Checking port 3001..."
if netstat -tlnp | grep :3001; then
    echo "Port 3001 is still occupied. Finding and killing the process..."
    PID=$(netstat -tlnp | grep :3001 | awk '{print $7}' | cut -d'/' -f1)
    if [ ! -z "$PID" ]; then
        echo "Killing process $PID on port 3001..."
        kill -9 $PID
        sleep 2
    fi
fi

# Navigate to core-logistics directory
cd services/core-logistics

# Ensure the build exists
if [ ! -d "dist" ]; then
    echo "Building core-logistics..."
    npm run build
fi

# Check if the main file exists (prefer server.js over index.js)
SCRIPT_FILE=""
if [ -f "dist/server.js" ]; then
    SCRIPT_FILE="dist/server.js"
    echo "✅ Found dist/server.js"
elif [ -f "dist/index.js" ]; then
    SCRIPT_FILE="dist/index.js"
    echo "✅ Found dist/index.js"
else
    echo "❌ No built files found! Building again..."
    npm run build
    
    if [ -f "dist/server.js" ]; then
        SCRIPT_FILE="dist/server.js"
        echo "✅ Build successful - using server.js"
    elif [ -f "dist/index.js" ]; then
        SCRIPT_FILE="dist/index.js"
        echo "✅ Build successful - using index.js"
    else
        echo "❌ Build failed! No entry point found."
        exit 1
    fi
fi

# Start using the separate ecosystem file
echo "Starting core-logistics using separate ecosystem file..."
pm2 start ecosystem.config.js

# Wait a moment for startup
sleep 5

# Check if it's running
echo "Checking service status..."
pm2 status

# Test the port
echo "Testing port 3001..."
if netstat -tlnp | grep :3001; then
    echo "✅ Core Logistics is now running on port 3001!"
    
    # Test the health endpoint
    echo "Testing health endpoint..."
    sleep 2
    if curl -f http://localhost:3001/health 2>/dev/null; then
        echo "✅ Health check passed!"
    else
        echo "⚠️ Health check failed, but service is running"
    fi
    
    # Test the driver registration endpoint
    echo "Testing driver registration endpoint..."
    if curl -f http://localhost:3001/api/driver-registration/vehicle-types 2>/dev/null; then
        echo "✅ Driver registration endpoint working!"
    else
        echo "⚠️ Driver registration endpoint not responding"
        echo "Checking logs for errors..."
        pm2 logs core-logistics --lines 10
    fi
    
else
    echo "❌ Core Logistics is still not running on port 3001"
    echo "Checking logs..."
    pm2 logs core-logistics --lines 20
    echo ""
    echo "Checking if TypeScript compilation errors exist..."
    npm run build
fi

# Go back to root
cd ../..

echo "🎉 Fix attempt complete!"
echo "Check status with: pm2 status"
echo "Check logs with: pm2 logs core-logistics"
echo "Test endpoint: curl https://olakzride.duckdns.org/api/driver-registration/vehicle-types"