import "dotenv/config";
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Rutas base que este servidor puede verificar localmente
const LOCAL_PATHS = [
    '/home/media/peliculas',
    '/home/media/series',
    '/home/peliplus_gran_disco/videos_subidos'
];

function isLocalPath(filePath: string): boolean {
    if (!filePath) return false;
    return LOCAL_PATHS.some(base => filePath.startsWith(base));
}

async function main() {
    console.log('🔍 Iniciando detección ultra-rápida de Videos Vacíos...');
    
    // 1. Obtener todos los VideoFiles
    const allVideos = await prisma.videoFile.findMany({
        select: { id: true, contentId: true, episodeId: true, originalPath: true, hlsPath: true, status: true }
    });

    const missingContentIds = new Set<string>();

    let totalChecked = 0;
    let totalMissing = 0;

    for (const vf of allVideos) {
        if (vf.status !== 'COMPLETED' && vf.status !== 'READY') continue;

        const p = vf.hlsPath || vf.originalPath;
        if (!p) continue;

        // Solo verificamos si la ruta pertenece a los discos montados en ESTE servidor
        if (isLocalPath(p)) {
            totalChecked++;
            if (!fs.existsSync(p)) {
                totalMissing++;
                // Si el episodio o película no existe físicamente, marcamos el contenido
                if (vf.contentId) missingContentIds.add(vf.contentId);
                if (vf.episodeId) {
                    const ep = await prisma.episode.findUnique({ where: { id: vf.episodeId }, select: { season: { select: { contentId: true } } } });
                    if (ep?.season?.contentId) {
                        missingContentIds.add(ep.season.contentId);
                    }
                }
            }
        }
    }

    console.log(`\n📊 Resultados Locales:`);
    console.log(`   - Archivos locales verificados: ${totalChecked}`);
    console.log(`   - Enlaces físicos rotos detectados: ${totalMissing}`);
    console.log(`   - Contenidos afectados que serán marcados: ${missingContentIds.size}`);

    if (missingContentIds.size > 0) {
        console.log('\n📝 Actualizando base de datos...');
        await prisma.content.updateMany({
            where: { id: { in: Array.from(missingContentIds) } },
            data: { hasMissingFiles: true }
        });
        console.log('✅ Base de datos actualizada. Ahora puedes verlos en el panel.');
    } else {
        console.log('✅ No se encontraron videos vacíos en este servidor.');
    }
}

main().finally(() => prisma.$disconnect());
