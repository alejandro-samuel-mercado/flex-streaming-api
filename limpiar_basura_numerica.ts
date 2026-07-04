import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function cleanNumericTitles() {
  console.log('🧹 Buscando títulos numéricos basura...');
  
  // Buscar todas las traducciones en español
  const translations = await prisma.contentTranslation.findMany({
    where: { language: 'es' },
    include: { content: true }
  });

  // Filtrar las que tienen títulos puramente numéricos y que NO estén fijadas
  const numericIds = translations
    .filter(t => /^\d+$/.test(t.title) && !t.content.isPinned)
    .map(t => t.contentId);

  if (numericIds.length === 0) {
    console.log('✅ No se encontraron títulos numéricos basura.');
    return;
  }

  console.log(`🗑️ Se encontraron ${numericIds.length} títulos numéricos basura. Borrando...`);

  // Borrar en orden respetando Foreign Keys
  await prisma.videoQuality.deleteMany({ where: { videoFile: { contentId: { in: numericIds } } } });
  await prisma.videoFile.deleteMany({ where: { contentId: { in: numericIds } } });
  await prisma.thumbnail.deleteMany({ where: { contentId: { in: numericIds } } });
  await prisma.contentTranslation.deleteMany({ where: { contentId: { in: numericIds } } });
  await prisma.contentGenre.deleteMany({ where: { contentId: { in: numericIds } } });
  await prisma.content.deleteMany({ where: { id: { in: numericIds } } });

  console.log('✅ Basura numérica eliminada correctamente.');
}

cleanNumericTitles().finally(() => prisma.$disconnect());
