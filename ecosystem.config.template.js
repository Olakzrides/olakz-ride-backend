// PM2 Ecosystem Configuration Template
// Copy this to ecosystem.config.js and fill in your values
// DO NOT commit ecosystem.config.js to Git - add it to .gitignore

module.exports = {
  apps: [
    {
      name: 'gateway',
      script: './gateway/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        AUTH_SERVICE_URL: 'http://localhost:3003',
        LOGISTICS_SERVICE_URL: 'http://localhost:3001',
        PAYMENT_SERVICE_URL: 'http://localhost:3002',
        PLATFORM_SERVICE_URL: 'http://localhost:3004',
        ALLOWED_ORIGINS: 'https://olakzride.duckdns.org,http://localhost:3000',
        LOG_LEVEL: 'info'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/gateway-error.log',
      out_file: './logs/gateway-out.log',
      log_file: './logs/gateway-combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'core-logistics',
      script: './services/core-logistics/dist/index.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        // Add your environment variables here - DO NOT commit with real values
        DATABASE_URL: 'your-database-url-here',
        JWT_SECRET: 'your-jwt-secret-here',
        SUPABASE_URL: 'your-supabase-url-here',
        SUPABASE_ANON_KEY: 'your-supabase-anon-key-here',
        SUPABASE_SERVICE_ROLE_KEY: 'your-service-role-key-here',
        AUTH_SERVICE_URL: 'http://localhost:3003',
        ALLOWED_ORIGINS: 'https://olakzride.duckdns.org,http://localhost:3000',
        LOG_LEVEL: 'info'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/core-logistics-error.log',
      out_file: './logs/core-logistics-out.log',
      log_file: './logs/core-logistics-combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'auth-service',
      script: './services/auth-service/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
        // Add your auth service environment variables here
        DATABASE_URL: 'your-database-url-here',
        JWT_SECRET: 'your-jwt-secret-here'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/auth-service-error.log',
      out_file: './logs/auth-service-out.log',
      log_file: './logs/auth-service-combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'platform-service',
      script: './services/platform-service/dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend',
      env: {
        NODE_ENV: 'production',
        PORT: 3004,
        // Add your platform service environment variables here
        DATABASE_URL: 'your-database-url-here',
        JWT_SECRET: 'your-jwt-secret-here'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: './logs/platform-service-error.log',
      out_file: './logs/platform-service-out.log',
      log_file: './logs/platform-service-combined.log',
      time: true,
      merge_logs: true,
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};