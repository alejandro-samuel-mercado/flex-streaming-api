#!/usr/bin/env node
/**
 * repair-series-tmdb.js
 *
 * Finds and repairs series content that is missing data:
 * 1. Series with NO tmdbId → search TMDB by numeric ID in title or by text
 * 2. Series WITH tmdbId but missing poster OR empty description → re-fetch from TMDB
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

function extractTmdbIdFromTitle(title) {
  const m = title.match(/^(\d{4,7})\b/);
  return m ? parseInt(m[1], 10) : null;
}

async function applyTmdbData(contentId, details, hasPoster) {
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

  // Update or create Spanish translation
  const existingTrans = await prisma.contentTranslation.findFirst({ where: { contentId, language: 'es' } });
  const hasRealDescription = existingTrans?.description && existingTrans.description.trim().length > 10;
  if (existingTrans) {
    await prisma.contentTranslation.update({
      where: { id: existingTrans.id },
      data: {
        title: details.title,
        description: hasRealDescription ? existingTrans.description : (details.synopsis || '')
      }
    });
  } else {
    await prisma.contentTranslation.create({
      data: { contentId, language: 'es', title: details.title, description: details.synopsis || '' }
    });
  }

  // Download images only if poster is missing
  if (!hasPoster) {
    await MediaScannerService._downloadTMDBImages(contentId, details).catch(() => {});
  }
}

async function main() {
  // Case 1: No tmdbId at all
  const withoutTmdb = await prisma.content.findMany({
    where: { type: { in: ['SERIES', 'ANIME'] }, tmdbId: null, deletedAt: null },
    include: {
      translations: { select: { id: true, title: true, description: true } },
      thumbnails: { select: { type: true } },
      videoFiles: { select: { id: true } },
    },
  });

  // Case 2: Has tmdbId but no poster thumbnail
  const withoutPoster = await prisma.content.findMany({
    where: {
      type: { in: ['SERIES', 'ANIME'] },
      tmdbId: { not: null },
      deletedAt: null,
      thumbnails: { none: { type: 'POSTER' } },
    },
    include: {
      translations: { select: { id: true, title: true, description: true } },
      thumbnails: { select: { type: true } },
      videoFiles: { select: { id: true } },
    },
  });

  const allToFix = [
    ...withoutTmdb.map(s => ({ ...s, hasPoster: false, reason: 'no-tmdb' })),
    ...withoutPoster.map(s => ({ ...s, hasPoster: false, reason: 'no-poster' })),
  ];

  // Deduplicate by id
  const seen = new Set();
  const unique = allToFix.filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });

  console.log(`\n🔍 Found ${unique.length} series to repair (${withoutTmdb.length} without tmdbId, ${withoutPoster.length} missing poster).\n`);

  let fixed = 0, merged = 0, notFound = 0, errors = 0;

  for (const series of unique) {
    const title = series.translations[0]?.title || '';
    const hasPoster = series.thumbnails.some(t => t.type === 'POSTER');
    const idx = fixed + merged + notFound + errors + 1;
    process.stdout.write(`[${idx}/${unique.length}] "${title}" (${series.reason}) → `);

    if (!title) { errors++; console.log('No title'); continue; }

    try {
      let details = null;

      // If it already has a tmdbId, fetch directly
      if (series.tmdbId) {
        try {
          details = await TMDBService.getFullDetails(parseInt(series.tmdbId), 'tv');
        } catch (_) {
          try { details = await TMDBService.getFullDetails(parseInt(series.tmdbId), 'movie'); } catch (_) {}
        }
      }

      // Try extracting numeric tmdbId from title
      if (!details) {
        const numericId = extractTmdbIdFromTitle(title);
        if (numericId) {
          try { details = await TMDBService.getFullDetails(numericId, 'tv'); } catch (_) {}
          if (!details) {
            try { details = await TMDBService.getFullDetails(numericId, 'movie'); } catch (_) {}
          }
        }
      }

      // Fallback: text search
      if (!details) {
        // Strip leading numbers for cleaner text search
        const cleanTitle = title.replace(/^\d+\s*/, '').trim();
        const searchTitle = cleanTitle || title;
        const result = await TMDBService.searchWithFallback(searchTitle);
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
        if (series.videoFiles.length > 0) {
          await prisma.videoFile.updateMany({
            where: { id: { in: series.videoFiles.map(v => v.id) } },
            data: { contentId: canonical.id }
          });
        }
        await prisma.content.update({ where: { id: series.id }, data: { deletedAt: new Date() } });
        console.log(`Duplicate → merged ${series.videoFiles.length} video(s) into "${details.title}" and soft-deleted`);
        merged++;
      } else {
        await applyTmdbData(series.id, details, hasPoster);
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
