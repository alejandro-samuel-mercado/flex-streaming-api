const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function sync() {
  console.log('🔄 Sincronizando estados de contenido...');

  // 1. Buscar todos los contenidos PENDING
  const pendingContent = await prisma.content.findMany({
    where: { status: 'PENDING' },
    include: {
      videoFiles: { where: { status: 'COMPLETED' } },
      seasons: {
        include: {
          episodes: {
            include: {
              videoFiles: { where: { status: 'COMPLETED' } }
            }
          }
        }
      }
    }
  });

  console.log(`🔍 Se encontraron ${pendingContent.length} contenidos en estado PENDING.`);

  let updated = 0;

  for (const content of pendingContent) {
    let hasCompletedVideo = content.videoFiles.length > 0;

    // Si no tiene video directo (película), revisar episodios (serie)
    if (!hasCompletedVideo) {
      for (const season of content.seasons) {
        for (const episode of season.episodes) {
          if (episode.videoFiles.length > 0) {
            hasCompletedVideo = true;
            break;
          }
        }
        if (hasCompletedVideo) break;
      }
    }

    if (hasCompletedVideo) {
      await prisma.content.update({
        where: { id: content.id },
        data: { status: 'READY' }
      });
      console.log(`✅ Contenido [${content.id}] marcado como READY.`);
      updated++;
    }
  }

  console.log(`✨ Sincronización completada. Se actualizaron ${updated} contenidos.`);
}

sync()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
