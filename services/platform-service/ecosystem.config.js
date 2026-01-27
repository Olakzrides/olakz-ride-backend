module.exports = {
  apps: [{
    name: 'platform-service',
    script: './dist/server.js',
    cwd: '/home/deploy/olakz-ride-backend/services/platform-service',
    env: {
      NODE_ENV: 'production',
      PORT: 3004
    },
    env_file: '.env',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    error_file: './logs/error.log',
    out_file: './logs/combined.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true
  }]
};