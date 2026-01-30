#!/bin/bash

# Diagnostic script for Core Logistics service
echo "🔍 Core Logistics Service Diagnostics"
echo "======================================"

echo ""
echo "1. PM2 Process Status:"
pm2 status core-logistics

echo ""
echo "2. Port 3001 Status:"
if netstat -tlnp | grep :3001; then
    echo "✅ Port 3001 is occupied"
    netstat -tlnp | grep :3001
else
    echo "❌ Port 3001 is NOT occupied"
fi

echo ""
echo "3. All Node.js processes on ports:"
netstat -tlnp | grep node

echo ""
echo "4. Core Logistics Build Status:"
cd services/core-logistics
if [ -d "dist" ]; then
    echo "✅ dist/ directory exists"
    echo "Contents:"
    ls -la dist/
    
    if [ -f "dist/index.js" ]; then
        echo "✅ dist/index.js exists (correct entry point)"
    else
        echo "❌ dist/index.js missing"
    fi
    
    if [ -f "dist/server.js" ]; then
        echo "⚠️ dist/server.js exists (might be wrong entry point)"
    fi
else
    echo "❌ dist/ directory missing - service not built"
fi

echo ""
echo "5. Ecosystem Configuration:"
if [ -f "ecosystem.config.js" ]; then
    echo "✅ ecosystem.config.js exists"
    echo "Script path configured as:"
    grep "script:" ecosystem.config.js
    echo "Port configured as:"
    grep "PORT:" ecosystem.config.js
else
    echo "❌ ecosystem.config.js missing"
fi

echo ""
echo "6. Environment File:"
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    echo "PORT setting:"
    grep "PORT=" .env
    echo "NODE_ENV setting:"
    grep "NODE_ENV=" .env
else
    echo "❌ .env file missing"
fi

echo ""
echo "7. Package.json Scripts:"
if [ -f "package.json" ]; then
    echo "✅ package.json exists"
    echo "Main entry point:"
    grep '"main":' package.json
    echo "Start script:"
    grep '"start":' package.json
    echo "Build script:"
    grep '"build":' package.json
else
    echo "❌ package.json missing"
fi

echo ""
echo "8. Recent PM2 Logs (last 10 lines):"
pm2 logs core-logistics --lines 10

echo ""
echo "9. Process Details:"
pm2 show core-logistics

echo ""
echo "10. Environment Variables in PM2:"
pm2 env core-logistics

echo ""
echo "11. TypeScript Compilation Check:"
npm run typecheck

echo ""
echo "12. Gateway Configuration:"
cd ../../gateway
if [ -f "src/config/index.ts" ]; then
    echo "✅ Gateway config exists"
    echo "Logistics service URL:"
    grep -A 5 "logistics:" src/config/index.ts
else
    echo "❌ Gateway config missing"
fi

echo ""
echo "13. Gateway Status:"
pm2 status gateway

echo ""
echo "14. Test Direct Connection to Core Logistics:"
if curl -f http://localhost:3001/health 2>/dev/null; then
    echo "✅ Direct connection to core-logistics works"
else
    echo "❌ Direct connection to core-logistics fails"
fi

echo ""
echo "15. Test Connection Through Gateway:"
if curl -f http://localhost:3000/api/driver-registration/vehicle-types 2>/dev/null; then
    echo "✅ Connection through gateway works"
else
    echo "❌ Connection through gateway fails"
fi

echo ""
echo "======================================"
echo "🎯 Diagnostic Summary:"
echo "======================================"

# Summary logic
if netstat -tlnp | grep :3001 > /dev/null; then
    echo "✅ Service is binding to port 3001"
else
    echo "❌ Service is NOT binding to port 3001"
    echo "   This is the main issue!"
fi

if pm2 status core-logistics | grep "online" > /dev/null; then
    echo "✅ PM2 shows service as online"
else
    echo "❌ PM2 shows service as offline/stopped"
fi

if [ -f "services/core-logistics/dist/index.js" ]; then
    echo "✅ Build output exists"
else
    echo "❌ Build output missing"
fi

echo ""
echo "Next steps:"
echo "1. If service is not binding to port 3001, check the logs for startup errors"
echo "2. If build output is missing, run 'npm run build' in services/core-logistics"
echo "3. If PM2 shows offline, there might be a startup error in the code"
echo "4. Check the ecosystem.config.js script path matches the actual build output"