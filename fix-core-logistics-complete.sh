#!/bin/bash

# Complete fix for Core Logistics service
echo "🔧 Complete Core Logistics Service Fix..."

# Stop and clean up any existing processes
echo "1. Cleaning up existing processes..."
pm2 stop core-logistics 2>/dev/null || echo "No existing core-logistics process found"
pm2 delete core-logistics 2>/dev/null || echo "No existing core-logistics process to delete"

# Check if port 3001 is still occupied and kill if necessary
echo "2. Checking port 3001..."
if netstat -tlnp | grep :3001; then
    echo "Port 3001 is occupied. Finding and killing the process..."
    PID=$(netstat -tlnp | grep :3001 | awk '{print $7}' | cut -d'/' -f1)
    if [ ! -z "$PID" ]; then
        echo "Killing process $PID on port 3001..."
        kill -9 $PID
        sleep 2
    fi
fi

# Navigate to core-logistics directory
cd services/core-logistics

# Ensure clean build
echo "3. Building core-logistics service..."
rm -rf dist/
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Checking for TypeScript errors..."
    npm run typecheck
    exit 1
fi

# Verify the correct entry point exists
echo "4. Verifying build output..."
if [ -f "dist/index.js" ]; then
    echo "✅ Found dist/index.js (correct entry point)"
elif [ -f "dist/server.js" ]; then
    echo "⚠️ Found dist/server.js but expected dist/index.js"
    echo "This might cause issues. Check your build configuration."
else
    echo "❌ No entry point found in dist/ directory"
    ls -la dist/
    exit 1
fi

# Check ecosystem configuration
echo "5. Verifying ecosystem configuration..."
if [ -f "ecosystem.config.js" ]; then
    echo "✅ Found ecosystem.config.js"
    # Check if it references the correct script
    if grep -q "dist/index.js" ecosystem.config.js; then
        echo "✅ Ecosystem references correct entry point (dist/index.js)"
    else
        echo "⚠️ Ecosystem might reference wrong entry point"
        grep "script:" ecosystem.config.js
    fi
else
    echo "❌ ecosystem.config.js not found!"
    exit 1
fi

# Start the service using ecosystem file
echo "6. Starting core-logistics service..."
pm2 start ecosystem.config.js

if [ $? -ne 0 ]; then
    echo "❌ Failed to start service with ecosystem file"
    echo "Trying manual start..."
    pm2 start dist/index.js --name core-logistics --env production
fi

# Wait for startup
echo "7. Waiting for service to start..."
sleep 5

# Check PM2 status
echo "8. Checking PM2 status..."
pm2 status

# Check if port 3001 is now occupied
echo "9. Verifying port 3001..."
if netstat -tlnp | grep :3001; then
    echo "✅ Core Logistics is now running on port 3001!"
    
    # Test local endpoints
    echo "10. Testing local endpoints..."
    
    # Test health endpoint
    if curl -f http://localhost:3001/health 2>/dev/null; then
        echo "✅ Health endpoint working"
    else
        echo "⚠️ Health endpoint not responding"
    fi
    
    # Test driver registration endpoint
    if curl -f http://localhost:3001/api/driver-registration/vehicle-types 2>/dev/null; then
        echo "✅ Driver registration endpoint working locally"
    else
        echo "⚠️ Driver registration endpoint not responding locally"
    fi
    
    # Test through gateway
    echo "11. Testing through gateway..."
    if curl -f http://localhost:3000/api/driver-registration/vehicle-types 2>/dev/null; then
        echo "✅ Driver registration working through gateway"
    else
        echo "⚠️ Driver registration not working through gateway"
        echo "Checking gateway logs..."
        pm2 logs gateway --lines 5
    fi
    
    # Test external URL
    echo "12. Testing external URL..."
    if curl -f https://olakzride.duckdns.org/api/driver-registration/vehicle-types 2>/dev/null; then
        echo "✅ Driver registration working externally!"
    else
        echo "⚠️ Driver registration not working externally"
        echo "This might be a gateway or nginx configuration issue"
    fi
    
else
    echo "❌ Core Logistics is still not running on port 3001"
    echo "Checking logs for errors..."
    pm2 logs core-logistics --lines 20
    
    echo ""
    echo "Debugging information:"
    echo "- PM2 Status:"
    pm2 status core-logistics
    echo ""
    echo "- Process details:"
    pm2 show core-logistics
    echo ""
    echo "- Environment variables:"
    pm2 env core-logistics
fi

# Go back to root
cd ../..

echo ""
echo "🎉 Fix attempt complete!"
echo ""
echo "Summary:"
echo "- Check status: pm2 status"
echo "- View logs: pm2 logs core-logistics"
echo "- Test local: curl http://localhost:3001/api/driver-registration/vehicle-types"
echo "- Test gateway: curl http://localhost:3000/api/driver-registration/vehicle-types"
echo "- Test external: curl https://olakzride.duckdns.org/api/driver-registration/vehicle-types"
echo ""
echo "If the service is still not working, check the logs for specific error messages."