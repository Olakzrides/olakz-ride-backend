module.exports = {
  apps: [
    {
      name: 'platform-service',
      script: './dist/server.js',
      cwd: '/home/deploy/olakz-ride-backend/services/platform-service',
      env: {
        NODE_ENV: 'production',
        PORT: '3004',
        DATABASE_URL: 'postgresql://postgres.ijlrjelstivyhttufraq:LakzRide1234%23@aws-1-eu-west-1.pooler.supabase.com:6543/postgres',
        JWT_SECRET: 'f303d2fe996095661c7e864a7d7de2a8cadeada4893dc7a4d89b47a246947e0f129ff997736314fec091256bc3b18b9f2b7eefa8e1974fce1f455a30da76804e',
        SUPABASE_URL: 'https://ijlrjelstivyhttufraq.supabase.co',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbHJqZWxzdGl2eWh0dHVmcmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2OTYyNDcsImV4cCI6MjA4MzI3MjI0N30.qmb-4FMz_Uw7Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8',
        SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqbHJqZWxzdGl2eWh0dHVmcmFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzY5NjI0NywiZXhwIjoyMDgzMjcyMjQ3fQ.xyz123',
        ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:19006,https://olakzride.duckdns.org',
        LOG_LEVEL: 'info',
        CACHE_TTL_MINUTES: '5',
        RATE_LIMIT_WINDOW_MS: '900000',
        RATE_LIMIT_MAX_REQUESTS: '100'
      },
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
      min_uptime: '10s'
    }
  ]
};