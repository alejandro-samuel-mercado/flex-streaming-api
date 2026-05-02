import { prisma } from '../shared/config/prisma';
import { MediaScannerService } from '../modules/media-scanner/media-scanner.service';
import type { Server as SocketIOServer } from 'socket.io';

/**
 * Auto Scanner Worker
 * 
 * Runs on a configurable interval (read from SiteConfig).
 * Scans the configured directory for new video files and auto-imports them.
 * Uses setInterval instead of BullMQ since this is a periodic task, not a queue job.
 */
export class AutoScannerWorker {
  private static intervalHandle: ReturnType<typeof setInterval> | null = null;
  private static isRunning = false;
  private static io: SocketIOServer | null = null;

  /**
   * Start the auto scanner worker.
   * Reads config from SiteConfig every check to support dynamic changes.
   */
  static start(io?: SocketIOServer): void {
    this.io = io || null;

    // Check every 60 seconds if we need to scan
    this.intervalHandle = setInterval(() => {
      this._tick();
    }, 60_000);

    console.log('🔍 [AutoScanner] Worker started — checking every 60s for scan schedule');
  }

  /**
   * Stop the auto scanner worker.
   */
  static stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log('🔍 [AutoScanner] Worker stopped');
  }

  /**
   * Force a scan immediately (called from API or internally).
   */
  static async forceScan(): Promise<void> {
    await this._executeScan();
  }

  /**
   * Internal tick — reads config and decides whether to scan.
   */
  private static async _tick(): Promise<void> {
    if (this.isRunning) return; // Skip if already scanning

    try {
      const configs = await prisma.siteConfig.findMany({
        where: {
          key: { in: ['AUTO_SCAN_ENABLED', 'AUTO_SCAN_PATH', 'AUTO_SCAN_INTERVAL', 'AUTO_SCAN_LAST_RUN'] }
        }
      });

      const configMap = Object.fromEntries(configs.map(c => [c.key, c.value]));

      // Check if enabled
      if (configMap['AUTO_SCAN_ENABLED'] !== 'true') return;

      // Check if path is configured
      const scanPath = configMap['AUTO_SCAN_PATH'];
      if (!scanPath) return;

      // Check interval
      const intervalMinutes = parseInt(configMap['AUTO_SCAN_INTERVAL'] || '30');
      const lastRun = configMap['AUTO_SCAN_LAST_RUN'];

      if (lastRun) {
        const lastRunTime = new Date(lastRun).getTime();
        const now = Date.now();
        const elapsedMinutes = (now - lastRunTime) / 60_000;

        if (elapsedMinutes < intervalMinutes) return; // Not time yet
      }

      // Time to scan!
      await this._executeScan();
    } catch (error: any) {
      console.error('[AutoScanner] Tick error:', error.message);
    }
  }

  /**
   * Execute the actual scan and import process.
   */
  private static async _executeScan(): Promise<void> {
    if (this.isRunning) {
      console.log('[AutoScanner] Scan already in progress, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // Read current path config
      const pathConfig = await prisma.siteConfig.findUnique({
        where: { key: 'AUTO_SCAN_PATH' }
      });

      if (!pathConfig?.value) {
        console.log('[AutoScanner] No scan path configured');
        return;
      }

      const scanPath = pathConfig.value;
      console.log(`🔍 [AutoScanner] Starting auto-scan of: ${scanPath}`);

      // Emit status to connected admins
      this.io?.emit('auto-scan-update', { status: 'scanning', path: scanPath });

      // Scan directory
      const files = await MediaScannerService.scanDirectory(scanPath);
      const newFiles = files.filter(f => !f.alreadyImported);

      console.log(`🔍 [AutoScanner] Found ${files.length} total files, ${newFiles.length} new`);

      if (newFiles.length === 0) {
        await this._saveResult('No se encontraron archivos nuevos', 0, 0, 0);
        this.io?.emit('auto-scan-update', { status: 'idle', newFiles: 0 });
        return;
      }

      // Import new files
      const filePaths = newFiles.map(f => f.filePath);
      const { summary } = await MediaScannerService.batchImport(filePaths, (current, total, result) => {
        this.io?.emit('auto-scan-update', {
          status: 'importing',
          current,
          total,
          lastFile: result.fileName,
          tmdbMatch: result.tmdbMatch
        });
      });

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const resultMessage = `Completado en ${elapsed}s: ${summary.success} importados (${summary.withTMDB} con TMDB, ${summary.incomplete} incompletos), ${summary.errors} errores`;

      console.log(`🔍 [AutoScanner] ${resultMessage}`);

      await this._saveResult(resultMessage, summary.success, summary.incomplete, summary.errors);

      this.io?.emit('auto-scan-update', {
        status: 'completed',
        summary,
        elapsed
      });

    } catch (error: any) {
      console.error('[AutoScanner] Scan error:', error.message);
      await this._saveResult(`Error: ${error.message}`, 0, 0, 0);
      this.io?.emit('auto-scan-update', { status: 'error', error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Save scan results and timestamp to SiteConfig.
   */
  private static async _saveResult(
    message: string,
    success: number,
    incomplete: number,
    errors: number
  ): Promise<void> {
    const now = new Date().toISOString();

    await Promise.all([
      prisma.siteConfig.upsert({
        where: { key: 'AUTO_SCAN_LAST_RUN' },
        update: { value: now },
        create: { key: 'AUTO_SCAN_LAST_RUN', value: now }
      }),
      prisma.siteConfig.upsert({
        where: { key: 'AUTO_SCAN_LAST_RESULT' },
        update: { value: JSON.stringify({ message, success, incomplete, errors, timestamp: now }) },
        create: { key: 'AUTO_SCAN_LAST_RESULT', value: JSON.stringify({ message, success, incomplete, errors, timestamp: now }) }
      })
    ]);
  }
}
