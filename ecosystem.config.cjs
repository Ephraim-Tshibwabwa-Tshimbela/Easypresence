module.exports = {
  apps: [
    {
      name: 'easypresence',
      script: 'src/server/index.js',
      instances: 1, // Single instance required for SQLite WAL integrity
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/err.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      min_uptime: '5s',
      max_restarts: 10,
      restart_delay: 2000
    }
  ]
};
