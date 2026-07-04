require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const pendingSeries = await prisma.content.findMany({
    where: {
      status: 'PENDING',
      type: { in: ['SERIES', 'ANIME', 'REALITY_SHOW', 'NOVELA'] }
    },
    include: {
      translations: true,
      videoFiles: true,
      seasons: {
        include: {
          episodes: {
            include: { videoFiles: true }
          }
        }
      }
    }
  });

  console.log(`Encontradas ${pendingSeries.length} series en PENDING.`);
  
  for (const s of pendingSeries) {
    const title = s.translations?.[0]?.title || s.slug;
    let totalEpisodes = 0;
    let completedEpisodes = 0;
    let failedEpisodes = 0;
    let processingEpisodes = 0;
    let unlinkedVideos = s.videoFiles.length;

    for (const season of s.seasons) {
      for (const episode of season.episodes) {
        totalEpisodes++;
        if (episode.videoFiles.some(v => v.status === 'COMPLETED')) {
          completedEpisodes++;
        } else if (episode.videoFiles.some(v => v.status === 'FAILED')) {
          failedEpisodes++;
        } else if (episode.videoFiles.some(v => v.status === 'PROCESSING')) {
          processingEpisodes++;
        }
      }
    }

    console.log(`- ${title}: ${totalEpisodes} episodios totales. (${completedEpisodes} COMPLETADOS, ${failedEpisodes} FALLIDOS, ${processingEpisodes} PROCESANDO). Videos sin vincular: ${unlinkedVideos}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
