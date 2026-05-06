import { prisma } from '../shared/config/prisma';
import { MediaScannerService } from '../modules/media-scanner/media-scanner.service';
import type { Server as SocketIOServer } from 'socket.io';

/**
 * Auto Scanner Worker
 *
 * Runs on a configurable interval (read from SiteConfig).
 * Scans the configured movie and/or series directories for new files/episodes
 * and auto-imports them.
 */
export class AutoScannerWorker {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;
  private static isRunning = false;
  private static io: SocketIOServer | null = null;

  static start(io?: SocketIOServer): void {
    this.io = io || null;
    this.intervalHandle = setInterval(() => { this._tick(); }, 60_000);
    console.log('🔍 [AutoScanner] Worker started — checking every 60s for scan schedule');
  }

  static stop(): void {
    if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; }
    console.log('🔍 [AutoScanner] Worker stopped');
  }

  static async forceScan(): Promise<void> {
    await this._executeScan();
  }

  private static async _tick(): Promise<void> {
    if (this.isRunning) return;
    try {
      const configs = await prisma.siteConfig.findMany({
        where: {
          key: {
            in: ['AUTO_SCAN_ENABLED', 'AUTO_SCAN_MOVIE_PATH', 'AUTO_SCAN_SERIES_PATH',
                 'AUTO_SCAN_INTERVAL', 'AUTO_SCAN_LAST_RUN',
                 // Legacy single-path key (kept for backwards compat)
                 'AUTO_SCAN_PATH']
          }
        }
      });
      const cfg = Object.fromEntries(configs.map(c => [c.key, c.value]));

      if (cfg['AUTO_SCAN_ENABLED'] !== 'true') return;

      const moviePath  = cfg['AUTO_SCAN_MOVIE_PATH']  || cfg['AUTO_SCAN_PATH'] || '';
      const seriesPath = cfg['AUTO_SCAN_SERIES_PATH'] || '';
      if (!moviePath && !seriesPath) return;

      const intervalMinutes = parseInt(cfg['AUTO_SCAN_INTERVAL'] || '30');
      const lastRun = cfg['AUTO_SCAN_LAST_RUN'];
      if (lastRun) {
        const elapsed = (Date.now() - new Date(lastRun).getTime()) / 60_000;
        if (elapsed < intervalMinutes) return;
      }

      await this._executeScan();
    } catch (error: any) {
      console.error('[AutoScanner] Tick error:', error.message);
    }
  }

  private static async _executeScan(): Promise<void> {
    if (this.isRunning) { console.log('[AutoScanner] Already running, skipping'); return; }
    this.isRunning = true;
    const startTime = Date.now();

    try {
      const configs = await prisma.siteConfig.findMany({
        where: { key: { in: ['AUTO_SCAN_MOVIE_PATH', 'AUTO_SCAN_SERIES_PATH', 'AUTO_SCAN_PATH'] } }
      });
      const cfg = Object.fromEntries(configs.map(c => [c.key, c.value]));

      const moviePath  = cfg['AUTO_SCAN_MOVIE_PATH']  || cfg['AUTO_SCAN_PATH'] || '';
      const seriesPath = cfg['AUTO_SCAN_SERIES_PATH'] || '';

      if (!moviePath && !seriesPath) {
        console.log('[AutoScanner] No scan paths configured');
        return;
      }

      console.log(`🔍 [AutoScanner] Scanning — movies: "${moviePath}", series: "${seriesPath}"`);
      this.io?.emit('auto-scan-update', { status: 'scanning', moviePath, seriesPath });

      const files = await MediaScannerService.scanDirectories(
        moviePath || undefined,
        seriesPath || undefined
      );
      const newFiles = files.filter(f => !f.alreadyImported);

      console.log(`🔍 [AutoScanner] Found ${files.length} total, ${newFiles.length} new`);

      if (newFiles.length === 0) {
        await this._saveResult('No se encontraron archivos nuevos', 0, 0, 0);
        this.io?.emit('auto-scan-update', { status: 'idle', newFiles: 0 });
        return;
      }

      const toImport = newFiles.map(f => ({ filePath: f.filePath, contentType: f.contentType, episode: f.episode }));
      const { summary } = await MediaScannerService.batchImport(toImport, (current, total, result) => {
        this.io?.emit('auto-scan-update', { status: 'importing', current, total, lastFile: result.fileName, tmdbMatch: result.tmdbMatch });
      });

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const msg = `Completado en ${elapsed}s: ${summary.success} importados (${summary.withTMDB} con TMDB, ${summary.incomplete} incompletos), ${summary.errors} errores`;
      console.log(`🔍 [AutoScanner] ${msg}`);

      await this._saveResult(msg, summary.success, summary.incomplete, summary.errors);
      this.io?.emit('auto-scan-update', { status: 'completed', summary, elapsed });

    } catch (error: any) {
      console.error('[AutoScanner] Scan error:', error.message);
      await this._saveResult(`Error: ${error.message}`, 0, 0, 0);
      this.io?.emit('auto-scan-update', { status: 'error', error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  private static async _saveResult(message: string, success: number, incomplete: number, errors: number): Promise<void> {
    const now = new Date().toISOString();
    await Promise.all([
      prisma.siteConfig.upsert({ where: { key: 'AUTO_SCAN_LAST_RUN' }, update: { value: now }, create: { key: 'AUTO_SCAN_LAST_RUN', value: now } }),
      prisma.siteConfig.upsert({
        where: { key: 'AUTO_SCAN_LAST_RESULT' },
        update: { value: JSON.stringify({ message, success, incomplete, errors, timestamp: now }) },
        create: { key: 'AUTO_SCAN_LAST_RESULT', value: JSON.stringify({ message, success, incomplete, errors, timestamp: now }) }
      })
    ]);
  }
}
