import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    console.log('⚠️ ADVERTENCIA: Este script ELIMINARÁ TODO EL CONTENIDO MULTIMEDIA de la base de datos.');
    console.log('Conservará: Usuarios, Planes, Suscripciones, Configuración.');
    console.log('Iniciando en 3 segundos...');
    await new Promise(r => setTimeout(r, 3000));

    try {
        console.log('Borrando RejectImports...');
        // await prisma.rejectedImport.deleteMany({}); // Only uncomment if you ran the migration
        
        const pinned = await prisma.content.findMany({ where: { isPinned: true }, select: { id: true } });
        const pinnedIds = pinned.map(p => p.id);
        
        let contentFilter = {};
        if (pinnedIds.length > 0) {
            contentFilter = { contentId: { notIn: pinnedIds } };
        }

        const pinnedVideoFiles = pinnedIds.length > 0 ? await prisma.videoFile.findMany({ where: { contentId: { in: pinnedIds } }, select: { id: true } }) : [];
        const pinnedVideoIds = pinnedVideoFiles.map(v => v.id);
        
        let videoFilter = {};
        if (pinnedVideoIds.length > 0) {
            videoFilter = { videoFileId: { notIn: pinnedVideoIds } };
        }

        console.log(`📌 Encontrados ${pinnedIds.length} contenidos FIJADOS. Serán ignorados en la limpieza.`);

        console.log('Borrando Tracks (Audio/Subtitles/Quality)...');
        await prisma.audioTrack.deleteMany({ where: videoFilter });
        await prisma.subtitleTrack.deleteMany({ where: videoFilter });
        await prisma.videoQuality.deleteMany({ where: videoFilter });
        
        console.log('Borrando VideoFiles (esto puede tomar tiempo si hay muchos)...');
        await prisma.videoFile.deleteMany({ where: contentFilter });
        
        console.log('Borrando Historial y Favoritos...');
        await prisma.watchHistory.deleteMany({ where: contentFilter });
        await prisma.favorite.deleteMany({ where: contentFilter });
        await prisma.review.deleteMany({ where: contentFilter });
        await prisma.like.deleteMany({ where: contentFilter });

        console.log('Borrando Episodes y Seasons...');
        await prisma.episode.deleteMany({ where: pinnedIds.length > 0 ? { season: { contentId: { notIn: pinnedIds } } } : {} });
        await prisma.season.deleteMany({ where: contentFilter });
        
        console.log('Borrando Thumbnails y Translations...');
        await prisma.thumbnail.deleteMany({ where: contentFilter });
        await prisma.contentTranslation.deleteMany({ where: contentFilter });

        console.log('Borrando Relations...');
        await prisma.contentActor.deleteMany({ where: contentFilter });
        await prisma.contentDirector.deleteMany({ where: contentFilter });
        await prisma.contentGenre.deleteMany({ where: contentFilter });
        await prisma.contentTag.deleteMany({ where: contentFilter });

        console.log('Borrando Content...');
        await prisma.content.deleteMany({ where: { isPinned: false } });

        console.log('✅ BASE DE DATOS LIMPIA. Todo el contenido multimedia fue eliminado.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al limpiar:', error);
        process.exit(1);
    }
}

run();
