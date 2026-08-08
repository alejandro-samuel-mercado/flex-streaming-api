import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
async function test() {
  const contents = await prisma.content.findMany({
    where: { title: { contains: "Sueños", mode: 'insensitive' } },
    include: { videoFiles: true }
  });
  for(const c of contents) {
    console.log(`Title: ${c.title}, TMDB: ${c.tmdbId}, Slug: ${c.slug}`);
    for(const vf of c.videoFiles) {
       console.log(`  -> VideoFile: ${vf.originalPath}`);
    }
  }
}
test().finally(() => process.exit(0));
