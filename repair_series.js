const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repair() {
  console.log('🔍 Buscando inconsistencias en series...');

  // Buscar todos los contenidos que son de tipo SERIES
  const series = await prisma.content.findMany({
    where: { 
        type: { in: ['SERIES', 'ANIME', 'REALITY_SHOW', 'NOVELA'] } 
    },
    include: {
      videoFiles: true,
      translations: { where: { language: 'es' } }
    }
  });

  console.log(`📑 Analizando ${series.length} series en total.`);

  let repairedCount = 0;

  for (const s of series) {
    if (s.videoFiles.length === 0) continue;

    const title = s.translations?.[0]?.title || s.slug;
    console.log(`\n📺 Procesando serie: "${title}" (${s.id})`);
    console.log(`   Encontrados ${s.videoFiles.length} videos mal vinculados.`);

    for (const vf of s.videoFiles) {
      try {
        const pathStr = vf.originalPath || '';
        // Intentar extraer SxxExx del path o nombre
        let seasonNum = 1;
        let episodeNum = 1;

        const match = pathStr.match(/[Ss](\d+)[Ee](\d+)/);
        if (match) {
          seasonNum = parseInt(match[1], 10);
          episodeNum = parseInt(match[2], 10);
        } else {
          // Si no hay S/E, buscamos solo números sueltos o asumimos S01E01 si es el único
          const simpleMatch = pathStr.match(/E(\d+)/i) || pathStr.match(/(\d+)/);
          if (simpleMatch) {
            episodeNum = parseInt(simpleMatch[1], 10);
          }
        }

        console.log(`   🛠️  Asignando video a S${seasonNum}E${episodeNum} (Path: ${pathStr})`);

        // 1. Asegurar Temporada
        const season = await prisma.season.upsert({
          where: { contentId_number: { contentId: s.id, number: seasonNum } },
          update: {},
          create: { contentId: s.id, number: seasonNum }
        });

        // 2. Asegurar Episodio
        const episode = await prisma.episode.upsert({
          where: { seasonId_number: { seasonId: season.id, number: episodeNum } },
          update: {},
          create: { seasonId: season.id, number: episodeNum }
        });

        // 3. Vincular VideoFile al Episodio y limpiar ContentId
        await prisma.videoFile.update({
          where: { id: vf.id },
          data: {
            episodeId: episode.id,
            contentId: null,
            type: 'EPISODE'
          }
        });

        console.log(`   ✅ Video ${vf.id} movido con éxito.`);
        repairedCount++;
      } catch (err) {
        console.error(`   ❌ Error moviendo video ${vf.id}:`, err.message);
      }
    }
  }

  console.log(`\n✨ Reparación completada. Se movieron ${repairedCount} videos.`);
}

repair()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
