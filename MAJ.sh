#!/usr/bin/env bash
# Mise à jour du site depuis GitHub, sans toucher à Nginx, au HTTPS, à .env ni aux données.
#
# Usage (sur le VPS, depuis le clone du dépôt) :   sudo bash MAJ.sh
#   SANS_PULL=1 sudo bash MAJ.sh    déploie le code tel qu'il est dans le dossier (retour arrière)
#
# Étapes : git pull -> sauvegarde de la base -> copie du code dans /opt/cabinet-lecture
#          -> dépendances (seulement si elles ont changé) -> redémarrage -> vérification.
set -euo pipefail

APP_DIR=/opt/cabinet-lecture
APP_USER=cabinet
SERVICE=cabinet-lecture
SRC="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "À lancer en root : sudo bash MAJ.sh"; exit 1; }
[ -d "$SRC/.git" ] || { echo "MAJ.sh doit être lancé depuis un clone git du dépôt."; exit 1; }
[ -d "$APP_DIR" ] && id "$APP_USER" >/dev/null 2>&1 || {
  echo "Le site n'est pas encore installé : lancez d'abord  sudo bash deploy/install.sh <admin>"; exit 1; }
[ "$SRC" != "$APP_DIR" ] || { echo "Le clone git ne doit pas être $APP_DIR lui-même."; exit 1; }

# git est lancé avec le propriétaire du clone (ses clés SSH, pas de « dubious ownership »)
OWNER="$(stat -c %U "$SRC")"
g() { runuser -u "$OWNER" -- git -C "$SRC" "$@"; }

AVANT="$(g rev-parse --short HEAD)"
if [ "${SANS_PULL:-0}" != "1" ]; then
  echo "==> Récupération depuis GitHub"
  g pull --ff-only
fi
APRES="$(g rev-parse --short HEAD)"
echo "    Version : $AVANT -> $APRES"

echo "==> Sauvegarde de la base"
if [ -f "$APP_DIR/data/cabinet.db" ]; then
  mkdir -p "$APP_DIR/data/sauvegardes"
  chown "$APP_USER:$APP_USER" "$APP_DIR/data/sauvegardes"
  SAUV="$APP_DIR/data/sauvegardes/cabinet-$(date +%F-%H%M%S).db"
  runuser -u "$APP_USER" -- sqlite3 "$APP_DIR/data/cabinet.db" ".backup '$SAUV'"
  echo "    $SAUV"
  # On garde les 10 dernières
  ls -1t "$APP_DIR"/data/sauvegardes/cabinet-*.db | tail -n +11 | xargs -r rm -f
else
  echo "    Pas encore de base, rien à sauvegarder."
fi

echo "==> Copie du code"
LOCK_AVANT="$(sha256sum "$APP_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1 || true)"
# data/, .env et node_modules/ du site en place ne sont jamais touchés
tar -C "$SRC" --exclude=./.git --exclude=./node_modules --exclude=./data --exclude=./.env -cf - . | tar -C "$APP_DIR" -xf -
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env"
chmod 750 "$APP_DIR/data"

LOCK_APRES="$(sha256sum "$APP_DIR/package-lock.json" | cut -d' ' -f1)"
if [ "$LOCK_AVANT" != "$LOCK_APRES" ] || [ ! -d "$APP_DIR/node_modules" ]; then
  echo "==> Dépendances Node (elles ont changé)"
  (cd "$APP_DIR" && runuser -u "$APP_USER" -- env HOME="$APP_DIR" npm ci --omit=dev --no-audit --no-fund)
else
  echo "==> Dépendances Node inchangées"
fi

if ! cmp -s "$APP_DIR/deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"; then
  echo "==> Service systemd mis à jour"
  cp "$APP_DIR/deploy/$SERVICE.service" "/etc/systemd/system/$SERVICE.service"
  systemctl daemon-reload
fi

echo "==> Redémarrage"
systemctl restart "$SERVICE"
sleep 2
if systemctl is-active --quiet "$SERVICE"; then
  echo "==> Site à jour ($APRES). Nginx et le certificat HTTPS n'ont pas été modifiés."
else
  echo "!! Le service ne démarre pas :"
  journalctl -u "$SERVICE" -n 30 --no-pager
  echo
  echo "Pour revenir à la version précédente :"
  echo "    git -C $SRC checkout $AVANT && sudo SANS_PULL=1 bash $SRC/MAJ.sh"
  echo "(puis  git -C $SRC checkout -  une fois le problème corrigé sur GitHub)"
  exit 1
fi
