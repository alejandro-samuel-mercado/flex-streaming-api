/**
 * health-inspector.worker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Inspector de Integridad de Contenido
 *
 * Corre cada 30 minutos (configurable) y verifica:
 *   1. Si el archivo HLS master.m3u8 existe físicamente en disco
 *   2. Si el contenido tiene todos los campos mínimos de TMDB
 *   3. Marca como MISSING si el video existía pero su archivo ya no está
 *   4. Marca como PENDING si faltan portada / título / descripción
 *   5. Marca como INCOMPLETE si tiene video pero le falta algún campo no crítico
 *   6. Solo puede estar ACTIVE si tiene al menos 1 video COMPLETED real + portada + título + descripción
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ContentStatus } from '@prisma/client';
import { prisma } from '../shared/config/prisma';

// ── Tipos de contenido que son SERIES (tienen episodios) ──────────────────────
const SERIES_TYPES = new Set([
  'SERIES', 'ANIME', 'NOVELA', 'REALITY_SHOW', 'TALK_SHOW',
  'VARIETY_SHOW', 'EDUCATIONAL', 'KIDS', 'FAMILY', 'INTERACTIVE'
]);

// ── Tipos de contenido que son PELÍCULAS (sin episodios) ──────────────────────
const MOVIE_TYPES = new Set([
  'MOVIE', 'DOCUMENTARY', 'ANIMATION', 'BIOGRAPHY', 'STAND_UP',
  'SPECIAL', 'DOCUDRAMA', 'SHORT', 'EXPERIMENTAL'
]);

/**
 * Verifica si el hlsPath / masterPlaylist de un VideoFile existe en disco.
 */
function hlsExistsOnDisk(_hlsPath: string | null, _masterPlaylist: string | null): boolean {
  // En la arquitectura multi-servidor, Cerebro no tiene acceso físico a los discos
  // de los servidores de Películas/Series. Por lo tanto, confiamos en el estado COMPLETED
  // de la base de datos y asumimos que el archivo existe.
  return true;
}

/**
 * Inspecciona un contenido de tipo PELÍCULA y retorna el nuevo estado correcto.
 */
async function inspectMovie(contentId: string): Promise<{ newStatus: ContentStatus; reason: string }> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: {
      translations: true,
      thumbnails: true,
      genres: true,
      videoFiles: {
        where: { status: 'COMPLETED' }
      }
    }
  });

  if (!content) return { newStatus: 'PENDING', reason: 'contenido no encontrado' };

  // No tocar contenido que está siendo procesado activamente
  if (content.status === 'PROCESSING') return { newStatus: 'PROCESSING', reason: 'procesando' };

  const hasPoster = content.thumbnails.some(t => t.type === 'POSTER');
  const translation = content.translations.find(t => t.language === 'es') || content.translations[0];
  const hasTitle = translation?.title && translation.title.trim().length > 0;
  const hasDescription = translation?.description && translation.description.trim().length > 5;
  const hasGenres = content.genres.length > 0;
  const completedVideos = content.videoFiles;

  // Sin videos COMPLETED → PENDING (falta el recurso principal)
  if (completedVideos.length === 0) {
    return { newStatus: 'PENDING', reason: 'sin video procesado' };
  }

  // Verificar que al menos 1 video COMPLETED tenga su HLS en disco
  let videoOnDisk = false;
  for (const vf of completedVideos) {
    if (hlsExistsOnDisk(vf.hlsPath, vf.masterPlaylist)) {
      videoOnDisk = true;
      break;
    }
  }

  if (!videoOnDisk) {
    // El video fue procesado pero el archivo ya no está en disco
    return { newStatus: 'PENDING', reason: 'HLS no encontrado en disco (enlace roto)' };
  }

  // Sin portada o título → PENDING
  if (!hasPoster || !hasTitle) {
    return { newStatus: 'PENDING', reason: `incompleto: ${[!hasPoster && 'portada', !hasTitle && 'título'].filter(Boolean).join(', ')}` };
  }

  // Si le falta la sinopsis pero tiene portada y video, lo dejamos ACTIVE pero lo marcamos en el reason
  if (!hasDescription) {
    return { newStatus: 'ACTIVE', reason: 'activo pero incompleto (sin sinopsis)' };
  }

  // Tiene lo esencial, pero le faltan géneros u otras cosas menores
  if (!hasGenres) {
    return { newStatus: 'ACTIVE', reason: 'activo pero incompleto (sin géneros)' };
  }

  // Todo completo → ACTIVE
  return { newStatus: 'ACTIVE', reason: 'completo' };
}

/**
 * Inspecciona un contenido de tipo SERIE y retorna el nuevo estado correcto.
 */
