import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Iniciando limpieza de procesos estancados...');
    
    const stuckVideos = await prisma.videoFile.updateMany({
        where: {
            status: 'PROCESSING'
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
}

main()
    .catch((e) => {
        console.error('❌ Error durante la limpieza:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
