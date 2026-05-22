import { prisma } from '../shared/config/prisma';
import { TMDBService } from '../services/tmdb.service';
import { env } from '../shared/config/env';
import path from 'path';
import fs from 'fs';

const SERIES_MAP = [
  { title: 'The Last of Us', tmdbId: '100088' },
  { title: 'Succession', tmdbId: '76331' },
  { title: 'Attack on Titan', tmdbId: '1429' }
];

async function run() {
  console.log('🚀 [Seed-Test-Episodes] Iniciando semillero de episodios de prueba con TMDB...');
  console.log('----------------------------------------------------------------------------------');

  for (const mapping of SERIES_MAP) {
    console.log(`\n📌 Buscando serie: "${mapping.title}"...`);
    const content = await prisma.content.findFirst({
      where: {
        translations: {
          some: {
            title: { equals: mapping.title, mode: 'insensitive' }
          }
        }
      }
    });

    if (!content) {
      console.log(`   ❌ Serie "${mapping.title}" no encontrada en la base de datos.`);
      continue;
    }

    console.log(`   ✅ Serie encontrada. Actualizando TMDB ID a: ${mapping.tmdbId}`);
    await prisma.content.update({
      where: { id: content.id },
      data: { tmdbId: mapping.tmdbId }
    });

    // Create Season 1
    const season = await prisma.season.upsert({
      where: {
        contentId_number: {
          contentId: content.id,
          number: 1
        }
      },
      update: {},
      create: {
        contentId: content.id,
        number: 1
      }
    });

    console.log(`   📦 Temporada 1 creada/verificada. Generando 3 episodios...`);

    for (let episodeNum = 1; episodeNum <= 3; episodeNum++) {
      console.log(`     ➡️ Procesando Episodio ${episodeNum}...`);
      
      const episodeRecord = await prisma.episode.upsert({
        where: {
          seasonId_number: {
            seasonId: season.id,
            number: episodeNum
          }
        },
        update: {},
        create: {
          seasonId: season.id,
          number: episodeNum
        }
      });

      // Fetch TMDB Episode Details
      const epDetails = await TMDBService.getEpisodeDetails(mapping.tmdbId, 1, episodeNum);
      let episodeTitle = `Episodio ${episodeNum}`;
      let episodeOverview = '';
      let stillPath: string | null = null;
      let duration = 45 * 60; // default 45 mins in seconds

      if (epDetails) {
        episodeTitle = epDetails.name || episodeTitle;
        episodeOverview = epDetails.overview || '';
        stillPath = epDetails.still_path || null;
        if (epDetails.runtime) {
          duration = epDetails.runtime * 60;
        }
      }

      // Upsert Translation
      await prisma.episodeTranslation.upsert({
        where: {
          episodeId_language: {
            episodeId: episodeRecord.id,
            language: 'es'
          }
        },
        update: {
          title: episodeTitle,
          description: episodeOverview
        },
        create: {
          episodeId: episodeRecord.id,
          language: 'es',
          title: episodeTitle,
          description: episodeOverview
        }
      });

      // Update Episode fields
      await prisma.episode.update({
        where: { id: episodeRecord.id },
        data: { duration }
      });

      // Download still image if exists
      if (stillPath) {
        const mediaFolder = path.join(env.MEDIA_PATH, 'thumbnails', 'episodes', episodeRecord.id);
        if (!fs.existsSync(mediaFolder)) {
          fs.mkdirSync(mediaFolder, { recursive: true });
        }

        const localStillPath = path.join(mediaFolder, 'still.jpg');
        const virtualStillUrl = `/media/thumbnails/episodes/${episodeRecord.id}/still.jpg`;

        console.log(`       ⬇️ Descargando miniatura: ${stillPath}...`);
        try {
          await TMDBService.downloadImage(stillPath, localStillPath);

          const existingThumb = await prisma.thumbnail.findFirst({
            where: { episodeId: episodeRecord.id, type: 'STILL' }
          });

          if (existingThumb) {
            await prisma.thumbnail.update({
              where: { id: existingThumb.id },
              data: { url: virtualStillUrl, width: 1280, height: 720 }
            });
          } else {
            await prisma.thumbnail.create({
              data: {
                episodeId: episodeRecord.id,
                type: 'STILL',
                url: virtualStillUrl,
                width: 1280,
                height: 720
              }
            });
          }
          console.log(`       ✅ Miniatura guardada.`);
        } catch (err: any) {
          console.warn(`       ⚠️ Error descargando miniatura: ${err.message}`);
        }
      }

      // Create a dummy completed video file so it appears on the frontend
      const existingVideo = await prisma.videoFile.findFirst({
        where: { episodeId: episodeRecord.id }
      });

      if (!existingVideo) {
        const dummyPlaylist = 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8';
        const videoFile = await prisma.videoFile.create({
          data: {
            episodeId: episodeRecord.id,
            type: 'EPISODE',
            originalPath: `/dummy/path/s1e${episodeNum}`,
            status: 'COMPLETED',
            masterPlaylist: dummyPlaylist,
            hlsPath: `/dummy/path/s1e${episodeNum}`,
            fileSize: BigInt(1234567),
            qualities: {
              create: [
                {
                  resolution: '720p',
                  width: 1280,
                  height: 720,
                  bitrate: 2500000,
                  playlistUrl: dummyPlaylist,
                  codec: 'h264'
                }
              ]
            }
          }
        });
        console.log(`       ✅ Archivo de video ficticio creado.`);
      }
    }
  }

  console.log('\n----------------------------------------------------------------------------------');
  console.log('🎉 ¡Episodios de prueba semillados con éxito!');
  console.log('----------------------------------------------------------------------------------');
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('💥 Error crítico:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
