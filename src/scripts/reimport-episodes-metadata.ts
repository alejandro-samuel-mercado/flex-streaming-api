import { prisma } from '../shared/config/prisma';
import { TMDBService } from '../services/tmdb.service';
import { env } from '../shared/config/env';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('🚀 [TMDB-Episodes] Iniciando importación masiva de metadatos y capturas de episodios...');
  console.log('----------------------------------------------------------------------------------');

  // Fetch all episodes belonging to content with a TMDB ID
  const episodes = await prisma.episode.findMany({
    where: {
      season: {
        content: {
          tmdbId: { not: null }
        }
      }
    },
    include: {
      season: {
        include: {
          content: {
            include: {
              translations: { where: { language: 'es' }, take: 1 }
            }
          }
        }
      },
      thumbnails: {
        where: { type: 'STILL' }
      }
    }
  });

  const total = episodes.length;
  console.log(`📌 Encontrados ${total} episodios vinculados a series con TMDB ID.`);

  let successCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < total; i++) {
    const ep = episodes[i];
    const seriesTitle = ep.season.content.translations?.[0]?.title || ep.season.content.slug || 'Serie';
    const percent = Math.round(((i + 1) / total) * 100);

    console.log(`\n[${percent}%] (${i + 1}/${total}) Procesando: "${seriesTitle}" - T${ep.season.number}E${ep.number}...`);

    try {
      const tmdbId = ep.season.content.tmdbId;
      if (!tmdbId) {
        console.log('   ⚠️ Sin TMDB ID. Omitiendo.');
        skippedCount++;
        continue;
      }

      // Fetch episode details from TMDB
      const epDetails = await TMDBService.getEpisodeDetails(tmdbId, ep.season.number, ep.number);
      if (!epDetails) {
        console.log('   ⚠️ No se encontraron detalles en TMDB.');
        skippedCount++;
        continue;
      }

      // Update / Create Translation
      const episodeTitle = epDetails.name || `Episodio ${ep.number}`;
      const episodeOverview = epDetails.overview || '';
      const duration = epDetails.runtime ? epDetails.runtime * 60 : null;

      await prisma.episodeTranslation.upsert({
        where: {
          episodeId_language: {
            episodeId: ep.id,
            language: 'es'
          }
        },
        update: {
          title: episodeTitle,
          description: episodeOverview
        },
        create: {
          episodeId: ep.id,
          language: 'es',
          title: episodeTitle,
          description: episodeOverview
        }
      });

      // Update duration if not set
      if (duration) {
        await prisma.episode.update({
          where: { id: ep.id },
          data: { duration }
        });
      }

      // Download still image if available
      if (epDetails.still_path) {
        const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', 'episodes', ep.id);
        if (!fs.existsSync(mediaFolder)) {
          fs.mkdirSync(mediaFolder, { recursive: true });
        }

        const localStillPath = path.join(mediaFolder, 'still.jpg');
        const virtualStillUrl = `/media/thumbnails/episodes/${ep.id}/still.jpg`;

        console.log(`   ⬇️  Descargando still oficial: ${epDetails.still_path}...`);
        await TMDBService.downloadImage(epDetails.still_path, localStillPath);

        const existingThumb = ep.thumbnails.find(t => t.type === 'STILL');
        if (existingThumb) {
          await prisma.thumbnail.update({
            where: { id: existingThumb.id },
            data: { url: virtualStillUrl, width: 1280, height: 720 }
          });
        } else {
          await prisma.thumbnail.create({
            data: {
              episodeId: ep.id,
              type: 'STILL',
              url: virtualStillUrl,
              width: 1280,
              height: 720
            }
          });
        }
        console.log(`   ✅ Miniatura guardada en base de datos.`);
      } else {
        console.log('   ℹ️ TMDB no tiene still_path para este episodio.');
      }

      successCount++;
      // Rate limit delay to be polite to TMDB API
      await new Promise((resolve) => setTimeout(resolve, 200));

    } catch (err: any) {
      errorCount++;
      console.error(`   ❌ Error:`, err.message);
    }
  }

  console.log('\n----------------------------------------------------------------------------------');
  console.log('🎉 ¡Proceso de importación de metadatos y stills completado!');
  console.log(`📊 Resumen:`);
  console.log(`   - Exitosos: ${successCount}`);
  console.log(`   - Omitidos: ${skippedCount}`);
  console.log(`   - Con Errores: ${errorCount}`);
  console.log(`   - Total Procesados: ${total}`);
  console.log('----------------------------------------------------------------------------------');
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('💥 Error crítico en el script:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
