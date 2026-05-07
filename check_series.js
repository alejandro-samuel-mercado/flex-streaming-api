const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const contents = await prisma.content.findMany({
    where: { type: 'SERIES' },
    include: {
      videoFiles: true,
      seasons: {
        include: { episodes: { include: { videoFiles: true } } }
      },
      translations: { where: { language: 'es' } }
    }
  });

  for (const c of contents) {
    console.log(`Serie: ${c.translations?.[0]?.title || c.slug}`);
    console.log(`- VideoFiles directos: ${c.videoFiles.length}`);
    console.log(`- Temporadas: ${c.seasons.length}`);
    let epCount = 0;
    c.seasons.forEach(s => epCount += s.episodes.length);
    console.log(`- Episodios totales: ${epCount}`);
    console.log('---');
  }
}

check().catch(e => console.error(e)).finally(() => prisma.$disconnect());
