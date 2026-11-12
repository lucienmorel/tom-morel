#!/usr/bin/env bash
# Installation / mise à jour sur Debian 12 ou 13.
# Usage (en root, depuis le dossier décompressé) :  bash deploy/install.sh [identifiant_admin]
set -euo pipefail

APP_DIR=/opt/cabinet-lecture
APP_USER=cabinet
SRC="$(cd "$(dirname "$0")/.." && pwd)"
ADMIN="${1:-}"

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root : sudo bash deploy/install.sh"; exit 1; }

echo "==> Paquets système"
apt-get update -qq
apt-get install -y -qq curl ca-certificates nginx build-essential python3 sqlite3 >/dev/null

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "==> Node.js 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "    Node $(node -v)"

echo "==> Utilisateur système et fichiers"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR/data"
if [ "$SRC" != "$APP_DIR" ]; then
  # Copie du code ; data/ et .env existants sont conservés
  tar -C "$SRC" --exclude=./node_modules --exclude=./data --exclude=./.env -cf - . | tar -C "$APP_DIR" -xf -
fi
[ -f "$APP_DIR/.env" ] || cp "$APP_DIR/.env.example" "$APP_DIR/.env"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"
chmod 750 "$APP_DIR/data"

echo "==> Dépendances Node"
cd "$APP_DIR"
runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm ci --omit=dev --no-audit --no-fund

echo "==> Service systemd"
cp deploy/cabinet-lecture.service /etc/systemd/system/cabinet-lecture.service
systemctl daemon-reload
systemctl enable cabinet-lecture >/dev/null
systemctl restart cabinet-lecture

echo "==> Nginx"
# La configuration existante n'est jamais écrasée (elle contient le HTTPS posé par certbot).
# Pour forcer la réinstallation de la version HTTP d'origine : FORCE_NGINX=1 bash deploy/install.sh
if [ ! -f /etc/nginx/sites-available/cabinet-lecture ] || [ "${FORCE_NGINX:-0}" = "1" ]; then
  cp deploy/nginx.conf /etc/nginx/sites-available/cabinet-lecture
  ln -sf /etc/nginx/sites-available/cabinet-lecture /etc/nginx/sites-enabled/cabinet-lecture
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
else
  echo "    Configuration existante conservée."
fi

if [ -n "$ADMIN" ]; then
  echo "==> Compte administrateur"
  runuser -u "$APP_USER" -- node scripts/create-admin.js "$ADMIN"
fi

sleep 1
systemctl is-active --quiet cabinet-lecture && echo "==> Service actif." || { echo "Le service ne démarre pas :"; journalctl -u cabinet-lecture -n 30 --no-pager; exit 1; }
IP=$(hostname -I | awk '{print $1}')
echo "Site disponible sur http://$IP/"
