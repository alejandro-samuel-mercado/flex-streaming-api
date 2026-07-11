import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const contents = await prisma.content.findMany({
    where: { 
        type: 'SERIES',
        OR: [
            { translations: { some: { title: { contains: 'aprender', mode: 'insensitive' } } } },
            { translations: { some: { title: { contains: 'teach', mode: 'insensitive' } } } },
            { slug: { contains: 'teach' } },
            { slug: { contains: 'aprender' } }
        ]
    },
    include: { translations: true, seasons: { include: { episodes: true } } }
  });
  
  for (const c of contents) {
      const title = c.translations[0]?.title || c.slug;
      const totalEpisodes = c.seasons.reduce((acc, s) => acc + s.episodes.length, 0);
      console.log(`Serie: "${title}" | ID: ${c.id} | TMDB: ${c.tmdbId} | Episodios: ${totalEpisodes}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