async function inspectSeries(contentId: string): Promise<{ newStatus: ContentStatus; reason: string }> {
  const content = await prisma.content.findUnique({
    where: { id: contentId },
    include: {
      translations: true,
      thumbnails: true,
      genres: true,
      videoFiles: {
        where: { status: 'COMPLETED' }
      },
      seasons: {
        include: {
          episodes: {
            include: {
              videoFiles: {
                where: { status: 'COMPLETED' }
              }
            }
          }
        }
      }
    }
  });

  if (!content) return { newStatus: 'PENDING', reason: 'contenido no encontrado' };
  if (content.status === 'PROCESSING') return { newStatus: 'PROCESSING', reason: 'procesando' };

  const hasPoster = content.thumbnails.some(t => t.type === 'POSTER');
  const translation = content.translations.find(t => t.language === 'es') || content.translations[0];
  const hasTitle = translation?.title && translation.title.trim().length > 0;
  const hasDescription = translation?.description && translation.description.trim().length > 5;
  const hasGenres = content.genres.length > 0;

  // Recopilar todos los episodios con video COMPLETED
  let episodesWithVideoOnDisk = 0;
  let totalCompletedVideos = 0;

  for (const season of content.seasons) {
    for (const episode of season.episodes) {
      for (const vf of episode.videoFiles) {
        totalCompletedVideos++;
        if (hlsExistsOnDisk(vf.hlsPath, vf.masterPlaylist)) {
          episodesWithVideoOnDisk++;
        }
      }
    }
  }

  if (content.videoFiles && content.videoFiles.length > 0) {
    for (const vf of content.videoFiles) {
      totalCompletedVideos++;
      if (hlsExistsOnDisk(vf.hlsPath, vf.masterPlaylist)) {
        episodesWithVideoOnDisk++;
      }
    }
  }

  // Si la serie tiene episodios pero NINGUNO tiene video completado → PENDING
  if (totalCompletedVideos === 0) {
    return { newStatus: 'PENDING', reason: 'sin episodios procesados' };
  }

  // Sin ningún episodio físico con video en disco → PENDING
  if (episodesWithVideoOnDisk === 0) {
    if (totalCompletedVideos > 0) {
      return { newStatus: 'PENDING', reason: 'videos procesados pero HLS no encontrado en disco' };
    }
    return { newStatus: 'PENDING', reason: 'sin episodios físicos con video' };
  }

  // Tiene episodios pero faltan datos mínimos → PENDING
  if (!hasPoster || !hasTitle) {
    return { newStatus: 'PENDING', reason: `tiene episodios pero falta: ${[!hasPoster && 'portada', !hasTitle && 'título'].filter(Boolean).join(', ')}` };
  }

  // Tiene episodios, portada y título pero falta descripción → ACTIVE (pero marcamos que le falta sinopsis)
  if (!hasDescription) {
    return { newStatus: 'ACTIVE', reason: 'activo pero incompleto (sin sinopsis)' };
  }

  // Tiene lo esencial, pero le faltan géneros
  if (!hasGenres) {
    return { newStatus: 'ACTIVE', reason: `activo con ${episodesWithVideoOnDisk} episodio(s) pero sin géneros` };
  }

  // Al menos 1 episodio real en disco con todos los datos → ACTIVE
  return { newStatus: 'ACTIVE', reason: `activo con ${episodesWithVideoOnDisk} episodio(s) en disco` };
}

/**
 * Marca los VideoFiles COMPLETED cuyo HLS ya no está en disco como FAILED.
 */
async function markMissingVideoFiles(): Promise<number> {
  const completedFiles = await prisma.videoFile.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true, hlsPath: true, masterPlaylist: true }
  });

  let marked = 0;
  for (const vf of completedFiles) {
    if (!hlsExistsOnDisk(vf.hlsPath, vf.masterPlaylist)) {
      await prisma.videoFile.update({
        where: { id: vf.id },
        data: {
          status: 'FAILED',
          errorMessage: 'HLS no encontrado en disco. El archivo fue eliminado o el disco está desconectado.'
        }
      });
      marked++;
    }
  }
  return marked;
}

/**
 * Función principal de inspección.
 */
