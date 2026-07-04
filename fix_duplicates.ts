import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deduplicate() {
    console.log('🔍 Iniciando script de deduplicación manual de VideoFiles...');
    
    // Agrupar por contentId
    const movies = await prisma.videoFile.groupBy({
        by: ['contentId'],
        where: { type: 'MOVIE', contentId: { not: null } },
        _count: { id: true }
    });
    
    let deletedMovies = 0;
    for (const group of movies.filter(g => g._count.id > 1)) {
        if (!group.contentId) continue;
        const files = await prisma.videoFile.findMany({
            where: { contentId: group.contentId },
            orderBy: [
                { status: 'asc' }, // Prioriza COMPLETED antes que PROCESSING/FAILED
                { createdAt: 'desc' } // Si hay varios COMPLETED, se queda el más reciente
            ]
        });
        
        // Conservamos el primero
        const toDelete = files.slice(1);
        for (const file of toDelete) {
            await prisma.videoFile.delete({ where: { id: file.id } });
            deletedMovies++;
            console.log(`🧹 Eliminado duplicado de Película: ${file.id} (status: ${file.status})`);
        }
    }

    // Agrupar por episodeId
    const episodes = await prisma.videoFile.groupBy({
        by: ['episodeId'],
        where: { type: 'EPISODE', episodeId: { not: null } },
        _count: { id: true }
    });
    
    let deletedEpisodes = 0;
    for (const group of episodes.filter(g => g._count.id > 1)) {
        if (!group.episodeId) continue;
        const files = await prisma.videoFile.findMany({
            where: { episodeId: group.episodeId },
            orderBy: [
                { status: 'asc' }, 
                { createdAt: 'desc' } 
            ]
        });
        
        const toDelete = files.slice(1);
        for (const file of toDelete) {
            await prisma.videoFile.delete({ where: { id: file.id } });
            deletedEpisodes++;
            console.log(`🧹 Eliminado duplicado de Episodio: ${file.id} (status: ${file.status})`);
        }
    }

    console.log(`✅ Deduplicación finalizada.`);
    console.log(`🎬 Películas duplicadas eliminadas: ${deletedMovies}`);
    console.log(`📺 Episodios duplicados eliminados: ${deletedEpisodes}`);
    process.exit(0);
}

deduplicate().catch(console.error);
