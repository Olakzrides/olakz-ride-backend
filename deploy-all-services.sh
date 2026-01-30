#!/bin/bash

# Olakz Ride Backend - Complete Deployment Script
# This script deploys all services using PM2 ecosystem

set -e  # Exit on any error

echo "🚀 Starting Olakz Ride Backend Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    print_error "PM2 is not installed. Installing PM2..."
    npm install -g pm2
fi

# Create logs directory
print_status "Creating logs directory..."
mkdir -p logs

# Stop existing PM2 processes
print_status "Stopping existing PM2 processes..."
pm2 stop all || true

# Pull latest changes
print_status "Pulling latest changes from Git..."
git pull origin main

# Install root dependencies
print_status "Installing root dependencies..."
npm install

# Build and install dependencies for each service
print_status "Building Gateway..."
cd gateway
npm install
npm run build
cd ..

print_status "Building Auth Service..."
cd services/auth-service
npm install
npx prisma generate
npm run build
cd ../..

print_status "Building Core Logistics Service..."
cd services/core-logistics
npm install
npx prisma generate
npm run build
cd ../..

print_status "Building Platform Service..."
cd services/platform-service
npm install
npx prisma generate
npm run build
cd ../..

# Run database migrations
print_status "Running database migrations..."

print_status "Auth Service migrations..."
cd services/auth-service
npx prisma migrate deploy
cd ../..

print_status "Core Logistics migrations..."
cd services/core-logistics
npx prisma migrate deploy
cd ../..

print_status "Platform Service migrations..."
cd services/platform-service
npx prisma migrate deploy
cd ../..

# Start services with PM2 ecosystem
print_status "Starting all services with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
print_status "Saving PM2 configuration..."
pm2 save

# Show PM2 status
print_status "PM2 Status:"
pm2 status

# Show service URLs
print_success "🎉 Deployment Complete!"
echo ""
echo "📋 Service URLs:"
echo "   Gateway:          http://localhost:3000"
echo "   Core Logistics:   http://localhost:3001"
echo "   Auth Service:     http://localhost:3002"
echo "   Platform Service: http://localhost:3003"
echo ""
echo "🔍 Health Checks:"
echo "   Gateway:          http://localhost:3000/health"
echo "   Core Logistics:   http://localhost:3001/health"
echo "   Auth Service:     http://localhost:3002/health"
echo "   Platform Service: http://localhost:3003/health"
echo ""
echo "📊 Monitoring Commands:"
echo "   pm2 status        - View all services status"
echo "   pm2 logs          - View all logs"
echo "   pm2 monit         - Real-time monitoring"
echo "   pm2 restart all   - Restart all services"
echo ""

# Test health endpoints
print_status "Testing health endpoints..."
sleep 5

# Function to test endpoint
test_endpoint() {
    local url=$1
    local service=$2
    
    if curl -f -s "$url" > /dev/null; then
        print_success "$service is healthy ✅"
    else
        print_warning "$service health check failed ⚠️"
    fi
}

test_endpoint "http://localhost:3000/health" "Gateway"
test_endpoint "http://localhost:3001/health" "Core Logistics"
test_endpoint "http://localhost:3002/health" "Auth Service"
test_endpoint "http://localhost:3003/health" "Platform Service"

print_success "🚀 All services deployed successfully!"
print_status "Check logs with: pm2 logs"