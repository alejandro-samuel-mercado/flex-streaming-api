import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Buscando videos de series que se colaron como películas o huérfanos...');

  // Buscar todos los videos que están físicamente en la carpeta de series
  // pero que NO son de tipo EPISODE o están huérfanos.
  const videosInfiltrados = await prisma.videoFile.findMany({
    where: {
      originalPath: { contains: '/home/media/series' },
      OR: [
        { type: 'MOVIE' },
        { episodeId: null }
      ],
      content: { isPinned: false }
    },
    include: { content: true }
  });

  let eliminados = 0;
  let contenidosEliminados = 0;
  const contenidosParaBorrar = new Set<string>();

  for (const vf of videosInfiltrados) {
    console.log(`⚠️ Destruyendo video infiltrado: ${vf.originalPath}`);
    
    // Si estaba atado a un contenido basura creado por accidente, marcarlo para borrar
    if (vf.contentId) {
      contenidosParaBorrar.add(vf.contentId);
    }

    // Borrar calidades y el video
    await prisma.videoQuality.deleteMany({ where: { videoFileId: vf.id } });
    await prisma.videoFile.delete({ where: { id: vf.id } });
    eliminados++;
  }

  // Borrar los contenidos basura (solo si son MOVIE para no romper series reales por accidente)
  for (const contentId of contenidosParaBorrar) {
    const c = await prisma.content.findUnique({ where: { id: contentId } });
    if (c && c.type === 'MOVIE') {
       await prisma.contentTranslation.deleteMany({ where: { contentId: c.id } });
       await prisma.contentGenre.deleteMany({ where: { contentId: c.id } });
       await prisma.content.delete({ where: { id: c.id } });
       contenidosEliminados++;
    }
  }

  console.log(`\n✅ ¡Aniquilación completa!`);
  console.log(`- Se eliminaron ${eliminados} videos de series que estaban camuflados/huérfanos.`);
  console.log(`- Se eliminaron ${contenidosEliminados} títulos basura de películas.`);
  console.log('➡️ AHORA SÍ, el camino está 100% despejado. Corre "npx tsx escanear_series.ts" en tu servidor de series.');
}

run().finally(() => process.exit(0));
