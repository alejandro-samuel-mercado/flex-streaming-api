import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const accidente = await prisma.content.findFirst({
    where: { translations: { some: { title: { contains: 'Accidente' } } }, type: 'SERIES' },
    include: {
      seasons: {
        include: {
          episodes: {
            include: { videoFile: true }
          }
        }
      }
    }
  });

  if (!accidente) {
    console.log("No se encontró 'Accidente'");
    process.exit(0);
  }

  console.log(`Serie: ${accidente.id} - Estado: ${accidente.status} - deletedAt: ${accidente.deletedAt}`);
  
  for (const season of accidente.seasons) {
    console.log(` Season ${season.number}`);
    for (const ep of season.episodes) {
      console.log(`  Episodio ${ep.number} - VideoFile: ${ep.videoFile ? ep.videoFile.status : 'NULL'} (ID: ${ep.videoFile?.id})`);
    }
  }

  // Buscar si hay VideoFiles orfanatos que pertenecen a la carpeta "The Accident"
  const orfanatos = await prisma.videoFile.findMany({
    where: { originalPath: { contains: 'The Accident' } },
    include: { episode: true, content: true }
  });
  
  console.log(`\nArchivos físicos en BD para The Accident: ${orfanatos.length}`);
  for (const o of orfanatos) {
     console.log(` - ${o.originalPath} | Estado: ${o.status} | episodeId: ${o.episodeId} | contentId: ${o.contentId}`);
     if (o.contentId && o.contentId !== accidente.id) {
        console.log(`   ⚠️ Este video está enlazado a OTRA serie: ${o.contentId}`);
     }
  }

  process.exit(0);
}
main();
