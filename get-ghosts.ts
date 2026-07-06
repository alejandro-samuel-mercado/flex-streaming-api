import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const series = await prisma.content.findMany({
    where: { type: 'SERIES' },
    include: { translations: true, videoFiles: true, seasons: { include: { episodes: true } } }
  });
  
  const ghosts = series.filter(s => {
    const title = s.translations[0]?.title || '';
    return /^\d+[\s_-]/.test(title) || s.tmdbId === null;
  });
  
  for (const s of ghosts) {
    const title = s.translations[0]?.title;
    console.log(`Ghost: ID=${s.id}, Title="${title}", tmdbId=${s.tmdbId}, episodes=${s.seasons.reduce((acc, season) => acc + season.episodes.length, 0)}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
