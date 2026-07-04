import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Buscando películas duplicadas (mismo TMDB ID o Título)...');

  // Buscar todas las películas
  const movies = await prisma.content.findMany({
    where: { type: 'MOVIE' },
    include: { translations: true, videoFiles: true }
  });

  // Agrupar por tmdbId o por título (si no tienen tmdbId)
  const grouped = new Map<string, typeof movies>();

  for (const m of movies) {
    const key = m.tmdbId ? `tmdb-${m.tmdbId}` : `title-${m.translations.find(t => t.language === 'es')?.title.toLowerCase() || m.id}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(m);
  }

  let mergedCount = 0;

  for (const [key, group] of grouped.entries()) {
    if (group.length > 1) {
      console.log(`\n⚠️  Encontrados ${group.length} duplicados para: ${key}`);
      
      // Tomamos el más antiguo (o el que tiene más datos) como el "Real"
      const realMovie = group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      const duplicates = group.filter(m => m.id !== realMovie.id);

      for (const dup of duplicates) {
        // Mover todos sus videoFiles al realMovie
        if (dup.videoFiles.length > 0) {
            await prisma.videoFile.updateMany({
                where: { contentId: dup.id },
                data: { contentId: realMovie.id }
            });
        }
        
        // Borrar el duplicado
        await prisma.contentTranslation.deleteMany({ where: { contentId: dup.id } });
        await prisma.content.delete({ where: { id: dup.id } });
        console.log(`✅ Duplicado ${dup.id} fusionado hacia ${realMovie.id}.`);
        mergedCount++;
      }
    }
  }

  if (mergedCount === 0) {
    console.log('✅ No se encontraron películas duplicadas.');
  } else {
    console.log(`\n🎉 Se repararon ${mergedCount} películas duplicadas fusionándolas.`);
  }
}

run().catch(console.error).finally(() => process.exit(0));
