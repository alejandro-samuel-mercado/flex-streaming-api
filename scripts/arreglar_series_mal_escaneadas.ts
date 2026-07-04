import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Iniciando limpieza profunda de Series mal escaneadas...');

  // Buscar todas las Series
  const series = await prisma.content.findMany({
    where: { type: 'SERIES' },
    include: { videoFiles: true }
  });

  let eliminados = 0;

  for (const s of series) {
    // Si la serie tiene videoFiles atados directamente a ella (como si fuera película)
    if (s.videoFiles.length > 0) {
      console.log(`⚠️  Serie afectada encontrada: ${s.id} (Tiene ${s.videoFiles.length} videos mal enlazados). Limpiando...`);
      
      for (const vf of s.videoFiles) {
        // Borrar VideoQuality dependientes
        await prisma.videoQuality.deleteMany({ where: { videoFileId: vf.id } });
        // Borrar el VideoFile
        await prisma.videoFile.delete({ where: { id: vf.id } });
        eliminados++;
      }
      
      // Pasar a PENDING para que el escáner la vuelva a agarrar limpia
      await prisma.content.update({ where: { id: s.id }, data: { status: 'PENDING' } });
    }
  }

  console.log(`✅ ¡Limpieza completada! Se eliminaron ${eliminados} videos corruptos de series.`);
  console.log('➡️  Ahora puedes correr "npx tsx escanear_series.ts" y ya no se saltará los episodios.');
}

run().finally(() => process.exit(0));
