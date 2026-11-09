#!/usr/bin/env bash
# CastroX · Respaldo de la base de datos PostgreSQL
# Guarda archivos .sql.gz en ./backups y conserva los últimos 14 días.
# Restaurar:  gunzip -c backups/ARCHIVO.sql.gz | docker exec -i castrox-db psql -U castrox -d castrox
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

mkdir -p backups
FILE="CastroX-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec castrox-db pg_dump -U castrox -d "${DB_NAME:-castrox}" --clean --if-exists | gzip > "backups/$FILE"
find backups -name 'CastroX-*' -mtime +14 -delete
echo "$(date '+%F %T') Respaldo creado: backups/$FILE"
