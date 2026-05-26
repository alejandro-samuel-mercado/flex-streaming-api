import { PrismaClient } from '@prisma/client';
import { videoQueue } from '../services/queue.service';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Iniciando limpieza de procesos estancados...');
    
    // Limpiar trabajos huérfanos en Redis (opcional pero recomendado)
    try {
        console.log('🧹 Limpiando la cola de BullMQ...');
        await videoQueue.obliterate({ force: true });
        console.log('✅ Cola de BullMQ limpiada.');
    } catch (err: any) {
        console.warn(`⚠️ No se pudo limpiar BullMQ (probablemente ya estaba vacía): ${err.message}`);
    }

    const stuckVideos = await prisma.videoFile.updateMany({
        where: {
            status: { in: ['PROCESSING', 'QUEUED'] }
        },
        data: {
            status: 'FAILED',
            errorMessage: 'Proceso reiniciado manualmente para destrabar la cola.'
        }
    });

    console.log(`✅ Se han reseteado ${stuckVideos.count} videos a estado FALLIDO.`);
    
    // También resetear el contenido asociado si estaba en PROCESSING
    const stuckContent = await prisma.content.updateMany({
        where: {
            status: 'PROCESSING'
        },
        data: {
            status: 'ERROR'
        }
    });
    
    console.log(`✅ Se han reseteado ${stuckContent.count} contenidos a estado ERROR.`);
    console.log('🚀 Ahora puedes presionar el botón "Reintentar Fallidos" en el panel de administrador para volver a encolar todos.');
}

main()
    .catch((e) => {
        console.error('❌ Error durante la limpieza:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        // BullMQ queue connection needs to be closed
        await videoQueue.close();
    });
