import { videoQueue } from './src/services/queue.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const videos = await prisma.videoFile.findMany({ where: { status: 'PROCESSING' } });
  for (const v of videos) {
    if (v.processingJobId) {
      const job = await videoQueue.getJob(v.processingJobId);
      console.log(`Video ID: ${v.id}, Job ID: ${v.processingJobId}, Job Progress: ${job?.progress}, Type of Progress: ${typeof job?.progress}`);
    } else {
      console.log(`Video ID: ${v.id} has no processingJobId!`);
    }
  }
}
main().finally(() => {
  prisma.$disconnect();
  process.exit(0);
});
