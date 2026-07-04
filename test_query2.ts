import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  console.log("Conectando...");
  const movies = await prisma.content.findMany({
    where: { status: 'PENDING', type: 'MOVIE' },
    include: { translations: true, thumbnails: true, videoFiles: true, genres: true },
    take: 3
  });
  console.log("Encontradas:", movies.length);
  for (const m of movies) {
    console.log(`Título: ${m.translations[0]?.title}, slug: ${m.slug}`);
    console.log(`  - Video: ${m.videoFiles.length > 0}`);
    console.log(`  - Status Video: ${m.videoFiles[0]?.status}`);
    console.log(`  - Poster: ${m.thumbnails.some(t => t.type === 'POSTER')}`);
    console.log(`  - Synopsis: ${m.translations[0]?.description?.length! > 5}`);
    console.log(`  - Genres: ${m.genres.length}`);
  }
}
run().catch(console.error).finally(() => prisma.$disconnect());
