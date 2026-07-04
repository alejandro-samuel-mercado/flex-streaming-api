import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Buscando series con episodios fusionados (Múltiples videos en el Episodio 1)...');

  // Buscar episodios que tengan más de 1 video HLS completado
  const episodiosSospechosos = await prisma.episode.findMany({
    include: { videoFiles: true, season: { include: { content: true } } }
  });

  let eliminados = 0;
  const contenidosAfectados = new Set<string>();

  for (const ep of episodiosSospechosos) {
    if (ep.videoFiles.length > 1) {
      console.log(`⚠️  Episodio fusionado detectado en la serie "${ep.season.content.translations?.[0]?.title || ep.season.content.slug}": T${ep.season.number}E${ep.number} tiene ${ep.videoFiles.length} videos atados.`);
      
      for (const vf of ep.videoFiles) {
        // Borrar dependencias
        await prisma.videoQuality.deleteMany({ where: { videoFileId: vf.id } });
        await prisma.videoFile.delete({ where: { id: vf.id } });
        eliminados++;
      }
      
      // Borrar el episodio corrupto
      await prisma.episode.delete({ where: { id: ep.id } });
      contenidosAfectados.add(ep.season.content.id);
    }
  }

  // Marcar los contenidos como PENDING para el re-escaneo
  for (const contentId of contenidosAfectados) {
    await prisma.content.update({ where: { id: contentId }, data: { status: 'PENDING' } });
  }

  console.log(`✅ Limpieza de episodios fusionados completada. Se eliminaron ${eliminados} videos corruptos.`);
  console.log('➡️  Ahora puedes correr "npx tsx escanear_series.ts" y se importarán separados correctamente.');
}

run().finally(() => process.exit(0));
