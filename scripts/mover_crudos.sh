#!/bin/bash

# Rutas de origen y destino
ORIGEN="/home/media/peliculas"
DESTINO="/home/peliplus_gran_disco/videos_subidos"

# Archivo de registro (Log)
LOG_FILE="/var/log/mover_crudos.log"

# Crear carpeta de destino si no existe
mkdir -p "$DESTINO"

echo "===================================================" >> "$LOG_FILE"
echo "Iniciando movimiento de archivos crudos a las $(date)" >> "$LOG_FILE"

# Buscar archivos .mp4 y .mkv
# IMPORTANTE: Usamos -mmin +360 para mover SOLO archivos que lleven más de 6 horas sin modificarse.
# Esto asegura que no movamos un video que se está subiendo o procesando en este exacto momento.
find "$ORIGEN" -type f \( -iname "*.mp4" -o -iname "*.mkv" \) -mmin +360 | while read -r archivo; do
    # Calcular la ruta relativa para mantener las carpetas (ej. /398978/video.mp4)
    relativo="${archivo#$ORIGEN/}"
    carpeta_destino="$DESTINO/$(dirname "$relativo")"
    
    # Crear la subcarpeta en el destino si no existe
    mkdir -p "$carpeta_destino"
    
    # Mover el archivo (cruza particiones, por lo que actuará como copia+borrado)
    mv "$archivo" "$carpeta_destino/"
    
    if [ $? -eq 0 ]; then
        echo "✅ Movido: $relativo" >> "$LOG_FILE"
    else
        echo "❌ Error moviendo: $relativo" >> "$LOG_FILE"
    fi
done

echo "Movimiento finalizado a las $(date)" >> "$LOG_FILE"
echo "===================================================" >> "$LOG_FILE"
