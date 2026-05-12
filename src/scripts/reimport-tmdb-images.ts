import { prisma } from '../shared/config/prisma';
import { TMDBService } from '../services/tmdb.service';
import { env } from '../shared/config/env';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('🚀 [TMDB-Reimport] Iniciando restaurador masivo de pósters y backdrops...');
  console.log('------------------------------------------------------------------------');

  // 1. Fetch all content with a TMDB ID
  const contents = await prisma.content.findMany({
    where: {
      tmdbId: { not: null }
    },
    include: {
      translations: { where: { language: 'es' }, take: 1 }
    }
  });

  const total = contents.length;
  console.log(`📌 Encontrados ${total} contenidos con ID de TMDB registrado.`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < total; i++) {
    const item = contents[i];
    const title = item.translations?.[0]?.title || item.slug || 'Sin título';
    const percent = Math.round(((i + 1) / total) * 100);

    console.log(`\n[${percent}%] (${i + 1}/${total}) Procesando: "${title}" (TMDB: ${item.tmdbId})...`);

    try {
      if (!item.tmdbId) continue;

      const mediaType = item.type === 'MOVIE' ? 'movie' : 'tv';
      
      // Fetch full details from TMDB to get the correct original poster and backdrop paths
      const details = await TMDBService.getFullDetails(item.tmdbId, mediaType);

      const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', item.id);
      if (!fs.existsSync(mediaFolder)) {
        fs.mkdirSync(mediaFolder, { recursive: true });
      }

      // Restoring Poster
      if (details.posterPath) {
        const localPosterPath = path.join(mediaFolder, 'poster.jpg');
        console.log(`   ⬇️  Descargando póster oficial: ${details.posterPath}...`);
        await TMDBService.downloadImage(details.posterPath, localPosterPath);

        // Ensure DB record is correct
        const posterUrl = `/media/thumbnails/${item.id}/poster.jpg`;
        await prisma.thumbnail.upsert({
          where: {
            contentId_type: {
              contentId: item.id,
              type: 'POSTER'
            }
          },
          update: { url: posterUrl, width: 500, height: 750 },
          create: {
            contentId: item.id,
            type: 'POSTER',
            url: posterUrl,
            width: 500,
            height: 750
          }
        });
        console.log(`   ✅ Póster restaurado.`);
      }

      // Restoring Backdrop
      if (details.backdropPath) {
        const localBackdropPath = path.join(mediaFolder, 'backdrop.jpg');
        console.log(`   ⬇️  Descargando backdrop oficial: ${details.backdropPath}...`);
        await TMDBService.downloadImage(details.backdropPath, localBackdropPath);

        // Ensure DB record is correct
        const backdropUrl = `/media/thumbnails/${item.id}/backdrop.jpg`;
        await prisma.thumbnail.upsert({
          where: {
            contentId_type: {
              contentId: item.id,
              type: 'BACKDROP'
            }
          },
          update: { url: backdropUrl, width: 1920, height: 1080 },
          create: {
            contentId: item.id,
            type: 'BACKDROP',
            url: backdropUrl,
            width: 1920,
            height: 1080
          }
        });
        console.log(`   ✅ Banner (backdrop) restaurado.`);
      }

      successCount++;
      // Polite rate limit delay so TMDB does not block us
      await new Promise((resolve) => setTimeout(resolve, 200));

    } catch (err: any) {
      errorCount++;
      console.error(`   ❌ Error procesando "${title}":`, err.message);
    }
  }

  console.log('\n------------------------------------------------------------------------');
  console.log('🎉 ¡Proceso de restauración masiva completado!');
  console.log(`📊 Resumen:`);
  console.log(`   - Exitosos: ${successCount}`);
  console.log(`   - Con Errores: ${errorCount}`);
  console.log(`   - Total Procesados: ${total}`);
  console.log('------------------------------------------------------------------------');
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('💥 Error crítico en el script:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
