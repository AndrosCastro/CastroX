#!/usr/bin/env bash
# CastroX · Respaldo de la base de datos SQL Server
# Guarda archivos .bak en ./backups y conserva los últimos 14 días.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

FILE="CastroX-$(date +%Y%m%d-%H%M%S).bak"
docker exec castrox-db /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASSWORD" -C -b \
  -Q "BACKUP DATABASE [${DB_NAME:-CastroX}] TO DISK = N'/var/opt/mssql/backups/$FILE' WITH INIT"
find backups -name 'CastroX-*.bak' -mtime +14 -delete
echo "$(date '+%F %T') Respaldo creado: backups/$FILE"
