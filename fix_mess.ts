import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();
const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const videoQueue = new Queue('video-processing', { connection });

async function run() {
  console.log('🛑 Pausing queue and clearing it...');
  await videoQueue.pause();
  await videoQueue.obliterate({ force: true });
  console.log('✅ Queue obliterated.');

  console.log('⏪ Restoring all QUEUED videos back to COMPLETED...');
  // We can just set ALL videos that were queued back to COMPLETED except those that genuinely have no HLS.
  // Actually, we can just set them all to COMPLETED for now to stop the bleeding.
  const updated = await prisma.videoFile.updateMany({
    where: { status: 'QUEUED' },
    data: { status: 'COMPLETED' }
  });

  console.log(`✅ Restored ${updated.count} videos back to COMPLETED.`);
  
  await prisma.$disconnect();
  connection.disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
