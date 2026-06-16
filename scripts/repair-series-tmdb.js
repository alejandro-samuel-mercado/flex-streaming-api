#!/usr/bin/env node
/**
 * repair-series-tmdb.js
 * 
 * Finds all SERIES content created without TMDB metadata (no tmdbId, empty description)
 * and attempts to fetch and apply TMDB data for each one.
 * 
 * Run on the Series server:
 *   node scripts/repair-series-tmdb.js
 */

require('dotenv').config();
const { PrismaClient } = require('../node_modules/@prisma/client');
const { TMDBService } = require('../dist/services/tmdb.service');
const { MediaScannerService } = require('../dist/modules/media-scanner/media-scanner.service');

const prisma = new PrismaClient();

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  // Find all SERIES with no tmdbId (created minimally by the scanner)
  const seriesWithoutTmdb = await prisma.content.findMany({
    where: {
      type: { in: ['SERIES', 'ANIME'] },
      tmdbId: null,
      deletedAt: null,
    },
    include: {
      translations: { select: { title: true, description: true } },
      thumbnails: { select: { type: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`\n🔍 Found ${seriesWithoutTmdb.length} series without TMDB data.\n`);

  let fixed = 0;
  let notFound = 0;
  let errors = 0;

  for (const series of seriesWithoutTmdb) {
    const title = series.translations[0]?.title || '';
    if (!title) { errors++; continue; }

    process.stdout.write(`[${fixed + notFound + errors + 1}/${seriesWithoutTmdb.length}] "${title}" → `);

    try {
      // Search TMDB
      const result = await TMDBService.searchWithFallback(title);

      if (!result.bestMatch || result.confidence < 0.3) {
        console.log(`❌ No match (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
        notFound++;
        await sleep(300);
        continue;
      }

      const mediaType = result.bestMatch.media_type === 'movie' ? 'movie' : 'tv';
      const details = await TMDBService.getFullDetails(result.bestMatch.id, mediaType);

      // Check if another content already has this tmdbId (avoid duplicate)
      const duplicate = await prisma.content.findFirst({ where: { tmdbId: String(details.tmdbId) } });
      if (duplicate && duplicate.id !== series.id) {
        console.log(`⚠️  TMDB ${details.tmdbId} already exists on another content (${duplicate.id}). Skipping.`);
        notFound++;
        await sleep(300);
        continue;
      }

      // Apply metadata to the existing content record
      await prisma.content.update({
        where: { id: series.id },
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

      // Update translation (title + description)
      const existingTranslation = await prisma.contentTranslation.findFirst({
        where: { contentId: series.id, language: 'es' }
      });
      if (existingTranslation) {
        await prisma.contentTranslation.update({
          where: { id: existingTranslation.id },
          data: {
            title: details.title,
            description: details.synopsis || existingTranslation.description
          }
        });
      } else {
        await prisma.contentTranslation.create({
          data: { contentId: series.id, language: 'es', title: details.title, description: details.synopsis || '' }
        });
      }

      // Download poster/backdrop if missing
      const hasPoster = series.thumbnails.some(t => t.type === 'POSTER');
      if (!hasPoster) {
        await MediaScannerService._downloadTMDBImages(series.id, details).catch(() => {});
      }

      console.log(`✅ Fixed → "${details.title}" (TMDB ${details.tmdbId}, confidence: ${(result.confidence * 100).toFixed(0)}%)`);
      fixed++;
      await sleep(400); // Respect TMDB rate limits
    } catch (err) {
      console.log(`💥 Error: ${err.message}`);
      errors++;
      await sleep(500);
    }
  }

  console.log(`\n✅ Done. Fixed: ${fixed} | Not found: ${notFound} | Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
