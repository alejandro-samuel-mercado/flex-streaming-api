import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Buscando series "falsas" o huérfanas creadas por errores de TMDB...');

  // Buscar todas las series
  const series = await prisma.content.findMany({
    where: { type: 'SERIES' },
    include: { translations: true, seasons: { include: { episodes: true } } }
  });

  let mergedCount = 0;

  for (const s of series) {
    const title = s.translations.find(t => t.language === 'es')?.title || '';
    const match = title.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;

    const fakeTmdbId = match[1];
    
    // Check if the "real" series exists
    const realSeries = await prisma.content.findFirst({
      where: {
        tmdbId: fakeTmdbId,
        type: 'SERIES',
        id: { not: s.id }
      },
      include: { seasons: { include: { episodes: true } } }
    });

    if (realSeries) {
      console.log(`\n⚠️  Encontrada serie duplicada por fallback: "${title}" (ID falso) -> "${realSeries.id}" (Serie Real)`);

      // Mover todas las temporadas y episodios de la serie falsa a la serie real
      for (const fakeSeason of s.seasons) {
        // Find if real season exists
        let realSeason = realSeries.seasons.find(rs => rs.number === fakeSeason.number);
        if (!realSeason) {
            // Create the season in the real series
            realSeason = await prisma.season.create({
                data: {
                    contentId: realSeries.id,
                    number: fakeSeason.number
                },
                include: { episodes: true }
            });
        }

        for (const fakeEp of fakeSeason.episodes) {
            // Check if real episode exists
            const realEp = realSeason.episodes.find(re => re.number === fakeEp.number);
            if (realEp) {
                // Move VideoFiles to real episode
                await prisma.videoFile.updateMany({
                    where: { episodeId: fakeEp.id },
                    data: { episodeId: realEp.id, contentId: null }
                });
                // Delete fake episode
                await prisma.episode.delete({ where: { id: fakeEp.id } });
            } else {
                // Just move the fake episode to the real season
                await prisma.episode.update({
                    where: { id: fakeEp.id },
                    data: { seasonId: realSeason.id }
                });
            }
        }
        
        // Delete fake season if it has no more episodes
        const epsLeft = await prisma.episode.count({ where: { seasonId: fakeSeason.id } });
        if (epsLeft === 0) {
            await prisma.season.delete({ where: { id: fakeSeason.id } });
        }
      }

      // Finally, delete the fake series
      await prisma.contentTranslation.deleteMany({ where: { contentId: s.id } });
      await prisma.content.delete({ where: { id: s.id } });
      console.log(`✅ Serie falsa "${title}" fusionada con éxito hacia la serie real.`);
      mergedCount++;
    }
  }

  if (mergedCount === 0) {
    console.log('✅ No se encontraron series falsas para fusionar.');
  } else {
    console.log(`\n🎉 Se repararon ${mergedCount} series fusionándolas a su contraparte real de TMDB.`);
  }
}

run().catch(console.error).finally(() => process.exit(0));
