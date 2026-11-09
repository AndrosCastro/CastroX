#!/usr/bin/env bash
# =============================================================
#  CastroX · Instalación en un VPS Ubuntu 22.04 / 24.04
#  Uso (como root, dentro de la carpeta del proyecto):
#     bash deploy/setup-vps.sh midominio.com
#  Si no tienes dominio, omite el argumento y se usará <IP>.sslip.io
# =============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(id -u)" -ne 0 ]; then
  echo "Ejecuta este script como root (sudo bash deploy/setup-vps.sh)"; exit 1
fi

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo ">> Instalando Docker…"
  curl -fsSL https://get.docker.com | sh
fi

# 2. Memoria de intercambio (ayuda en servidores de 1 GB de RAM)
if [ "$(swapon --show | wc -l)" -eq 0 ]; then
  echo ">> Creando 2 GB de swap…"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# 3. Firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
  ufw --force enable >/dev/null
fi

# 4. Dominio
DOMAIN="${1:-}"
if [ -z "$DOMAIN" ]; then
  IP="$(curl -fsS https://api.ipify.org)"
  DOMAIN="$(echo "$IP" | tr '.' '-').sslip.io"
  echo ">> Sin dominio propio: se usará https://$DOMAIN"
fi

# 5. Archivo .env con claves aleatorias (solo si no existe)
mkdir -p backups && chmod 777 backups
if [ ! -f .env ]; then
  rand() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }
  DB_PASSWORD="Cx#$(rand 20)9a"
  ADMIN_PASSWORD="$(rand 12)"
  cat > .env <<EOF
DOMAIN=$DOMAIN
DB_PASSWORD=$DB_PASSWORD
DB_NAME=castrox
JWT_SECRET=$(rand 64)
JWT_EXPIRES=12h
ADMIN_USER=admin
ADMIN_PASSWORD=$ADMIN_PASSWORD
SEED_DEMO=false
EOF
  chmod 600 .env
  echo ""
  echo "=============================================="
  echo "  Usuario administrador: admin"
  echo "  Contraseña:            $ADMIN_PASSWORD"
  echo "  (guárdala; también está en el archivo .env)"
  echo "=============================================="
else
  sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
  grep -q '^DOMAIN=' .env || echo "DOMAIN=$DOMAIN" >> .env
fi

# 6. Levantar
docker compose -f docker-compose.prod.yml up -d --build

# 7. Respaldo diario automático a las 3:00 am
CRON="0 3 * * * cd $(pwd) && bash deploy/backup.sh >> backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'deploy/backup.sh' ; echo "$CRON" ) | crontab -

echo ""
echo ">> Listo. Abre https://$DOMAIN (el certificado puede tardar 1 minuto la primera vez)."
