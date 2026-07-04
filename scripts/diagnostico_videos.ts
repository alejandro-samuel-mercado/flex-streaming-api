import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Diagnosticando estado de los videos en la base de datos...');

  const totalVideos = await prisma.videoFile.count();
  console.log(`Total de VideoFiles en DB: ${totalVideos}`);

  const videosComoPeliculas = await prisma.videoFile.count({ where: { type: 'MOVIE' } });
  const videosComoEpisodios = await prisma.videoFile.count({ where: { type: 'EPISODE' } });

  console.log(`- Videos registrados como PELÍCULAS: ${videosComoPeliculas}`);
  console.log(`- Videos registrados como EPISODIOS: ${videosComoEpisodios}`);

  if (videosComoEpisodios > 0) {
    // Ver si los episodios están asignados a la MISMA serie o a series diferentes
    const episodios = await prisma.episode.findMany({
      include: { videoFiles: true, season: { include: { content: { include: { translations: true } } } } }
    });

    console.log(`\nDetalle de los ${episodios.length} Episodios registrados:`);
    
    // Agrupar por serie
    const seriesMap = new Map();
    for (const ep of episodios) {
      if (!ep.season || !ep.season.content) continue;
      const title = ep.season.content.translations?.[0]?.title || ep.season.content.slug;
      if (!seriesMap.has(title)) {
        seriesMap.set(title, { episodios: 0, videos: 0, contentId: ep.season.content.id });
      }
      const data = seriesMap.get(title);
      data.episodios++;
      data.videos += ep.videoFiles.length;
    }

    for (const [title, data] of seriesMap.entries()) {
      console.log(`  🎬 Serie: ${title} -> Tiene ${data.episodios} Episodios (con ${data.videos} videos en total) [ID: ${data.contentId}]`);
    }
  }

  // Detectar si hay videos huerfanos o con IDs rotos
  const huerfanos = await prisma.videoFile.findMany({
    where: { contentId: null, episodeId: null }
  });
  if (huerfanos.length > 0) {
    console.log(`\n⚠️ Hay ${huerfanos.length} videos huérfanos sin contenido ni episodio asignado.`);
  }

}

run().finally(() => process.exit(0));
