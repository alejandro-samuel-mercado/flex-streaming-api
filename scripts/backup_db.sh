#!/bin/bash
# Script de Backup Automático de Peliplus / Nuba
# Debe ejecutarse en el servidor que tenga acceso a pg_dump y la base de datos (Cerebro)

set -e

BACKUP_DIR="/home/copia_seguridad_nuba"
mkdir -p "$BACKUP_DIR"

DATE=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="$BACKUP_DIR/peliplus_db_$DATE.sql.gz"

echo "=============================================="
echo "Iniciando respaldo de base de datos..."
echo "Destino: $BACKUP_FILE"

# Buscar variables de entorno (por si se corre vía cron)
if [ -f "/home/flex-streaming-api/.env" ]; then
    export $(grep -E '^DATABASE_URL=' /home/flex-streaming-api/.env | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: No se encontró DATABASE_URL en el entorno o en /home/flex-streaming-api/.env"
    exit 1
fi

# Hacer volcado y comprimir
pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"

echo "✅ Respaldo completado exitosamente: $BACKUP_FILE"

# Limpieza: Conservar solo los últimos 10 backups para ahorrar disco
echo "Limpiando respaldos antiguos (conservando los últimos 10)..."
ls -tp "$BACKUP_DIR"/peliplus_db_*.sql.gz | grep -v '/$' | tail -n +11 | xargs -r rm -- 

echo "✅ Proceso finalizado."
echo "=============================================="
