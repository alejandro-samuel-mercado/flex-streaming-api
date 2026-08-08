import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';

async function fix() {
    console.log("Restaurando los episodios que quedaron como QUEUED/PROCESSING...");
    const result = await prisma.videoFile.updateMany({
        where: {
            type: 'EPISODE',
            status: { in: ['QUEUED', 'PROCESSING'] }
        },
        data: {
            status: 'COMPLETED'
        }
    });
    console.log(`✅ Listo. Se han restaurado ${result.count} episodios a estado COMPLETED.`);
}

fix().catch(console.error).finally(() => process.exit(0));
