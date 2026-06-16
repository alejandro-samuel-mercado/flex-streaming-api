#!/usr/bin/env node
/**
 * repair-series-tmdb.js
 *
 * 1. For series WITHOUT tmdbId: if title starts with a number, use it as TMDB ID directly.
 *    Otherwise search TMDB by title.
 * 2. For DUPLICATES (same TMDB already exists on another content):
 *    move all VideoFiles from the empty duplicate to the real content, then soft-delete the duplicate.
 *
 * Run on the Series server:
 *   node scripts/repair-series-tmdb.js
 */

require('dotenv').config();
const { PrismaClient } = require('../node_modules/@prisma/client');
const { TMDBService } = require('../dist/services/tmdb.service');
const { MediaScannerService } = require('../dist/modules/media-scanner/media-scanner.service');

const prisma = new PrismaClient();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/** Extract a TMDB numeric ID if the title starts with one, e.g. "43348 pablo escobar..." */
function extractTmdbIdFromTitle(title) {
  const m = title.match(/^(\d{4,7})\b/);
  return m ? parseInt(m[1], 10) : null;
}

async function applyTmdbData(contentId, details) {
  await prisma.content.update({
    where: { id: contentId },
    data: {
      tmdbId: String(details.tmdbId),
      imdbId: details.imdbId || undefined,
      releaseYear: details.releaseYear || undefined,
      originalTitle: details.originalTitle || undefined,
      duration: details.duration || undefined,
      rating: details.rating || undefined,
      country: details.country || undefined,
      languages: details.languages || [],
      originalLanguage: details.originalLanguage || undefined,
      isAdult: details.isAdult || false,
    }
  });

  const existing = await prisma.contentTranslation.findFirst({ where: { contentId, language: 'es' } });
  if (existing) {
    await prisma.contentTranslation.update({
      where: { id: existing.id },
      data: { title: details.title, description: details.synopsis || existing.description }
    });
  } else {
    await prisma.contentTranslation.create({
      data: { contentId, language: 'es', title: details.title, description: details.synopsis || '' }
    });
  }

  await MediaScannerService._downloadTMDBImages(contentId, details).catch(() => {});
}

async function main() {
  const seriesWithoutTmdb = await prisma.content.findMany({
    where: { type: { in: ['SERIES', 'ANIME'] }, tmdbId: null, deletedAt: null },
    include: {
      translations: { select: { title: true } },
      videoFiles: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n🔍 Found ${seriesWithoutTmdb.length} series without TMDB data.\n`);

  let fixed = 0, merged = 0, notFound = 0, errors = 0;

  for (const series of seriesWithoutTmdb) {
    const title = series.translations[0]?.title || '';
    const idx = fixed + merged + notFound + errors + 1;
    process.stdout.write(`[${idx}/${seriesWithoutTmdb.length}] "${title}" → `);

    if (!title) { errors++; console.log('No title'); continue; }

    try {
      let details = null;

      // Try direct lookup by numeric ID embedded in title (e.g. "43348 pablo escobar")
      const numericId = extractTmdbIdFromTitle(title);
      if (numericId) {
        try { details = await TMDBService.getFullDetails(numericId, 'tv'); } catch (_) {}
        if (!details) {
          try { details = await TMDBService.getFullDetails(numericId, 'movie'); } catch (_) {}
        }
      }

      // Fallback: text search
      if (!details) {
        const result = await TMDBService.searchWithFallback(title);
        if (result.bestMatch && result.confidence >= 0.3) {
          const mediaType = result.bestMatch.media_type === 'movie' ? 'movie' : 'tv';
          details = await TMDBService.getFullDetails(result.bestMatch.id, mediaType);
        }
      }

      if (!details) {
        console.log(`Not found in TMDB`);
        notFound++;
        await sleep(400);
        continue;
      }

      // Check for duplicate (another content already has this tmdbId)
      const canonical = await prisma.content.findFirst({
        where: { tmdbId: String(details.tmdbId), id: { not: series.id } }
      });

      if (canonical) {
        // Move VideoFiles to the canonical record and soft-delete duplicate
        if (series.videoFiles.length > 0) {
          await prisma.videoFile.updateMany({
            where: { id: { in: series.videoFiles.map(v => v.id) } },
            data: { contentId: canonical.id }
          });
        }
        await prisma.content.update({ where: { id: series.id }, data: { deletedAt: new Date() } });
        console.log(`Merged ${series.videoFiles.length} video(s) into "${details.title}" (${canonical.id}) and soft-deleted duplicate`);
        merged++;
      } else {
        await applyTmdbData(series.id, details);
        console.log(`Fixed → "${details.title}" (TMDB ${details.tmdbId})`);
        fixed++;
      }

      await sleep(400);
    } catch (err) {
      console.log(`Error: ${err.message}`);
      errors++;
      await sleep(500);
    }
  }

  console.log(`\nDone. Fixed: ${fixed} | Merged duplicates: ${merged} | Not found: ${notFound} | Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
