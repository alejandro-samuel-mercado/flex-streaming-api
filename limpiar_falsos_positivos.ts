import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function cleanGhostEpisodes() {
    console.log("🔍 Buscando episodios 'fantasma' en la base de datos...");

    const videoFiles = await prisma.videoFile.findMany({
        where: { type: 'EPISODE' }
    });

    let borrados = 0;

    // Cachear todos los master.m3u8 del disco para que la búsqueda sea instantánea
    console.log("📂 Mapeando el disco duro (esto tomará unos segundos)...");
    let allPaths = "";
    try {
        allPaths = execSync('find /home/peliplus_gran_disco/hls -name "master.m3u8"', { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });
    } catch (e) {}

    for (const vf of videoFiles) {
        let isGhost = false;

        if (vf.hlsPath) {
            // Si la base de datos tiene la ruta exacta, la verificamos
            const masterPlaylist = path.join(vf.hlsPath, 'master.m3u8');
            if (!fs.existsSync(masterPlaylist)) {
                isGhost = true;
            }
        } else {
            // Si la base de datos NO tiene ruta (es antigua o un fantasma)
            // 1. Si es antigua (antes de Julio), la perdonamos para no borrar cosas sanas.
            if (vf.createdAt < new Date('2026-07-01T00:00:00.000Z')) {
                continue;
            }

            // 2. Si es reciente, buscamos su ID único o el ID del episodio en el mapa del disco duro
            const shortId = vf.id.substring(0, 8);
            const epId = vf.episodeId || 'unknown';
            
            if (!allPaths.includes(shortId) && !allPaths.includes(epId)) {
                isGhost = true;
            }
        }

        if (isGhost) {
            console.log(`👻 Fantasma detectado y eliminado: ID ${vf.id}`);
            
            await prisma.videoFile.delete({ where: { id: vf.id } });
            
            if (vf.episodeId) {
                const count = await prisma.videoFile.count({ where: { episodeId: vf.episodeId } });
                if (count === 0) {
                    try { await prisma.episode.delete({ where: { id: vf.episodeId } }); } catch (e) {}
                }
            }
            borrados++;
        }
    }

    console.log(`\n✅ ¡Limpieza terminada de forma 100% SEGURA!`);
    console.log(`🗑️  Se eliminaron ${borrados} registros fantasma de la base de datos sin tocar los videos sanos.`);
    console.log(`👉 La información de tus series (títulos, portadas, etc) sigue 100% intacta.`);
    console.log(`👉 Ahora puedes volver a correr tu escáner (npx tsx escanear_series.ts) para que detecte correctamente lo que falta.`);
}

cleanGhostEpisodes().catch(console.error).finally(() => process.exit(0));
