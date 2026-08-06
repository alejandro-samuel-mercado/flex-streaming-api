import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function restaurarAbsolutamenteTodo() {
    console.log("🚑 Restaurando TODOS los episodios y series sin importar la fecha...");

    // 1. Restaurar TODOS los episodios (VideoFiles) a COMPLETED
    const videoResult = await prisma.videoFile.updateMany({
        where: {
            type: 'EPISODE',
            status: { in: ['QUEUED', 'PROCESSING', 'PENDING'] }
        },
        data: {
            status: 'COMPLETED'
        }
    });

    // 2. Restaurar TODAS las series (Content) a ACTIVE
    const contentResult = await prisma.content.updateMany({
        where: {
            type: 'SERIES',
            status: { in: ['PENDING', 'DRAFT', 'PROCESSING'] }
        },
        data: {
            status: 'ACTIVE'
        }
    });

    console.log(`✅ ¡Solucionado!`);
    console.log(`   - Se restauraron ${videoResult.count} episodios atascados a COMPLETED.`);
    console.log(`   - Se restauraron ${contentResult.count} series atascadas a ACTIVE.`);
}

restaurarAbsolutamenteTodo().catch(console.error).finally(() => process.exit(0));
