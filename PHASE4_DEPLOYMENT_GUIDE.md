# Phase 4: Production Deployment Guide 🚀

## Overview
This guide covers deploying the Phase 4 production-ready driver registration system to your server.

## Pre-Deployment Checklist ✅

### 1. Local Testing Complete
- [ ] All services running locally without errors
- [ ] Phase 4 Postman collection tests passing
- [ ] Database migrations applied successfully
- [ ] Rate limiting working correctly
- [ ] Error handling tested

### 2. Environment Configuration
- [ ] Production environment variables configured
- [ ] Database connection strings updated
- [ ] JWT secrets generated for production
- [ ] API keys and external service credentials set

### 3. Security Review
- [ ] No sensitive data in code
- [ ] Environment files not committed to git
- [ ] Rate limiting configured appropriately
- [ ] CORS settings configured for production domains

## Deployment Steps

### Step 1: Commit and Push Changes 📤

```bash
# 1. Check git status
git status

# 2. Add all Phase 4 changes
git add .

# 3. Commit with descriptive message
git commit -m "feat: Phase 4 - Production-ready driver registration system

- Add comprehensive validation system
- Implement standardized error handling with 30+ error codes
- Add rate limiting middleware for security
- Create production-ready response utilities
- Add complete test collection
- Enhance documentation

Features:
- Cross-step validation
- Business rule enforcement
- Document validation
- Rate limiting (10 req/15min, 3 init/hour, 20 uploads/10min)
- Standardized error responses
- Request tracking and logging"

# 4. Push to GitHub
git push origin main
```

### Step 2: Server Deployment 🖥️

```bash
# 1. SSH into your server
ssh your-username@your-server-ip

# 2. Navigate to your project directory
cd /path/to/your/olakz-ride-backend

# 3. Pull latest changes
git pull origin main

# 4. Install/update dependencies
npm install

# 5. Install dependencies for all services
cd services/auth-service && npm install && cd ../..
cd services/core-logistics && npm install && cd ../..
cd services/platform-service && npm install && cd ../..
cd gateway && npm install && cd ..
```

### Step 3: Environment Configuration 🔧

```bash
# 1. Update production environment files
# Copy from templates and configure for production

# Core Logistics Service
cp services/core-logistics/.env.template services/core-logistics/.env.production
nano services/core-logistics/.env.production

# Auth Service  
cp services/auth-service/.env.template services/auth-service/.env.production
nano services/auth-service/.env.production

# Platform Service
cp services/platform-service/.env.template services/platform-service/.env.production
nano services/platform-service/.env.production

# Gateway
cp gateway/.env.template gateway/.env.production
nano gateway/.env.production
```

### Step 4: Database Migrations 🗄️

```bash
# 1. Run migrations for each service

# Auth Service
cd services/auth-service
npx prisma migrate deploy
npx prisma generate
cd ../..

# Core Logistics Service  
cd services/core-logistics
npx prisma migrate deploy
npx prisma generate
cd ../..

# Platform Service
cd services/platform-service
npx prisma migrate deploy
npx prisma generate
cd ../..
```

### Step 5: Build Services 🔨

```bash
# 1. Build TypeScript for production
cd services/auth-service && npm run build && cd ../..
cd services/core-logistics && npm run build && cd ../..
cd services/platform-service && npm run build && cd ../..
cd gateway && npm run build && cd ..
```

### Step 6: Process Management 🔄

```bash
# Option A: Using PM2 (Recommended)

# 1. Install PM2 globally if not installed
npm install -g pm2

# 2. Create PM2 ecosystem file
nano ecosystem.config.js
```

Create `ecosystem.config.js`:
```javascript
module.exports = {
  apps: [
    {
      name: 'auth-service',
      script: 'services/auth-service/dist/server.js',
      cwd: '/path/to/your/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3002
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/auth-service-error.log',
      out_file: './logs/auth-service-out.log',
      log_file: './logs/auth-service-combined.log'
    },
    {
      name: 'core-logistics',
      script: 'services/core-logistics/dist/index.js',
      cwd: '/path/to/your/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/core-logistics-error.log',
      out_file: './logs/core-logistics-out.log',
      log_file: './logs/core-logistics-combined.log'
    },
    {
      name: 'platform-service',
      script: 'services/platform-service/dist/server.js',
      cwd: '/path/to/your/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3003
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/platform-service-error.log',
      out_file: './logs/platform-service-out.log',
      log_file: './logs/platform-service-combined.log'
    },
    {
      name: 'gateway',
      script: 'gateway/dist/server.js',
      cwd: '/path/to/your/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/gateway-error.log',
      out_file: './logs/gateway-out.log',
      log_file: './logs/gateway-combined.log'
    }
  ]
};
```

