#!/usr/bin/env bash
# Register the push-to-sa systemd service + timer on the linebet VM.
#
# Usage (as root, on the linebet VM):
#   SA_HOST=102.133.147.252 sudo bash scripts/register-push.sh
#
# Overridable env:
#   SA_HOST       host of the SA collector/status VM (required)
#   SA_USER       default azureuser
#   SA_APP_DIR    default /opt/linebet
#   APP_DIR       default /opt/linebet
#   PUSH_EVERY    timer interval (default 30s)
#   RUN_USER      default ${SUDO_USER:-azureuser}
set -euo pipefail

SA_HOST="${SA_HOST:?SA_HOST required (host of the SA collector/status VM)}"
SA_USER="${SA_USER:-azureuser}"
SA_APP_DIR="${SA_APP_DIR:-/opt/linebet}"
APP_DIR="${APP_DIR:-/opt/linebet}"
PUSH_EVERY="${PUSH_EVERY:-30s}"
RUN_USER="${RUN_USER:-${SUDO_USER:-azureuser}}"

log() { printf '\033[1;33m[push-register]\033[0m %s\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

SERVICE="/etc/systemd/system/push-to-sa.service"
TIMER="/etc/systemd/system/push-to-sa.timer"

cat > "$SERVICE" <<EOF
[Unit]
Description=Push linebet status to SA VM
After=network-online.target
Wants=network-online.target

[Service]
User=$RUN_USER
Type=oneshot
WorkingDirectory=$APP_DIR
Environment=SA_HOST=$SA_HOST
Environment=SA_USER=$SA_USER
Environment=SA_APP_DIR=$SA_APP_DIR
Environment=APP_DIR=$APP_DIR
ExecStart=$APP_DIR/scripts/push-to-sa.sh
EOF

cat > "$TIMER" <<EOF
[Unit]
Description=Push linebet status to SA VM

[Timer]
OnBootSec=30
OnUnitActiveSec=$PUSH_EVERY
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now push-to-sa.timer >/dev/null
log "Registered push-to-sa.timer (every ${PUSH_EVERY}) → $SA_HOST"
log "Status: systemctl status push-to-sa.timer — logs: journalctl -u push-to-sa -f"
