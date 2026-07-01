import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Sincronizando estado de Contenidos (Películas y Series)...');

    // 1. Update Content with COMPLETED VideoFiles to READY
    const pendingContents = await prisma.content.findMany({
        where: { status: 'PENDING' },
        include: {
            videoFiles: true,
            seasons: {
                include: {
                    episodes: {
                        include: {
                            videoFiles: true
                        }
                    }
                }
            }
        }
    });

    let fixedReady = 0;
    let fixedFailed = 0;

    for (const content of pendingContents) {
        let isReady = false;
        let isProcessing = false;

        if (content.type === 'MOVIE') {
            const hasCompleted = content.videoFiles.some(v => v.status === 'COMPLETED');
            const hasProcessing = content.videoFiles.some(v => ['PENDING', 'QUEUED', 'PROCESSING'].includes(v.status));
            
            if (hasCompleted) isReady = true;
            else if (hasProcessing) isProcessing = true;
        } else if (content.type === 'SERIES') {
            // Series is ready if it has at least one completed episode
            for (const season of content.seasons) {
                for (const episode of season.episodes) {
                    if (episode.videoFiles.some(v => v.status === 'COMPLETED')) {
                        isReady = true;
                        break;
                    } else if (episode.videoFiles.some(v => ['PENDING', 'QUEUED', 'PROCESSING'].includes(v.status))) {
                        isProcessing = true;
                    }
                }
            }
        }

        if (isReady) {
            await prisma.content.update({
                where: { id: content.id },
                data: { status: 'READY' }
            });
            fixedReady++;
            console.log(`[OK] Contenido ${content.slug} marcado como READY.`);
        } else if (!isProcessing) {
            // No video is completed, and none are processing. It's a ghost or failed.
            await prisma.content.update({
                where: { id: content.id },
                data: { status: 'FAILED' }
            });
            fixedFailed++;
            console.log(`[FAILED] Contenido ${content.slug} no tiene videos válidos, marcado como FAILED.`);
        }
    }

    console.log(`\n🎉 Sincronización terminada.`);
    console.log(`- ${fixedReady} contenidos marcados como READY (¡listos para verse!).`);
    console.log(`- ${fixedFailed} contenidos marcados como FAILED (archivos no encontrados o rotos).`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
