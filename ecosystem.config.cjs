// ecosystem.config.cjs — pm2 process config for Cathedral bot
// Must be .cjs because nanoclaw/package.json has "type": "module"
//
// Before first run, add ANTHROPIC_API_KEY to ~/nanoclaw/.env so the
// cath_api.py subprocess can inherit it via process.env.
//
// Commands:
//   pm2 start ecosystem.config.cjs        — start
//   pm2 restart cathedral-bot             — restart
//   pm2 logs cathedral-bot                — tail logs
//   pm2 stop cathedral-bot                — stop

module.exports = {
  apps: [
    {
      name:           'cathedral-bot',
      script:         'telegram-bot.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',

      // Restart policy
      autorestart:    true,
      restart_delay:  3000,     // ms before restart attempt
      max_restarts:   10,       // give up after 10 crashes in min_uptime window
      min_uptime:     '10s',    // must stay up 10s to count as a successful start
      watch:          false,

      // Logs — reuse existing log files already in nanoclaw/
      error_file:     '/Users/basicclaw777/nanoclaw/cathedral-bot-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/cathedral-bot.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',

      // Environment — secrets loaded from .env by dotenv at runtime.
      // ANTHROPIC_API_KEY must be present in .env for cath_api.py to work.
      env: {
        NODE_ENV: 'production',
        HOME:     '/Users/basicclaw777',
        TZ:       'Asia/Hong_Kong',
      },
    },
  ],
};
