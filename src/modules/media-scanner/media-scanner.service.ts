import fs from 'fs';
import path from 'path';
import { prisma } from '../../shared/config/prisma';
import { TMDBService, TMDBFullDetails } from '../../services/tmdb.service';
import { addVideoJob } from '../../services/queue.service';
import { env } from '../../shared/config/env';

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
  '.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp', '.mxf', '.rmvb', '.vob'
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
  const m = folderName.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Parse season and episode from folder names like "1399_S01E01".
 */
function parseSeasonEpisode(folderName: string): { season: number; episode: number } | null {
  const m = folderName.match(/[Ss](\d+)[Ee](\d+)/);
  if (!m) return null;
  return { season: parseInt(m[1], 10), episode: parseInt(m[2], 10) };
}

export class MediaScannerService {

  static getSuggestedDirectories(): string[] {
    const dirs = env.MEDIA_SCAN_DIRS;
    if (!dirs) return [];
    return dirs.split(';').map(d => d.trim()).filter(d => d.length > 0);
  }

  static cleanFileName(fileName: string): string {
    let clean = fileName.replace(/\.[^/.]+$/, '');
    for (const pattern of NOISE_PATTERNS) clean = clean.replace(pattern, ' ');
    clean = clean.replace(/[._-]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return clean;
  }

  /**
   * Scan both a movies folder (raw video files) and a series folder (already-HLS episodes).
   */
  static async scanDirectories(moviePath?: string, seriesPath?: string): Promise<ScannedFile[]> {
    const existingVideos = await prisma.videoFile.findMany({ select: { originalPath: true } });
    const importedPaths = new Set(existingVideos.map(v => v.originalPath));

    const allFiles: ScannedFile[] = [];

    if (moviePath && fs.existsSync(moviePath)) {
      const movieFiles: ScannedFile[] = [];
      this._scanMoviesRecursive(moviePath, movieFiles, importedPaths, 0, 2);
      allFiles.push(...movieFiles);
    }

    if (seriesPath && fs.existsSync(seriesPath)) {
      const seriesFiles: ScannedFile[] = [];
      this._scanSeriesRecursive(seriesPath, seriesFiles, importedPaths, '', 0, 6);
      allFiles.push(...seriesFiles);
    }

    allFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
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
      this._scanSeriesRecursive(dirPath, files, importedPaths, '', 0, 6);
    } else {
      this._scanMoviesRecursive(dirPath, files, importedPaths, 0, maxDepth);
    }
    files.sort((a, b) => a.fileName.localeCompare(b.fileName));
    return files;
  }

  // ── Private scanners ──────────────────────────────────────────────────────