```bash
# 3. Start services with PM2
pm2 start ecosystem.config.js

# 4. Save PM2 configuration
pm2 save

# 5. Setup PM2 startup script
pm2 startup
# Follow the instructions provided by PM2
```

### Step 7: Nginx Configuration 🌐

```bash
# 1. Create Nginx configuration
sudo nano /etc/nginx/sites-available/olakz-api
```

Create Nginx config:
```nginx
server {
    listen 80;
    server_name your-domain.com api.your-domain.com;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=registration:10m rate=1r/s;

    # Gateway (Main API)
    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # Driver Registration (Extra rate limiting)
    location /api/driver-registration/ {
        limit_req zone=registration burst=5 nodelay;
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Health checks
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

```bash
# 2. Enable the site
sudo ln -s /etc/nginx/sites-available/olakz-api /etc/nginx/sites-enabled/

# 3. Test Nginx configuration
sudo nginx -t

# 4. Reload Nginx
sudo systemctl reload nginx
```

### Step 8: SSL Certificate (Optional but Recommended) 🔒

```bash
# Using Certbot for Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d api.your-domain.com
```

### Step 9: Monitoring Setup 📊

```bash
# 1. Create log directories
mkdir -p logs

# 2. Setup log rotation
sudo nano /etc/logrotate.d/olakz-api
```

Create log rotation config:
```
/path/to/your/olakz-ride-backend/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Post-Deployment Verification ✅

### 1. Service Health Checks
```bash
# Check PM2 status
pm2 status

# Check service logs
pm2 logs

# Test health endpoints
curl http://localhost:3000/health
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

### 2. API Testing
```bash
# Test vehicle types endpoint (public)
curl http://your-domain.com/api/driver-registration/vehicle-types

# Test rate limiting
for i in {1..15}; do curl -w "%{http_code}\n" -o /dev/null -s http://your-domain.com/api/driver-registration/vehicle-types; done
```

### 3. Database Verification
```bash
# Check database connections
cd services/auth-service && npx prisma db pull && cd ../..
cd services/core-logistics && npx prisma db pull && cd ../..
cd services/platform-service && npx prisma db pull && cd ../..
```

## Monitoring Commands 📈

```bash
# PM2 monitoring
pm2 monit

# View logs
pm2 logs --lines 100

# Restart specific service
pm2 restart auth-service

# Restart all services
pm2 restart all

# View service metrics
pm2 show auth-service
```

## Rollback Plan 🔄

If issues occur:

```bash
# 1. Stop services
pm2 stop all

# 2. Rollback to previous commit
git log --oneline -10  # Find previous commit
git checkout <previous-commit-hash>

# 3. Rebuild and restart
npm run build:all
pm2 restart all
```

## Environment Variables Checklist 📋

### Core Logistics Service (.env.production)
```env
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:password@localhost:5432/olakz_logistics
JWT_SECRET=your-super-secure-jwt-secret
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-supabase-anon-key
GOOGLE_MAPS_API_KEY=your-google-maps-key
```

### Auth Service (.env.production)
```env
NODE_ENV=production
PORT=3002
DATABASE_URL=postgresql://user:password@localhost:5432/olakz_auth
JWT_SECRET=your-super-secure-jwt-secret
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key
```

### Platform Service (.env.production)
```env
NODE_ENV=production
PORT=3003
DATABASE_URL=postgresql://user:password@localhost:5432/olakz_platform
JWT_SECRET=your-super-secure-jwt-secret
```

### Gateway (.env.production)
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=your-super-secure-jwt-secret
AUTH_SERVICE_URL=http://localhost:3002
CORE_LOGISTICS_SERVICE_URL=http://localhost:3001
PLATFORM_SERVICE_URL=http://localhost:3003
CORS_ORIGIN=https://your-frontend-domain.com
```

## Success Indicators 🎯

✅ All PM2 processes running  
✅ Health endpoints responding  
✅ Database connections active  
✅ Rate limiting working  
✅ Error responses standardized  
✅ Logs being generated  
✅ Nginx proxying correctly  
✅ SSL certificate active (if configured)  

## Support Commands 🛠️

```bash
# View system resources
htop
df -h
free -h

# Check port usage
netstat -tulpn | grep :3000
netstat -tulpn | grep :3001
netstat -tulpn | grep :3002
netstat -tulpn | grep :3003

# Check Nginx status
sudo systemctl status nginx

# Check database connections
sudo -u postgres psql -c "\l"
```

Your Phase 4 production-ready driver registration system is now deployed! 🚀

## Next Steps
1. Monitor logs for the first 24 hours
2. Set up automated backups
3. Configure monitoring alerts
4. Update DNS records if needed
5. Test with Postman collection from production URL