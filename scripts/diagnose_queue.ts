import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const prisma = new PrismaClient();

async function main() {
  console.log("=== Diagnóstico de Trabajos Encolados (QUEUED/PROCESSING) ===");
  
  // 1. Revisar estado en la base de datos
  const queued = await prisma.videoFile.findMany({
    where: { status: 'QUEUED' },
    select: { id: true, type: true, contentId: true, episodeId: true, originalPath: true }
  });
  console.log(`\n📌 Hay ${queued.length} archivos en estado QUEUED en la Base de Datos.`);
  
  const processing = await prisma.videoFile.findMany({
    where: { status: 'PROCESSING' },
    select: { id: true, type: true, originalPath: true, updatedAt: true }
  });
  console.log(`\n📌 Hay ${processing.length} archivos en estado PROCESSING en la Base de Datos.`);
  processing.forEach(p => console.log(`   - [${p.type}] ${p.id} (actualizado: ${p.updatedAt})`));

  // 2. Revisar BullMQ
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const queueName = process.env.QUEUE_NAME || 'video-processing';
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const videoQueue = new Queue(queueName, { connection: connection as any });
  
  const isPaused = await videoQueue.isPaused();
  const counts = await videoQueue.getJobCounts();
  console.log(`\n=== Estado de BullMQ (${queueName}) ===`);
  console.log(`¿Pausado?: ${isPaused}`);
  console.log(`Conteos:`, counts);
  
  const activeJobs = await videoQueue.getActive();
  if (activeJobs.length > 0) {
    console.log(`\n🔥 Trabajos Activos en BullMQ:`);
    activeJobs.forEach(j => console.log(`   - Job ${j.id}: ${j.data.type || 'MOVIE'} ${j.data.videoPath}`));
  } else {
    console.log(`\n🔥 No hay trabajos activos en BullMQ.`);
  }

  // 3. Revisar variables de entorno problemáticas
  console.log(`\n=== Configuración del Worker ===`);
  console.log(`ENABLE_WORKER: ${process.env.ENABLE_WORKER}`);
  console.log(`WORKER_MODE: ${process.env.WORKER_MODE}`);

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
