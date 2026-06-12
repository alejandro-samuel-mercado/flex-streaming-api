const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: 'postgresql://peliplus:peliplus_secret@129.121.32.195:5433/peliplus?schema=public' } } });

async function run() {
  const thumbs = await prisma.thumbnail.findMany();
  let updated = 0;
  for (const t of thumbs) {
    if (t.url.startsWith('/media/thumbnails')) {
      // If it's a movie (has contentId but no episodeId), or we just prefix it with Peliculas url for now
      // Actually, since this is the movies server, all current videos are probably movies.
      // Let's check if it has episodeId.
      let newUrl = t.url;
      if (t.episodeId) {
         newUrl = 'https://series-streamflex.unixxtech.online' + t.url;
      } else {
         newUrl = 'https://peliculas-streamflex.unixxtech.online' + t.url;
      }
      await prisma.thumbnail.update({ where: { id: t.id }, data: { url: newUrl } });
      updated++;
    }
  }
  console.log('Fixed', updated, 'posters!');
}
run().catch(console.error).finally(() => process.exit(0));
