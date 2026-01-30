# Deployment Guide - Separate Ecosystem Files

This guide covers deploying the Olakz Ride Backend using separate ecosystem files for each service, which provides better security and maintainability.

## 🏗️ Architecture Overview

```
Gateway (Port 3000) → Nginx → Internet
├── Auth Service (Port 3003)
├── Core Logistics (Port 3001)
├── Platform Service (Port 3004)
└── Payment Service (Port 3002) [Future]
```

## 📁 Ecosystem File Structure

Each service now has its own ecosystem configuration:

```
├── gateway/ecosystem.config.js
├── services/auth-service/ecosystem.config.js
├── services/core-logistics/ecosystem.config.js
├── services/platform-service/ecosystem.config.js
└── services/payment-service/ecosystem.config.js [Future]
```

## 🔒 Security Benefits

1. **Isolated Configurations**: Each service has its own PM2 configuration
2. **No Centralized Secrets**: Secrets are distributed across service directories
3. **Git Safety**: All ecosystem files are in `.gitignore` to prevent secret leaks
4. **Service-Specific Settings**: Each service can have unique memory limits, restart policies, etc.

## 🚀 Deployment Process

### Step 1: Build and Deploy All Services

```bash
# Make the deployment script executable
chmod +x deploy-separate-services.sh

# Run the deployment
./deploy-separate-services.sh
```

### Step 2: Fix Core Logistics (if needed)

If core-logistics isn't running on port 3001:

```bash
# Make the fix script executable
chmod +x fix-core-logistics.sh

# Run the fix
./fix-core-logistics.sh
```

### Step 3: Verify Deployment

```bash
# Check all services are running
pm2 status

# Check ports are occupied
sudo netstat -tlnp | grep -E ":(3000|3001|3003|3004)"

# Test endpoints
curl https://olakzride.duckdns.org/api/store/channels
curl https://olakzride.duckdns.org/api/driver-registration/vehicle-types
```

## 🔧 Individual Service Management

### Deploy Single Service

```bash
# Navigate to service directory
cd services/core-logistics

# Build the service
npm run build

# Deploy using ecosystem file
pm2 start ecosystem.config.js

# Check status
pm2 status core-logistics
```

### Update Service Configuration

1. Edit the service's `ecosystem.config.js` file
2. Restart the service:

```bash
cd services/core-logistics
pm2 restart core-logistics
```

### View Service Logs

```bash
# View logs for specific service
pm2 logs core-logistics

# View logs with tail
pm2 logs core-logistics --lines 50

# View error logs only
pm2 logs core-logistics --err
```

## 🛠️ Troubleshooting

### Core Logistics Not Running on Port 3001

**Symptoms:**
- PM2 shows core-logistics as "online" but `netstat` shows no process on port 3001
- 404 errors when accessing driver-registration endpoints

**Solution:**
```bash
# Run the fix script
./fix-core-logistics.sh

# Or manually:
cd services/core-logistics
pm2 stop core-logistics
pm2 delete core-logistics
npm run build
pm2 start ecosystem.config.js
```

### Service Won't Start

**Check build output:**
```bash
cd services/[service-name]
npm run build
ls -la dist/
```

**Check ecosystem file:**
```bash
# Verify the script path exists
cat ecosystem.config.js
ls -la dist/server.js  # or dist/index.js
```

**Check logs:**
```bash
pm2 logs [service-name] --lines 20
```

### Port Conflicts

**Find process using port:**
```bash
sudo netstat -tlnp | grep :3001
sudo lsof -i :3001
```

**Kill process:**
```bash
sudo kill -9 [PID]
```

### Environment Variables Not Loading

**Check .env file exists:**
```bash
ls -la services/[service-name]/.env
```

**Verify ecosystem file references correct env file:**
```bash
cat services/[service-name]/ecosystem.config.js
```

## 📊 Service Health Checks

### Automated Health Check Script

```bash
#!/bin/bash
# health-check.sh

services=("gateway:3000" "core-logistics:3001" "auth-service:3003" "platform-service:3004")

for service in "${services[@]}"; do
    name=$(echo $service | cut -d: -f1)
    port=$(echo $service | cut -d: -f2)
    
    if curl -f http://localhost:$port/health 2>/dev/null; then
        echo "✅ $name ($port) - Healthy"
    else
        echo "❌ $name ($port) - Unhealthy"
    fi
done
```

### Manual Health Checks

```bash
# Gateway
curl http://localhost:3000/health

# Core Logistics
curl http://localhost:3001/health

# Auth Service
curl http://localhost:3003/health

# Platform Service
curl http://localhost:3004/health
```

## 🔄 Production Deployment Workflow

### 1. Development to Production

```bash
# On your local machine
git add .
git commit -m "Your changes"
git push origin main

# On production server
cd /home/deploy/olakz-ride-backend
git pull origin main
./deploy-separate-services.sh
```

### 2. Zero-Downtime Deployment

```bash
# Deploy services one by one
cd services/auth-service && pm2 reload auth-service
cd ../core-logistics && pm2 reload core-logistics
cd ../platform-service && pm2 reload platform-service
cd ../../gateway && pm2 reload gateway
```

### 3. Rollback Strategy

```bash
# If deployment fails, rollback
git checkout [previous-commit-hash]
./deploy-separate-services.sh
```

## 📈 Monitoring and Maintenance

### PM2 Monitoring

```bash
# Real-time monitoring
pm2 monit

# Process list
pm2 list

# Detailed info
pm2 show core-logistics
```

### Log Rotation

```bash
# Install PM2 log rotate
pm2 install pm2-logrotate

# Configure log rotation
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### Memory Management

```bash
# Check memory usage
pm2 list

# Restart service if memory usage is high
pm2 restart core-logistics
```

## 🔐 Security Considerations

1. **Never commit ecosystem.config.js files** - They contain secrets
2. **Use environment-specific configurations** - Different settings for dev/staging/prod
3. **Rotate secrets regularly** - Update JWT secrets, database passwords, etc.
4. **Monitor logs for security issues** - Watch for authentication failures, etc.

## 📞 Support Commands

```bash
# View all PM2 processes
pm2 status

# Restart all services
pm2 restart all

# Stop all services
pm2 stop all

# Delete all services (careful!)
pm2 delete all

# Save PM2 configuration
pm2 save

# Resurrect saved configuration
pm2 resurrect
```

## 🎯 Next Steps

1. Set up automated health checks
2. Configure log aggregation
3. Set up monitoring alerts
4. Implement automated backups
5. Configure SSL certificates renewal
6. Set up CI/CD pipeline

---

**Need Help?**
- Check service logs: `pm2 logs [service-name]`
- Run health checks: `curl http://localhost:[port]/health`
- Test endpoints: `curl https://olakzride.duckdns.org/api/[endpoint]`