import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();

async function run() {
  console.log('🛑 1. CONECTANDO Y VACIANDO LA COLA...');
  
  try {
    const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
    const videoQueue = new Queue('video-processing', { connection });
    await videoQueue.pause();
    await videoQueue.obliterate({ force: true });
    console.log('✅ Cola vaciada por completo.');
    connection.disconnect();
  } catch (e: any) {
    console.log('⚠️ No se pudo vaciar la cola automáticamente. Si el worker sigue procesando, detenlo con "pm2 stop all"');
  }

  console.log('⏪ 2. RESTAURANDO TODAS LAS PELICULAS/SERIES...');
  
  // Todo lo que el script dañino puso como QUEUED lo volvemos a poner como COMPLETED.
  // El error fue porque el script viejo no encontraba las rutas correctas y creyó que todas estaban rotas.
  const updated = await prisma.videoFile.updateMany({
    where: { status: 'QUEUED' },
    data: { status: 'COMPLETED' }
  });

  console.log(`✅ ¡Restaurados ${updated.count} videos de vuelta a COMPLETED!`);
  console.log(`\n🎉 Tu librería ha vuelto a la normalidad en la base de datos.`);
  
  await prisma.$disconnect();
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
