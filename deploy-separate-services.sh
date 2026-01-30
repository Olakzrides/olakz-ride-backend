#!/bin/bash

# Deploy all services using separate ecosystem files
echo "🚀 Deploying all services with separate ecosystem configurations..."

# Function to deploy a service
deploy_service() {
    local service_name=$1
    local service_path=$2
    
    echo "📦 Deploying $service_name..."
    
    # Navigate to service directory
    cd $service_path
    
    # Build the service
    echo "Building $service_name..."
    npm run build
    
    if [ $? -ne 0 ]; then
        echo "❌ Build failed for $service_name"
        return 1
    fi
    
    # Stop existing process
    pm2 stop $service_name 2>/dev/null || echo "No existing $service_name process"
    pm2 delete $service_name 2>/dev/null || echo "No existing $service_name process to delete"
    
    # Start with ecosystem file
    echo "Starting $service_name..."
    pm2 start ecosystem.config.js
    
    if [ $? -eq 0 ]; then
        echo "✅ $service_name deployed successfully"
    else
        echo "❌ Failed to deploy $service_name"
        return 1
    fi
    
    # Go back to root
    cd - > /dev/null
}

# Create logs directory if it doesn't exist
mkdir -p logs

# Deploy services in order
echo "Starting deployment process..."

# 1. Deploy Auth Service (port 3003)
deploy_service "auth-service" "services/auth-service"
if [ $? -ne 0 ]; then
    echo "❌ Auth service deployment failed"
    exit 1
fi

# 2. Deploy Platform Service (port 3004)
deploy_service "platform-service" "services/platform-service"
if [ $? -ne 0 ]; then
    echo "❌ Platform service deployment failed"
    exit 1
fi

# 3. Deploy Core Logistics (port 3001)
deploy_service "core-logistics" "services/core-logistics"
if [ $? -ne 0 ]; then
    echo "❌ Core logistics deployment failed"
    exit 1
fi

# 4. Deploy Gateway (port 3000)
deploy_service "gateway" "gateway"
if [ $? -ne 0 ]; then
    echo "❌ Gateway deployment failed"
    exit 1
fi

# Wait for all services to start
echo "⏳ Waiting for services to start..."
sleep 10

# Check all services
echo "🔍 Checking service status..."
pm2 status

# Test ports
echo "🔍 Testing service ports..."
echo "Gateway (3000):" $(netstat -tlnp | grep :3000 | wc -l) "processes"
echo "Core Logistics (3001):" $(netstat -tlnp | grep :3001 | wc -l) "processes"
echo "Auth Service (3003):" $(netstat -tlnp | grep :3003 | wc -l) "processes"
echo "Platform Service (3004):" $(netstat -tlnp | grep :3004 | wc -l) "processes"

# Test endpoints through gateway
echo "🔍 Testing endpoints through gateway..."

# Test platform service
echo "Testing platform service..."
if curl -f http://localhost:3000/api/store/channels 2>/dev/null; then
    echo "✅ Platform service working through gateway"
else
    echo "⚠️ Platform service not responding through gateway"
fi

# Test driver registration
echo "Testing driver registration..."
if curl -f http://localhost:3000/api/driver-registration/vehicle-types 2>/dev/null; then
    echo "✅ Driver registration working through gateway"
else
    echo "⚠️ Driver registration not responding through gateway"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Service URLs:"
echo "- Gateway: http://localhost:3000 (https://olakzride.duckdns.org)"
echo "- Core Logistics: http://localhost:3001"
echo "- Auth Service: http://localhost:3003"
echo "- Platform Service: http://localhost:3004"
echo ""
echo "Test endpoints:"
echo "- Platform: https://olakzride.duckdns.org/api/store/channels"
echo "- Driver Registration: https://olakzride.duckdns.org/api/driver-registration/vehicle-types"
echo ""
echo "Commands:"
echo "- Check status: pm2 status"
echo "- View logs: pm2 logs [service-name]"
echo "- Restart service: pm2 restart [service-name]"