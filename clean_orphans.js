const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Buscando películas pendientes sin archivo de video...');
  
  const movies = await prisma.content.findMany({
    where: { type: 'MOVIE', status: 'PENDING' },
    include: { videoFiles: true }
  });

  const orphans = movies.filter(m => m.videoFiles.length === 0);
  
  console.log(`🔍 Se encontraron ${orphans.length} películas fantasma.`);
  
  let deleted = 0;
  for (const orphan of orphans) {
    try {
      await prisma.content.delete({ where: { id: orphan.id } });
      deleted++;
    } catch (e) {
      // Ignorar si falla por alguna relación extraña
    }
  }
  
  console.log(`✅ ¡Se eliminaron ${deleted} películas vacías de la BD!`);
}

main().catch(console.error).finally(() => process.exit(0));
