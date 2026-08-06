import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function activarSeries() {
    console.log("Restaurando los estados de las Series y sus Episodios...");

    // 1. Restaurar el estado de los episodios (VideoFiles) a COMPLETED
    const videoResult = await prisma.videoFile.updateMany({
        where: {
            type: 'EPISODE',
            status: { in: ['QUEUED', 'PROCESSING', 'PENDING'] },
            createdAt: { gte: new Date('2026-07-29T00:00:00.000Z') }
        },
        data: {
            status: 'COMPLETED'
        }
    });

    // 2. Restaurar el estado del Contenedor (Content / Serie) a ACTIVE
    const contentResult = await prisma.content.updateMany({
        where: {
            type: 'SERIES',
            status: { in: ['PENDING', 'DRAFT'] },
            createdAt: { gte: new Date('2026-07-29T00:00:00.000Z') }
        },
        data: {
            status: 'ACTIVE'
        }
    });

    console.log(`✅ Listo.`);
    console.log(`   - Se restauraron ${videoResult.count} episodios de vuelta a COMPLETED.`);
    console.log(`   - Se restauraron ${contentResult.count} series de vuelta a ACTIVE.`);
}

activarSeries().catch(console.error).finally(() => process.exit(0));
