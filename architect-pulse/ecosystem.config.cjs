module.exports = {
  apps: [{
    name: 'architect-pulse',
    script: './pulse-engine.js',
    cwd: __dirname,
    cron_restart: '0 7 * * *',  // Daily at 07:00 HKT
    autorestart: false,
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
