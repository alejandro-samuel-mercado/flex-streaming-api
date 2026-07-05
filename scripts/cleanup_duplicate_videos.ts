import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('🔍 Buscando archivos de video encolados o procesando por duplicado...');

  // Buscar todos los videoFiles agrupados por originalPath
  const videoFiles = await prisma.videoFile.findMany({
    orderBy: { createdAt: 'asc' }
  });

  const grouped = new Map<string, typeof videoFiles>();

  for (const v of videoFiles) {
    if (!v.originalPath) continue;
    if (!grouped.has(v.originalPath)) grouped.set(v.originalPath, []);
    grouped.get(v.originalPath)!.push(v);
  }

  let deletedCount = 0;

  for (const [path, group] of grouped.entries()) {
    if (group.length > 1) {
      console.log(`\n⚠️  Encontrados ${group.length} registros para el mismo archivo: ${path}`);
      
      // Dejamos el PRIMERO (el más antiguo) y borramos los demás
      const [keep, ...duplicates] = group;

      for (const dup of duplicates) {
        if (dup.status === 'COMPLETED') {
           console.log(`❌ No borraremos ${dup.id} porque está completado, saltando.`);
           continue;
        }
        
        await prisma.videoFile.delete({ where: { id: dup.id } });
        console.log(`✅ Duplicado ${dup.id} (${dup.status}) eliminado.`);
        deletedCount++;
      }
    }
  }

  console.log(`\n🎉 Finalizado! Se eliminaron ${deletedCount} registros de video duplicados en la base de datos.`);
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
