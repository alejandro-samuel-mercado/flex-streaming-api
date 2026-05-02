import fs from 'fs';
import path from 'path';
import { prisma } from '../../shared/config/prisma';
import { TMDBService, TMDBFullDetails } from '../../services/tmdb.service';
import { addVideoJob } from '../../services/queue.service';
import { env } from '../../shared/config/env';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScannedFile {
  fileName: string;
  cleanName: string;
  filePath: string;
  fileSize: number;
  extension: string;
  lastModified: Date;
  alreadyImported: boolean;
}

export interface ImportResult {
  filePath: string;
  fileName: string;
  success: boolean;
  contentId?: string;
  tmdbMatch: boolean;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set([
  '.mkv', '.mp4', '.avi', '.webm', '.mov', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp', '.mxf', '.rmvb', '.vob'
]);

const NOISE_PATTERNS = [
  // Resolutions
  /\b(360p|480p|720p|1080p|2160p|4k|uhd)\b/gi,
  // Codecs
  /\b(x264|x265|h264|h265|hevc|avc|xvid|divx|av1)\b/gi,
  // Sources
  /\b(blu[\s-]?ray|bdrip|brrip|web[\s-]?dl|web[\s-]?rip|hdtv|dvdrip|hdrip|cam|ts|screener|r5)\b/gi,
  // Audio
  /\b(aac|ac3|dts|dd5\.?1|atmos|truehd|flac|mp3)\b/gi,
  // Groups/tags in brackets
  /\[.*?\]/g,
  /\(.*?\)/g,
  // File sizes
  /\b\d+(\.\d+)?\s*(gb|mb|tb)\b/gi,
  // Common release group patterns
  /[-\.]\w{2,10}$/g,
  // Year at end (but we extract it first)
  /\b(19|20)\d{2}\b/g,
  // Common separators -> spaces
  /[._]/g,
  // Multiple spaces
  /\s{2,}/g,
];

// ─── Service ─────────────────────────────────────────────────────────────────

export class MediaScannerService {

  /**
   * Get suggested directories from environment variable
   */
  static getSuggestedDirectories(): string[] {
    const dirs = env.MEDIA_SCAN_DIRS;
    if (!dirs) return [];
    return dirs
      .split(';')
      .map(d => d.trim())
      .filter(d => d.length > 0);
  }

  /**
   * Clean a file name for TMDB search.
   * Since user says files just have the movie/series name, we mostly
   * just strip the extension and clean up dots/underscores.
   */
  static cleanFileName(fileName: string): string {
    // Remove extension
    let clean = fileName.replace(/\.[^/.]+$/, '');

    // Apply noise patterns
    for (const pattern of NOISE_PATTERNS) {
      clean = clean.replace(pattern, ' ');
    }

    // Replace dots and underscores with spaces
    clean = clean.replace(/[._-]/g, ' ');

    // Remove multiple spaces and trim
    clean = clean.replace(/\s{2,}/g, ' ').trim();

    return clean;
  }

