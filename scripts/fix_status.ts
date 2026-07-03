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
        let targetType = c.type;
        const isSeries = ['SERIES', 'ANIME', 'NOVELA', 'REALITY_SHOW'].includes(c.type) || c.seasons.length > 0;

        // CRITICAL FIX: Frontend ONLY renders videos for type === 'MOVIE'.
        // If a Documentary/Kids/Family film has no seasons, it MUST be a MOVIE.
        if (!isSeries && targetType !== 'MOVIE') {
            targetType = 'MOVIE';
        }

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

        console.log(`[DEBUG] Slug: ${c.slug} | Type: ${c.type} -> ${targetType} | isSeries: ${isSeries} | currentStatus: ${c.status} | targetStatus: ${targetStatus} | completedEpisodes: ${isSeries ? c.seasons.reduce((acc, s) => acc + s.episodes.filter(e => e.videoFiles.some(v => v.status === 'COMPLETED')).length, 0) : 'N/A'} | hasCompletedVideo: ${!isSeries ? c.videoFiles.some(v => v.status === 'COMPLETED') : 'N/A'}`);

        if (c.status !== targetStatus || c.type !== targetType) {
            await prisma.content.update({
                where: { id: c.id },
                data: { status: targetStatus, type: targetType }
            });
            console.log(`   🛠️  Corregido: "${c.slug}" | Estado: ${c.status}->${targetStatus} | Tipo: ${c.type}->${targetType}`);
            fixedCount++;
        }
    }

    console.log(`\n🎉 Listo! Se corrigieron las inconsistencias de estado en ${fixedCount} contenidos.`);
    process.exit(0);
}

run();
