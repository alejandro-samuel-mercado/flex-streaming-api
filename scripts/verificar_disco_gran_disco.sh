#!/bin/bash
# =============================================================================
# verificar_disco_gran_disco.sh
# Verifica que /home/peliplus_gran_disco sea la partición más grande del sistema
# y ayuda a reorganizarlo si no lo es.
# =============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   VERIFICAR DISCO GRANDE — peliplus_gran_disco       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

TARGET="/home/peliplus_gran_disco"

if [ ! -d "$TARGET" ]; then
  echo "❌ ERROR: El directorio $TARGET no existe."
  echo "   Necesitas montarlo primero. Pasos:"
  echo ""
  echo "   1. Ver discos disponibles:"
  echo "      lsblk -f"
  echo "      fdisk -l"
  echo ""
  echo "   2. Crear el directorio de montaje:"
  echo "      sudo mkdir -p $TARGET"
  echo ""
  echo "   3. Montar el disco (reemplaza /dev/sdXY con tu partición):"
  echo "      sudo mount /dev/sdXY $TARGET"
  echo ""
  echo "   4. Para montaje permanente, agregar a /etc/fstab:"
  echo "      /dev/sdXY  $TARGET  ext4  defaults  0  2"
  echo ""
  exit 1
fi

echo "📊 Todas las particiones montadas (ordenadas por tamaño):"
echo ""
df -h --output=source,size,used,avail,pcent,target | sort -k2 -rh | head -20
echo ""

echo "📌 Estado actual de $TARGET:"
df -h "$TARGET"
echo ""

# Obtener tamaño de la partición de peliplus_gran_disco
SIZE_GRAN=$(df -k "$TARGET" | awk 'NR==2 {print $2}')

# Obtener el tamaño de la partición más grande
LARGEST=$(df -k --output=size,target | sort -k1 -rn | head -2 | tail -1 | awk '{print $1}')
LARGEST_MOUNT=$(df -k --output=size,target | sort -k1 -rn | head -1 | awk '{print $2}')

if [ "$LARGEST_MOUNT" = "/" ]; then
  LARGEST=$(df -k --output=size,target | sort -k1 -rn | sed -n '2p' | awk '{print $1}')
  LARGEST_MOUNT=$(df -k --output=size,target | sort -k1 -rn | sed -n '2p' | awk '{print $2}')
fi

SIZE_GRAN_GB=$(( SIZE_GRAN / 1024 / 1024 ))
LARGEST_GB=$(( LARGEST / 1024 / 1024 ))

echo "   📦 Tamaño de $TARGET:    ${SIZE_GRAN_GB} GB"
echo "   🏆 Partición más grande: ${LARGEST_MOUNT} (${LARGEST_GB} GB)"
echo ""

if [ "$SIZE_GRAN" -ge "$LARGEST" ]; then
  echo "✅ CORRECTO: $TARGET es la partición más grande del sistema."
else
  echo "⚠️  ADVERTENCIA: $TARGET NO es la partición más grande."
  echo "   La partición más grande es: $LARGEST_MOUNT ($LARGEST_GB GB)"
  echo ""
  echo "   Opciones:"
  echo "   A) Si tienes otro disco físico más grande disponible:"
  echo "      sudo lsblk -f            # Ver discos"
  echo "      sudo mkfs.ext4 /dev/sdX  # Formatear (CUIDADO: borra todo)"
  echo "      sudo mount /dev/sdX $TARGET"
  echo ""
  echo "   B) Si usas LVM, puedes extender el volumen lógico:"
  echo "      sudo lvextend -l +100%FREE /dev/vg_media/lv_almacenamiento"
  echo "      sudo resize2fs /dev/vg_media/lv_almacenamiento"
fi

echo ""
echo "📁 Contenido actual de $TARGET:"
if [ -d "$TARGET" ]; then
  du -sh "$TARGET"/* 2>/dev/null || echo "   (directorio vacío o sin permisos)"
fi

echo ""
echo "🔍 Para recuperar sector aislado del disco (falla de hardware):"
echo "   sudo lvdisplay 2>/dev/null | grep -A5 'LV Name'"
echo "   sudo vgdisplay 2>/dev/null"
echo "   sudo dumpe2fs /dev/sdXY 2>/dev/null | grep -i 'bad block' || echo 'sin bad blocks'"
echo "   sudo badblocks -v /dev/sdX 2>&1 | head -20"
echo ""