  private static _scanMoviesRecursive(
    dirPath: string, results: ScannedFile[], importedPaths: Set<string>,
    currentDepth: number, maxDepth: number
  ): void {
    if (currentDepth > maxDepth) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
    catch (err: any) { console.warn(`[MediaScanner] Cannot read ${dirPath}: ${err.message}`); return; }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        this._scanMoviesRecursive(fullPath, results, importedPaths, currentDepth + 1, maxDepth);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
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
   * Series scanner: looks for episode FOLDERS containing index.m3u8 or video.m3u8.
   * Expected structure: /series/{tmdbId}_{name}/temporada N/{tmdbId}_S{s}E{e}/index.m3u8
   * The filePath stored is the episode folder path (used as the unique key).
   */
  private static _scanSeriesRecursive(
    dirPath: string, results: ScannedFile[], importedPaths: Set<string>,
    seriesFolderName: string, currentDepth: number, maxDepth: number
  ): void {
    if (currentDepth > maxDepth) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dirPath, { withFileTypes: true }); }
    catch (err: any) { console.warn(`[MediaScanner] Cannot read ${dirPath}: ${err.message}`); return; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const fullPath = path.join(dirPath, entry.name);

      // Detect if this directory is an episode folder (contains index.m3u8 or video.m3u8)
      const m3u8Path = this._findM3u8(fullPath);
      if (m3u8Path) {
        // This is an episode folder
        const seInfo = parseSeasonEpisode(entry.name);
        const tmdbSeriesId = parseTmdbId(seriesFolderName || entry.name);
        const stat = fs.statSync(fullPath);

        // key used to detect if already imported: episode folder path
        const key = fullPath;
        results.push({
          fileName: entry.name,
          cleanName: this.cleanFileName(entry.name),
          filePath: key,
          fileSize: stat.size,
          extension: 'HLS',
          lastModified: stat.mtime,
          alreadyImported: importedPaths.has(key),
          contentType: 'SERIES',
          episode: {
            m3u8Path,
            season: seInfo?.season ?? 1,
            episodeNumber: seInfo?.episode ?? 1,
            tmdbSeriesId,
            seriesFolderName: seriesFolderName || entry.name
          }
        });
      } else {
        // Not an episode — go deeper, passing the series folder name at depth 0
        const nextSeriesFolder = currentDepth === 0 ? entry.name : seriesFolderName;
        this._scanSeriesRecursive(fullPath, results, importedPaths, nextSeriesFolder, currentDepth + 1, maxDepth);
      }
    }
  }

  /** Find index.m3u8 or video.m3u8 directly inside a folder. */
  private static _findM3u8(dirPath: string): string | null {
    try {
      const entries = fs.readdirSync(dirPath);
      for (const name of entries) {
        if (name === 'index.m3u8' || name === 'video.m3u8') {
          return path.join(dirPath, name);
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  // ── Import ────────────────────────────────────────────────────────────────

  static async importFile(filePath: string, contentType: 'MOVIE' | 'SERIES' = 'MOVIE', episode?: ScannedFile['episode']): Promise<ImportResult> {
    const fileName = path.basename(filePath);

    const existingVideo = await prisma.videoFile.findFirst({ where: { originalPath: filePath } });
    if (existingVideo) {
      return { filePath, fileName, success: false, tmdbMatch: false, error: 'Este archivo ya fue importado' };
    }

    try {
      if (contentType === 'SERIES' && episode) {
        return await this._importSeriesEpisode(filePath, fileName, episode);
      }

      // Movie flow
      const cleanName = this.cleanFileName(fileName);
      const tmdbResult = await TMDBService.searchWithFallback(cleanName);
      if (tmdbResult.bestMatch && tmdbResult.confidence >= 0.3) {
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
    let contentId: string;
    let tmdbMatch = false;

    if (episode.tmdbSeriesId) {
      // Look up existing content by TMDB id first
      const existing = await prisma.content.findFirst({ where: { tmdbId: String(episode.tmdbSeriesId) } });
      if (existing) {
        contentId = existing.id;
        tmdbMatch = true;
      } else {
        // Fetch from TMDB and create content
        try {
          const details = await TMDBService.getFullDetails(episode.tmdbSeriesId, 'tv');
          contentId = await this._createSeriesContent(details);
          tmdbMatch = true;
        } catch (err: any) {
          console.warn(`[MediaScanner] TMDB fetch failed for series ${episode.tmdbSeriesId}: ${err.message}`);
          contentId = await this._createMinimalSeriesContent(episode.seriesFolderName);
        }
      }
    } else {
      contentId = await this._createMinimalSeriesContent(episode.seriesFolderName);
    }

    // Find or create the Season
    const season = await prisma.season.upsert({
      where: { contentId_number: { contentId, number: episode.season } },
      update: {},
      create: {
        contentId,
        number: episode.season,
      }
    });

    // Find or create the Episode
    const episodeRecord = await prisma.episode.upsert({
      where: { seasonId_number: { seasonId: season.id, number: episode.episodeNumber } },
      update: {},
      create: {
        seasonId: season.id,
        number: episode.episodeNumber,
      }
    });

    // Create VideoFile as COMPLETED (no processing needed)
    const videoFile = await prisma.videoFile.create({
      data: {
        contentId: null, // Episodes are linked via episodeId, not contentId directly
        episodeId: episodeRecord.id,
        type: 'EPISODE',
        originalPath: episodeFolderPath,
        status: 'COMPLETED',
        masterPlaylist: '', // Will be updated below
        hlsPath: episodeFolderPath,
        fileSize: BigInt(0),
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

    console.log(`📦 [MediaScanner] Registered series episode ${folderName} → contentId: ${contentId}`);

    return { filePath: episodeFolderPath, fileName: folderName, success: true, contentId, tmdbMatch };
  }

  private static async _createSeriesContent(details: TMDBFullDetails): Promise<string> {
    const baseSlug = details.title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const slug = baseSlug + '-' + Math.random().toString(36).substring(2, 6);
    const genreIds = await this._matchGenres(details.genres);
    const actorIds = await this._matchActors(details.actors);
    const directorIds = await this._matchDirectors(details.directors);

    const content = await prisma.content.create({
      data: {
        type: details.type,
        status: 'PENDING',
        slug,
        releaseYear: details.releaseYear,
        originalTitle: details.originalTitle || null,
        duration: details.duration,
        rating: details.rating,
        tmdbId: details.tmdbId,
        imdbId: details.imdbId,
        country: details.country,
        languages: details.languages || [],
        originalLanguage: details.originalLanguage || null,
        budget: details.budget ? BigInt(details.budget) : null,
        revenue: details.revenue ? BigInt(details.revenue) : null,
        isAdult: details.isAdult || false,
        translations: { create: [{ language: 'es', title: details.title, description: details.synopsis }] },
        genres: genreIds.length > 0 ? { create: genreIds.map(gId => ({ genreId: gId })) } : undefined,
        actors: actorIds.length > 0 ? { create: actorIds.map((aId, idx) => ({ actorId: aId, order: idx })) } : undefined,
        directors: directorIds.length > 0 ? { create: directorIds.map(dId => ({ directorId: dId })) } : undefined,
      }
    });
    await this._downloadTMDBImages(content.id, details);
    return content.id;
  }

  private static async _createMinimalSeriesContent(seriesFolderName: string): Promise<string> {
    const cleanName = this.cleanFileName(seriesFolderName);
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
  }

  private static async _importWithTMDB(filePath: string, fileName: string, tmdbMatch: any, contentType: 'MOVIE' | 'SERIES'): Promise<ImportResult> {
    const mediaType = tmdbMatch.media_type === 'tv' ? 'tv' : tmdbMatch.media_type === 'movie' ? 'movie' : (tmdbMatch.title ? 'movie' : 'tv');
    const details = await TMDBService.getFullDetails(tmdbMatch.id, mediaType as 'movie' | 'tv');

    const existingContent = await prisma.content.findFirst({ where: { tmdbId: details.tmdbId } });
    let contentId: string;

    if (existingContent) {
      contentId = existingContent.id;
      if (existingContent.deletedAt) {
        await prisma.content.update({ where: { id: contentId }, data: { deletedAt: null, status: 'PENDING' } });
      }
    } else {
      // Try to find by title before creating new
      const existingByTitle = await prisma.content.findFirst({
        where: {
          translations: { some: { title: { equals: details.title, mode: 'insensitive' } } },
          type: details.type,
          deletedAt: null
        }
      });

      if (existingByTitle) {
        contentId = existingByTitle.id;
        // Update existing with TMDB data
        await prisma.content.update({
          where: { id: contentId },
          data: {
            tmdbId: details.tmdbId,
            imdbId: details.imdbId,
            releaseYear: details.releaseYear,
            rating: details.rating,
            // ... add other relevant updates if needed
          }
        });
      } else {
        const baseSlug = details.title.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const slug = baseSlug + '-' + Math.random().toString(36).substring(2, 6);
        const genreIds = await this._matchGenres(details.genres);
        const actorIds = await this._matchActors(details.actors);
        const directorIds = await this._matchDirectors(details.directors);

        const content = await prisma.content.create({
          data: {
            type: details.type, status: 'PENDING', slug,
            releaseYear: details.releaseYear, originalTitle: details.originalTitle || null,
            duration: details.duration, rating: details.rating, tmdbId: details.tmdbId,
            imdbId: details.imdbId, country: details.country, languages: details.languages || [],
            originalLanguage: details.originalLanguage || null,
            budget: details.budget ? BigInt(Math.floor(details.budget)) : null,
            revenue: details.revenue ? BigInt(Math.floor(details.revenue)) : null,
            isAdult: details.isAdult || false,
            translations: { create: [{ language: 'es', title: details.title, description: details.synopsis }] },
            genres: genreIds.length > 0 ? { create: genreIds.map(gId => ({ genreId: gId })) } : undefined,
            actors: actorIds.length > 0 ? { create: actorIds.map((aId, idx) => ({ actorId: aId, order: idx })) } : undefined,
            directors: directorIds.length > 0 ? { create: directorIds.map(dId => ({ directorId: dId })) } : undefined,
          }
        });
        contentId = content.id;
        await this._downloadTMDBImages(contentId, details);
      }
    }

    await this._createVideoAndEnqueue(contentId, filePath, contentType);
    return { filePath, fileName, success: true, contentId, tmdbMatch: true };
  }

  private static async _importMinimal(filePath: string, fileName: string, cleanName: string, contentType: 'MOVIE' | 'SERIES'): Promise<ImportResult> {
    const existingByTitle = await prisma.content.findFirst({
      where: {
        translations: { some: { title: { equals: cleanName, mode: 'insensitive' } } },
        type: contentType === 'SERIES' ? 'SERIES' : 'MOVIE',
        deletedAt: null
      }
    });

    let contentId: string;

    if (existingByTitle) {
      contentId = existingByTitle.id;
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
      contentId = content.id;
    }

    await this._createVideoAndEnqueue(contentId, filePath, contentType);
    return { filePath, fileName, success: true, contentId, tmdbMatch: false };
  }

  private static async _createVideoAndEnqueue(contentId: string, filePath: string, contentType: 'MOVIE' | 'SERIES'): Promise<void> {
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

      // 3. Find or Create Episode
      const episode = await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: seInfo.episode } },
        update: {},
        create: { seasonId: season.id, number: seInfo.episode }
      });
      episodeId = episode.id;
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
      type: contentType, 
      videoPath: filePath 
    });

    await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    console.log(`📦 [MediaScanner] Enqueued ${fileName} → ${contentType === 'SERIES' ? 'Episode ' + episodeId : 'Content ' + contentId}`);
  }

  private static async _downloadTMDBImages(contentId: string, details: TMDBFullDetails): Promise<void> {
    const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
    if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });
    try {
      if (details.posterPath) {
        await TMDBService.downloadImage(details.posterPath, path.join(mediaFolder, 'poster.jpg'));
        await prisma.thumbnail.create({ data: { contentId, type: 'POSTER', url: `/media/thumbnails/${contentId}/poster.jpg`, width: 500, height: 750 } });
      }
      if (details.backdropPath) {
        await TMDBService.downloadImage(details.backdropPath, path.join(mediaFolder, 'backdrop.jpg'));
        await prisma.thumbnail.create({ data: { contentId, type: 'BACKDROP', url: `/media/thumbnails/${contentId}/backdrop.jpg`, width: 1920, height: 1080 } });
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
