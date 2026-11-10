# Respaldos de CastroX

Respaldos diarios automáticos de la base de datos (carpeta `respaldos/`), creados por
`.github/workflows/respaldo.yml` en la rama `main`.

Restaurar un respaldo en una base PostgreSQL vacía:

```bash
gunzip -c respaldos/castrox-AAAA-MM-DD.sql.gz | psql "postgres://usuario:clave@servidor/base"
```
