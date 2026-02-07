# Ready-to-Copy Ecosystem Configs

**Instructions:** Copy the content below and paste directly into your server using `nano ecosystem.config.js`

---

## 📋 Auth Service Ecosystem Config (RECOMMENDED - Uses .env)

**File:** `services/auth-service/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'auth-service',
      script: './dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend/services/auth-service',
      
      // Load environment variables from .env file (RECOMMENDED)
      env_file: './.env',
      
      // PM2 Process Management Settings
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      
      // Logging Configuration
      error_file: './logs/error.log',
      out_file: './logs/combined.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      
      // Restart Configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Auto-restart on file changes (disable in production)
      ignore_watch: ['node_modules', 'logs', 'dist'],
      
      // Environment-specific overrides (optional)
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    }
  ]
};
```

---

## 📋 Core Logistics Ecosystem Config (RECOMMENDED - Uses .env)

**File:** `services/core-logistics/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'core-logistics',
      script: './dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend/services/core-logistics',
      
      // Load environment variables from .env file (RECOMMENDED)
      env_file: './.env',
      
      // PM2 Process Management Settings
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      
      // Logging Configuration
      error_file: './logs/error.log',
      out_file: './logs/combined.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      
      // Restart Configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Auto-restart on file changes (disable in production)
      ignore_watch: ['node_modules', 'logs', 'dist'],
      
      // Environment-specific overrides (optional)
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    }
  ]
};
```

---

## 📋 Gateway Ecosystem Config (RECOMMENDED - Uses .env)

**File:** `gateway/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'gateway',
      script: './dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend/gateway',
      
      // Load environment variables from .env file (RECOMMENDED)
      env_file: './.env',
      
      // PM2 Process Management Settings
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      
      // Logging Configuration
      error_file: './logs/error.log',
      out_file: './logs/combined.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      
      // Restart Configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Auto-restart on file changes (disable in production)
      ignore_watch: ['node_modules', 'logs', 'dist'],
      
      // Environment-specific overrides (optional)
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    }
  ]
};
```

---

## 📋 Platform Service Ecosystem Config (RECOMMENDED - Uses .env)

**File:** `services/platform-service/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'platform-service',
      script: './dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend/services/platform-service',
      
      // Load environment variables from .env file (RECOMMENDED)
      env_file: './.env',
      
      // PM2 Process Management Settings
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      
      // Logging Configuration
      error_file: './logs/error.log',
      out_file: './logs/combined.log',
      log_file: './logs/combined.log',
      time: true,
      merge_logs: true,
      
      // Restart Configuration
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      
      // Auto-restart on file changes (disable in production)
      ignore_watch: ['node_modules', 'logs', 'dist'],
      
      // Environment-specific overrides (optional)
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    }
  ]
};
```

---

## 📋 All Services Combined (Single File)

**File:** `ecosystem.config.js` (root directory)

```javascript
module.exports = {
  apps: [
    // Gateway Service
    {
      name: 'gateway',
      script: './gateway/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env_file: './gateway/.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      error_file: './gateway/logs/error.log',
      out_file: './gateway/logs/combined.log',
      log_file: './gateway/logs/combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    },
    
    // Auth Service
    {
      name: 'auth-service',
      script: './services/auth-service/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env_file: './services/auth-service/.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './services/auth-service/logs/error.log',
      out_file: './services/auth-service/logs/combined.log',
      log_file: './services/auth-service/logs/combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    },
    
    // Core Logistics Service
    {
      name: 'core-logistics',
      script: './services/core-logistics/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env_file: './services/core-logistics/.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './services/core-logistics/logs/error.log',
      out_file: './services/core-logistics/logs/combined.log',
      log_file: './services/core-logistics/logs/combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    },
    
    // Platform Service
    {
      name: 'platform-service',
      script: './services/platform-service/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env_file: './services/platform-service/.env',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '512M',
      error_file: './services/platform-service/logs/error.log',
      out_file: './services/platform-service/logs/combined.log',
      log_file: './services/platform-service/logs/combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'warn'
      }
    }
  ]
};
```

