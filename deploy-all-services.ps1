# Olakz Ride Backend - Complete Deployment Script (PowerShell)
# This script deploys all services using PM2 ecosystem

Write-Host "🚀 Starting Olakz Ride Backend Deployment..." -ForegroundColor Blue

function Write-Status {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Check if PM2 is installed
try {
    pm2 --version | Out-Null
} catch {
    Write-Error "PM2 is not installed. Installing PM2..."
    npm install -g pm2
}

# Create logs directory
Write-Status "Creating logs directory..."
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs"
}

# Stop existing PM2 processes
Write-Status "Stopping existing PM2 processes..."
try {
    pm2 stop all
} catch {
    Write-Warning "No existing PM2 processes to stop"
}

# Pull latest changes
Write-Status "Pulling latest changes from Git..."
git pull origin main

# Install root dependencies
Write-Status "Installing root dependencies..."
npm install

# Build and install dependencies for each service
Write-Status "Building Gateway..."
Set-Location gateway
npm install
npm run build
Set-Location ..

Write-Status "Building Auth Service..."
Set-Location services/auth-service
npm install
npx prisma generate
npm run build
Set-Location ../..

Write-Status "Building Core Logistics Service..."
Set-Location services/core-logistics
npm install
npx prisma generate
npm run build
Set-Location ../..

Write-Status "Building Platform Service..."
Set-Location services/platform-service
npm install
npx prisma generate
npm run build
Set-Location ../..

# Run database migrations
Write-Status "Running database migrations..."

Write-Status "Auth Service migrations..."
Set-Location services/auth-service
npx prisma migrate deploy
Set-Location ../..

Write-Status "Core Logistics migrations..."
Set-Location services/core-logistics
npx prisma migrate deploy
Set-Location ../..

Write-Status "Platform Service migrations..."
Set-Location services/platform-service
npx prisma migrate deploy
Set-Location ../..

# Start services with PM2 ecosystem
Write-Status "Starting all services with PM2..."
pm2 start ecosystem.config.js

# Save PM2 configuration
Write-Status "Saving PM2 configuration..."
pm2 save

# Show PM2 status
Write-Status "PM2 Status:"
pm2 status

# Show service URLs
Write-Success "🎉 Deployment Complete!"
Write-Host ""
Write-Host "📋 Service URLs:" -ForegroundColor White
Write-Host "   Gateway:          http://localhost:3000" -ForegroundColor White
Write-Host "   Core Logistics:   http://localhost:3001" -ForegroundColor White
Write-Host "   Auth Service:     http://localhost:3002" -ForegroundColor White
Write-Host "   Platform Service: http://localhost:3003" -ForegroundColor White
Write-Host ""
Write-Host "🔍 Health Checks:" -ForegroundColor White
Write-Host "   Gateway:          http://localhost:3000/health" -ForegroundColor White
Write-Host "   Core Logistics:   http://localhost:3001/health" -ForegroundColor White
Write-Host "   Auth Service:     http://localhost:3002/health" -ForegroundColor White
Write-Host "   Platform Service: http://localhost:3003/health" -ForegroundColor White
Write-Host ""
Write-Host "📊 Monitoring Commands:" -ForegroundColor White
Write-Host "   pm2 status        - View all services status" -ForegroundColor White
Write-Host "   pm2 logs          - View all logs" -ForegroundColor White
Write-Host "   pm2 monit         - Real-time monitoring" -ForegroundColor White
Write-Host "   pm2 restart all   - Restart all services" -ForegroundColor White
Write-Host ""

# Test health endpoints
Write-Status "Testing health endpoints..."
Start-Sleep -Seconds 5

function Test-Endpoint {
    param($Url, $ServiceName)
    
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
        if ($response.StatusCode -eq 200) {
            Write-Success "$ServiceName is healthy ✅"
        } else {
            Write-Warning "$ServiceName health check failed ⚠️"
        }
    } catch {
        Write-Warning "$ServiceName health check failed ⚠️"
    }
}

Test-Endpoint "http://localhost:3000/health" "Gateway"
Test-Endpoint "http://localhost:3001/health" "Core Logistics"
Test-Endpoint "http://localhost:3002/health" "Auth Service"
Test-Endpoint "http://localhost:3003/health" "Platform Service"

Write-Success "🚀 All services deployed successfully!"
Write-Status "Check logs with: pm2 logs"