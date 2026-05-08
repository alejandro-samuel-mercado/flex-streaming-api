import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SERIES_TYPES = ['SERIES', 'ANIME', 'NOVELA', 'REALITY_SHOW', 'TALK_SHOW', 'VARIETY_SHOW', 'EDUCATIONAL', 'KIDS', 'FAMILY', 'DOCUDRAMA'];

async function repair() {
  console.log('🚀 [Repair] Iniciando reparación de episodios...');

  // Buscar VideoFiles vinculados directamente a contenidos de tipo SERIE
  const videoFiles = await prisma.videoFile.findMany({
    where: {
      episodeId: null,
      contentId: { not: null },
      content: {
        type: { in: ['SERIES', 'ANIME', 'NOVELA', 'REALITY_SHOW', 'TALK_SHOW', 'VARIETY_SHOW', 'EDUCATIONAL', 'KIDS', 'FAMILY', 'DOCUDRAMA'] as any }
      }
    },
    include: {
      content: true
    }
  });

  console.log(`📑 Se encontraron ${videoFiles.length} archivos vinculados directamente a series.`);

  for (const vf of videoFiles as any[]) {
    try {
      const path = vf.originalPath || '';
      const filename = path.split('/').pop() || '';
      
      // Intentar extraer SxxExx del path o nombre de archivo
      let seasonNum = 1;
      let episodeNum = 1;

      const seMatch = filename.match(/[Ss](\d+)[Ee](\d+)/) || path.match(/[Ss](\d+)[Ee](\d+)/);
      if (seMatch) {
        seasonNum = parseInt(seMatch[1], 10);
        episodeNum = parseInt(seMatch[2], 10);
      } else {
        // Intentar buscar solo el número de episodio (ej: "Friends 01.mp4")
        const eMatch = filename.match(/\s(\d{1,3})\b/) || filename.match(/[_-](\d{1,3})\./);
        if (eMatch) {
          episodeNum = parseInt(eMatch[1], 10);
        } else {
          console.warn(`⚠️ No se pudo determinar S/E para: "${filename}". Usando S1E1 por defecto.`);
        }
      }

      console.log(`🛠️ Reparando: "${vf.content?.originalTitle || 'Serie'}" -> S${seasonNum}E${episodeNum} (${filename})`);

      // 1. Asegurar Temporada
      const season = await prisma.season.upsert({
        where: { contentId_number: { contentId: vf.contentId!, number: seasonNum } },
        update: {},
        create: { contentId: vf.contentId!, number: seasonNum }
      });

      // 2. Asegurar Episodio
      const episode = await prisma.episode.upsert({
        where: { seasonId_number: { seasonId: season.id, number: episodeNum } },
        update: {},
        create: { seasonId: season.id, number: episodeNum }
      });

      // 3. Vincular VideoFile al Episodio y desvincular del Contenido
      await prisma.videoFile.update({
        where: { id: vf.id },
        data: {
          episodeId: episode.id,
          contentId: null,
          type: 'EPISODE' // Aseguramos que el tipo sea EPISODE
        }
      });

      console.log(`✅ Reparado: ${vf.id}`);
    } catch (err: any) {
      console.error(`❌ Error reparando ${vf.id}:`, err.message);
    }
  }

  console.log('✨ Reparación completada.');
}

repair()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
