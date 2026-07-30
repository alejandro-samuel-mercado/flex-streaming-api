import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function run() {
    console.log('--- Iniciando Reparacion de Alineacion de Audio HLS ---');
    
    // Buscar todos los archivos procesados
    const videos = await prisma.videoFile.findMany({
        where: {
            status: 'COMPLETED',
            hlsPath: { not: null }
        },
        include: { 
            content: { select: { translations: { select: { title: true } } } },
            episode: { include: { season: { include: { content: { select: { translations: { select: { title: true } } } } } } } }
        }
    });

    console.log(`Se encontraron ${videos.length} videos en la base de datos.`);

    for (const file of videos) {
        if (!file.hlsPath) continue;
        if (!fs.existsSync(file.hlsPath)) {
            console.log(`[Ruta Inaccesible] La carpeta no existe en este servidor: ${file.hlsPath}`);
            continue;
        }
        
        const title = file.content?.translations?.[0]?.title || (file.episode ? `${file.episode.season.content?.translations?.[0]?.title || 'Serie'} - T${file.episode.season.number}E${file.episode.number}` : 'Desconocido');
        
        // Buscar listas de audio (todas las que empiecen con stream_ y no sean la de video)
        const filesInDir = fs.readdirSync(file.hlsPath);
        const audioPlaylists = filesInDir.filter(f => 
            f.startsWith('stream_') && f.endsWith('.m3u8') && f !== 'stream_video.m3u8'
        );

        if (audioPlaylists.length === 0) continue;

        console.log(`\n[REVISANDO] ID: ${file.id} | Titulo: ${title} | Audios: ${audioPlaylists.length}`);

        for (const playlist of audioPlaylists) {
            const playlistPath = path.join(file.hlsPath, playlist);
            const content = fs.readFileSync(playlistPath, 'utf8');
            
            // Si el nombre del audio ya fue arreglado antes, ignorar
            if (content.includes('_fix_')) {
                console.log(`  - ${playlist} ya fue reparado. Saltando.`);
                continue;
            }

            console.log(`  - Reparando ${playlist} (Forzando AAC y alineación 6s)...`);
            const baseName = playlist.replace('.m3u8', '');
            
            try {
                await new Promise<void>((resolve, reject) => {
                    ffmpeg(playlistPath)
                        .outputOptions([
                            '-y',
                            '-c:a', 'aac',
                            '-b:a', '192k',
                            '-ac', '2',
                            '-hls_time', '6',
                            '-hls_list_size', '0',
                            '-hls_playlist_type', 'vod',
                            '-hls_segment_type', 'mpegts',
                            '-hls_segment_filename', path.join(file.hlsPath!, `${baseName}_fix_%05d.ts`)
                        ])
                        .output(path.join(file.hlsPath!, `${baseName}_fix.m3u8`))
                        .on('end', () => resolve())
                        .on('error', (err) => reject(err))
                        .run();
                });

                // Reemplazar la vieja playlist por la arreglada
                const oldChunks = filesInDir.filter(f => f.startsWith(`${baseName}_`) && f.endsWith('.ts') && !f.includes('_fix_'));
                for (const chunk of oldChunks) {
                    try { fs.unlinkSync(path.join(file.hlsPath, chunk)); } catch (e) {}
                }

                // Borramos la playlist original y renombramos la arreglada
                fs.unlinkSync(playlistPath);
                fs.renameSync(path.join(file.hlsPath, `${baseName}_fix.m3u8`), playlistPath);

                console.log(`    [EXITO] ${playlist} reparada con éxito.`);
            } catch (e: any) {
                console.error(`    [ERROR] Falló la reparación de ${playlist}: ${e.message}`);
            }
        }
    }
    
    console.log('\n--- Reparacion Finalizada ---');
}

run().catch(console.error).finally(() => prisma.$disconnect());
