#!/bin/zsh
exec /opt/homebrew/bin/ttyd \
  --writable \
  --port 7681 \
  --ping-interval 300 \
  /bin/zsh
