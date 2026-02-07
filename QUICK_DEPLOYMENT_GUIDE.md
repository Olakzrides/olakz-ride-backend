# Quick Deployment Guide - Copy & Paste Ready

**Last Updated:** February 6, 2026

---

## 🚀 Deploy in 5 Minutes

### Step 1: Update Ecosystem Configs (2 minutes)

**Auth Service:**
```bash
cd /home/deploy/olakz-ride-backend/services/auth-service
nano ecosystem.config.js
```

**Paste this:**
```javascript
module.exports = {
  apps: [{
    name: 'auth-service',
    script: './dist/server.js',
    cwd: '/home/deploy/olakz-ride-backend/services/auth-service',
    env_file: './.env',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/combined.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    ignore_watch: ['node_modules', 'logs', 'dist'],
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    }
  }]
};
```

**Core Logistics:**
```bash
cd /home/deploy/olakz-ride-backend/services/core-logistics
nano ecosystem.config.js
```

**Paste this:**
```javascript
module.exports = {
  apps: [{
    name: 'core-logistics',
    script: './dist/index.js',
    cwd: '/home/deploy/olakz-ride-backend/services/core-logistics',
    env_file: './.env',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/combined.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    ignore_watch: ['node_modules', 'logs', 'dist'],
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: 'warn'
    }
  }]
};
```

### Step 2: Restart Services (1 minute)

```bash
# Stop all services
pm2 stop all

# Start with new configs
cd /home/deploy/olakz-ride-backend/services/auth-service
pm2 start ecosystem.config.js

cd /home/deploy/olakz-ride-backend/services/core-logistics
pm2 start ecosystem.config.js

# Save configuration
pm2 save
```

### Step 3: Verify (2 minutes)

```bash
# Check status
pm2 status

# Check logs (should show no errors)
pm2 logs --lines 20

# Test endpoints
curl http://localhost:3003/health
curl http://localhost:3001/health
curl http://localhost:3000/health
```

---

## ✅ Success Indicators

You should see:
- ✅ All services showing "online" in `pm2 status`
- ✅ No errors in `pm2 logs`
- ✅ Health endpoints returning 200 OK
- ✅ "Environment variables loaded" in logs

---

## 🆘 If Something Goes Wrong

```bash
# View detailed logs
pm2 logs auth-service --lines 100

# Check if .env exists
ls -la /home/deploy/olakz-ride-backend/services/auth-service/.env

# Test .env loading
cd /home/deploy/olakz-ride-backend/services/auth-service
node -e "require('dotenv').config(); console.log('Loaded:', !!process.env.PORT)"

# Restart a specific service
pm2 restart auth-service
```

---

## 📞 Quick Commands

```bash
# View all services
pm2 list

# View logs
pm2 logs

# Restart all
pm2 restart all

# Stop all
pm2 stop all

# Monitor
pm2 monit
```

---

**That's it!** Your services are now using .env files and are production-ready! 🎉