---

## 🚀 Deployment Commands

### Using Individual Ecosystem Files

```bash
# Start each service separately
cd /home/deploy/olakz-ride-backend/gateway
pm2 start ecosystem.config.js

cd /home/deploy/olakz-ride-backend/services/auth-service
pm2 start ecosystem.config.js

cd /home/deploy/olakz-ride-backend/services/core-logistics
pm2 start ecosystem.config.js

cd /home/deploy/olakz-ride-backend/services/platform-service
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

### Using Combined Ecosystem File

```bash
# Start all services at once
cd /home/deploy/olakz-ride-backend
pm2 start ecosystem.config.js

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup
```

---

## 📝 Important Notes

### ✅ **What This Config Does:**

1. **Loads from .env files** - All secrets stay in .env, not in code
2. **Proper logging** - Separate error and combined logs
3. **Auto-restart** - Restarts on crashes (max 10 times)
4. **Memory limits** - Restarts if memory exceeds limit
5. **Production ready** - Optimized settings for production

### ⚠️ **Before Deploying:**

1. **Ensure .env files exist** in each service directory
2. **Check file paths** - Verify `cwd` paths match your server
3. **Create log directories** - `mkdir -p logs` in each service
4. **Build services** - Run `npm run build` in each service
5. **Test locally** - Verify services start without errors

### 🔒 **Security Checklist:**

- [ ] All .env files have correct permissions (`chmod 600 .env`)
- [ ] .env files are NOT in git (check `.gitignore`)
- [ ] Secrets are rotated for production
- [ ] Database passwords are strong
- [ ] JWT secrets are long and random
- [ ] API keys are production keys (not test keys)

---

## 🔄 PM2 Management Commands

```bash
# View all services
pm2 list

# View logs
pm2 logs
pm2 logs auth-service
pm2 logs core-logistics

# Restart services
pm2 restart all
pm2 restart auth-service

# Stop services
pm2 stop all
pm2 stop auth-service

# Delete services
pm2 delete all
pm2 delete auth-service

# Monitor services
pm2 monit

# Save current configuration
pm2 save

# Reload services (zero-downtime)
pm2 reload all
```

---

## ✅ Verification Steps

After deploying, verify everything works:

```bash
# 1. Check PM2 status
pm2 status

# 2. Check logs for errors
pm2 logs --lines 50

# 3. Test health endpoints
curl http://localhost:3000/health  # Gateway
curl http://localhost:3003/health  # Auth (internal)
curl http://localhost:3001/health  # Core Logistics (internal)

# 4. Test API through gateway
curl http://localhost:3000/api/auth/health
curl http://localhost:3000/api/variants

# 5. Check memory usage
pm2 monit
```

---

## 🆘 Troubleshooting

### Service won't start?

```bash
# Check logs
pm2 logs auth-service --lines 100

# Check if .env file exists
ls -la /home/deploy/olakz-ride-backend/services/auth-service/.env

# Check if dist folder exists
ls -la /home/deploy/olakz-ride-backend/services/auth-service/dist

# Manually test the service
cd /home/deploy/olakz-ride-backend/services/auth-service
node dist/server.js
```

### Environment variables not loading?

```bash
# Verify .env file path in ecosystem.config.js
# Ensure env_file path is relative to cwd

# Test loading .env manually
cd /home/deploy/olakz-ride-backend/services/auth-service
node -e "require('dotenv').config(); console.log(process.env.PORT)"
```

### Service keeps restarting?

```bash
# Check error logs
pm2 logs auth-service --err

# Increase min_uptime if service needs more startup time
# Increase max_restarts if needed

# Check memory usage
pm2 monit
```

---

**Ready to deploy!** 🚀

Copy the appropriate config above and paste it into your server using:
```bash
nano ecosystem.config.js
```

Then follow the deployment commands to start your services.
