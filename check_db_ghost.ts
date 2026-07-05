import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function main() {
  const total = await prisma.videoFile.count();
  const completed = await prisma.videoFile.count({ where: { status: 'COMPLETED' } });
  const failed = await prisma.videoFile.count({ where: { status: 'FAILED' } });
  const queued = await prisma.videoFile.count({ where: { status: 'QUEUED' } });
  const processing = await prisma.videoFile.count({ where: { status: 'PROCESSING' } });

  console.log('--- Resumen de VideoFiles ---');
  console.log('Total:', total);
  console.log('Completed:', completed);
  console.log('Failed:', failed);
  console.log('Queued:', queued);
  console.log('Processing:', processing);

  // Buscar duplicados de originalPath
  const dups = await prisma.$queryRaw<Array<{ originalPath: string; count: bigint }>>`
    SELECT "originalPath", COUNT(*) as count 
    FROM "video_files" 
    GROUP BY "originalPath" 
    HAVING COUNT(*) > 1
    LIMIT 20;
  `;

  console.log('\n--- Duplicados detectados (Top 20) ---');
  if (dups.length === 0) {
    console.log('No hay duplicados de originalPath en la base de datos.');
  } else {
    for (const d of dups) {
      console.log(`Path: ${d.originalPath} (Repetido ${d.count} veces)`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
