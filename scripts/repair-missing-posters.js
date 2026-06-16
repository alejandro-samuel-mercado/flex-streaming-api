#!/usr/bin/env node
/**
 * repair-missing-posters.js
 *
 * 1. Finds content with missing poster FILE on disk → downloads from TMDB
 * 2. Finds thumbnails with relative URLs (/media/...) → updates to absolute URL of THIS server
 *
 * Run on EACH storage server separately (Series server and Movies server).
 * Each server will only repair content whose thumbnails physically exist on its disk.
 *
 *   node scripts/repair-missing-posters.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('../node_modules/@prisma/client');
const { TMDBService } = require('../dist/services/tmdb.service');
const { env } = require('../dist/shared/config/env');

const prisma = new PrismaClient();
const baseUrl = env.BACKEND_URL.replace(/\/$/, '');
const thumbBase = path.join(env.MEDIA_PATH, 'thumbnails');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`\nServer: ${baseUrl}`);
  console.log(`Thumbnails dir: ${thumbBase}\n`);

  // ── Step 1: Fix relative URLs to absolute for thumbnails that EXIST on THIS disk ──
  const relativeThumbnails = await prisma.thumbnail.findMany({
    where: { url: { startsWith: '/media/' } },
    select: { id: true, url: true, contentId: true }
  });

  console.log(`Found ${relativeThumbnails.length} thumbnails with relative URLs — checking which are on THIS server's disk...`);
  let urlsFixed = 0;
  for (const thumb of relativeThumbnails) {
    // Check if the file physically exists on THIS server
    const localPath = path.join(env.MEDIA_PATH, thumb.url.replace('/media/', ''));
    if (fs.existsSync(localPath)) {
      const newUrl = `${baseUrl}${thumb.url}`;
      await prisma.thumbnail.update({ where: { id: thumb.id }, data: { url: newUrl } });
      urlsFixed++;
    }
  }
  console.log(`  → Fixed ${urlsFixed} relative URLs to absolute (${baseUrl}/media/...)\n`);

  // ── Step 2: Download missing posters for content with tmdbId ──
  const allContent = await prisma.content.findMany({
    where: { tmdbId: { not: null }, deletedAt: null },
    include: {
      thumbnails: { select: { id: true, type: true, url: true } },
    },
  });

  // Only process content whose thumbnails folder is on this server's disk
  // (i.e., the folder exists here OR it has no thumbnails at all)
  const toRepair = allContent.filter(c => {
    const localDir = path.join(thumbBase, c.id);
    const hasFolderHere = fs.existsSync(localDir);
    const hasPoster = c.thumbnails.some(t => t.type === 'POSTER');
    return hasFolderHere && !hasPoster;
  });

  console.log(`Found ${toRepair.length} content items with no poster on THIS server's disk.\n`);

  let downloaded = 0, errors = 0;
  for (const content of toRepair) {
    const mediaType = ['MOVIE', 'ANIMATION', 'DOCUMENTARY', 'BIOGRAPHY'].includes(content.type) ? 'movie' : 'tv';
    process.stdout.write(`[${downloaded + errors + 1}/${toRepair.length}] tmdbId:${content.tmdbId} → `);
    try {
      const details = await TMDBService.getFullDetails(parseInt(content.tmdbId), mediaType);
      const mediaFolder = path.join(thumbBase, content.id);
      if (!fs.existsSync(mediaFolder)) fs.mkdirSync(mediaFolder, { recursive: true });

      if (details.posterPath) {
        const dest = path.join(mediaFolder, 'poster.jpg');
        await TMDBService.downloadImage(details.posterPath, dest);
        const url = `${baseUrl}/media/thumbnails/${content.id}/poster.jpg`;
        const existing = content.thumbnails.find(t => t.type === 'POSTER');
        if (existing) {
          await prisma.thumbnail.update({ where: { id: existing.id }, data: { url } });
        } else {
          await prisma.thumbnail.create({ data: { contentId: content.id, type: 'POSTER', url, width: 500, height: 750 } });
        }
        console.log(`Downloaded poster for "${details.title}"`);
        downloaded++;
      } else {
        console.log(`No poster path in TMDB`);
        errors++;
      }
      await sleep(350);
    } catch (e) {
      console.log(`Error: ${e.message}`);
      errors++;
      await sleep(500);
    }
  }

  console.log(`\nDone. URLs fixed: ${urlsFixed} | Posters downloaded: ${downloaded} | Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
