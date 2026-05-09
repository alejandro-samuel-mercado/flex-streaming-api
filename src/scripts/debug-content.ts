import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Consultando estados de Content...');
    
    const stats = await prisma.content.groupBy({
        by: ['status'],
        _count: {
            _all: true
        }
    });

    console.log('📊 Estadísticas de Content:');
    console.log(JSON.stringify(stats, null, 2));

    const processing = await prisma.content.findMany({
        where: { status: 'PROCESSING' },
        select: { id: true, slug: true, title: true }
    });

    console.log(`🎬 Contenidos en PROCESSING (${processing.length}):`);
    console.log(JSON.stringify(processing, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
