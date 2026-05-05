#!/bin/bash
# telegram-webhook-tunnel.sh
# Starts an ngrok tunnel to expose cath-bridge (port 8080) and
# registers the Telegram webhook with the tunnel URL.
#
# PM2: pm2 start telegram-webhook-tunnel.sh --name telegram-tunnel --interpreter bash
# The tunnel URL changes on every restart (free tier). The script
# re-registers the webhook automatically.
#
# Note: cloudflared was tested but Telegram's servers cannot resolve
# trycloudflare.com subdomains. ngrok-free.dev resolves fine.

NANOCLAW="$HOME/nanoclaw"
URLFILE="$NANOCLAW/.tunnel-url"
WEBHOOK_PATH="/telegram/webhook"

# Load env for TELEGRAM_TOKEN
if [ -f "$NANOCLAW/.env" ]; then
  export TELEGRAM_TOKEN=$(grep '^TELEGRAM_TOKEN=' "$NANOCLAW/.env" | cut -d= -f2)
fi

if [ -z "$TELEGRAM_TOKEN" ]; then
  echo "[tunnel] ERROR: TELEGRAM_TOKEN not found in .env"
  exit 1
fi

# Clean up on exit — switch bot back to polling
cleanup() {
  echo "[tunnel] Shutting down — switching bot back to polling..."
  curl -s -X POST http://127.0.0.1:8443/switch-to-polling >/dev/null 2>&1 || true
  curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteWebhook" >/dev/null 2>&1 || true
  rm -f "$URLFILE"
  if [ -n "$NGROK_PID" ]; then
    kill "$NGROK_PID" 2>/dev/null || true
    wait "$NGROK_PID" 2>/dev/null || true
  fi
  echo "[tunnel] Cleanup complete."
}
trap cleanup EXIT INT TERM

# Start ngrok in background
echo "[tunnel] Starting ngrok tunnel to localhost:8080..."
ngrok http 8080 --log=stdout --log-format=json >/dev/null 2>&1 &
NGROK_PID=$!
echo "[tunnel] ngrok PID: $NGROK_PID"

# Wait for ngrok to be ready (up to 15s)
TUNNEL_URL=""
for i in $(seq 1 15); do
  # Check if ngrok died
  if ! kill -0 "$NGROK_PID" 2>/dev/null; then
    echo "[tunnel] ERROR: ngrok exited prematurely"
    exit 1
  fi
  # Query ngrok local API for tunnel URL
  TUNNEL_URL=$(curl -s http://127.0.0.1:4040/api/tunnels 2>/dev/null \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print([t['public_url'] for t in d['tunnels'] if t['public_url'].startswith('https')][0])" 2>/dev/null)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "[tunnel] ERROR: Could not get tunnel URL after 15s"
  exit 1
fi

echo "[tunnel] Tunnel URL: $TUNNEL_URL"
echo "$TUNNEL_URL" > "$URLFILE"

# Register webhook with Telegram (retry up to 3 times with 5s gap)
WEBHOOK_URL="${TUNNEL_URL}${WEBHOOK_PATH}"
echo "[tunnel] Setting Telegram webhook: $WEBHOOK_URL"

for attempt in 1 2 3; do
  RESULT=$(curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook" \
    -d "url=${WEBHOOK_URL}" \
    -d "drop_pending_updates=false" \
    -d "allowed_updates=[\"message\",\"callback_query\"]")

  OK=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok', False))" 2>/dev/null || echo "unknown")

  if [ "$OK" = "True" ]; then
    echo "[tunnel] Webhook registered successfully (attempt $attempt)."
    break
  else
    echo "[tunnel] setWebhook attempt $attempt failed: $RESULT"
    if [ "$attempt" -lt 3 ]; then
      sleep 5
    fi
  fi
done

if [ "$OK" != "True" ]; then
  echo "[tunnel] WARNING: Webhook registration failed after 3 attempts. Bot stays in polling mode."
fi

echo "[tunnel] Tunnel is live. Waiting for ngrok..."

# Keep running — wait for ngrok
wait "$NGROK_PID"
EXIT_CODE=$?
echo "[tunnel] ngrok exited with code $EXIT_CODE"
exit $EXIT_CODE
