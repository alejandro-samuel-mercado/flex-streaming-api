import fs from 'fs';
import path from 'path';
import { addVideoJob } from '../../services/queue.service';
import { TMDBFullDetails, TMDBService } from '../../services/tmdb.service';
import { env } from '../../shared/config/env';
import { prisma } from '../../shared/config/prisma';

export interface ScannedFile {
  fileName: string;
  cleanName: string;
  filePath: string;
  fileSize: number;
  extension: string;
  lastModified: Date;
  alreadyImported: boolean;
  contentType: 'MOVIE' | 'SERIES';
  // Only for SERIES (already-HLS episodes)
  episode?: {
    m3u8Path: string;
    season: number;
    episodeNumber: number;
    tmdbSeriesId: number | null;
    seriesFolderName: string;
  };
}

export interface ImportResult {
  filePath: string;
  fileName: string;
  success: boolean;
  contentId?: string;
  tmdbMatch: boolean;
  error?: string;
}

const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp', '.mxf', '.rmvb', '.vob', '.ts'
]);

const NOISE_PATTERNS = [
  /\b(360p|480p|720p|1080p|2160p|4k|uhd)\b/gi,
  /\b(x264|x265|h264|h265|hevc|avc|xvid|divx|av1)\b/gi,
  /\b(blu[\s-]?ray|bdrip|brrip|web[\s-]?dl|web[\s-]?rip|hdtv|dvdrip|hdrip|cam|ts|screener|r5)\b/gi,
  /\b(aac|ac3|dts|dd5\.?1|atmos|truehd|flac|mp3)\b/gi,
  /\[.*?\]/g,
  /\(.*?\)/g,
  /\b\d+(\.\d+)?\s*(gb|mb|tb)\b/gi,
  /[-\.]\w{2,10}$/g,
  /\b(19|20)\d{2}\b/g,
  /[._]/g,
  /\s{2,}/g,
];

// ── Parsers ───────────────────────────────────────────────────────────────────

/**
 * Parse TMDB id from folder names like "1399_juego_de_tronos" or "1399_S01E01".
 */
