import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando re-cálculo de estado de las Series...');
  
  const SERIES_TYPES = ['SERIES', 'ANIME', 'ANIMATION', 'NOVELA', 'REALITY_SHOW', 'DOCUMENTARY', 'KIDS', 'FAMILY'];

  // Obtener todas las series
  const series = await prisma.content.findMany({
    where: {
      type: { in: SERIES_TYPES }
    },
    include: {
      thumbnails: true
    }
  });

  console.log(`📌 Encontradas ${series.length} series en total. Revisando episodios...`);

  let actived = 0;
  let pending = 0;

  for (const s of series) {
    const hasPoster = s.thumbnails.some((t: any) => t.type === 'POSTER');
    
    // Contar episodios con video COMPLETED para esta serie
    const completedEpisodes = await prisma.episode.count({
      where: {
        season: { contentId: s.id },
        videoFiles: { some: { status: 'COMPLETED' } }
      }
    });

    const targetStatus = (completedEpisodes > 0 && hasPoster) ? 'ACTIVE' : 'PENDING';

    if (s.status !== targetStatus) {
      await prisma.content.update({
        where: { id: s.id },
        data: { status: targetStatus }
      });
      console.log(`🔄 Serie "${s.slug}" actualizada a ${targetStatus} (${completedEpisodes} eps listos).`);
      if (targetStatus === 'ACTIVE') actived++;
      if (targetStatus === 'PENDING') pending++;
    }
  }

  console.log('--------------------------------------------------');
  console.log('✅ Proceso completado.');
  console.log(`📊 Series activadas: ${actived}`);
  console.log(`📊 Series pasadas a pendiente: ${pending}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
