#!/usr/bin/env bash
# Push linebet status files to the SA VM so its /status bot can show this VM
# (same pattern as 1xauto shards 3-4: rsync loop-status + state + summary +
# seen-numbers + a journalctl log tail into the SA VM's /opt/linebet).
#
# Env:
#   SA_HOST       host of the SA collector/status VM (required)
#   SA_USER       default azureuser
#   SA_APP_DIR    target dir on SA (default /opt/linebet)
#   APP_DIR       source dir on this VM (default /opt/linebet)
set -euo pipefail

SA_HOST="${SA_HOST:?SA_HOST required (host of the SA collector/status VM)}"
SA_USER="${SA_USER:-azureuser}"
SA_APP_DIR="${SA_APP_DIR:-/opt/linebet}"
APP_DIR="${APP_DIR:-/opt/linebet}"

log() { printf '\033[1;33m[push]\033[0m %s\n' "$*"; }

DEST="$SA_USER@$SA_HOST:$SA_APP_DIR"

for f in loop-status.json state.json run-summary.json seen-numbers.json; do
  if [[ -f "$APP_DIR/$f" ]]; then
    rsync -az "$APP_DIR/$f" "$DEST/$f"
  fi
done

journalctl -u linebet --no-pager -n 60 2>/dev/null > "$APP_DIR/loop-status.txt" || true
if [[ -s "$APP_DIR/loop-status.txt" ]]; then
  rsync -az "$APP_DIR/loop-status.txt" "$DEST/loop-status.txt"
fi

log "Pushed linebet status to $SA_USER@$SA_HOST:$SA_APP_DIR"
