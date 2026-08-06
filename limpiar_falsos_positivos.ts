import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
import fs from 'fs';
import path from 'path';

async function cleanGhostEpisodes() {
    console.log("🔍 Buscando episodios 'fantasma' en la base de datos...");

    // Traemos todos los archivos de video asociados a episodios
    const videoFiles = await prisma.videoFile.findMany({
        where: { type: 'EPISODE' }
    });

    let borrados = 0;

    for (const vf of videoFiles) {
        // Resolvemos la ruta donde debería estar el video HLS
        const outputFolder = vf.hlsPath || path.resolve(process.env.HLS_PATH || '/home/peliplus_gran_disco/hls', vf.episodeId || vf.contentId || 'unknown');
        const masterPlaylist = path.join(outputFolder, 'master.m3u8');

        // Verificamos si el archivo físico realmente existe en el disco duro
        if (!fs.existsSync(masterPlaylist)) {
            console.log(`👻 Fantasma detectado: ID ${vf.id} (No se encontró master.m3u8)`);

            // 1. Borramos el VideoFile falso
            await prisma.videoFile.delete({
                where: { id: vf.id }
            });

            // 2. Si el episodio quedó vacío (sin otros videos), borramos el episodio
            if (vf.episodeId) {
                const count = await prisma.videoFile.count({ where: { episodeId: vf.episodeId } });
                if (count === 0) {
                    try {
                        await prisma.episode.delete({ where: { id: vf.episodeId } });
                    } catch (e) {}
                }
            }

            borrados++;
        }
    }

    console.log(`\n✅ ¡Limpieza terminada!`);
    console.log(`🗑️  Se eliminaron ${borrados} registros fantasma de la base de datos.`);
    console.log(`👉 La información de tus series (títulos, portadas, etc) sigue 100% intacta.`);
    console.log(`👉 Ahora puedes volver a correr tu escáner (npx tsx escanear_series.ts) para que detecte correctamente lo que falta.`);
}

cleanGhostEpisodes().catch(console.error).finally(() => process.exit(0));
