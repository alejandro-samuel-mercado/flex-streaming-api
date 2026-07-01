import { PrismaClient } from '@prisma/client';
import { addVideoJob } from './src/services/queue.service';

const prisma = new PrismaClient();

async function main() {
    console.log('Buscando videos atascados (PENDING, QUEUED, PROCESSING)...');
    
    const stuckVideos = await prisma.videoFile.findMany({
        where: {
            status: { in: ['PENDING', 'QUEUED', 'PROCESSING'] }
        }
    });

    if (stuckVideos.length === 0) {
        console.log('✅ No hay videos atascados.');
        return;
    }

    console.log(`⚠️ Se encontraron ${stuckVideos.length} videos atascados. Re-encolando...`);

    let count = 0;
    for (const v of stuckVideos) {
        try {
            const job = await addVideoJob({
                videoFileId: v.id,
                contentId: v.contentId || '',
                type: v.type,
                episodeId: v.episodeId || undefined,
                videoPath: v.originalPath,
            });

            await prisma.videoFile.update({
                where: { id: v.id },
                data: { 
                    status: 'QUEUED', 
                    errorMessage: null, 
                    processingJobId: job.id 
                }
            });
            console.log(`[OK] Video ${v.id} re-encolado (Job: ${job.id})`);
            count++;
        } catch (error: any) {
            console.error(`[ERROR] No se pudo re-encolar el video ${v.id}:`, error.message);
        }
    }

    console.log(`\n🎉 Proceso completado. Se re-encolaron ${count} videos.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
