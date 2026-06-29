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
        
        const title = file.content?.translations?.[0]?.title || (file.episode ? `${file.episode.season.content?.translations?.[0]?.title || 'Serie'} - T${file.episode.season.number}E${file.episode.number}` : 'Desconocido');
        let oldPlaylist = path.join(file.hlsPath, '720p.m3u8');
        const demuxedVideoPlaylist = fs.existsSync(path.join(file.hlsPath, 'stream_video.m3u8')) 
            ? path.join(file.hlsPath, 'stream_video.m3u8') 
            : path.join(file.hlsPath, 'stream_0.m3u8');
        
        if (!fs.existsSync(oldPlaylist)) {
            // Check if master.m3u8 exists but it's the old format
            if (fs.existsSync(path.join(file.hlsPath, 'master.m3u8')) && !fs.existsSync(demuxedVideoPlaylist)) {
                oldPlaylist = path.join(file.hlsPath, 'master.m3u8');
            } else if (fs.existsSync(demuxedVideoPlaylist)) {
                // RESTORE MASTER.M3U8 FOR ALREADY PROCESSED MOVIES
                console.log(`\n[RESTORE MASTER] ID: ${file.id} | Titulo: ${title} | Ruta: ${file.hlsPath}`);
                
                const allFiles = fs.readdirSync(file.hlsPath);
                const audioPlaylists = allFiles.filter(f => f.startsWith('stream_') && f.endsWith('.m3u8') && f !== 'stream_0.m3u8' && f !== 'stream_video.m3u8' && f !== 'stream_v:0.m3u8' && !f.startsWith('stream_a:'));
                
                let masterContent = `#EXTM3U\n#EXT-X-VERSION:3\n`;
                
                for (let i = 0; i < audioPlaylists.length; i++) {
                    const audioFile = audioPlaylists[i];
                    const dbTrack = file.audioTracks.find(t => t.trackIndex === i);
                    const lang = dbTrack?.language || 'unk';
                    const safeName = `Audio_${i}`;
                    const isDefault = i === 0 ? 'YES' : 'NO';
                    
                    masterContent += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",LANGUAGE="${lang}",NAME="${safeName}",AUTOSELECT=${isDefault},DEFAULT=${isDefault},URI="${audioFile}"\n`;
                }
                
                const videoFile = fs.existsSync(path.join(file.hlsPath, 'stream_video.m3u8')) ? 'stream_video.m3u8' : 'stream_0.m3u8';
                if (audioPlaylists.length > 0) {
                    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720,AUDIO="audio"\n${videoFile}\n`;
                } else {
                    masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720\n${videoFile}\n`;
                }
                
                fs.writeFileSync(path.join(file.hlsPath, 'master.m3u8'), masterContent, 'utf-8');
                console.log(`  [ÉXITO] master.m3u8 reconstruido correctamente.`);
                continue;
            } else {
                continue; // No existe ni 720p.m3u8 ni master.m3u8
            }
        }

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
        let varStreamMap = 'v:0,agroup:audio,name:video';
        
        if (audioStreams.length === 0) {
            varStreamMap = 'v:0,name:video';
        } else {
            for (let i = 0; i < audioStreams.length; i++) {
                mapOptions.push('-map', `0:a:${i}`);
                
                // Tratar de recuperar los nombres desde la DB si existen
                const dbTrack = file.audioTracks.find(t => t.trackIndex === i);
                const name = dbTrack?.label || `Audio`;
                const lang = dbTrack?.language || 'unk';
                const safeName = `${name.replace(/[,="' ]/g, '_')}_${i}`; // GUARANTEE UNIQUE
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
                        '-master_pl_name', path.join(file.hlsPath!, 'master.m3u8'),
                        '-max_muxing_queue_size', '1024'
                    ])
                    .outputOption('-var_stream_map', varStreamMap)
                    .output(path.join(file.hlsPath!, 'stream_%v.m3u8'))
                    .on('start', (cmd: string) => console.log('  FFmpeg CMD:', cmd))
                    .on('end', () => res(true))
                    .on('error', (err: any, stdout: any, stderr: any) => {
                        console.error('  FFmpeg error:', err.message);
                        rej(err);
                    })
                    .run();
            });

            console.log(`  [ÉXITO] HLS re-generado (Separado). Limpiando disco...`);

            // 1. Delete old playlist (if it was 720p.m3u8, it is deleted. If it's master.m3u8, it was overwritten)
            if (oldPlaylist.endsWith('720p.m3u8')) {
                try { fs.unlinkSync(oldPlaylist); } catch(e){}
            }
            
            // 2. Delete old 720p_000.ts or stream_0_000.ts files (the new ones are stream_video_*.ts)
            const files = fs.readdirSync(file.hlsPath);
            let deletedCount = 0;
            for (const f of files) {
                if ((f.startsWith('720p_') || f.startsWith('stream_0')) && f.endsWith('.ts')) {
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