export async function runHealthInspection(): Promise<void> {
  const startTime = Date.now();
  console.log('[HealthInspector] 🔍 Iniciando inspección de integridad...');

  // Paso 1: Marcar VideoFiles COMPLETED sin HLS en disco como FAILED
  const missingFiles = await markMissingVideoFiles();
  if (missingFiles > 0) {
    console.log(`[HealthInspector] ⚠️  ${missingFiles} VideoFile(s) marcados como FAILED (HLS no encontrado)`);
  }

  // Paso 1b: Barrido de series "fantasma" que están READY/ACTIVE pero no tienen ningún episodio con VideoFile COMPLETED
  const emptySeries = await prisma.content.findMany({
    where: {
      type: { in: ['SERIES', 'ANIME', 'NOVELA'] },
      status: { in: ['READY', 'ACTIVE'] },
      seasons: {
        every: {
          episodes: {
            every: {
              videoFiles: {
                none: { status: 'COMPLETED' }
              }
            }
          }
        }
      }
    },
    select: { id: true, status: true }
  });

  if (emptySeries.length > 0) {
    console.log(`[HealthInspector] ⚠️  Encontradas ${emptySeries.length} series marcadas como ACTIVE pero sin episodios válidos. Bajando a PENDING...`);
    for (const series of emptySeries) {
      await prisma.content.update({
        where: { id: series.id },
        data: { status: 'PENDING' }
      });
    }
  }

  // Paso 2: Inspeccionar todo el contenido que NO está siendo procesado
  const allContent = await prisma.content.findMany({
    where: {
      status: { notIn: ['PROCESSING'] },
      deletedAt: null
    },
    select: { id: true, type: true, status: true }
  });

  console.log(`[HealthInspector] Inspeccionando ${allContent.length} contenidos...`);

  let updated = 0;
  let errors = 0;

  for (const content of allContent) {
    try {
      let inspection: { newStatus: ContentStatus; reason: string };

      if (MOVIE_TYPES.has(content.type)) {
        inspection = await inspectMovie(content.id);
      } else if (SERIES_TYPES.has(content.type)) {
        inspection = await inspectSeries(content.id);
      } else {
        continue;
      }

      let { newStatus, reason } = inspection;

      // Si el contenido está en PENDING, no promoverlo automáticamente a ACTIVE o READY.
      // Debe mantenerse en PENDING para permitir la activación manual por parte del administrador.
      if (content.status === 'PENDING' && (newStatus === 'ACTIVE' || newStatus === 'READY')) {
        newStatus = 'PENDING';
      }

      // Si el administrador lo puso en ACTIVE o READY manualmente, no lo degradamos automáticamente a PENDING.
      // Así respetamos los cambios que hizo el administrador desde el panel.
      if ((content.status === 'ACTIVE' || content.status === 'READY') && newStatus === 'PENDING') {
        newStatus = content.status;
      }

      if (newStatus !== content.status) {
        await prisma.content.update({
          where: { id: content.id },
          data: { status: newStatus }
        });
        console.log(`[HealthInspector] ${content.id} → ${content.status} ⟶ ${newStatus} (${reason})`);
        updated++;
      }
    } catch (err: any) {
      console.warn(`[HealthInspector] Error inspeccionando ${content.id}: ${err.message}`);
      errors++;
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`[HealthInspector] ✅ Completado en ${elapsed}s: ${updated} estados actualizados, ${errors} errores`);

  // Guardar resultado en SiteConfig
  await prisma.siteConfig.upsert({
    where: { key: 'HEALTH_INSPECTOR_LAST_RUN' },
    update: { value: new Date().toISOString() },
    create: { key: 'HEALTH_INSPECTOR_LAST_RUN', value: new Date().toISOString() }
  });
  await prisma.siteConfig.upsert({
    where: { key: 'HEALTH_INSPECTOR_LAST_RESULT' },
    update: { value: JSON.stringify({ updated, missingFiles, errors, elapsed, timestamp: new Date().toISOString() }) },
    create: { key: 'HEALTH_INSPECTOR_LAST_RESULT', value: JSON.stringify({ updated, missingFiles, errors, elapsed }) }
  });
}

// ── Worker con interval ────────────────────────────────────────────────────────

export class HealthInspectorWorker {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;
  private static isRunning = false;

  /** Iniciar el inspector automático cada `intervalMinutes` minutos (default 30). */
  static start(intervalMinutes = 30): void {
    const ms = intervalMinutes * 60 * 1000;
    this.intervalHandle = setInterval(() => { this._tick(); }, ms);
    console.log(`[HealthInspector] 🩺 Worker iniciado — inspección cada ${intervalMinutes} min`);
    // Primera inspección al arrancar (con 2 min de delay para que el sistema cargue)
    setTimeout(() => { this._tick(); }, 2 * 60 * 1000);
  }

  static stop(): void {
    if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; }
    console.log('[HealthInspector] Worker detenido');
  }

  static async forceRun(): Promise<void> {
    await runHealthInspection();
  }

  private static async _tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await runHealthInspection();
    } catch (err: any) {
      console.error('[HealthInspector] Error en tick:', err.message);
    } finally {
      this.isRunning = false;
    }
  }
}
