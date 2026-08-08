import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('🔄 Reiniciando estado de Videos Vacíos...');
    // 1. Resetear todos a falso
    await prisma.content.updateMany({ data: { hasMissingFiles: false } });

    // 2. Marcar como true solo los que no tienen NI UN SOLO VideoFile
    // Películas sin video
    await prisma.content.updateMany({
        where: { type: 'MOVIE', videoFiles: { none: {} } },
        data: { hasMissingFiles: true }
    });

    // Series sin video (esto es aproximado, si la serie no tiene episodios o videos)
    const series = await prisma.content.findMany({
        where: { type: { in: ['SERIES', 'ANIME', 'NOVELA'] } },
        include: { seasons: { include: { episodes: { include: { videoFiles: true } } } } }
    });

    let seriesUpdates = 0;
    for (const s of series) {
        let hasAnyVideo = false;
        for (const season of s.seasons) {
            for (const ep of season.episodes) {
                if (ep.videoFiles.length > 0) {
                    hasAnyVideo = true;
                    break;
                }
            }
            if (hasAnyVideo) break;
        }
        if (!hasAnyVideo) {
            await prisma.content.update({ where: { id: s.id }, data: { hasMissingFiles: true } });
            seriesUpdates++;
        }
    }

    console.log(`✅ Listo! Se marcaron correctamente los contenidos sin videos en la base de datos.`);
}
main().finally(() => prisma.$disconnect());
