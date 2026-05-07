const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repair() {
  console.log('🔍 Buscando VideoFiles de tipo EPISODE mal vinculados...');

  const videoFiles = await prisma.videoFile.findMany({
    where: {
      type: 'EPISODE',
      episodeId: null,
      contentId: { not: null }
    },
    include: {
      content: {
        include: {
           translations: { where: { language: 'es' } }
        }
      }
    }
  });

  console.log(`📑 Se encontraron ${videoFiles.length} archivos para reparar.`);

  for (const vf of videoFiles) {
    try {
      const pathStr = vf.originalPath;
      // Intentar extraer SxxExx del path
      const match = pathStr.match(/[Ss](\d+)[Ee](\d+)/);
      if (!match) {
        console.warn(`⚠️ No se pudo determinar S/E para: ${pathStr}. Saltando.`);
        continue;
      }

      const seasonNum = parseInt(match[1], 10);
      const episodeNum = parseInt(match[2], 10);

      const title = vf.content?.translations?.[0]?.title || vf.contentId;
      console.log(`🛠️ Reparando: ${title} -> S${seasonNum}E${episodeNum}`);

      // 1. Asegurar Temporada
      const season = await prisma.season.upsert({
        where: { contentId_number: { contentId: vf.contentId, number: seasonNum } },
        update: {},
        create: { contentId: vf.contentId, number: seasonNum }
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
          contentId: null
        }
      });

      console.log(`✅ Reparado: ${vf.id}`);
    } catch (err) {
      console.error(`❌ Error reparando ${vf.id}:`, err.message);
    }
  }

  console.log('✨ Reparación completada.');
}

repair()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
