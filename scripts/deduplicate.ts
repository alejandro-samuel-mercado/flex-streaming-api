import 'dotenv/config';
import { prisma } from '../src/shared/config/prisma';

async function main() {
  console.log('Buscando duplicados de originalPath en la base de datos...');

  const dups = await prisma.$queryRaw<Array<{ originalPath: string; count: bigint }>>`
    SELECT "originalPath", COUNT(*) as count 
    FROM "video_files" 
    GROUP BY "originalPath" 
    HAVING COUNT(*) > 1;
  `;

  console.log(`Se encontraron ${dups.length} rutas con duplicados.`);

  let deletedCount = 0;

  for (const d of dups) {
    const records = await prisma.videoFile.findMany({
      where: { originalPath: d.originalPath }
    });

    // Ordenar en TS: Priorizar COMPLETED, luego el más viejo
    records.sort((a, b) => {
      if (a.status === 'COMPLETED' && b.status !== 'COMPLETED') return -1;
      if (b.status === 'COMPLETED' && a.status !== 'COMPLETED') return 1;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });

    const keep = records[0];
    const toDelete = records.slice(1);

    console.log(`\nRuta: ${d.originalPath}`);
    console.log(`  [MANTENER] ID: ${keep.id} (Status: ${keep.status}, Creado: ${keep.createdAt.toISOString()})`);

    for (const record of toDelete) {
      console.log(`  [ELIMINAR] ID: ${record.id} (Status: ${record.status}, Creado: ${record.createdAt.toISOString()})`);
      await prisma.videoFile.delete({ where: { id: record.id } });
      deletedCount++;
    }
  }

  console.log(`\n¡Deduplicación terminada! Se eliminaron ${deletedCount} registros duplicados.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
