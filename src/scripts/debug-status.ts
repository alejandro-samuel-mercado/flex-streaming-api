import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Consultando estados de VideoFile...');
    
    const stats = await prisma.videoFile.groupBy({
        by: ['status'],
        _count: {
            _all: true
        }
    });

    console.log('📊 Estadísticas de VideoFile:');
    console.log(JSON.stringify(stats, null, 2));

    const processing = await prisma.videoFile.findMany({
        where: { status: 'PROCESSING' },
        select: { id: true, contentId: true, episodeId: true, originalPath: true }
    });

    console.log(`🎥 Videos en PROCESSING (${processing.length}):`);
    console.log(JSON.stringify(processing.slice(0, 5), null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
