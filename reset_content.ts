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
        
        console.log('Borrando Tracks (Audio/Subtitles/Quality)...');
        await prisma.audioTrack.deleteMany({});
        await prisma.subtitleTrack.deleteMany({});
        await prisma.videoQuality.deleteMany({});
        
        console.log('Borrando VideoFiles (esto puede tomar tiempo si hay muchos)...');
        await prisma.videoFile.deleteMany({});
        
        console.log('Borrando Historial y Favoritos...');
        await prisma.watchHistory.deleteMany({});
        await prisma.favorite.deleteMany({});
        await prisma.review.deleteMany({});
        await prisma.like.deleteMany({});

        console.log('Borrando Episodes y Seasons...');
        await prisma.episode.deleteMany({});
        await prisma.season.deleteMany({});
        
        console.log('Borrando Thumbnails y Translations...');
        await prisma.thumbnail.deleteMany({});
        await prisma.contentTranslation.deleteMany({});

        console.log('Borrando Relations...');
        await prisma.contentActor.deleteMany({});
        await prisma.contentDirector.deleteMany({});
        await prisma.contentGenre.deleteMany({});
        await prisma.contentTag.deleteMany({});

        console.log('Borrando Content...');
        await prisma.content.deleteMany({});

        console.log('✅ BASE DE DATOS LIMPIA. Todo el contenido multimedia fue eliminado.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al limpiar:', error);
        process.exit(1);
    }
}

run();
