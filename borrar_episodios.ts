import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
import * as fs from 'fs';

async function deleteAllEpisodes(contentId: string) {
    console.log(`\n🧹 Iniciando borrado de episodios para la serie: ${contentId}`);

    const seasons = await prisma.season.findMany({
        where: { contentId },
        include: {
            episodes: {
                include: { videoFiles: true }
            }
        }
    });

    let episodeCount = 0;
    let videoFileCount = 0;

    for (const season of seasons) {
        for (const episode of season.episodes) {
            episodeCount++;
            for (const vf of episode.videoFiles) {
                videoFileCount++;
                // 1. Borrar archivos físicos HLS si existen
                if (vf.hlsPath && fs.existsSync(vf.hlsPath)) {
                    console.log(`   🗑️  Borrando archivos físicos: ${vf.hlsPath}`);
                    try { fs.rmSync(vf.hlsPath, { recursive: true, force: true }); } catch (e) {
                        console.log(`      ⚠️  No se pudo borrar del disco: ${e.message}`);
                    }
                }
                
                // 2. Borrar VideoFile de la BD
                await prisma.videoFile.delete({ where: { id: vf.id } });
            }
            // 3. Borrar Episodio de la BD
            await prisma.episode.delete({ where: { id: episode.id } });
            console.log(`   ✅ Episodio ${episode.number} (Temporada ${season.number}) borrado de la base de datos.`);
        }
    }

    console.log(`\n🎉 ¡Listo! Se borraron ${episodeCount} episodios y ${videoFileCount} archivos de video.`);
}

const targetId = 'cms9bjjbz0008fxppwc52m1xp';
deleteAllEpisodes(targetId).finally(() => process.exit(0));
