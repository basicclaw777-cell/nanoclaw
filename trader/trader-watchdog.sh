#!/bin/bash
# trader-watchdog.sh — Minimal watchdog for trading processes
# Runs every 5 minutes via PM2 cron. So simple it can't crash.
# If trader is down, restarts it and alerts Paul immediately.

source ~/.zshrc 2>/dev/null
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

TRADER_NAME="trader"
BOT_TOKEN=$(grep TELEGRAM_TOKEN ~/nanoclaw/.env | cut -d'=' -f2)
CHAT_ID=$(grep PAUL_CHAT_ID ~/nanoclaw/.env | cut -d'=' -f2)

send_alert() {
  curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${CHAT_ID}\",\"text\":\"$1\",\"parse_mode\":\"Markdown\"}" > /dev/null 2>&1
}

# Check trader status
STATUS=$(pm2 jlist 2>/dev/null | node -e "
  const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  const t=d.find(p=>p.name==='${TRADER_NAME}');
  console.log(t ? t.pm2_env.status : 'missing');
")

if [ "$STATUS" != "online" ]; then
  # Restart trader
  pm2 restart "$TRADER_NAME" 2>/dev/null

  # Check if restart worked
  sleep 3
  NEW_STATUS=$(pm2 jlist 2>/dev/null | node -e "
    const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const t=d.find(p=>p.name==='${TRADER_NAME}');
    console.log(t ? t.pm2_env.status : 'missing');
  ")

  if [ "$NEW_STATUS" = "online" ]; then
    send_alert "⚠️ *Trader Watchdog*: trader was DOWN — restarted successfully."
  else
    send_alert "🔴 *Trader Watchdog*: trader is DOWN and restart FAILED. Manual intervention needed."
  fi
fi
