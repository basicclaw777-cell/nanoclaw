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
      name:           'long-term-portfolio',
      script:         'trader/long-term-orchestrator.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',

      // Cron: every Monday at 08:00 HKT (00:00 UTC Monday)
      cron_restart:   '0 0 * * 1',
      autorestart:    false,

      error_file:     '/Users/basicclaw777/nanoclaw/trader/logs/long-term-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/trader/logs/long-term.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',

      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
    {
      name:           'trader',
      script:         'trader/trading-orchestrator.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',

      // Cron: every 4 hours (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
      cron_restart:   '0 */4 * * *',
      autorestart:    false,          // cron job, not persistent

      error_file:     '/Users/basicclaw777/nanoclaw/trader/logs/trader-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/trader/logs/trader.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',

      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
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
    // ── Dashboard Refresh ──────────────────────────────────────────────────
    {
      name:           'dashboard-refresh',
      script:         'command-centre/refresh-dashboard.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: every 6 hours
      cron_restart:   '0 */6 * * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/command-centre/refresh-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/command-centre/refresh.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV: 'production',
        HOME:     '/Users/basicclaw777',
        TZ:       'Asia/Hong_Kong',
      },
    },
    // ── Operations Agent Crons ──────────────────────────────────────────────
    {
      name:           'ops-finance',
      script:         'ops-agent/run-finance.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: 1st of every month at 07:00 HKT (23:00 UTC previous day)
      cron_restart:   '0 23 28-31 * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/ops-agent/logs/finance-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/ops-agent/logs/finance.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV: 'production',
        HOME:     '/Users/basicclaw777',
        TZ:       'Asia/Hong_Kong',
      },
    },
    {
      name:           'ops-hr',
      script:         'ops-agent/run-hr.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: every Monday at 06:00 HKT (22:00 UTC Sunday)
      cron_restart:   '0 22 * * 0',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/ops-agent/logs/hr-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/ops-agent/logs/hr.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV: 'production',
        HOME:     '/Users/basicclaw777',
        TZ:       'Asia/Hong_Kong',
      },
    },
    {
      name:           'ops-mpf',
      script:         'ops-agent/run-hr.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: 1st of every month at 07:00 HKT
      cron_restart:   '0 23 28-31 * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/ops-agent/logs/mpf-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/ops-agent/logs/mpf.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV: 'production',
        HOME:     '/Users/basicclaw777',
        TZ:       'Asia/Hong_Kong',
      },
    },
    // ── Comms Engine Crons ──────────────────────────────────────────────────
    {
      name:           'comms-daily',
      script:         'comms-engine/run-daily-comms.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: every day at 09:00 HKT (01:00 UTC)
      cron_restart:   '0 1 * * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/comms-engine/logs/daily-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/comms-engine/logs/daily.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
    {
      name:           'comms-monthly-lapsed',
      script:         'comms-engine/run-monthly-lapsed.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: 1st of every month at 10:00 HKT (02:00 UTC)
      cron_restart:   '0 2 1 * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/comms-engine/logs/monthly-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/comms-engine/logs/monthly.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
    // ── Growth Agent Crons ────────────────────────────────────────────────────
    {
      name:           'growth-calendar',
      script:         'growth-agent/run-weekly-calendar.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: every Sunday at 20:00 HKT (12:00 UTC Sunday)
      cron_restart:   '0 12 * * 0',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/growth-agent/logs/calendar-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/growth-agent/logs/calendar.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
    {
      name:           'growth-newsletter',
      script:         'growth-agent/run-monthly-newsletter.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: 1st of every month at 11:00 HKT (03:00 UTC)
      cron_restart:   '0 3 1 * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/growth-agent/logs/newsletter-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/growth-agent/logs/newsletter.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
    {
      name:           'growth-seo',
      script:         'growth-agent/run-monthly-seo.js',
      cwd:            '/Users/basicclaw777/nanoclaw',
      interpreter:    'node',
      // Cron: 1st of every month at 12:00 HKT (04:00 UTC)
      cron_restart:   '0 4 1 * *',
      autorestart:    false,
      error_file:     '/Users/basicclaw777/nanoclaw/growth-agent/logs/seo-error.log',
      out_file:       '/Users/basicclaw777/nanoclaw/growth-agent/logs/seo.log',
      merge_logs:     true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss HKT',
      env: {
        NODE_ENV:       'production',
        HOME:           '/Users/basicclaw777',
        TZ:             'Asia/Hong_Kong',
        TELEGRAM_TOKEN: '8284790243:AAHocCsFhjkzmRsGPI0t1I_NMF4ZcPV--v4',
        PAUL_CHAT_ID:   '1912121485',
      },
    },
  ],
};
