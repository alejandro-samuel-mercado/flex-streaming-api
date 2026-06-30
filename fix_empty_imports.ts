import './src/shared/config/env';
import { prisma } from './src/shared/config/prisma';
import fs from 'fs';

async function run() {
  // Buscar VideoFiles que están encolados
  const queued = await prisma.videoFile.findMany({
    where: { status: 'QUEUED' },
    include: { content: true }
  });

  let count = 0;
  for (const vf of queued) {
    // Si originalPath es un directorio y no un archivo, fue importado por error como película
    if (vf.originalPath && fs.existsSync(vf.originalPath)) {
      const stat = fs.statSync(vf.originalPath);
      if (stat.isDirectory()) {
        console.log(`Eliminando importación errónea: ${vf.content?.title || vf.id}`);
        // Borrar el VideoFile
        await prisma.videoFile.delete({ where: { id: vf.id } });
        // Borrar el Content si era una película temporal creada por error
        if (vf.contentId) {
          await prisma.content.delete({ where: { id: vf.contentId } }).catch(() => {});
        }
        count++;
      }
    }
  }
  console.log(`✅ Limpiados ${count} falsos videos de carpetas vacías.`);
}
run().finally(() => prisma.$disconnect());
