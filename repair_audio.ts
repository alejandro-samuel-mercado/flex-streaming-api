import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function run() {
    console.log('--- Iniciando Reparacion de Archivos Multiplexados ---');
    
    // Find all completed videos, we will filter by checking if 720p.m3u8 exists physically
    const brokenFiles = await prisma.videoFile.findMany({
        where: {
            status: 'COMPLETED',
            hlsPath: { not: null }
        },
        include: { 
            audioTracks: { orderBy: { trackIndex: 'asc' } },
            content: { select: { translations: { select: { title: true } } } },
            episode: { include: { season: { include: { content: { select: { translations: { select: { title: true } } } } } } } }
        }
    });

    console.log(`Se encontraron ${brokenFiles.length} peliculas/episodios para reparar.`);

    for (const file of brokenFiles) {
        if (!file.hlsPath) continue;
        
        const oldPlaylist = path.join(file.hlsPath, '720p.m3u8');
        if (!fs.existsSync(oldPlaylist)) {
            continue;
        }

        const title = file.content?.translations?.[0]?.title || (file.episode ? `${file.episode.season.content?.translations?.[0]?.title || 'Serie'} - T${file.episode.season.number}E${file.episode.number}` : 'Desconocido');
        console.log(`\n[REPARANDO] ID: ${file.id} | Titulo: ${title} | Ruta: ${file.hlsPath}`);

        // Read metadata from 720p.m3u8 to know audio tracks
        let metadata: any;
        try {
            metadata = await new Promise((res, rej) => {
                ffmpeg.ffprobe(oldPlaylist, (err, meta) => {
                    if (err) rej(err); else res(meta);
                });
            });
        } catch (e) {
            console.log(`[ERROR FFPROBE] No se pudo leer ${oldPlaylist}. Saltando.`);
            continue;
        }

        const audioStreams = metadata.streams.filter((s: any) => s.codec_type === 'audio');
        if (audioStreams.length === 0) {
            console.log(`[OK] No tiene audios, pero actualizaremos la URL de todas formas.`);
        }

        // Build var_stream_map command
        const mapOptions = ['-map', '0:v:0'];
        let varStreamMap = 'v:0,agroup:audio';
        
        if (audioStreams.length === 0) {
            varStreamMap = 'v:0';
        } else {
            for (let i = 0; i < audioStreams.length; i++) {
                mapOptions.push('-map', `0:a:${i}`);
                
                // Tratar de recuperar los nombres desde la DB si existen
                const dbTrack = file.audioTracks.find(t => t.trackIndex === i);
                const name = dbTrack?.label || `Audio_${i + 1}`;
                const lang = dbTrack?.language || 'unk';
                const safeName = name.replace(/[,="' ]/g, '_');
                
                varStreamMap += ` a:${i},agroup:audio,language:${lang},name:${safeName}`;
            }
        }

        console.log(`  Ejecutando demuxing (Separando ${audioStreams.length} audios)...`);

        try {
            await new Promise((res, rej) => {
                ffmpeg(oldPlaylist)
                    .outputOptions([
                        '-y',
                        ...mapOptions,
                        '-c', 'copy',
                        '-hls_time', '6',
                        '-hls_list_size', '0',
                        '-hls_playlist_type', 'vod',
                        '-hls_flags', 'independent_segments',
                        '-hls_segment_type', 'mpegts',
                        '-hls_segment_filename', path.join(file.hlsPath!, 'stream_%v_%03d.ts'),
                        '-master_pl_name', 'master.m3u8',
                        '-max_muxing_queue_size', '1024'
                    ])
                    .outputOption('-var_stream_map', varStreamMap)
                    .output(path.join(file.hlsPath!, 'stream_%v.m3u8'))
                    .on('end', () => res(true))
                    .on('error', (err, stdout, stderr) => {
                        console.error('  FFmpeg error:', err.message);
                        rej(err);
                    })
                    .run();
            });

            console.log(`  [ÉXITO] HLS re-generado (Separado). Limpiando disco...`);

            // 1. Delete old 720p.m3u8
            fs.unlinkSync(oldPlaylist);
            
            // 2. Delete old 720p_000.ts files
            const files = fs.readdirSync(file.hlsPath);
            let deletedCount = 0;
            for (const f of files) {
                if (f.startsWith('720p_') && f.endsWith('.ts')) {
                    fs.unlinkSync(path.join(file.hlsPath, f));
                    deletedCount++;
                }
            }
            console.log(`  Eliminados ${deletedCount} fragmentos .ts viejos.`);

            // 3. Update DB URLs
            await prisma.videoFile.update({
                where: { id: file.id },
                data: { masterPlaylist: `/api/stream/hls/${file.id}/master.m3u8` }
            });
            
            await prisma.$executeRawUnsafe(`UPDATE "video_qualities" SET "playlistUrl" = '/api/stream/hls/${file.id}/master.m3u8' WHERE "videoFileId" = '${file.id}'`);
            
            console.log(`  [LISTO] Base de datos actualizada.`);
            
        } catch (e: any) {
            console.error(`  [ERROR] Falló la reparación: ${e.message}`);
        }
    }
    
    console.log('\n--- Reparacion Finalizada ---');
}

run().catch(console.error).finally(() => prisma.$disconnect());
