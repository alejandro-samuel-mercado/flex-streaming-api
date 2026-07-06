import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  console.log('Buscando la serie fantasma "Yo Teach...!"...');
  
  const series = await prisma.content.findMany({
    where: {
      type: 'SERIES',
      translations: {
        some: { title: { contains: 'Teach' } }
      }
    },
    include: { translations: true, seasons: { include: { episodes: true } } }
  });
  
  for (const s of series) {
    const title = s.translations[0]?.title || '';
    if (title.includes('Yo Teach')) {
      console.log(`Borrando la serie fantasma: ${title} (ID: ${s.id})`);
      await prisma.content.delete({ where: { id: s.id } });
      console.log('Serie borrada con éxito.');
    }
  }

  // Also trigger Maintenance cleanup manually once
  console.log('Triggering full maintenance ghost cleanup...');
  const { MaintenanceService } = await import('../src/modules/maintenance/maintenance.service');
  await MaintenanceService.cleanGhostSeries();
}

main().catch(console.error).finally(() => prisma.$disconnect());
