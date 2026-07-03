import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function run() {
    console.log('🔍 Analizando el catálogo para corregir estados inconsistentes (ACTIVE sin videos, etc)...');
    
    const contents = await prisma.content.findMany({
        include: { 
            thumbnails: true,
            seasons: {
                include: { episodes: { include: { videoFiles: true } } }
            },
            videoFiles: true
        }
    });

    let fixedCount = 0;

    for (const c of contents) {
        const hasPoster = c.thumbnails.some(t => t.type === 'POSTER');
        let targetStatus = c.status;
        const isSeries = ['SERIES', 'ANIME'].includes(c.type);

        if (!hasPoster) {
            targetStatus = 'PENDING';
        } else if (isSeries) {
            // Contar episodios completados
            let completedEpisodes = 0;
            for (const season of c.seasons) {
                for (const ep of season.episodes) {
                    if (ep.videoFiles.some(v => v.status === 'COMPLETED')) {
                        completedEpisodes++;
                    }
                }
            }
            if (completedEpisodes === 0) {
                targetStatus = 'PROCESSING';
            } else if (targetStatus === 'PENDING') {
                // Si tiene episodios y portada, debería ser ACTIVE
                targetStatus = 'ACTIVE';
            }
        } else {
            // Películas / Documentales
            const hasCompletedVideo = c.videoFiles.some(v => v.status === 'COMPLETED');
            if (!hasCompletedVideo) {
                targetStatus = 'PENDING';
            } else if (targetStatus === 'PENDING') {
                targetStatus = 'ACTIVE';
            }
        }

        if (c.status !== targetStatus) {
            await prisma.content.update({
                where: { id: c.id },
                data: { status: targetStatus }
            });
            console.log(`   🛠️  Corregido: "${c.slug}" pasó de ${c.status} a ${targetStatus}`);
            fixedCount++;
        }
    }

    console.log(`\n🎉 Listo! Se corrigieron las inconsistencias de estado en ${fixedCount} contenidos.`);
    process.exit(0);
}

run();
