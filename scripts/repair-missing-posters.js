#!/usr/bin/env node
/**
 * repair-missing-posters.js
 *
 * For ALL content (series + movies) that has tmdbId but:
 *  - poster file doesn't exist on disk, OR
 *  - description is empty
 *
 * Re-fetches from TMDB and saves images to MEDIA_PATH.
 * Run this on Cerebro (the server that serves thumbnails to the web).
 *
 *   node scripts/repair-missing-posters.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { PrismaClient } = require('../node_modules/@prisma/client');
const { TMDBService } = require('../dist/services/tmdb.service');
const { env } = require('../dist/shared/config/env');

const prisma = new PrismaClient();
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function repairContent(content, mediaType) {
  const tmdbId = parseInt(content.tmdbId);
  let details;
  try {
    details = await TMDBService.getFullDetails(tmdbId, mediaType);
  } catch (e) {
    return `TMDB error: ${e.message}`;
  }

  const changes = [];

  // 1. Fix empty description
  const trans = content.translations[0];
  if (trans && (!trans.description || trans.description.trim().length === 0) && details.synopsis) {
    await prisma.contentTranslation.update({
      where: { id: trans.id },
      data: { description: details.synopsis }
    });
    changes.push('description');
  }

  // 2. Download missing poster
  const thumbnailDir = path.join(env.MEDIA_PATH, 'thumbnails', content.id);
  const posterPath = path.join(thumbnailDir, 'poster.jpg');
  const backdropPath = path.join(thumbnailDir, 'backdrop.jpg');

  if (!fs.existsSync(posterPath) && details.posterUrl) {
    const posterUrl = details.posterUrl.startsWith('http')
      ? details.posterUrl
      : `https://image.tmdb.org/t/p/w500${details.posterUrl}`;
    try {
      await downloadFile(posterUrl, posterPath);
      changes.push('poster');

      // Upsert thumbnail record
      const existing = await prisma.thumbnail.findFirst({ where: { contentId: content.id, type: 'POSTER' } });
      const url = `/media/thumbnails/${content.id}/poster.jpg`;
      if (existing) {
        await prisma.thumbnail.update({ where: { id: existing.id }, data: { url } });
      } else {
        await prisma.thumbnail.create({ data: { contentId: content.id, type: 'POSTER', url, width: 500, height: 750 } });
      }
    } catch (e) {
      changes.push(`poster-error:${e.message}`);
    }
  }

  if (!fs.existsSync(backdropPath) && details.backdropUrl) {
    const backdropUrl = details.backdropUrl.startsWith('http')
      ? details.backdropUrl
      : `https://image.tmdb.org/t/p/w1280${details.backdropUrl}`;
    try {
      await downloadFile(backdropUrl, backdropPath);

      const existing = await prisma.thumbnail.findFirst({ where: { contentId: content.id, type: 'BACKDROP' } });
      const url = `/media/thumbnails/${content.id}/backdrop.jpg`;
      if (existing) {
        await prisma.thumbnail.update({ where: { id: existing.id }, data: { url } });
      } else {
        await prisma.thumbnail.create({ data: { contentId: content.id, type: 'BACKDROP', url, width: 1280, height: 720 } });
      }
      changes.push('backdrop');
    } catch (_) {}
  }

  return changes.length > 0 ? `Fixed: ${changes.join(', ')}` : 'Already OK';
}

async function main() {
  console.log(`\nMedia path: ${env.MEDIA_PATH}\n`);

  // Find all content with tmdbId that has empty description OR missing poster file
  const allContent = await prisma.content.findMany({
    where: { tmdbId: { not: null }, deletedAt: null },
    include: {
      translations: { select: { id: true, title: true, description: true }, where: { language: 'es' } },
      thumbnails: { select: { type: true, url: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Filter to only those that actually need repair
  const toRepair = allContent.filter(c => {
    const trans = c.translations[0];
    const emptyDesc = !trans?.description || trans.description.trim().length === 0;
    const posterUrl = c.thumbnails.find(t => t.type === 'POSTER')?.url;
    const posterMissing = !posterUrl || !fs.existsSync(path.join(env.MEDIA_PATH, posterUrl.replace('/media/', '')));
    return emptyDesc || posterMissing;
  });

  console.log(`Found ${toRepair.length} content items needing repair (out of ${allContent.length} total with tmdbId).\n`);

  let fixed = 0, errors = 0;
  for (const content of toRepair) {
    const title = content.translations[0]?.title || content.tmdbId;
    const mediaType = ['MOVIE', 'ANIMATION', 'DOCUMENTARY', 'BIOGRAPHY'].includes(content.type) ? 'movie' : 'tv';
    process.stdout.write(`[${fixed + errors + 1}/${toRepair.length}] "${title}" → `);

    try {
      const result = await repairContent(content, mediaType);
      console.log(result);
      fixed++;
    } catch (e) {
      console.log(`Error: ${e.message}`);
      errors++;
    }
    await sleep(350);
  }

  console.log(`\nDone. Fixed: ${fixed} | Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
