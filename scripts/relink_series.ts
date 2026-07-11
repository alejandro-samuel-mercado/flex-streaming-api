import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("=== Análisis de Archivos Ya Importados (Orfanatos) ===");

  // Encontrar VideoFiles que existen, pero cuyo Content está eliminado o no coincide
  const allVideos = await prisma.videoFile.findMany({
    where: { type: 'EPISODE' },
    select: { id: true, contentId: true, originalPath: true }
  });

  const softDeletedContents = await prisma.content.findMany({
    where: { deletedAt: { not: null } },
    select: { id: true, translations: true }
  });
  const deletedContentIds = new Set(softDeletedContents.map(c => c.id));

  let orphans = 0;
  for (const v of allVideos) {
    if (v.contentId && deletedContentIds.has(v.contentId)) {
      orphans++;
    }
  }

  console.log(`\n📌 Hay ${allVideos.length} episodios en total en la BD.`);
  console.log(`📌 Hay ${orphans} episodios que pertenecen a series ELIMINADAS (Papelera).`);
  
  if (orphans > 0) {
     console.log("\n⚠️ Cuando eliminas una serie o creas una nueva, los videos antiguos siguen existiendo ocultos en la base de datos.");
     console.log("⚠️ El escáner los ve y dice 'ya están importados', por eso no los agrega a tu nueva serie fijada.");
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