  /**
   * Scan a directory recursively (up to maxDepth levels) for video files
   */
  static async scanDirectory(dirPath: string, maxDepth: number = 3): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directorio no encontrado: ${dirPath}`);
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`La ruta no es un directorio: ${dirPath}`);
    }

    // Get all existing imported paths to filter duplicates
    const existingVideos = await prisma.videoFile.findMany({
      select: { originalPath: true }
    });
    const importedPaths = new Set(existingVideos.map(v => v.originalPath));

    this._scanRecursive(dirPath, files, importedPaths, 0, maxDepth);

    // Sort by name
    files.sort((a, b) => a.fileName.localeCompare(b.fileName));

    return files;
  }

  private static _scanRecursive(
    dirPath: string,
    results: ScannedFile[],
    importedPaths: Set<string>,
    currentDepth: number,
    maxDepth: number
  ): void {
    if (currentDepth > maxDepth) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (err: any) {
      console.warn(`[MediaScanner] Cannot read directory ${dirPath}: ${err.message}`);
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this._scanRecursive(fullPath, results, importedPaths, currentDepth + 1, maxDepth);
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
              alreadyImported: importedPaths.has(fullPath)
            });
          } catch (err: any) {
            console.warn(`[MediaScanner] Cannot stat file ${fullPath}: ${err.message}`);
          }
        }
      }
    }
  }

  /**
   * Import a single file: search TMDB, create content, enqueue video processing.
   */
  static async importFile(filePath: string): Promise<ImportResult> {
    const fileName = path.basename(filePath);
    const cleanName = this.cleanFileName(fileName);

    // Check if already imported
    const existingVideo = await prisma.videoFile.findFirst({
      where: { originalPath: filePath }
    });
    if (existingVideo) {
      return {
        filePath,
        fileName,
        success: false,
        tmdbMatch: false,
        error: 'Este archivo ya fue importado'
      };
    }

    try {
      // Search TMDB
      const tmdbResult = await TMDBService.searchWithFallback(cleanName);

      if (tmdbResult.bestMatch && tmdbResult.confidence >= 0.3) {
        // Good match — create content with full TMDB data
        return await this._importWithTMDB(filePath, fileName, tmdbResult.bestMatch);
      } else {
        // No match — create minimal content
        return await this._importMinimal(filePath, fileName, cleanName);
      }
    } catch (error: any) {
      console.error(`[MediaScanner] Error importing ${fileName}:`, error.message);
      return {
        filePath,
        fileName,
        success: false,
        tmdbMatch: false,
        error: error.message
      };
    }
  }

  /**
   * Import with full TMDB data
   */
  private static async _importWithTMDB(
    filePath: string,
    fileName: string,
    tmdbMatch: any
  ): Promise<ImportResult> {
    const mediaType = tmdbMatch.media_type === 'tv' ? 'tv' :
      tmdbMatch.media_type === 'movie' ? 'movie' :
        (tmdbMatch.title ? 'movie' : 'tv');

    // Get full details
    const details: TMDBFullDetails = await TMDBService.getFullDetails(
      tmdbMatch.id,
      mediaType as 'movie' | 'tv'
    );

    // Check if content with this tmdbId already exists
    const existingContent = await prisma.content.findFirst({
      where: { tmdbId: details.tmdbId }
    });

    let contentId: string;

    if (existingContent) {
      // Content exists but maybe from a different file — just add the video
      contentId = existingContent.id;
      
      // If it was soft-deleted, restore it so it shows up in the admin panel
      if (existingContent.deletedAt) {
        await prisma.content.update({
          where: { id: contentId },
          data: { deletedAt: null, status: 'PENDING' }
        });
      }
    } else {
      // Generate unique slug
      const baseSlug = details.title
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const slug = baseSlug + '-' + Math.random().toString(36).substring(2, 6);

      // Match genres
      const genreConnections = await this._matchGenres(details.genres);

      // Match actors
      const actorConnections = await this._matchActors(details.actors);

      // Match directors
      const directorConnections = await this._matchDirectors(details.directors);

      // Create content
      const content = await prisma.content.create({
        data: {
          type: details.type,
          status: 'PENDING', // Will become READY after video processing
          slug,
          releaseYear: details.releaseYear,
          duration: details.duration,
          rating: details.rating,
          tmdbId: details.tmdbId,
          imdbId: details.imdbId,
          country: details.country,
          languages: details.languages || [],
          translations: {
            create: [{
              language: 'es',
              title: details.title,
              description: details.synopsis
            }]
          },
          genres: genreConnections.length > 0 ? {
            create: genreConnections.map(gId => ({ genreId: gId }))
          } : undefined,
          actors: actorConnections.length > 0 ? {
            create: actorConnections.map((aId, idx) => ({ actorId: aId, order: idx }))
          } : undefined,
          directors: directorConnections.length > 0 ? {
            create: directorConnections.map(dId => ({ directorId: dId }))
          } : undefined,
        }
      });

      contentId = content.id;

      // Download and save images
      await this._downloadTMDBImages(contentId, details);
    }

    // Create VideoFile and enqueue processing
    await this._createVideoAndEnqueue(contentId, filePath);

    return {
      filePath,
      fileName,
      success: true,
      contentId,
      tmdbMatch: true
    };
  }

  /**
   * Import with minimal data (no TMDB match)
   */
  private static async _importMinimal(
    filePath: string,
    fileName: string,
    cleanName: string
  ): Promise<ImportResult> {
    const slug = cleanName
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      + '-' + Math.random().toString(36).substring(2, 6);

    const content = await prisma.content.create({
      data: {
        type: 'MOVIE', // Default, admin can change later
        status: 'PENDING',
        slug,
        translations: {
          create: [{
            language: 'es',
            title: cleanName,
            description: ''
          }]
        }
      }
    });

    // Create VideoFile and enqueue processing
    await this._createVideoAndEnqueue(content.id, filePath);

    return {
      filePath,
      fileName,
      success: true,
      contentId: content.id,
      tmdbMatch: false
    };
  }

  /**
   * Create VideoFile record and enqueue for HLS processing
   */
  private static async _createVideoAndEnqueue(contentId: string, filePath: string): Promise<void> {
    const videoFile = await prisma.videoFile.create({
      data: {
        contentId,
        type: 'MOVIE',
        originalPath: filePath,
        status: 'QUEUED',
        fileSize: BigInt(fs.statSync(filePath).size)
      }
    });

    const job = await addVideoJob({
      videoFileId: videoFile.id,
      contentId,
      type: 'MOVIE',
      videoPath: filePath
    });

    await prisma.videoFile.update({
      where: { id: videoFile.id },
      data: { processingJobId: job.id }
    });

    console.log(`📦 [MediaScanner] Enqueued video processing for ${path.basename(filePath)} → contentId: ${contentId}`);
  }

  /**
   * Download poster and backdrop from TMDB
   */
  private static async _downloadTMDBImages(contentId: string, details: TMDBFullDetails): Promise<void> {
    const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', contentId);
    if (!fs.existsSync(mediaFolder)) {
      fs.mkdirSync(mediaFolder, { recursive: true });
    }

    try {
      if (details.posterPath) {
        const posterFile = path.join(mediaFolder, 'poster.jpg');
        await TMDBService.downloadImage(details.posterPath, posterFile);
        await prisma.thumbnail.create({
          data: {
            contentId,
            type: 'POSTER',
            url: `/media/thumbnails/${contentId}/poster.jpg`,
            width: 500,
            height: 750
          }
        });
      }

      if (details.backdropPath) {
        const backdropFile = path.join(mediaFolder, 'backdrop.jpg');
        await TMDBService.downloadImage(details.backdropPath, backdropFile);
        await prisma.thumbnail.create({
          data: {
            contentId,
            type: 'BACKDROP',
            url: `/media/thumbnails/${contentId}/backdrop.jpg`,
            width: 1920,
            height: 1080
          }
        });
      }
    } catch (err: any) {
      console.warn(`[MediaScanner] Error downloading images for ${contentId}: ${err.message}`);
    }
  }

  /**
   * Match TMDB genre names to local Genre records (create if needed)
   */
  private static async _matchGenres(tmdbGenreNames: string[]): Promise<string[]> {
    const ids: string[] = [];
    for (const name of tmdbGenreNames) {
      const slug = name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      let genre = await prisma.genre.findFirst({
        where: {
          OR: [
            { name: { equals: name, mode: 'insensitive' } },
            { slug }
          ]
        }
      });

      if (!genre) {
        try {
          genre = await prisma.genre.create({
            data: { name, slug }
          });
        } catch {
          // Unique constraint — find again
          genre = await prisma.genre.findFirst({
            where: { slug }
          });
        }
      }

      if (genre) {
        ids.push(genre.id);
      }
    }
    return ids;
  }

  /**
   * Match/create actors by tmdbId
   */
  private static async _matchActors(
    tmdbActors: TMDBFullDetails['actors']
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const a of tmdbActors.slice(0, 10)) { // Limit to top 10
      let actor = await prisma.actor.findFirst({
        where: { tmdbId: a.tmdbId }
      });

      if (!actor) {
        try {
          actor = await prisma.actor.create({
            data: {
              name: a.name,
              photoUrl: a.photoUrl,
              tmdbId: a.tmdbId
            }
          });
        } catch {
          actor = await prisma.actor.findFirst({ where: { tmdbId: a.tmdbId } });
        }
      }

      if (actor) ids.push(actor.id);
    }
    return ids;
  }

  /**
   * Match/create directors by tmdbId
   */
  private static async _matchDirectors(
    tmdbDirectors: TMDBFullDetails['directors']
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const d of tmdbDirectors) {
      let director = await prisma.director.findFirst({
        where: { tmdbId: d.tmdbId }
      });

      if (!director) {
        try {
          director = await prisma.director.create({
            data: {
              name: d.name,
              photoUrl: d.photoUrl,
              tmdbId: d.tmdbId
            }
          });
        } catch {
          director = await prisma.director.findFirst({ where: { tmdbId: d.tmdbId } });
        }
      }

      if (director) ids.push(director.id);
    }
    return ids;
  }

  /**
   * Batch import multiple files
   */
  static async batchImport(
    filePaths: string[],
    onProgress?: (current: number, total: number, result: ImportResult) => void
  ): Promise<{ results: ImportResult[]; summary: { total: number; success: number; withTMDB: number; incomplete: number; errors: number } }> {
    const results: ImportResult[] = [];
    const batchSize = 3; // Process 3 at a time to not overwhelm TMDB API
    const total = filePaths.length;

    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(fp => this.importFile(fp))
      );

      for (const r of batchResults) {
        const result = r.status === 'fulfilled'
          ? r.value
          : { filePath: '', fileName: '', success: false, tmdbMatch: false, error: (r.reason as Error).message };
        results.push(result);

        if (onProgress) {
          onProgress(results.length, total, result);
        }
      }

      // Small delay between batches to respect TMDB rate limits
      if (i + batchSize < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
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
