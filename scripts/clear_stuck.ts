import 'dotenv/config';
import { videoQueue } from '../src/services/queue.service';
import { prisma } from '../src/shared/config/prisma';

async function main() {
  console.log('1. Vaciando cola de BullMQ en Redis...');
  try {
    await videoQueue.drain(true);
    await videoQueue.clean(0, 5000, 'failed');
    await videoQueue.clean(0, 5000, 'completed');
    await videoQueue.clean(0, 5000, 'active');
    await videoQueue.clean(0, 5000, 'delayed');
    await videoQueue.clean(0, 5000, 'paused');
    console.log('✓ Cola BullMQ vaciada en Redis.');
  } catch (err: any) {
    console.error('⚠ Error vaciando la cola de Redis:', err.message);
  }

  console.log('2. Buscando videos trabados en PROCESSING o QUEUED...');
  const stuckVideos = await prisma.videoFile.findMany({
    where: {
      status: { in: ['PROCESSING', 'QUEUED'] }
    }
  });

  console.log(`Se encontraron ${stuckVideos.length} videos trabados.`);

  let resetCount = 0;
  for (const vf of stuckVideos) {
    console.log(`Reseteando ${vf.id} - ${vf.originalPath}`);
    await prisma.videoFile.update({
      where: { id: vf.id },
      data: {
        status: 'FAILED',
        errorMessage: 'Trabajo cancelado por limpieza de cola bloqueada. Listo para re-procesar.',
        hlsPath: '',
        masterPlaylist: ''
      }
    });
    resetCount++;
  }

  console.log(`\n✓ Se resetearon ${resetCount} videos a estado FAILED.`);
  console.log('¡Proceso de limpieza completado con éxito!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