function parseTmdbId(folderName: string): number | null {
  let m = folderName.match(/[\[\(\{]tmdb[-_\s]?(\d+)[\]\)\}]/i);
  if (m) return parseInt(m[1], 10);
  m = folderName.match(/^(\d+)[_\s-]/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Parse season and episode from folder names like "1399_S01E01".
 */
function parseSeasonEpisode(folderName: string): { season: number; episode: number } | null {
  const m = folderName.match(/[Ss](\d+)[-_\s]*[Ee](?:[Pp])?[-_\s]*(\d+)/i);
  if (m) {
    return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
  }
  return null;
}

/**
 * Parse season and episode from filenames with varied formats:
 *   "Before T01-05.mkv"  → S01E05
 *   "Show T01E09.mkv"    → S01E09
 *   "Series 1x09.mkv"   → S01E09
 *   "Episode 5.mkv"      → S01E05 (season defaults to 1)
 */
function parseSeasonEpisodeFromFilename(fileName: string): { season: number; episode: number } | null {
  // Try standard S01E01 formats again just in case
  const m = fileName.match(/[Ss](\d+)[-_\s]*[Ee](?:[Pp])?[-_\s]*(\d+)/i);
  if (m) return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };

  // T01-05, T01E05, T01-E05 formats (common in Spanish file naming)
  const tFormat = fileName.match(/[Tt](\d+)[-\s]*[Ee]?(?:[Pp])?[-\s]*(\d+)/i);
  if (tFormat) return { season: parseInt(tFormat[1], 10), episode: parseInt(tFormat[2], 10) };

  // 1x09 format
  const xFormat = fileName.match(/(\d+)[xX](\d+)/i);
  if (xFormat) return { season: parseInt(xFormat[1], 10), episode: parseInt(xFormat[2], 10) };

  // Standalone episode number (e.g. "Episode 5", "Capítulo 5", "Ep 05")
  const epFormat = fileName.match(/(?:[Ee]pisodio|[Ee]p|[Cc]ap[ií]tulo|[Cc]ap)[-_\s]*(\d+)/i);
  if (epFormat) return { season: 1, episode: parseInt(epFormat[1], 10) };

  // E05 format
  const eFormat = fileName.match(/[Ee](\d+)/i);
  if (eFormat) return { season: 1, episode: parseInt(eFormat[1], 10) };

  return null;
}

export class MediaScannerService {

  private static creatingContents = new Map<string, Promise<string>>();
  private static resolvingSeries = new Map<string, Promise<string | null>>();
  private static resolvingMovies = new Map<string, Promise<string>>();

  static getSuggestedDirectories(): string[] {
    const dirs = env.MEDIA_SCAN_DIRS;
    if (!dirs) return [];
    return dirs.split(';').map(d => d.trim()).filter(d => d.length > 0);
  }

  static extractTmdbId(fileName: string): number | null {
    // Quitar extensión para facilitar la búsqueda
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "").trim();

    // Patrón 1: "[TMDB-12345]" o "(tmdb 12345)" o "{tmdb_12345}"
    let m = nameWithoutExt.match(/[\[\(\{]tmdb[-_\s]?(\d+)[\]\)\}]/i);
    if (m) return parseInt(m[1], 10);

    // Patrón 2: ID puro ("12345") de 3 o más dígitos
    if (/^\d{3,}$/.test(nameWithoutExt)) {
        return parseInt(nameWithoutExt, 10);
    }

    // Patrón 3: ID al inicio con nombre ("12345 Nombre" o "12345_Nombre" o "12345 - Nombre")
    // Exigimos 4 o más dígitos para evitar confundir con años o números pequeños como "24"
    m = nameWithoutExt.match(/^(\d{4,})[_\s-]/);
    if (m) return parseInt(m[1], 10);

    // Patrón 4: ID al final ("Nombre 12345" o "Nombre_12345")
    m = nameWithoutExt.match(/[_\s-](\d+)$/);
    if (m) {
      const num = parseInt(m[1], 10);
      // Evitar que detecte años al final como IDs (ej: "Avatar 2026")
      if (!(num >= 1900 && num <= 2100)) {
         return num;
      }
    }
    
    return null;
  }

  static cleanFileName(fileName: string): string {
    let clean = fileName.replace(/\.[^/.]+$/, '');
    
    // Si tiene un Smart ID, quítalo del nombre para no ensuciar el título
    const tmdbId = this.extractTmdbId(fileName);
    if (tmdbId) {
      clean = clean.replace(new RegExp(`^${tmdbId}_`), '');
      clean = clean.replace(new RegExp(`[_\\s-]${tmdbId}$`), '');
    }

    for (const pattern of NOISE_PATTERNS) clean = clean.replace(pattern, ' ');
    clean = clean.replace(/[._-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return clean;
  }

  /**
   * Scan both a movies folder (raw video files) and a series folder (already-HLS episodes).
   * Optimized: scans disk first (no DB), then batch-checks imported status in chunks.
   */
  static async scanDirectories(moviePath?: string, seriesPath?: string): Promise<ScannedFile[]> {
    // Phase 1: Scan filesystem without DB — fast, just read directories
    const emptySet = new Set<string>(); // Temporarily mark nothing as imported
    const allFiles: ScannedFile[] = [];

    if (moviePath && fs.existsSync(moviePath)) {
      const movieFiles: ScannedFile[] = [];
      await this._scanMoviesRecursive(moviePath, movieFiles, emptySet, 0, 2);
      allFiles.push(...movieFiles);
    }

    if (seriesPath && fs.existsSync(seriesPath)) {
      const seriesFiles: ScannedFile[] = [];
      await this._scanSeriesRecursive(seriesPath, seriesFiles, emptySet, '', 0, 6);
      allFiles.push(...seriesFiles);
    }

    // Phase 2: Batch-check which paths are already imported (chunks of 200)
    // If DB is temporarily unreachable, we continue without this check —
    // importFile() has its own duplicate guard so nothing will be double-imported.
    const CHUNK = 200;
    const importedPaths = new Set<string>();
    try {
      for (let i = 0; i < allFiles.length; i += CHUNK) {
        const chunk = allFiles.slice(i, i + CHUNK).map(f => f.filePath);
        const found = await prisma.videoFile.findMany({
          where: { 
            originalPath: { in: chunk },
            status: { not: 'FAILED' }
          },
          select: { originalPath: true }
        });
        for (const v of found) importedPaths.add(v.originalPath);
        // Yield event loop between chunks
        if (i + CHUNK < allFiles.length) await new Promise(r => setImmediate(r));
      }
    } catch (err: any) {
      console.warn(`[MediaScanner] DB batch-check failed (${err?.message}). Continuing scan — importFile() will handle duplicates.`);
    }

    // Phase 3: Mark imported status
    for (const f of allFiles) {
      f.alreadyImported = importedPaths.has(f.filePath);
    }

    allFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
    console.log(`[MediaScanner] Scan complete: ${allFiles.length} files found (${importedPaths.size} already imported).`);
    return allFiles;
  }

  /** Legacy single-folder scan (movies only). */
  static async scanDirectory(dirPath: string, maxDepth = 2, contentType: 'MOVIE' | 'SERIES' = 'MOVIE'): Promise<ScannedFile[]> {
    if (!fs.existsSync(dirPath)) throw new Error(`Directorio no encontrado: ${dirPath}`);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) throw new Error(`La ruta no es un directorio: ${dirPath}`);

    const existingVideos = await prisma.videoFile.findMany({ select: { originalPath: true } });
    const importedPaths = new Set(existingVideos.map(v => v.originalPath));

    const files: ScannedFile[] = [];
    if (contentType === 'SERIES') {
      await this._scanSeriesRecursive(dirPath, files, importedPaths, '', 0, 6);
    } else {
      await this._scanMoviesRecursive(dirPath, files, importedPaths, 0, maxDepth);
    }
    files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return files;
  }

  // ── Private scanners ──────────────────────────────────────────────────────

  private static async _scanMoviesRecursive(
    dirPath: string, results: ScannedFile[], importedPaths: Set<string>,
    currentDepth: number, maxDepth: number
  ): Promise<void> {
    if (currentDepth > maxDepth) return;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); }
    catch (err: any) { console.warn(`[MediaScanner] Cannot read ${dirPath}: ${err.message}`); return; }

    let count = 0;
    for (const entry of entries) {
      // Yield event loop every 50 files to prevent blocking BullMQ locks
      if (++count % 50 === 0) await new Promise(resolve => setImmediate(resolve));

      const fullPath = path.join(dirPath, entry.name);
      const cleanName = this.cleanFileName(entry.name);
      const isSinTitulo = /sin t[ií]tulo/i.test(cleanName);
      if (isSinTitulo) {
        continue;
      }

      if (entry.isDirectory()) {
        // Check if this folder is a pre-processed HLS movie (has index.m3u8)
        const m3u8Path = await this._findM3u8(fullPath);
        if (m3u8Path) {
          try {
            const stat = await fs.promises.stat(fullPath);
            if (Date.now() - stat.mtimeMs < 15 * 60 * 1000) {
              console.log(`⏳ [MediaScanner] Carpeta de Película "${entry.name}" está subiéndose (actividad reciente). Se omitirá por ahora.`);
              continue;
            }
            results.push({
              fileName: entry.name,
              cleanName: this.cleanFileName(entry.name),
              filePath: fullPath,
              fileSize: stat.size,
              extension: 'HLS',
              lastModified: stat.mtime,
              alreadyImported: importedPaths.has(fullPath),
              contentType: 'MOVIE',
              episode: { m3u8Path, season: 1, episodeNumber: 1, tmdbSeriesId: null, seriesFolderName: '' } // Hack to pass m3u8Path
            });
          } catch { /* skip */ }
        } else {
          await this._scanMoviesRecursive(fullPath, results, importedPaths, currentDepth + 1, maxDepth);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.promises.stat(fullPath);
            if (Date.now() - stat.mtimeMs < 15 * 60 * 1000) {
              console.log(`⏳ [MediaScanner] Película "${entry.name}" está subiéndose (actividad reciente). Se omitirá por ahora.`);
              continue;
            }
            results.push({
              fileName: entry.name,
              cleanName: this.cleanFileName(entry.name),
              filePath: fullPath,
              fileSize: stat.size,
              extension: ext.replace('.', '').toUpperCase(),
              lastModified: stat.mtime,
              alreadyImported: importedPaths.has(fullPath),
              contentType: 'MOVIE'
            });
          } catch { /* skip */ }
        }
      }
    }
  }

  /**
   * Series scanner: looks for:
   *   1. Episode FOLDERS containing index.m3u8/video.m3u8 (pre-processed HLS — imported as COMPLETED)
   *   2. Raw video files (.mkv, .mp4, etc.) inside series subfolders (enqueued for FFmpeg processing)
   *
   * Supported structures:
   *   /series/{tmdbId}_{name}/temporada N/{tmdbId}_S{s}E{e}/index.m3u8  ← pre-processed HLS
   *   /series/{name}/temp 1/Series T01-05.mkv                            ← raw video → FFmpeg
   *   /series/{name}/Season 1/S01E05.mkv                                 ← raw video → FFmpeg
   */
  private static async _scanSeriesRecursive(
    dirPath: string, results: ScannedFile[], importedPaths: Set<string>,
    seriesFolderName: string, currentDepth: number, maxDepth: number
  ): Promise<boolean> {
    if (currentDepth > maxDepth) return false;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dirPath, { withFileTypes: true }); }
    catch (err: any) { console.warn(`[MediaScanner] Cannot read ${dirPath}: ${err.message}`); return false; }

    let foundMedia = false;

    let count = 0;
    for (const entry of entries) {
      if (++count % 50 === 0) await new Promise(resolve => setImmediate(resolve));

      const fullPath = path.join(dirPath, entry.name);
      const cleanName = this.cleanFileName(entry.name);
      const isSinTitulo = /sin t[ií]tulo/i.test(cleanName);
      if (isSinTitulo) {
        continue;
      }

      if (entry.isDirectory()) {
        // Check if this folder is a pre-processed HLS episode (has index.m3u8)
        const m3u8Path = await this._findM3u8(fullPath, 0, 0);
        if (m3u8Path) {
          const parentDirName = path.basename(dirPath);
          let seasonMatch = parentDirName.match(/[Tt]emp(?:orada)?\s*(\d+)/i) || entry.name.match(/[Tt]emp(?:orada)?\s*(\d+)/i) || entry.name.match(/[Ss](\d+)/i);
          let episodeMatch = entry.name.match(/[Ee]p(?:isodio)?\s*(\d+)/i) || entry.name.match(/[Ee](\d+)/i);
          
          let seInfo = parseSeasonEpisode(entry.name) || parseSeasonEpisodeFromFilename(entry.name);
          if (seasonMatch && episodeMatch) {
            seInfo = { season: parseInt(seasonMatch[1], 10), episode: parseInt(episodeMatch[1], 10) };
          } else if (seasonMatch && seInfo) {
            seInfo.season = parseInt(seasonMatch[1], 10);
          } else if (episodeMatch && seInfo) {
            seInfo.episode = parseInt(episodeMatch[1], 10);
          }
          const tmdbSeriesId = parseTmdbId(seriesFolderName || entry.name);
          const stat = await fs.promises.stat(fullPath);
          results.push({
            fileName: entry.name,
            cleanName: this.cleanFileName(entry.name),
            filePath: fullPath,
            fileSize: stat.size,
            extension: 'HLS',
            lastModified: stat.mtime,
            alreadyImported: importedPaths.has(fullPath),
            contentType: 'SERIES',
            episode: {
              m3u8Path,
              season: seInfo?.season ?? 1,
              episodeNumber: seInfo?.episode ?? 1,
              tmdbSeriesId,
              seriesFolderName: seriesFolderName || entry.name
            }
          });
          foundMedia = true;
        } else {
          // Go deeper. At depth 0 this is the series root folder name.
            const nextSeriesFolder = currentDepth === 0 ? entry.name : seriesFolderName;
            const startIndex = results.length;
            const subFound = await this._scanSeriesRecursive(fullPath, results, importedPaths, nextSeriesFolder, currentDepth + 1, maxDepth);
            if (subFound) {
              if (currentDepth === 0) {
                let activelyUploading = false;
                const now = Date.now();
                for (let i = startIndex; i < results.length; i++) {
                  if (now - results[i].lastModified.getTime() < 15 * 60 * 1000) {
                    activelyUploading = true;
                    break;
                  }
                }
                if (activelyUploading) {
                  console.log(`⏳ [MediaScanner] Serie "${entry.name}" está en subida activa (actividad en últimos 15 min). Se omitirá por seguridad para no separar episodios.`);
                  results.splice(startIndex, results.length - startIndex);
                }
              }
              foundMedia = true;
            } else if (currentDepth === 0) {
              // It's a root series folder and nothing was found inside! It is empty!
              const stat = await fs.promises.stat(fullPath).catch(() => ({ mtime: new Date(), size: 0 }));
              results.push({
                fileName: entry.name,
                cleanName: this.cleanFileName(entry.name),
                filePath: fullPath,
                fileSize: 0,
                extension: 'VACÍA',
                lastModified: stat.mtime,
                alreadyImported: false,
                contentType: 'SERIES'
              });
            }
          }
        } else if (entry.isFile() && currentDepth > 0) {
        // Raw video file inside a series subdirectory — needs FFmpeg processing
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          try {
            const stat = await fs.promises.stat(fullPath);
            const parentDirName = path.basename(dirPath);
            let seasonMatch = parentDirName.match(/[Tt]emp(?:orada)?\s*(\d+)/i) || parentDirName.match(/[Ss](\d+)/i);
            
            const seInfo = parseSeasonEpisode(entry.name) || parseSeasonEpisodeFromFilename(entry.name);
            if (seasonMatch && seInfo) {
              seInfo.season = parseInt(seasonMatch[1], 10);
            }

            const tmdbSeriesId = parseTmdbId(seriesFolderName || '');
            results.push({
              fileName: entry.name,
              cleanName: this.cleanFileName(entry.name),
              filePath: fullPath,
              fileSize: stat.size,
              extension: ext.replace('.', '').toUpperCase(),
              lastModified: stat.mtime,
              alreadyImported: importedPaths.has(fullPath),
              contentType: 'SERIES',
              episode: {
                m3u8Path: '', // empty = needs FFmpeg processing
                season: seInfo?.season ?? 1,
                episodeNumber: seInfo?.episode ?? 1,
                tmdbSeriesId,
                seriesFolderName: seriesFolderName || path.basename(dirPath)
              }
            });
            foundMedia = true;
          } catch { /* skip unreadable files */ }
        }
      }
    }
    return foundMedia;
  }

  /** Find index.m3u8 / video.m3u8 / master.m3u8 up to maxDepth levels deep inside a folder. */
  private static async _findM3u8(dirPath: string, depth = 0, maxDepth = 2): Promise<string | null> {
    if (depth > maxDepth) return null;
    let entries: string[];
    try { entries = await fs.promises.readdir(dirPath); }
    catch { return null; }

    for (const name of entries) {
      if (name === 'index.m3u8' || name === 'video.m3u8' || name === 'master.m3u8') {
        return path.join(dirPath, name);
      }
    }

    // Not found at this level — check subfolders
    if (depth < maxDepth) {
      for (const name of entries) {
        const sub = path.join(dirPath, name);
        try {
          const stat = await fs.promises.stat(sub);
          if (stat.isDirectory()) {
            const found = await this._findM3u8(sub, depth + 1, maxDepth);
            if (found) return found;
          }
        } catch { /* skip */ }
      }
    }
    return null;
  }

  // ── Import ────────────────────────────────────────────────────────────────

  static async importFile(filePath: string, contentType: 'MOVIE' | 'SERIES' = 'MOVIE', episode?: ScannedFile['episode']): Promise<ImportResult> {
    const fileName = path.basename(filePath);
    
    // Bloqueador GLOBAL de carpetas y archivos no deseados (basura numérica y "sin título")
    const cleanName = this.cleanFileName(fileName);
    const isSinTitulo = /sin t[ií]tulo/i.test(cleanName);
    if (isSinTitulo) {
      return { filePath, fileName, success: false, tmdbMatch: false, error: 'Título no deseado (sin título)' };
    }

    // Si es una carpeta vacía de una serie (no tiene episodio), la marcamos como fallida inmediatamente
    if (contentType === 'SERIES' && !episode) {
      const alreadyFailed = await prisma.videoFile.findFirst({ where: { originalPath: filePath, status: 'FAILED' } });
      if (!alreadyFailed) {
        await prisma.videoFile.create({
          data: {
            originalPath: filePath,
            status: 'FAILED',
            errorMessage: 'Carpeta de serie vacía o sin videos compatibles. Sube los archivos para procesarla.',
            fileSize: 0,
          }
        });
      }
      return { filePath, fileName, success: false, tmdbMatch: false, error: 'Carpeta vacía' };
    }

    // (Eliminado el bloque fs.promises.stat que fallaba para subcarpetas)

    let existingVideo = await prisma.videoFile.findFirst({ 
      where: { 
        originalPath: { equals: filePath, mode: 'insensitive' }
      },
      include: {
        content: true,
        episode: {
          include: {
            season: {
              include: { content: true }
            }
          }
        }
      }
    });

    // DETECCIÓN DE ARCHIVOS MOVIDOS:
    // Si el script del servidor movió el archivo a otra partición (ej. videos_subidos),
    // el filePath cambia pero el fileName suele ser idéntico. Lo buscamos y actualizamos la ruta.
    if (!existingVideo) {
      // Búsqueda 1: por nombre de carpeta/archivo al final de la ruta
      existingVideo = await prisma.videoFile.findFirst({
        where: { originalPath: { endsWith: `/${fileName}`, mode: 'insensitive' } },
        include: {
          content: true,
          episode: { include: { season: { include: { content: true } } } }
        }
      });

      // Búsqueda 2 (NUEVA): si el filePath es una CARPETA (peliculas HLS),
      // buscar cualquier videoFile cuyo contenido ya esté enlazado a ese mismo basePath.
      // Esto cubre el caso donde el usuario renombró la película en el panel pero
      // el nombre de carpeta en disco no cambió.
      if (!existingVideo) {
        const baseName = path.basename(filePath);
        existingVideo = await prisma.videoFile.findFirst({
          where: {
            originalPath: { contains: baseName, mode: 'insensitive' },
            status: { not: 'FAILED' }
          },
          include: {
            content: true,
            episode: { include: { season: { include: { content: true } } } }
          }
        });
        // Sólo usar este match si realmente apunta a un contenido válido activo
        if (existingVideo && existingVideo.content?.deletedAt !== null) {
          existingVideo = null;
        }
      }

      if (existingVideo) {
        console.log(`[MediaScanner] 🚚 Detectado archivo movido. Actualizando ruta en BD:\n   De: ${existingVideo.originalPath}\n   A:  ${filePath}`);
        await prisma.videoFile.update({ where: { id: existingVideo.id }, data: { originalPath: filePath } });
        existingVideo.originalPath = filePath;
      }
    }

    if (existingVideo) {
      let isOrphaned = false;
      if (existingVideo.type === 'MOVIE' && (!existingVideo.content || existingVideo.content.deletedAt !== null)) {
         isOrphaned = true;
      }
      if (existingVideo.type === 'EPISODE' && (!existingVideo.episode || !existingVideo.episode.season || !existingVideo.episode.season.content || existingVideo.episode.season.content.deletedAt !== null)) {
         isOrphaned = true;
      }

      if (isOrphaned) {
         console.log(`[MediaScanner] 🗑️ Limpiando registro de video huérfano (serie eliminada o sin enlazar) para re-escanearlo: ${fileName}`);
         await prisma.videoFile.delete({ where: { id: existingVideo.id } });
         // Al borrarlo, permitimos que el código de abajo lo importe como nuevo
      } else {
        if (existingVideo.status === 'FAILED') {
          // Retry failed processing jobs automatically if scanned again
          await prisma.videoFile.update({ where: { id: existingVideo.id }, data: { status: 'QUEUED' } });
          try {
            await addVideoJob({
              videoFileId: existingVideo.id,
              contentId: existingVideo.contentId || existingVideo.episodeId || '',
              type: existingVideo.type,
              videoPath: filePath
            });
          } catch (e) { /* skip if queue fails */ }
          return { filePath, fileName, success: true, tmdbMatch: false };
        }
        return { filePath, fileName, success: false, tmdbMatch: false, error: 'Este archivo ya fue importado' };
      }
    }

    try {
      if (contentType === 'SERIES' && episode) {
        if (episode.m3u8Path) {
          // Pre-processed HLS episode — register as COMPLETED directly
          return await this._importSeriesEpisode(filePath, fileName, episode);
        } else {
          // Raw video file in a series folder — needs FFmpeg processing
          return await this._importRawSeriesEpisode(filePath, fileName, episode);
        }
      }



      // --- MATCH INTELIGENTE POR NOMBRE DE CARPETA ---
      // Si el usuario ya editó o creó un título en el panel que se llama EXACTAMENTE como la carpeta,
      // lo enlazamos directo sin pelearnos con TMDB ni importar su tmdbId actual.
      const existingDbByFolderName = await prisma.content.findFirst({
        where: {
            translations: { some: { title: { equals: cleanName, mode: 'insensitive' } } },
            type: contentType,
            deletedAt: null
        }
      });

      if (existingDbByFolderName) {
          console.log(`[MediaScanner] 💡 Match inteligente por nombre de carpeta: Enlazando a "${cleanName}".`);
          if (episode?.m3u8Path) {
              const alreadyHasVideo = await prisma.videoFile.findFirst({
                  where: { contentId: existingDbByFolderName.id, status: { in: ['COMPLETED', 'PROCESSING', 'QUEUED'] } }
              });
              if (!alreadyHasVideo) {
                  const videoFile = await prisma.videoFile.create({
                      data: {
                          contentId: existingDbByFolderName.id,
                          type: 'MOVIE',
                          originalPath: filePath, // use folderPath for HLS
                          status: 'COMPLETED',
                          masterPlaylist: '',
                          hlsPath: path.dirname(episode.m3u8Path),
                          fileSize: BigInt(0),
                          sourceNode: env.WORKER_MODE || 'ALL'
                      }
                  });
                  const virtualMasterPath = `/api/stream/hls/${videoFile.id}/${path.basename(episode.m3u8Path)}`;
                  await prisma.videoFile.update({
                      where: { id: videoFile.id },
                      data: { masterPlaylist: virtualMasterPath, qualities: { create: [{ resolution: '720p', width: 1280, height: 720, bitrate: 2500000, playlistUrl: virtualMasterPath, codec: 'h264' }] } }
                  });
              }
              // Keep content status as PENDING for admin review
              return { filePath, fileName, success: true, contentId: existingDbByFolderName.id, tmdbMatch: true };
          } else {
              await this._createVideoAndEnqueue(existingDbByFolderName.id, filePath, contentType);
              return { filePath, fileName, success: true, contentId: existingDbByFolderName.id, tmdbMatch: true };
          }
      }
      // --- FIN MATCH INTELIGENTE ---

      if (episode?.m3u8Path) {
        // This is a pre-processed HLS movie folder
        return await this._importHLSMovie(filePath, fileName, episode.m3u8Path);
      }

      const explicitTmdbId = this.extractTmdbId(fileName);
      
      let tmdbResult;
      if (explicitTmdbId) {
          console.log(`[MediaScanner] 💡 Smart ID detectado en película: ${explicitTmdbId}`);
          tmdbResult = { bestMatch: { id: explicitTmdbId, title: cleanName }, confidence: 1 };
      } else {
          tmdbResult = await TMDBService.searchWithFallback(cleanName, 'es-ES', 'movie');
      }
      if (tmdbResult.bestMatch && tmdbResult.confidence >= 0.5) {
        return await this._importWithTMDB(filePath, fileName, tmdbResult.bestMatch, 'MOVIE');
      } else {
        return await this._importMinimal(filePath, fileName, cleanName, 'MOVIE');
      }
    } catch (error: any) {
      console.error(`[MediaScanner] Error importing ${fileName}:`, error.message);
      return { filePath, fileName, success: false, tmdbMatch: false, error: error.message };
    }
  }

  /**
   * Import a series episode that is ALREADY in HLS format.
   * Does NOT enqueue FFmpeg processing — just registers in DB pointing to existing m3u8.
   */
  private static async _importSeriesEpisode(
    episodeFolderPath: string,
    folderName: string,
    episode: NonNullable<ScannedFile['episode']>
  ): Promise<ImportResult> {
    // Derive relative m3u8 URL from the m3u8Path
    // e.g. /home/media/series/1399_xxx/temporada 1/1399_S01E01/index.m3u8
    // → we store it as-is and let the streaming module serve it
    const m3u8Url = episode.m3u8Path; // absolute path; the streaming service reads from MEDIA_PATH

    // Find or create the series content
    let contentId: string = '';
    let tmdbMatch = false;

    if (episode.tmdbSeriesId) {
      // Look up existing content by TMDB id first
      const existing = await prisma.content.findFirst({ where: { tmdbId: String(episode.tmdbSeriesId) } });
      if (existing) {
        contentId = existing.id;
        tmdbMatch = true;
      }
    }

    if (!contentId) {
      // MATCH INTELIGENTE POR NOMBRE DE CARPETA
      const seriesNameForMatch = this.cleanFileName(episode.seriesFolderName);
      const existingDbByFolderName = await prisma.content.findFirst({
          where: {
              translations: { some: { title: { equals: seriesNameForMatch, mode: 'insensitive' } } },
              type: { in: ['SERIES', 'ANIME', 'NOVELA'] },
              deletedAt: null
          }
      });

      if (existingDbByFolderName) {
          console.log(`[MediaScanner] 💡 Match inteligente por nombre de carpeta: Enlazando episodio a serie editada "${seriesNameForMatch}".`);
          contentId = existingDbByFolderName.id;
          tmdbMatch = true;
      }
    }

    if (!contentId && episode.tmdbSeriesId) {
        // Fetch from TMDB and create content
        try {
          const details = await TMDBService.getFullDetails(episode.tmdbSeriesId, 'tv');
          contentId = await this._createSeriesContent(details);
          tmdbMatch = true;
        } catch (err: any) {
          console.warn(`[MediaScanner] TMDB fetch failed for series ${episode.tmdbSeriesId}: ${err.message}`);
          contentId = await this._createMinimalSeriesContent(episode.seriesFolderName);
        }
    } else if (!contentId) {
      contentId = await this._createMinimalSeriesContent(episode.seriesFolderName);
    }

    // Find or create the Season (with retry for concurrency)
    let season;
    try {
      season = await prisma.season.upsert({
        where: { contentId_number: { contentId, number: episode.season } },
        update: {},
        create: {
          contentId,
          number: episode.season,
        }
      });
    } catch {
      season = await prisma.season.findUniqueOrThrow({
        where: { contentId_number: { contentId, number: episode.season } }
      });
    }

    // Find or create the Episode (with retry for concurrency)
    let episodeRecord;
    try {
      episodeRecord = await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: episode.episodeNumber } },
        update: {},
        create: {
          seasonId: season.id,
          number: episode.episodeNumber,
        }
      });
    } catch {
      episodeRecord = await prisma.episode.findUniqueOrThrow({
        where: { seasonId_number: { seasonId: season.id, number: episode.episodeNumber } }
      });
    }

    await this._syncEpisodeMetadata(
      episodeRecord.id,
      episode.tmdbSeriesId,
      episode.season,
      episode.episodeNumber
    );

    // Create VideoFile as COMPLETED (no processing needed)
    const videoFile = await prisma.videoFile.create({
      data: {
        contentId: null, // Episodes are linked via episodeId, not contentId directly
        episodeId: episodeRecord.id,
        type: 'EPISODE',
        originalPath: episodeFolderPath,
        status: 'COMPLETED',
        masterPlaylist: '', // Will be updated below
        hlsPath: path.dirname(episode.m3u8Path),
        fileSize: BigInt(0),
        sourceNode: env.WORKER_MODE || 'ALL',
      }
    });

    // Update with virtual path using the newly created ID
    const m3u8Filename = path.basename(m3u8Url);
    const virtualMasterPath = `/api/stream/hls/${videoFile.id}/${m3u8Filename}`;

    await prisma.videoFile.update({
      where: { id: videoFile.id },
      data: {
        masterPlaylist: virtualMasterPath,
        qualities: {
          create: [
            { 
              resolution: '720p', 
              width: 1280, 
              height: 720, 
              bitrate: 2500000, 
              playlistUrl: virtualMasterPath, 
              codec: 'h264' 
            }
          ]
        }
      }
    });

    // Keep the series marked as PENDING for admin review
    console.log(`📦 [MediaScanner] Registered series episode ${folderName} → contentId: ${contentId} (Kept PENDING for admin review)`);

    return { filePath: episodeFolderPath, fileName: folderName, success: true, contentId, tmdbMatch };
  }

  /**
   * Import a movie that is ALREADY in HLS format.
   * Does NOT enqueue FFmpeg processing.
   */
  private static async _importHLSMovie(folderPath: string, folderName: string, m3u8Url: string): Promise<ImportResult> {
    const cleanName = this.cleanFileName(folderName);

    // FIX: Check if this physical folder is already registered in the DB!
    // If we don't check this, renaming a movie in the panel causes the scanner to not find it by title/TMDB,
    // which results in creating a zombie duplicate movie and crashing on the VideoFile creation.
    let existingVideo = await prisma.videoFile.findFirst({
      where: { originalPath: { equals: folderPath, mode: 'insensitive' } },
      include: { content: true }
    });

    if (existingVideo) {
      if (existingVideo.type === 'MOVIE' && (!existingVideo.content || existingVideo.content.deletedAt !== null)) {
         console.log(`[MediaScanner] 🗑️ Limpiando registro de video HLS huérfano (película eliminada o sin enlazar) para re-escanearlo: ${folderName}`);
         await prisma.videoFile.delete({ where: { id: existingVideo.id } });
      } else {
         console.log(`⏭️  [MediaScanner] Skipping HLS movie "${folderName}" — already registered.`);
         return { filePath: folderPath, fileName: folderName, success: true, contentId: existingVideo.contentId!, tmdbMatch: true };
      }
    }

    let tmdbResult;
    const explicitTmdbId = this.extractTmdbId(folderName);

    if (explicitTmdbId) {
       // Mock the search result to force the TMDB flow to use this exact ID
       tmdbResult = { bestMatch: { id: explicitTmdbId }, confidence: 1 };
    } else {
       tmdbResult = await TMDBService.searchWithFallback(cleanName, 'es-ES', 'movie');
    }

    let contentId: string;
    let tmdbMatch = false;

    if (tmdbResult.bestMatch && tmdbResult.confidence >= 0.3) {
      // Find or create with TMDB
      const match = tmdbResult.bestMatch;
      let existing = await prisma.content.findFirst({ 
         where: { tmdbId: String(match.id), deletedAt: null },
         orderBy: { isPinned: 'desc' }
      });
      
      if (!existing) {
         existing = await prisma.content.findFirst({ 
            where: { tmdbId: String(match.id) },
            orderBy: { isPinned: 'desc' }
         });
         if (existing) {
            await prisma.content.update({ where: { id: existing.id }, data: { deletedAt: null } });
         }
      }

      if (existing) {
        contentId = existing.id;
        const alreadyHasVideo = await prisma.videoFile.findFirst({
            where: { contentId, status: { in: ['COMPLETED', 'PROCESSING', 'QUEUED'] } }
        });
        if (alreadyHasVideo) {
            console.log(`⏭️  [MediaScanner] Skipping "${folderName}" — already has a video file processing or completed.`);
            return { filePath: folderPath, fileName: folderName, success: true, tmdbMatch: true };
        }

        // Si el contenido está fijado pero le falta el VideoFile (ej: después de re-escanear),
        // SÍ se permite crear el VideoFile. Solo protegemos los METADATOS del Content, no el video.
        if (existing.isPinned) {
            console.log(`📌 [MediaScanner] Content "${folderName}" is PINNED — restoring missing VideoFile link (metadata untouched).`);
        }
      } else {
        const lockKey = `tmdb-${match.id}`;
        if (this.creatingContents.has(lockKey)) {
          contentId = await this.creatingContents.get(lockKey)!;
        } else {
          let details;
          try {
             details = await TMDBService.getFullDetails(match.id, 'movie');
          } catch (err: any) {
             // Si falla como película, intentamos verificar si es una serie
             try {
               const tvDetails = await TMDBService.getFullDetails(match.id, 'tv');
               console.log(`[MediaScanner] ⚠️ Ignorando ${cleanName}: Es una SERIE, pero se intentó escanear como PELÍCULA.`);
               await prisma.rejectedImport.create({
                 data: {
                   filePath: folderPath,
                   fileName: folderName,
                   reason: 'Es una serie, use el escáner de series',
                   tmdbId: String(match.id),
                   tmdbTitle: tvDetails.title || cleanName,
                   tmdbType: 'tv',
                   serverMode: env.WORKER_MODE || 'ALL'
                 }
               });
               return { filePath: folderPath, fileName: folderName, success: false, tmdbMatch: false, error: 'Es una serie, use el escáner de series' };
             } catch (err2: any) {
               if (/^\d+$/.test(cleanName)) {
                 console.log(`[MediaScanner] Saltando carpeta puramente numérica sin metadata en TMDB: ${cleanName}`);
                 return { filePath: folderPath, fileName: folderName, success: false, tmdbMatch: false, error: 'Título numérico sin TMDB' };
               }
               // Fallback minimal (solo si el nombre era texto normal)
               const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
               const content = await prisma.content.create({
                 data: {
                   type: 'MOVIE', status: 'PENDING', slug,
                   translations: { create: [{ language: 'es', title: cleanName, description: 'Sin sinopsis disponible.' }] }
                 }
               });
               contentId = content.id;
               details = null;
             }
          }

          if (details) {
            contentId = await this._createSeriesContent(details);
          }
        }
      }
      tmdbMatch = true;
    } else {
      // Minimal creation
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).substring(2, 6);
      const content = await prisma.content.create({
        data: {
          type: 'MOVIE', status: 'PENDING', slug,
          translations: { create: [{ language: 'es', title: cleanName, description: 'Sin sinopsis disponible.' }] }
        }
      });
      contentId = content.id;
    }

    const videoFile = await prisma.videoFile.create({
      data: {
        contentId: contentId!, // Tell TS it is definitely assigned
        type: 'MOVIE',
        originalPath: folderPath,
        status: 'COMPLETED',
        masterPlaylist: '', 
        hlsPath: path.dirname(m3u8Url),
        fileSize: BigInt(0),
        sourceNode: env.WORKER_MODE || 'ALL'
      }
    });

    const m3u8Filename = path.basename(m3u8Url);
    const virtualMasterPath = `/api/stream/hls/${videoFile.id}/${m3u8Filename}`;

    await prisma.videoFile.update({
      where: { id: videoFile.id },
      data: { 
        masterPlaylist: virtualMasterPath,
        qualities: {
          create: [
            { resolution: '720p', width: 1280, height: 720, bitrate: 2500000, playlistUrl: virtualMasterPath, codec: 'h264' }
          ]
        }
      }
    });

    // Keep the movie marked as PENDING for admin review

    return { filePath: folderPath, fileName: folderName, success: true, contentId: contentId!, tmdbMatch };
  }

  /**
   * Import a raw video file (mkv/mp4/etc.) that belongs to a series.
   * Creates season/episode records and enqueues for FFmpeg processing.
   */
  private static async _importRawSeriesEpisode(
    filePath: string,
    fileName: string,
    episode: NonNullable<ScannedFile['episode']>
  ): Promise<ImportResult> {
    // 💡 FIRST CHECK: If this file was already imported but FAILED, just re-queue it!
    const existingFailedVF = await prisma.videoFile.findFirst({
        where: { originalPath: filePath, status: 'FAILED' },
        include: { episode: { select: { season: { select: { contentId: true } } } } }
    });
    
    if (existingFailedVF && existingFailedVF.episodeId) {
        console.log(`[MediaScanner] 🔄 Re-encolando episodio previamente FALLIDO: ${fileName}`);
        
        await prisma.videoFile.update({
            where: { id: existingFailedVF.id },
            data: { status: 'QUEUED', processingJobId: null }
        });
        
        const job = await addVideoJob({
          videoFileId: existingFailedVF.id,
          contentId: existingFailedVF.episodeId, 
          type: 'EPISODE',
          videoPath: filePath
        });
        
        await prisma.videoFile.update({ where: { id: existingFailedVF.id }, data: { processingJobId: job.id } });
        
        return { filePath, fileName, success: true, contentId: existingFailedVF.episode?.season?.contentId || '', tmdbMatch: true };
    }

    let contentId: string;
    let tmdbMatch = false;

    const seriesKey = episode.tmdbSeriesId ? `tmdb-${episode.tmdbSeriesId}` : `folder-${episode.seriesFolderName}`;
    
    if (!this.resolvingSeries.has(seriesKey)) {
      const resolveSeries = async () => {
        if (episode.tmdbSeriesId) {
          const existing = await prisma.content.findFirst({ where: { tmdbId: String(episode.tmdbSeriesId) } });
          if (existing) {
            if (existing.isPinned) {
                console.log(`📌 [MediaScanner] Serie "${episode.tmdbSeriesId}" está fijada (PINNED). Se agregarán episodios faltantes pero no se sobrescribirán metadatos.`);
            }
            tmdbMatch = true;
            return existing.id;
          }
        }

        // MATCH INTELIGENTE POR NOMBRE DE CARPETA
        const seriesNameForMatch = this.cleanFileName(episode.seriesFolderName);
        const existingDbByFolderName = await prisma.content.findFirst({
            where: {
                translations: { some: { title: { equals: seriesNameForMatch, mode: 'insensitive' } } },
                type: { in: ['SERIES', 'ANIME', 'NOVELA'] },
                deletedAt: null
            }
        });

        if (existingDbByFolderName) {
            console.log(`[MediaScanner] 💡 Match inteligente por nombre de carpeta: Enlazando a serie editada "${seriesNameForMatch}".`);
            tmdbMatch = true;
            return existingDbByFolderName.id;
        }

        if (episode.tmdbSeriesId) {
          try {
            const details = await TMDBService.getFullDetails(episode.tmdbSeriesId, 'tv');
            const id = await this._createSeriesContent(details);
            tmdbMatch = true;
            return id;
          } catch (err: any) {
            // Verificar si el ID en realidad es de una película
            try {
               const movieDetails = await TMDBService.getFullDetails(episode.tmdbSeriesId, 'movie');
               console.warn(`[MediaScanner] ⚠️ Ignorando ID ${episode.tmdbSeriesId}: TMDB dice que es una PELÍCULA, pero se está subiendo como SERIE.`);
               
               await prisma.rejectedImport.create({
                 data: {
                   filePath,
                   fileName,
                   reason: 'Es una película, use el escáner de películas',
                   tmdbId: String(episode.tmdbSeriesId),
                   tmdbTitle: movieDetails.title || fileName,
                   tmdbType: 'movie',
                   serverMode: env.WORKER_MODE || 'ALL'
                 }
               });
               return null;
            } catch (err2: any) {
               console.warn(`[MediaScanner] TMDB fetch failed for series ${episode.tmdbSeriesId}: ${err.message}`);
               return await this._createMinimalSeriesContent(episode.seriesFolderName);
            }
          }
        } else {
          const seriesName = this.cleanFileName(episode.seriesFolderName);
        const explicitTmdbId = this.extractTmdbId(episode.seriesFolderName);
        let tmdbResult;
        
        if (explicitTmdbId) {
            console.log(`[MediaScanner] 💡 Smart ID detectado en serie: ${explicitTmdbId}`);
            tmdbResult = { bestMatch: { id: explicitTmdbId, name: seriesName }, confidence: 1 };
        } else {
            tmdbResult = await TMDBService.searchWithFallback(seriesName, 'es-ES', 'tv').catch(() => ({ bestMatch: null, confidence: 0 }));
        }
          if (tmdbResult.bestMatch && tmdbResult.confidence >= 0.5) {
            const mediaType = (tmdbResult.bestMatch as any).media_type === 'movie' ? 'movie' : 'tv';
            
            if (mediaType === 'movie') {
               console.warn(`[MediaScanner] ⚠️ Ignorando ${seriesName}: TMDB dice que es una PELÍCULA, pero se está subiendo como SERIE.`);
               
               await prisma.rejectedImport.create({
                 data: {
                   filePath,
                   fileName,
                   reason: 'Es una película, use el escáner de películas',
                   tmdbId: String(tmdbResult.bestMatch.id),
                   tmdbTitle: (tmdbResult.bestMatch as any).title || seriesName,
                   tmdbType: 'movie',
                   serverMode: env.WORKER_MODE || 'ALL'
                 }
               });
               return null; // Return null to trigger fallback
            }

            const details = await TMDBService.getFullDetails(tmdbResult.bestMatch.id, mediaType as 'movie' | 'tv');
            tmdbMatch = true;
            return await this._createSeriesContent(details);
          } else {
            return await this._createMinimalSeriesContent(episode.seriesFolderName);
          }
        }
      };
      this.resolvingSeries.set(seriesKey, resolveSeries().catch(() => null).finally(() => this.resolvingSeries.delete(seriesKey)));
    }

    const resolvedContentId = await this.resolvingSeries.get(seriesKey);
    if (!resolvedContentId) {
       return { filePath, fileName, success: false, tmdbMatch: false, error: 'Rechazado: El contenido es una película, no una serie.' };
    }
    contentId = resolvedContentId;
    // tmdbMatch state might be slightly off if resolved by another promise, but that's acceptable for the scan summary

    // Find or create the Season (with retry for concurrency on upsert)
    let season;
    try {
      season = await prisma.season.upsert({
        where: { contentId_number: { contentId, number: episode.season } },
        update: {},
        create: { contentId, number: episode.season }
      });
    } catch {
      // If unique constraint failed, it was just created by another concurrent episode
      season = await prisma.season.findUniqueOrThrow({ where: { contentId_number: { contentId, number: episode.season } } });
    }

    // Find or create the Episode
    let episodeRecord;
    try {
      episodeRecord = await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: episode.episodeNumber } },
        update: {},
        create: { seasonId: season.id, number: episode.episodeNumber }
      });
    } catch {
      episodeRecord = await prisma.episode.findUniqueOrThrow({ where: { seasonId_number: { seasonId: season.id, number: episode.episodeNumber } } });
    }



    await this._syncEpisodeMetadata(
      episodeRecord.id,
      episode.tmdbSeriesId,
      episode.season,
      episode.episodeNumber
    );

    // Skip if this episode already has a video processing or completed — protect finished content
    const existingCompletedVF = await prisma.videoFile.findFirst({
      where: { episodeId: episodeRecord.id, status: { in: ['COMPLETED', 'PROCESSING', 'QUEUED'] } }
    });
    if (existingCompletedVF) {
      console.log(`⏭️  [MediaScanner] Skipping S${episode.season}E${episode.episodeNumber} of "${episode.seriesFolderName}" — already has a COMPLETED video.`);
      return { filePath, fileName, success: true, contentId, tmdbMatch };
    }

    // Manual Upsert: Find first, then update or create to avoid Prisma client unique constraint errors
    let videoFile = await prisma.videoFile.findFirst({ where: { originalPath: filePath } });

    if (videoFile) {
        videoFile = await prisma.videoFile.update({
            where: { id: videoFile.id },
            data: {
                contentId: null,
                episodeId: episodeRecord.id,
                type: 'EPISODE'
            }
        });
    } else {
        videoFile = await prisma.videoFile.create({
            data: {
                contentId: null,
                episodeId: episodeRecord.id,
                type: 'EPISODE',
                originalPath: filePath,
                status: 'QUEUED',
                fileSize: BigInt(fs.statSync(filePath).size),
                sourceNode: env.WORKER_MODE || 'ALL'
            }
        });
    }

    if (videoFile.status === 'QUEUED' && !videoFile.processingJobId) {
        const job = await addVideoJob({
          videoFileId: videoFile.id,
          contentId: episodeRecord.id, // worker uses this as the "owner" id
          type: 'EPISODE',
          videoPath: filePath
        });
        await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    }

    console.log(`📦 [MediaScanner] Enqueued raw series episode ${fileName} → S${episode.season}E${episode.episodeNumber} of "${episode.seriesFolderName}" (contentId: ${contentId})`);

    return { filePath, fileName, success: true, contentId, tmdbMatch };
  }

  private static async _createSeriesContent(details: TMDBFullDetails): Promise<string> {
    const lockKey = `tmdb-${details.tmdbId}`;
    if (this.creatingContents.has(lockKey)) return this.creatingContents.get(lockKey)!;

    const creationPromise = (async () => {
        // 1. Double check existence by TMDB ID (safety)
        let existing = await prisma.content.findFirst({ 
           where: { tmdbId: String(details.tmdbId), deletedAt: null },
           orderBy: { isPinned: 'desc' }
        });
        
        if (!existing) {
           existing = await prisma.content.findFirst({ 
              where: { tmdbId: String(details.tmdbId) },
              orderBy: { isPinned: 'desc' }
           });
           if (existing) {
              await prisma.content.update({ where: { id: existing.id }, data: { deletedAt: null } });
           }
        }

        if (existing) {
          // If already ACTIVE, never overwrite metadata — protect manual edits
          if (existing.status === 'ACTIVE') return existing.id;
          return existing.id;
        }

        // 2. Check by imdbId to avoid unique constraint crash
        if (details.imdbId) {
            let existingByImdb = await prisma.content.findFirst({ 
               where: { imdbId: details.imdbId, deletedAt: null },
               orderBy: { isPinned: 'desc' }
            });
            if (!existingByImdb) {
                existingByImdb = await prisma.content.findFirst({ 
                   where: { imdbId: details.imdbId },
                   orderBy: { isPinned: 'desc' }
                });
                if (existingByImdb) {
                    await prisma.content.update({ where: { id: existingByImdb.id }, data: { deletedAt: null } });
                }
            }

            if (existingByImdb) {
                // Link tmdbId if missing, but don't overwrite metadata if ACTIVE
                if (!existingByImdb.tmdbId)
                    await prisma.content.update({ where: { id: existingByImdb.id }, data: { tmdbId: String(details.tmdbId) } });
                return existingByImdb.id;
            }
        }

        // 3. Double check existence by title and type
        const existingByTitle = await prisma.content.findFirst({
            where: {
                translations: { some: { title: { equals: details.title, mode: 'insensitive' } } },
                type: details.type,
                deletedAt: null
            }
        });
        if (existingByTitle) {
            await prisma.content.update({ where: { id: existingByTitle.id }, data: { tmdbId: String(details.tmdbId) } });
            return existingByTitle.id;
        }

        const baseSlug = details.title.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const slug = baseSlug + '-' + Math.random().toString(36).substring(2, 6);
        const genreIds = Array.from(new Set(await this._matchGenres(details.genres)));
        const actorIds = Array.from(new Set(await this._matchActors(details.actors)));
        const directorIds = Array.from(new Set(await this._matchDirectors(details.directors)));

        let content: any;
        const createData = {
            type: details.type,
            status: 'PENDING' as any,
            slug,
            releaseYear: details.releaseYear,
            originalTitle: details.originalTitle || null,
            duration: details.duration,
            rating: details.rating,
            tmdbId: String(details.tmdbId),
            imdbId: details.imdbId,
            country: details.country,
            languages: details.languages || [],
            originalLanguage: details.originalLanguage || null,
            budget: details.budget ? BigInt(Math.floor(details.budget)) : null,
            revenue: details.revenue ? BigInt(Math.floor(details.revenue)) : null,
            isAdult: details.isAdult || false,
            translations: { create: [{ language: 'es', title: details.title, description: details.synopsis }] },
            genres: genreIds.length > 0 ? { create: genreIds.map((gId: string) => ({ genreId: gId })) } : undefined,
            actors: actorIds.length > 0 ? { create: actorIds.map((aId: string, idx: number) => ({ actorId: aId, order: idx })) } : undefined,
            directors: directorIds.length > 0 ? { create: directorIds.map((dId: string) => ({ directorId: dId })) } : undefined,
        };

        try {
            content = await prisma.content.create({ data: createData });
        } catch (err: any) {
            if (err.message?.includes('imdbId') || err.code === 'P2002') {
                console.warn(`[MediaScanner] TMDB ID ${details.tmdbId} failed due to duplicate imdbId (${details.imdbId}). Creating without imdbId...`);
                createData.imdbId = null as any;
                content = await prisma.content.create({ data: createData });
            } else {
                throw err;
            }
        }
        await this._downloadTMDBImages(content.id, details);
        return content.id;
    })();

    this.creatingContents.set(lockKey, creationPromise);
    try { return await creationPromise; } finally { this.creatingContents.delete(lockKey); }
  }

  private static async _createMinimalSeriesContent(seriesFolderName: string): Promise<string> {
    const cleanName = this.cleanFileName(seriesFolderName);
    const lockKey = `minimal-${cleanName.toLowerCase()}`;
    if (this.creatingContents.has(lockKey)) return this.creatingContents.get(lockKey)!;

    const creationPromise = (async () => {
        // Check if it already exists by title
        const existing = await prisma.content.findFirst({
            where: {
                translations: { some: { title: { equals: cleanName, mode: 'insensitive' } } },
                type: 'SERIES',
                deletedAt: null
            }
        });
        if (existing) return existing.id;

        const slug = cleanName.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
            + '-' + Math.random().toString(36).substring(2, 6);
        const content = await prisma.content.create({
            data: {
                type: 'SERIES', status: 'PENDING', slug,
                translations: { create: [{ language: 'es', title: cleanName, description: '' }] }
            }
        });
        return content.id;
    })();

    this.creatingContents.set(lockKey, creationPromise);
    try { return await creationPromise; } finally { this.creatingContents.delete(lockKey); }
  }

  private static async _importWithTMDB(filePath: string, fileName: string, tmdbMatch: any, contentType: 'MOVIE' | 'SERIES'): Promise<ImportResult> {
    const mediaType = tmdbMatch.media_type === 'tv' ? 'tv' : tmdbMatch.media_type === 'movie' ? 'movie' : (tmdbMatch.title ? 'movie' : 'tv');
    
    // Si el escáner es de películas, pero el resultado de TMDB es una serie, rechazar
    if (contentType === 'MOVIE' && mediaType === 'tv') {
      console.log(`[MediaScanner] ⚠️ Ignorando ${fileName}: Es una SERIE, pero se intentó escanear como PELÍCULA.`);
      await prisma.rejectedImport.create({
        data: {
          filePath: filePath,
          fileName: fileName,
          reason: 'Es una serie, use el escáner de series',
          tmdbId: String(tmdbMatch.id),
          tmdbTitle: tmdbMatch.name || tmdbMatch.title || fileName,
          tmdbType: mediaType,
          serverMode: env.WORKER_MODE || 'ALL'
        }
      });
      return { filePath, fileName, success: false, tmdbMatch: false, error: 'Es una serie, use el escáner de series' };
    }

    // Si el escáner es de series, pero el resultado de TMDB es una película, rechazar
    if (contentType === 'SERIES' && mediaType === 'movie') {
      console.log(`[MediaScanner] ⚠️ Ignorando ${fileName}: Es una PELÍCULA, pero se intentó escanear como SERIE.`);
      await prisma.rejectedImport.create({
        data: {
          filePath: filePath,
          fileName: fileName,
          reason: 'Es una película, use el escáner de películas',
          tmdbId: String(tmdbMatch.id),
          tmdbTitle: tmdbMatch.title || tmdbMatch.name || fileName,
          tmdbType: mediaType,
          serverMode: env.WORKER_MODE || 'ALL'
        }
      });
      return { filePath, fileName, success: false, tmdbMatch: false, error: 'Es una película, use el escáner de películas' };
    }

    let details;
    try {
      details = await TMDBService.getFullDetails(tmdbMatch.id, mediaType as 'movie' | 'tv');
    } catch (err: any) {
      if (err.response?.status === 404 || err.isAxiosError) {
        // Retry with the opposite type if TMDB couldn't find it (ID mismatch between tv/movie)
        const fallbackType = mediaType === 'movie' ? 'tv' : 'movie';
        try {
          details = await TMDBService.getFullDetails(tmdbMatch.id, fallbackType);
        } catch (err2: any) {
          // Both types returned 404 or failed — TMDB match was a false positive.
          // Fall back to minimal import so the file is still registered in the DB.
          console.warn(`[MediaScanner] TMDB ID ${tmdbMatch.id} not found as '${mediaType}' nor '${fallbackType}'. Importing minimally: ${fileName}`);
          const cleanName = this.cleanFileName(fileName);
          return await this._importMinimal(filePath, fileName, cleanName, contentType);
        }
      } else {
        throw err;
      }
    }

    const movieKey = `tmdb-${details.tmdbId}`;
    
    if (!this.resolvingMovies.has(movieKey)) {
      const resolveMovie = async () => {
        const existingContent = await prisma.content.findFirst({ where: { tmdbId: String(details.tmdbId) } });
        if (existingContent) {
          if (existingContent.deletedAt) {
            await prisma.content.update({ where: { id: existingContent.id }, data: { deletedAt: null } });
          }
          return existingContent.id;
        } else {
          return await this._createSeriesContent(details); // Note: handles both series and movie creation
        }
      };
      this.resolvingMovies.set(movieKey, resolveMovie().finally(() => this.resolvingMovies.delete(movieKey)));
    }

    const contentId = await this.resolvingMovies.get(movieKey);
    if (!contentId) throw new Error('Failed to resolve movie content ID');

    await this._createVideoAndEnqueue(contentId, filePath, contentType);
    return { filePath, fileName, success: true, contentId, tmdbMatch: true };
  }

  private static async _importMinimal(filePath: string, fileName: string, cleanName: string, contentType: 'MOVIE' | 'SERIES'): Promise<ImportResult> {
    const lockKey = `minimal-${contentType}-${cleanName.toLowerCase()}`;
    
    if (!this.creatingContents.has(lockKey)) {
      const resolveMinimal = async () => {
        const existingByTitle = await prisma.content.findFirst({
          where: {
            translations: { some: { title: { equals: cleanName, mode: 'insensitive' } } },
            type: contentType === 'SERIES' ? 'SERIES' : 'MOVIE',
            deletedAt: null
          }
        });

        if (existingByTitle) {
          return existingByTitle.id;
        } else {
          const slug = cleanName.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
            + '-' + Math.random().toString(36).substring(2, 6);

          const content = await prisma.content.create({
            data: {
              type: contentType === 'SERIES' ? 'SERIES' : 'MOVIE',
              status: 'PENDING', slug,
              translations: { create: [{ language: 'es', title: cleanName, description: '' }] }
            }
          });
          return content.id;
        }
      };
      this.creatingContents.set(lockKey, resolveMinimal().finally(() => this.creatingContents.delete(lockKey)));
    }

    const contentId = await this.creatingContents.get(lockKey);
    if (!contentId) throw new Error('Failed to create minimal content');

    await this._createVideoAndEnqueue(contentId, filePath, contentType);
    return { filePath, fileName, success: true, contentId, tmdbMatch: false };
  }

  private static creatingVideos = new Map<string, Promise<void>>();

  private static async _createVideoAndEnqueue(contentId: string, filePath: string, contentType: 'MOVIE' | 'SERIES'): Promise<void> {
    const lockKey = `video-${filePath}`;
    if (this.creatingVideos.has(lockKey)) {
        return this.creatingVideos.get(lockKey);
    }

    const resolveVideo = async () => {
        const existing = await prisma.videoFile.findFirst({ where: { originalPath: filePath } });
        if (existing) {
            console.log(`⏭️  [MediaScanner] Skipping duplicate enqueue for ${filePath}`);
            return;
        }

        if (contentType === 'MOVIE') {
            const existingMovieVideo = await prisma.videoFile.findFirst({
                where: { contentId, type: 'MOVIE' }
            });
            if (existingMovieVideo) {
                console.log(`⏭️  [MediaScanner] MOVIE ${contentId} already has a video. Skipping ${filePath}`);
                return;
            }
        }

        const fileName = path.basename(filePath);
    let episodeId: string | null = null;

    if (contentType === 'SERIES') {
      // 1. Parse Season/Episode from filename (e.g. S01E01)
      const seInfo = parseSeasonEpisode(fileName) || { season: 1, episode: 1 };
      
      // 2. Find or Create Season
      const season = await prisma.season.upsert({
        where: { contentId_number: { contentId, number: seInfo.season } },
        update: {},
        create: { contentId, number: seInfo.season }
      });

      const episode = await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: seInfo.episode } },
        update: {},
        create: { seasonId: season.id, number: seInfo.episode }
      });
      episodeId = episode.id;

      const parentContent = await prisma.content.findUnique({
        where: { id: contentId },
        select: { tmdbId: true }
      });
      const tmdbSeriesId = parentContent?.tmdbId ? parseInt(parentContent.tmdbId, 10) : null;
      await this._syncEpisodeMetadata(episode.id, tmdbSeriesId, seInfo.season, seInfo.episode);

      const existingEpVideo = await prisma.videoFile.findFirst({
        where: { episodeId: episode.id }
      });
      if (existingEpVideo) {
         console.log(`⏭️  [MediaScanner] EPISODE ${episode.id} already has a video. Skipping ${filePath}`);
         return;
      }
    }

    const videoFile = await prisma.videoFile.create({
      data: {
        contentId: contentType === 'MOVIE' ? contentId : null,
        episodeId,
        type: contentType === 'SERIES' ? 'EPISODE' : 'MOVIE',
        originalPath: filePath,
        status: 'QUEUED',
        fileSize: BigInt(fs.statSync(filePath).size)
      }
    });

    const job = await addVideoJob({ 
      videoFileId: videoFile.id, 
      contentId: contentType === 'SERIES' && episodeId ? episodeId : contentId, 
      type: videoFile.type, // Must be 'MOVIE' or 'EPISODE' to match WORKER_MODE filter
      videoPath: filePath 
    });

    await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    console.log(`📦 [MediaScanner] Enqueued ${fileName} → ${contentType === 'SERIES' ? 'Episode ' + episodeId : 'Content ' + contentId}`);
    };

    const promise = resolveVideo().finally(() => this.creatingVideos.delete(lockKey));
    this.creatingVideos.set(lockKey, promise);
    return promise;
  }

  private static async _downloadTMDBImages(contentId: string, details: TMDBFullDetails): Promise<void> {
    const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
    if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

    // Use absolute URL so in a multi-server setup the frontend fetches from the
    // correct storage node (Series server, Movies server, etc.) instead of Cerebro.
    const baseUrl = env.BACKEND_URL.replace(/\/$/, '');

    try {
      if (details.posterPath) {
        await TMDBService.downloadImage(details.posterPath, path.join(mediaFolder, 'poster.jpg'));
        await prisma.thumbnail.create({ data: { contentId, type: 'POSTER', url: `${baseUrl}/media/thumbnails/${contentId}/poster.jpg`, width: 500, height: 750 } });
      }
      if (details.backdropPath) {
        await TMDBService.downloadImage(details.backdropPath, path.join(mediaFolder, 'backdrop.jpg'));
        await prisma.thumbnail.create({ data: { contentId, type: 'BACKDROP', url: `${baseUrl}/media/thumbnails/${contentId}/backdrop.jpg`, width: 1920, height: 1080 } });
      }
    } catch (err: any) { console.warn(`[MediaScanner] Image download error for ${contentId}: ${err.message}`); }
  }

  private static async _matchGenres(names: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      let genre = await prisma.genre.findFirst({ where: { OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug }] } });
      if (!genre) { try { genre = await prisma.genre.create({ data: { name, slug } }); } catch { genre = await prisma.genre.findFirst({ where: { slug } }); } }
      if (genre) ids.push(genre.id);
    }
    return ids;
  }

  private static async _matchActors(actors: TMDBFullDetails['actors']): Promise<string[]> {
    const ids: string[] = [];
    for (const a of actors.slice(0, 10)) {
      let actor = await prisma.actor.findFirst({ where: { tmdbId: a.tmdbId } });
      if (!actor) { try { actor = await prisma.actor.create({ data: { name: a.name, photoUrl: a.photoUrl, tmdbId: a.tmdbId } }); } catch { actor = await prisma.actor.findFirst({ where: { tmdbId: a.tmdbId } }); } }
      if (actor) ids.push(actor.id);
    }
    return ids;
  }

  private static async _matchDirectors(directors: TMDBFullDetails['directors']): Promise<string[]> {
    const ids: string[] = [];
    for (const d of directors) {
      let director = await prisma.director.findFirst({ where: { tmdbId: d.tmdbId } });
      if (!director) { try { director = await prisma.director.create({ data: { name: d.name, photoUrl: d.photoUrl, tmdbId: d.tmdbId } }); } catch { director = await prisma.director.findFirst({ where: { tmdbId: d.tmdbId } }); } }
      if (director) ids.push(director.id);
    }
    return ids;
  }

  private static async _syncEpisodeMetadata(
    episodeId: string,
    tmdbSeriesId: number | null,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<void> {
    try {
      let episodeTitle = `Episodio ${episodeNumber}`;
      let episodeOverview = '';
      let stillPath: string | null = null;
      let duration: number | null = null;

      if (tmdbSeriesId) {
        const epDetails = await TMDBService.getEpisodeDetails(tmdbSeriesId, seasonNumber, episodeNumber);
        if (epDetails) {
          episodeTitle = epDetails.name || episodeTitle;
          episodeOverview = epDetails.overview || '';
          stillPath = epDetails.still_path || null;
          duration = epDetails.runtime ? epDetails.runtime * 60 : null;
        }
      }

      const existingTrans = await prisma.episodeTranslation.findUnique({
        where: { episodeId_language: { episodeId, language: 'es' } }
      });

      if (!existingTrans) {
        await prisma.episodeTranslation.create({
          data: {
            episodeId,
            language: 'es',
            title: episodeTitle,
            description: episodeOverview
          }
        });
      }

      if (duration) {
        await prisma.episode.update({
          where: { id: episodeId },
          data: { duration }
        });
      }

      if (stillPath) {
        const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', 'episodes', episodeId);
        if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

        const localStillPath = path.join(mediaFolder, 'still.jpg');
        const baseUrl = env.BACKEND_URL.replace(/\/$/, '');
        const virtualStillUrl = `${baseUrl}/media/thumbnails/episodes/${episodeId}/still.jpg`;

        const existingThumb = await prisma.thumbnail.findFirst({
          where: { episodeId, type: 'STILL' }
        });

        if (!existingThumb) {
          await TMDBService.downloadImage(stillPath, localStillPath);
          await prisma.thumbnail.create({
            data: {
              episodeId,
              type: 'STILL',
              url: virtualStillUrl,
              width: 1280,
              height: 720
            }
          });
        }
      }
    } catch (err: any) {
      console.warn(`[MediaScanner] Failed to sync episode metadata: ${err.message}`);
    }
  }

  static async batchImport(
    files: { filePath: string; contentType: 'MOVIE' | 'SERIES'; episode?: ScannedFile['episode'] }[],
    onProgress?: (current: number, total: number, result: ImportResult) => void
  ): Promise<{ results: ImportResult[]; summary: { total: number; success: number; withTMDB: number; incomplete: number; errors: number } }> {
    const results: ImportResult[] = [];
    const batchSize = 3;
    const total = files.length;

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(f => this.importFile(f.filePath, f.contentType, f.episode))
      );
      for (const r of batchResults) {
        const result = r.status === 'fulfilled' ? r.value : { filePath: '', fileName: '', success: false, tmdbMatch: false, error: (r.reason as Error).message };
        results.push(result);
        if (onProgress) onProgress(results.length, total, result);
      }
      if (i + batchSize < files.length) await new Promise(resolve => setTimeout(resolve, 500));
    }

    const summary = {
      total: results.length,
      success: results.filter(r => r.success).length,
      withTMDB: results.filter(r => r.success && r.tmdbMatch).length,
      incomplete: results.filter(r => r.success && !r.tmdbMatch).length,
      errors: results.filter(r => !r.success).length
    };
    return { results, summary };
  }
}
