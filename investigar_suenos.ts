import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function test() {
  const contents = await prisma.content.findMany({
    where: { title: { contains: "Sueños", mode: 'insensitive' }, type: 'MOVIE' },
    include: { videoFiles: true }
  });
  
  console.log(`\n🔎 ENCONTRADAS ${contents.length} PELÍCULAS CON LA PALABRA "SUEÑOS"\n`);
  
  for(const c of contents) {
    console.log(`🎬 Título: ${c.title}`);
    console.log(`   Slug: ${c.slug}`);
    console.log(`   ID Content: ${c.id}`);
    console.log(`   TMDB ID: ${c.tmdbId === null ? 'NULL' : `"${c.tmdbId}"`}`);
    console.log(`   Estado: ${c.status}`);
    console.log(`   Fijado: ${c.isPinned}`);
    console.log(`   VideoFiles asociados: ${c.videoFiles.length}`);
    for(const vf of c.videoFiles) {
       console.log(`      -> [${vf.id}] ${vf.originalPath} (Status: ${vf.status})`);
    }
    console.log('----------------------------------------------------');
  }
}

test().finally(() => process.exit(0));
