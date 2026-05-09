/**
 * Backup Router — PeliPlus
 * All routes require ADMIN role.
 */

import { Router, Response, NextFunction, RequestHandler } from 'express';
import { authenticate, requireRole, AuthenticatedRequest } from '../../shared/middleware/auth.middleware';
import { ok } from '../../shared/utils/api-response';
import * as BackupService from './backup.service';
import { prisma } from '../../shared/config/prisma';

export const backupRouter = Router();

backupRouter.use(authenticate as RequestHandler);
backupRouter.use(requireRole('ADMIN') as RequestHandler);

/**
 * GET /api/admin/backup/list
 * Returns all available backup files with metadata
 */
backupRouter.get('/list', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const backups = BackupService.listBackups();
    const lastRun = await prisma.siteConfig.findUnique({ where: { key: 'BACKUP_LAST_RUN' } });
    ok(res, { backups, lastRun: lastRun?.value || null });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * POST /api/admin/backup/create
 * Creates a new manual backup right now
 */
backupRouter.post('/create', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const result = await BackupService.exportToJSON();
    await prisma.siteConfig.upsert({
      where: { key: 'BACKUP_LAST_RUN' },
      update: { value: new Date().toISOString() },
      create: { key: 'BACKUP_LAST_RUN', value: new Date().toISOString() },
    });
    ok(res, result);
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * POST /api/admin/backup/import
 * Imports a backup with mode: 'merge' | 'replace'
 * Body: { filename: string; mode: 'merge' | 'replace' }
 */
backupRouter.post('/import', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { filename, mode } = req.body;
    if (!filename || !['merge', 'replace'].includes(mode)) {
      res.status(400).json({ success: false, error: 'Se requiere filename y mode (merge | replace)' });
      return;
    }
    const result = await BackupService.importFromJSON(filename, mode);
    ok(res, result);
  } catch (err: any) {
    if (err.message === 'Backup file not found') {
      res.status(404).json({ success: false, error: 'Archivo de backup no encontrado' });
      return;
    }
    next(err);
  }
}) as RequestHandler);

/**
 * GET /api/admin/backup/download/:filename
 * Downloads the raw JSON backup file
 */
backupRouter.get('/download/:filename', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params;
    // Sanitize — only allow alphanumeric, dash, underscore, dot
    if (!/^[\w\-.]+\.json$/.test(filename)) {
      res.status(400).json({ success: false, error: 'Nombre de archivo inválido' });
      return;
    }
    const filepath = BackupService.getBackupPath(filename);
    res.download(filepath, filename);
  } catch (err: any) {
    if (err.message === 'Backup file not found') {
      res.status(404).json({ success: false, error: 'Archivo no encontrado' });
      return;
    }
    next(err);
  }
}) as RequestHandler);

/**
 * DELETE /api/admin/backup/:filename
 * Deletes a backup file
 */
backupRouter.delete('/:filename', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { filename } = req.params;
    if (!/^[\w\-.]+\.json$/.test(filename)) {
      res.status(400).json({ success: false, error: 'Nombre de archivo inválido' });
      return;
    }
    BackupService.deleteBackup(filename);
    ok(res, { deleted: filename });
  } catch (err: any) {
    if (err.message === 'Backup file not found') {
      res.status(404).json({ success: false, error: 'Archivo no encontrado' });
      return;
    }
    next(err);
  }
}) as RequestHandler);

/**
 * GET /api/admin/backup/settings
 * Returns current auto-backup configuration
 */
backupRouter.get('/settings', (async (_req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const configs = await prisma.siteConfig.findMany({
      where: {
        key: { in: ['BACKUP_AUTO_ENABLED', 'BACKUP_INTERVAL_HOURS', 'BACKUP_RETENTION_COUNT', 'BACKUP_LAST_RUN'] }
      }
    });
    const map = Object.fromEntries(configs.map(c => [c.key, c.value]));
    ok(res, {
      enabled: map['BACKUP_AUTO_ENABLED'] === 'true',
      intervalHours: parseInt(map['BACKUP_INTERVAL_HOURS'] || '24'),
      retentionCount: parseInt(map['BACKUP_RETENTION_COUNT'] || '10'),
      lastRun: map['BACKUP_LAST_RUN'] || null,
    });
  } catch (err) { next(err); }
}) as RequestHandler);

/**
 * PUT /api/admin/backup/settings
 * Updates auto-backup configuration and restarts the scheduler
 * Body: { enabled: boolean; intervalHours: number; retentionCount: number }
 */
backupRouter.put('/settings', (async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { enabled, intervalHours, retentionCount } = req.body;

    const updates = [
      { key: 'BACKUP_AUTO_ENABLED', value: String(!!enabled) },
      { key: 'BACKUP_INTERVAL_HOURS', value: String(Math.max(1, parseInt(intervalHours) || 24)) },
      { key: 'BACKUP_RETENTION_COUNT', value: String(Math.max(1, parseInt(retentionCount) || 10)) },
    ];

    for (const item of updates) {
      await prisma.siteConfig.upsert({
        where: { key: item.key },
        update: { value: item.value },
        create: { key: item.key, value: item.value },
      });
    }

    // Restart the scheduler with new settings
    await BackupService.startAutoBackupScheduler();

    ok(res, { updated: true, enabled, intervalHours, retentionCount });
  } catch (err) { next(err); }
}) as RequestHandler);
