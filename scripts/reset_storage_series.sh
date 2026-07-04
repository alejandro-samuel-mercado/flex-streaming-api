#!/bin/bash
# =============================================================================
# reset_storage_series.sh
# Limpia TODOS los archivos procesados del servidor de SERIES.
# Los videos originales en /home/series NO se tocan.
# =============================================================================
set -euo pipefail

# ── Rutas a limpiar ───────────────────────────────────────────────────────────
GRAN_DISCO="/home/peliplus_gran_disco"
HLS_DIR="$GRAN_DISCO/hls"
THUMBS_DIR="$GRAN_DISCO/thumbnails"
SUBS_DIR="$GRAN_DISCO/subtitles"
UPLOADS_DIR="$GRAN_DISCO/uploads"
AUDIOS_DIR="$GRAN_DISCO/audios"

# ── Videos originales (NO tocar) ─────────────────────────────────────────────
ORIGINALS_DIR="/home/series"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   RESET STORAGE — SERVIDOR DE SERIES                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  ✅ Se CONSERVARÁN:   $ORIGINALS_DIR (videos originales)"
echo "  🗑️  Se BORRARÁN:     $GRAN_DISCO (HLS, miniaturas, subtítulos, audios)"
echo ""

# ── Verificar que el disco grande existe ──────────────────────────────────────
if [ ! -d "$GRAN_DISCO" ]; then
  echo "❌ ERROR: No se encontró el directorio $GRAN_DISCO"
  echo "   Verifica que el disco /home/peliplus_gran_disco está montado."
  exit 1
fi

# ── Verificar tamaño del disco grande vs otros discos ────────────────────────
echo "📊 Verificando tamaños de particiones..."
df -h "$GRAN_DISCO" 2>/dev/null || echo "  (no se pudo verificar $GRAN_DISCO)"
echo ""

read -rp "¿Confirmar borrado de archivos procesados? (escribe 'SI' para continuar): " confirm
if [ "$confirm" != "SI" ]; then
  echo "Cancelado."
  exit 1
fi

echo ""
echo "🗑️  Borrando HLS de series..."
if [ -d "$HLS_DIR" ]; then
  rm -rf "${HLS_DIR:?}"/*
  echo "   ✅ $HLS_DIR limpio"
else
  mkdir -p "$HLS_DIR"
  echo "   ℹ️  $HLS_DIR creado (no existía)"
fi

echo "🗑️  Borrando miniaturas..."
if [ -d "$THUMBS_DIR" ]; then
  rm -rf "${THUMBS_DIR:?}"/*
  echo "   ✅ $THUMBS_DIR limpio"
else
  mkdir -p "$THUMBS_DIR"
  echo "   ℹ️  $THUMBS_DIR creado"
fi

echo "🗑️  Borrando subtítulos..."
if [ -d "$SUBS_DIR" ]; then
  rm -rf "${SUBS_DIR:?}"/*
  echo "   ✅ $SUBS_DIR limpio"
else
  mkdir -p "$SUBS_DIR"
  echo "   ℹ️  $SUBS_DIR creado"
fi

echo "🗑️  Borrando audios extraídos..."
if [ -d "$AUDIOS_DIR" ]; then
  rm -rf "${AUDIOS_DIR:?}"/*
  echo "   ✅ $AUDIOS_DIR limpio"
else
  mkdir -p "$AUDIOS_DIR"
  echo "   ℹ️  $AUDIOS_DIR creado"
fi

echo "🗑️  Borrando uploads temporales..."
if [ -d "$UPLOADS_DIR" ]; then
  rm -rf "${UPLOADS_DIR:?}"/*
  echo "   ✅ $UPLOADS_DIR limpio"
else
  mkdir -p "$UPLOADS_DIR"
  echo "   ℹ️  $UPLOADS_DIR creado"
fi

echo ""
echo "✅ Disco de SERIES limpio. Listo para re-escanear."
echo "   Próximo paso: ejecutar reset_catalogo_completo.ts y luego escanear_series.ts"
echo ""
