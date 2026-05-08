import { PrismaClient, ContentStatus, ProcessingStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando escaneo de estados de contenido...');

  const contents = await prisma.content.findMany({
    where: {
      status: ContentStatus.READY,
    },
    include: {
      videoFiles: true,
      seasons: {
        include: {
          episodes: {
            include: {
              videoFiles: true,
            },
          },
        },
      },
    },
  });

  console.log(`📑 Se encontraron ${contents.length} contenidos marcados como READY.`);

  let fixed = 0;

  for (const content of contents) {
    let shouldBeError = false;
    let shouldBePending = false;
    let reason = '';

    if (content.type === 'MOVIE') {
      if (content.videoFiles.length === 0) {
        shouldBePending = true;
        reason = 'No tiene archivos de video vinculados.';
      } else {
        const allFailed = content.videoFiles.every(vf => vf.status === ProcessingStatus.FAILED);
        const noneCompleted = !content.videoFiles.some(vf => vf.status === ProcessingStatus.COMPLETED);
        
        if (allFailed || noneCompleted) {
          shouldBeError = true;
          reason = 'Todos los archivos de video fallaron o no hay ninguno completado.';
        }
      }
    } else {
      // Para Series, Animes, etc.
      const allEpisodes = content.seasons.flatMap(s => s.episodes);
      
      if (allEpisodes.length === 0) {
        // Si no tiene episodios, pero tiene archivos de video directos (modo pelicula accidental)
        if (content.videoFiles.length > 0) {
            const hasCompleted = content.videoFiles.some(vf => vf.status === ProcessingStatus.COMPLETED);
            if (!hasCompleted) {
                shouldBeError = true;
                reason = 'Es una serie sin episodios y sus videos directos NO están completados.';
            }
        } else {
            shouldBePending = true;
            reason = 'Es una serie sin temporadas ni episodios configurados.';
        }
      } else {
        const playableEpisodes = allEpisodes.filter(ep => 
          ep.videoFiles.some(vf => vf.status === ProcessingStatus.COMPLETED)
        );

        if (playableEpisodes.length === 0) {
          shouldBeError = true;
          reason = `De los ${allEpisodes.length} episodios, ninguno tiene un video procesado correctamente (COMPLETED).`;
        }
      }
    }

    if (shouldBeError || shouldBePending) {
      const newStatus = shouldBeError ? ContentStatus.ERROR : ContentStatus.PENDING;
      console.log(`⚠️  Corrigiendo: "${content.originalTitle || content.slug}" (${content.type})`);
      console.log(`   └─ Motivo: ${reason}`);
      console.log(`   └─ Estado: READY -> ${newStatus}`);

      await prisma.content.update({
        where: { id: content.id },
        data: { status: newStatus },
      });
      fixed++;
    }
  }

  console.log(`\n✅ Proceso finalizado. Se corrigieron ${fixed} contenidos.`);
}

main()
  .catch((e) => {
    console.error('❌ Error ejecutando el script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
