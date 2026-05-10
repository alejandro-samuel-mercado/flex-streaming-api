/**
 * Backup Service — PeliPlus
 *
 * Exports and imports the database as structured JSON files.
 * Supports two import modes:
 *   - 'replace': wipes the target tables and re-inserts from backup
 *   - 'merge': upserts records, preserving existing data not in the backup
 *
 * Backups are stored in <MEDIA_PATH>/backups/ as JSON files.
 */

import fs from 'fs';
import path from 'path';
import { prisma } from '../../shared/config/prisma';
import { env } from '../../shared/config/env';

const BACKUP_DIR = path.join(env.MEDIA_PATH, 'backups');

export interface BackupMeta {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeMB: string;
  recordCounts: Record<string, number>;
  version: string;
}

export interface BackupData {
  version: string;
  exportedAt: string;
  recordCounts: Record<string, number>;
  data: {
    siteConfig: any[];
    subscriptionPlans: any[];
    creditPackages: any[];
    users: any[];
    endUserAccounts: any[];
    creditTransactions: any[];
    contents: any[];
    contentTranslations: any[];
    thumbnails: any[];
    seasons: any[];
    seasonTranslations: any[];
    episodes: any[];
    episodeTranslations: any[];
    genres: any[];
    platforms: any[];
  };
}

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export async function exportToJSON(): Promise<{ filename: string; meta: BackupMeta }> {
  ensureBackupDir();

  const [
    siteConfig,
    subscriptionPlans,
    creditPackages,
    users,
    endUserAccounts,
    creditTransactions,
    contents,
    contentTranslations,
    thumbnails,
    seasons,
    seasonTranslations,
    episodes,
    episodeTranslations,
    genres,
    platforms,
  ] = await Promise.all([
    prisma.siteConfig.findMany(),
    prisma.subscriptionPlan.findMany(),
    prisma.creditPackage.findMany(),
    // Exclude passwordHash for security (it's bcrypt, so safe, but good practice)
    prisma.user.findMany({
      select: {
        id: true, phone: true, username: true, name: true, role: true,
        isActive: true, credits: true, parentId: true, preferredLang: true,
        createdAt: true, updatedAt: true, deletedAt: true,
        googleId: true, appleId: true,
        // Include passwordHash for full restore capability
        passwordHash: true,
      }
    }),
    prisma.endUserAccount.findMany(),
    prisma.creditTransaction.findMany(),
    prisma.content.findMany(),
    prisma.contentTranslation.findMany(),
    prisma.thumbnail.findMany(),
    prisma.season.findMany(),
    prisma.seasonTranslation.findMany(),
    prisma.episode.findMany(),
    prisma.episodeTranslation.findMany(),
    prisma.genre.findMany(),
    prisma.platform.findMany(),
  ]);

  const recordCounts: Record<string, number> = {
    siteConfig: siteConfig.length,
    subscriptionPlans: subscriptionPlans.length,
    creditPackages: creditPackages.length,
    users: users.length,
    endUserAccounts: endUserAccounts.length,
    creditTransactions: creditTransactions.length,
    contents: contents.length,
    contentTranslations: contentTranslations.length,
    thumbnails: thumbnails.length,
    seasons: seasons.length,
    seasonTranslations: seasonTranslations.length,
    episodes: episodes.length,
    episodeTranslations: episodeTranslations.length,
    genres: genres.length,
    platforms: platforms.length,
  };

  const backup: BackupData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    recordCounts,
    data: {
      siteConfig,
      subscriptionPlans,
      creditPackages,
      users,
      endUserAccounts,
      creditTransactions,
      contents,
      contentTranslations,
      thumbnails,
      seasons,
      seasonTranslations,
      episodes,
      episodeTranslations,
      genres,
      platforms,
    },
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${timestamp}.json`;
  const filepath = path.join(BACKUP_DIR, filename);

  fs.writeFileSync(filepath, JSON.stringify(backup, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  , 2), 'utf-8');

  const stats = fs.statSync(filepath);
  const meta: BackupMeta = {
    filename,
    createdAt: backup.exportedAt,
    sizeBytes: stats.size,
    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
    recordCounts,
    version: backup.version,
  };

  // Enforce retention limit (from SiteConfig)
  await enforceRetentionLimit();

  return { filename, meta };
}

// ─── List ─────────────────────────────────────────────────────────────────────

export function listBackups(): BackupMeta[] {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith('backup_'))
    .sort()
    .reverse(); // Newest first

  return files.map(filename => {
    const filepath = path.join(BACKUP_DIR, filename);
    const stats = fs.statSync(filepath);
    try {
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as BackupData;
      return {
        filename,
        createdAt: content.exportedAt,
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        recordCounts: content.recordCounts,
        version: content.version,
      };
    } catch {
      return {
        filename,
        createdAt: stats.mtime.toISOString(),
        sizeBytes: stats.size,
        sizeMB: (stats.size / 1024 / 1024).toFixed(2),
        recordCounts: {},
        version: 'unknown',
      };
    }
  });
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export function deleteBackup(filename: string): void {
  const filepath = path.join(BACKUP_DIR, filename);
  if (!filepath.startsWith(BACKUP_DIR)) throw new Error('Invalid filename');
  if (!fs.existsSync(filepath)) throw new Error('Backup file not found');
  fs.unlinkSync(filepath);
}

// ─── Download ─────────────────────────────────────────────────────────────────

export function getBackupPath(filename: string): string {
  const filepath = path.join(BACKUP_DIR, filename);
  if (!filepath.startsWith(BACKUP_DIR)) throw new Error('Invalid filename');
  if (!fs.existsSync(filepath)) throw new Error('Backup file not found');
  return filepath;
}

// ─── Import ───────────────────────────────────────────────────────────────────

export async function importFromJSON(
  filename: string,
  mode: 'merge' | 'replace'
): Promise<{ mode: string; results: Record<string, { upserted: number; errors: number }> }> {
  const filepath = path.join(BACKUP_DIR, filename);
  if (!filepath.startsWith(BACKUP_DIR)) throw new Error('Invalid filename');
  if (!fs.existsSync(filepath)) throw new Error('Backup file not found');

  const raw = fs.readFileSync(filepath, 'utf-8');
  const backup: BackupData = JSON.parse(raw);

  const results: Record<string, { upserted: number; errors: number }> = {};

  if (mode === 'replace') {
    // Clear tables in safe reverse-dependency order
    await prisma.$transaction([
      prisma.episodeTranslation.deleteMany(),
      prisma.episode.deleteMany(),
      prisma.seasonTranslation.deleteMany(),
      prisma.season.deleteMany(),
      prisma.contentTranslation.deleteMany(),
      prisma.thumbnail.deleteMany(),
      prisma.creditTransaction.deleteMany(),
      prisma.endUserAccount.deleteMany(),
      prisma.content.deleteMany(),
      prisma.genre.deleteMany(),
      prisma.platform.deleteMany(),
      prisma.subscriptionPlan.deleteMany(),
      prisma.creditPackage.deleteMany(),
      prisma.siteConfig.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  }

  // Upsert all tables in dependency order
  results['siteConfig'] = await upsertMany(
    backup.data.siteConfig,
    (item) => prisma.siteConfig.upsert({ where: { key: item.key }, update: item, create: item })
  );

  results['genres'] = await upsertMany(
    backup.data.genres,
    (item) => prisma.genre.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['platforms'] = await upsertMany(
    backup.data.platforms,
    (item) => prisma.platform.upsert({ where: { id: item.id }, update: { ...item, updatedAt: new Date() }, create: item })
  );

  results['subscriptionPlans'] = await upsertMany(
    backup.data.subscriptionPlans,
    (item) => prisma.subscriptionPlan.upsert({ where: { id: item.id }, update: { ...item, updatedAt: new Date() }, create: item })
  );

  results['creditPackages'] = await upsertMany(
    backup.data.creditPackages,
    (item) => prisma.creditPackage.upsert({ where: { id: item.id }, update: { ...item, updatedAt: new Date() }, create: item })
  );

  results['users'] = await upsertMany(
    backup.data.users,
    (item) => prisma.user.upsert({
      where: { id: item.id },
      update: { ...item, updatedAt: new Date() },
      create: item
    })
  );

  results['endUserAccounts'] = await upsertMany(
    backup.data.endUserAccounts,
    (item) => prisma.endUserAccount.upsert({
      where: { id: item.id },
      update: { ...item, updatedAt: new Date() },
      create: item
    })
  );

  results['creditTransactions'] = await upsertMany(
    backup.data.creditTransactions,
    (item) => prisma.creditTransaction.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['contents'] = await upsertMany(
    backup.data.contents,
    (item) => {
      const { tmdbId, imdbId, ...rest } = item;
      return prisma.content.upsert({
        where: { id: item.id },
        update: { ...rest, updatedAt: new Date(), tmdbId: tmdbId || null, imdbId: imdbId || null },
        create: item
      });
    }
  );

  results['contentTranslations'] = await upsertMany(
    backup.data.contentTranslations,
    (item) => prisma.contentTranslation.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['thumbnails'] = await upsertMany(
    backup.data.thumbnails,
    (item) => prisma.thumbnail.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['seasons'] = await upsertMany(
    backup.data.seasons,
    (item) => prisma.season.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['seasonTranslations'] = await upsertMany(
    backup.data.seasonTranslations,
    (item) => prisma.seasonTranslation.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['episodes'] = await upsertMany(
    backup.data.episodes,
    (item) => prisma.episode.upsert({ where: { id: item.id }, update: item, create: item })
  );

  results['episodeTranslations'] = await upsertMany(
    backup.data.episodeTranslations,
    (item) => prisma.episodeTranslation.upsert({ where: { id: item.id }, update: item, create: item })
  );

  return { mode, results };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function upsertMany<T>(
  items: T[],
  upsertFn: (item: T) => Promise<any>
): Promise<{ upserted: number; errors: number }> {
  let upserted = 0;
  let errors = 0;

  // Optimized with parallel chunks to avoid timeouts
  const chunkSize = 15;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (item) => {
      try {
        await upsertFn(item);
        upserted++;
      } catch (err: any) {
        console.warn(`[Backup] Upsert error:`, err?.message);
        errors++;
      }
    }));
  }
  return { upserted, errors };
}

// ─── Retention ────────────────────────────────────────────────────────────────

async function enforceRetentionLimit() {
  const config = await prisma.siteConfig.findUnique({ where: { key: 'BACKUP_RETENTION_COUNT' } });
  const limit = parseInt(config?.value || '10');

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.json') && f.startsWith('backup_'))
    .sort(); // Oldest first

  if (files.length > limit) {
    const toDelete = files.slice(0, files.length - limit);
    toDelete.forEach(f => fs.unlinkSync(path.join(BACKUP_DIR, f)));
    console.log(`[Backup] Removed ${toDelete.length} old backup(s) to enforce retention limit of ${limit}`);
  }
}

// ─── Auto-Scheduler ───────────────────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

export async function startAutoBackupScheduler() {
  const config = await prisma.siteConfig.findMany({
    where: { key: { in: ['BACKUP_AUTO_ENABLED', 'BACKUP_INTERVAL_HOURS'] } }
  });
  const configMap = Object.fromEntries(config.map(c => [c.key, c.value]));

  const enabled = configMap['BACKUP_AUTO_ENABLED'] === 'true';
  const intervalHours = parseInt(configMap['BACKUP_INTERVAL_HOURS'] || '24');

  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  if (!enabled) {
    console.log('[Backup] Auto-backup is disabled');
    return;
  }

  const intervalMs = intervalHours * 60 * 60 * 1000;
  schedulerTimer = setInterval(async () => {
    try {
      console.log('[Backup] Running scheduled backup...');
      const { filename } = await exportToJSON();
      await prisma.siteConfig.upsert({
        where: { key: 'BACKUP_LAST_RUN' },
        update: { value: new Date().toISOString() },
        create: { key: 'BACKUP_LAST_RUN', value: new Date().toISOString() },
      });
      console.log(`[Backup] ✅ Scheduled backup created: ${filename}`);
    } catch (err) {
      console.error('[Backup] ❌ Scheduled backup failed:', err);
    }
  }, intervalMs);

  console.log(`[Backup] ✅ Auto-backup scheduler started (every ${intervalHours}h)`);
}

export function stopAutoBackupScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    console.log('[Backup] Auto-backup scheduler stopped');
  }
}
