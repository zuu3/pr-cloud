#!/usr/bin/env bash
# Atomic redeploy: fetch the rolling bundle into a fresh release dir, flip the
# /opt/promo/current symlink, restart. No in-place tar over a running process
# (that races the mmap'd prisma engine .so -> SIGBUS on a tight box).
#
#   sudo bash /opt/promo/current/redeploy.sh
set -euo pipefail

URL="https://github.com/zuu3/pr-cloud/releases/download/bundle/promo-bundle.tar.gz"
ROOT=/opt/promo
REL="$ROOT/releases/$(date +%Y%m%d-%H%M%S)"

mkdir -p "$REL"
echo "downloading -> $REL"
curl -fsSL "$URL" | tar -xz -C "$REL"
chown -R ubuntu:ubuntu "$REL"

# service unit may have changed
install -m644 "$REL/promo.service" /etc/systemd/system/promo.service
systemctl daemon-reload

ln -sfn "$REL" "$ROOT/current"
sync
systemctl restart promo

sleep 12
systemctl is-active promo
curl -fsS http://localhost:8080/api/healthz && echo

# keep the last 2 releases (6.8G root disk on the VM is tight)
ls -1dt "$ROOT"/releases/*/ | tail -n +3 | xargs -r rm -rf
echo "done. releases:"; ls -1dt "$ROOT"/releases/*/
