import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Rutas base posibles. Filtramos dinámicamente solo las que existan físicamente en ESTE servidor.
const POSSIBLE_PATHS = [
    '/home/media/peliculas',
    '/home/media/series',
    '/home/peliplus_gran_disco/videos_subidos'
];
const LOCAL_PATHS = POSSIBLE_PATHS.filter(p => {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
});

function isLocalPath(filePath: string): boolean {
    if (!filePath) return false;
    return LOCAL_PATHS.some(base => filePath.startsWith(base));
}

async function main() {
    console.log('🔍 Iniciando detección ultra-rápida de Videos Vacíos...');
    
    console.log('🔄 Limpiando marcas antiguas de la base de datos...');
    await prisma.$executeRawUnsafe(`UPDATE "contents" SET "hasMissingFiles" = false`);

    // 1. Obtener todos los VideoFiles
    const allVideos = await prisma.videoFile.findMany({
        select: { id: true, contentId: true, episodeId: true, originalPath: true, hlsPath: true, status: true }
    });

    const missingContentIds = new Set<string>();
    const missingEpisodeIds = new Set<string>();

    let totalChecked = 0;
    let totalMissing = 0;

    for (let i = 0; i < allVideos.length; i++) {
        const vf = allVideos[i];
        if (i % 2500 === 0 && i > 0) console.log(`   ...procesando ${i} de ${allVideos.length} videos`);
        
        if (vf.status !== 'COMPLETED' && vf.status !== 'READY') continue;

        const p = vf.hlsPath || vf.originalPath;
        if (!p) continue;

        // Solo verificamos si la ruta pertenece a los discos montados en ESTE servidor
        if (isLocalPath(p)) {
            totalChecked++;
            if (!fs.existsSync(p)) {
                totalMissing++;
                // Agregamos a las listas, pero resolvemos la DB después para que el loop sea instantáneo
                if (vf.contentId) missingContentIds.add(vf.contentId);
                if (vf.episodeId) missingEpisodeIds.add(vf.episodeId);
            }
        }
    }

    // Resolver los Content IDs de los episodios en una sola consulta masiva
    if (missingEpisodeIds.size > 0) {
        const episodes = await prisma.episode.findMany({
            where: { id: { in: Array.from(missingEpisodeIds) } },
            select: { season: { select: { contentId: true } } }
        });
        for (const ep of episodes) {
            if (ep?.season?.contentId) {
                missingContentIds.add(ep.season.contentId);
            }
        }
    }

    console.log(`\n📊 Resultados Locales:`);
    console.log(`   - Archivos locales verificados: ${totalChecked}`);
    console.log(`   - Enlaces físicos rotos detectados: ${totalMissing}`);
    console.log(`   - Contenidos afectados que serán marcados: ${missingContentIds.size}`);

    if (missingContentIds.size > 0) {
        console.log('\n📝 Actualizando base de datos...');
        await prisma.$executeRawUnsafe(`UPDATE "contents" SET "hasMissingFiles" = true WHERE id IN (${Array.from(missingContentIds).map(id => `'${id}'`).join(",")})`);
        console.log('✅ Base de datos actualizada. Ahora puedes verlos en el panel.');
    } else {
        console.log('✅ No se encontraron videos vacíos en este servidor.');
    }
}

main().finally(() => prisma.$disconnect());
