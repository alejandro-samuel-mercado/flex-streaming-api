import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { env } from '../shared/config/env';

// Initialize FFmpeg and FFprobe paths from environment configuration
if (env.FFMPEG_PATH) ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
if (env.FFPROBE_PATH) ffmpeg.setFfprobePath(env.FFPROBE_PATH);

export class FFmpegService {
    /**
     * Get file metadata (streams, duration, etc.)
     */
    static async getMetadata(inputPath: string): Promise<ffmpeg.FfprobeData> {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(inputPath, (err, metadata) => {
                if (err) reject(err);
                else resolve(metadata);
            });
        });
    }

    /**
     * Generates HLS (.m3u8 and .ts segments) from an input video file.
     *
     * FAST PATH (95% of cases): If the source video is already H.264/H.265 and audio is AAC/MP3,
     * it uses `-c copy` (stream copy / remux). This is near-instant and CPU-free.
     *
     * SLOW PATH (fallback): Only re-encodes if the source codec is not HLS-compatible
     * (e.g. VP9, AV1, HEVC with incompatible profile, etc.).
     */
    static async generateHLS(
        inputPath: string,
        outputFolder: string,
        onProgress?: (percent: number) => void
    ): Promise<{ path: string; audioTracks: any[] }> {
        const resolvedInputPath = path.resolve(inputPath);
        const resolvedOutputFolder = path.resolve(outputFolder);

        if (!fs.existsSync(resolvedOutputFolder)) {
            fs.mkdirSync(resolvedOutputFolder, { recursive: true });
        }

        const metadata = await this.getMetadata(resolvedInputPath);
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
        const audioTracks: any[] = [];

        const playlistPath = path.join(resolvedOutputFolder, 'master.m3u8');

        // ── Detect if we can use fast copy path ───────────────────────────────
        const videoCodec = videoStream?.codec_name?.toLowerCase() || '';
        const HLS_COMPATIBLE_VIDEO = ['h264', 'avc', 'avc1', 'h265', 'hevc'];
        const canCopyVideo = HLS_COMPATIBLE_VIDEO.some(c => videoCodec.includes(c));

        const HLS_COMPATIBLE_AUDIO = ['aac', 'mp3', 'mp2'];
        const canCopyAudio = audioStreams.length > 0 && audioStreams.every(s => 
            HLS_COMPATIBLE_AUDIO.some(c => (s.codec_name?.toLowerCase() || '').includes(c))
        );
        const audioCodec = audioStreams.map(s => s.codec_name).join(',');

        console.log(`🎬 [FFmpeg] Video codec: ${videoCodec} (copy: ${canCopyVideo}), Audio codecs: ${audioCodec} (copy: ${canCopyAudio})`);

        if (canCopyVideo) {
            // ══════════════════════════════════════════════════════════════════
            // FAST PATH: remux to HLS without re-encoding
            // A 2-hour movie takes ~30 seconds instead of 2 hours.
            // ══════════════════════════════════════════════════════════════════
            console.log(`⚡ [FFmpeg] Using FAST PATH (stream copy) — no re-encoding needed`);

            await new Promise((resolve, reject) => {
                let stallTimeout: NodeJS.Timeout;
                let hardTimeout: NodeJS.Timeout;

                const cmd = ffmpeg(resolvedInputPath)
                    .inputOptions(['-analyzeduration', '100M', '-probesize', '100M', '-nostdin']);

                const cleanup = () => { clearTimeout(stallTimeout); clearTimeout(hardTimeout); };

                const resetStall = () => {
                    clearTimeout(stallTimeout);
                    stallTimeout = setTimeout(() => {
                        cleanup(); cmd.kill('SIGKILL');
                        reject(new Error('[Timeout] Remux atascado por 10 min sin actividad.'));
                    }, 10 * 60 * 1000);
                };

                hardTimeout = setTimeout(() => {
                    cleanup(); cmd.kill('SIGKILL');
                    reject(new Error('[Timeout] Remux excedió 2 horas.'));
                }, 2 * 60 * 60 * 1000);

                const audioOpts = canCopyAudio
                    ? ['-c:a', 'copy']
                    : ['-c:a', 'aac', '-b:a', '192k', '-ac', '2'];

                cmd
                    .outputOptions([
                        '-map', '0:v:0',
                        '-map', '0:a?',
                        '-c:v', 'copy',
                        ...audioOpts,
                        '-hls_time', '6',
                        '-hls_list_size', '0',
                        '-hls_playlist_type', 'vod',
                        '-hls_flags', 'independent_segments',
                        '-hls_segment_type', 'mpegts',
                        '-hls_segment_filename', path.join(resolvedOutputFolder, '720p_%03d.ts'),
                        '-max_muxing_queue_size', '1024',
                    ])
                    .output(path.join(resolvedOutputFolder, '720p.m3u8'))
                    .on('start', resetStall)
                    .on('progress', (p) => {
                        resetStall();
                        if (p.percent && onProgress) onProgress(Math.min(Math.round(p.percent), 99));
                    })
                    .on('end', () => { cleanup(); if (onProgress) onProgress(100); resolve(true); })
                    .on('error', (err, _stdout, stderr) => {
                        cleanup();
                        reject(new Error(`FFmpeg copy error: ${err.message}${stderr ? `\n${stderr}` : ''}`));
                    })
                    .run();
            });

            // Detect audio tracks for the master playlist (from the muxed stream)
            for (let i = 0; i < audioStreams.length; i++) {
                const s = audioStreams[i];
                audioTracks.push({
                    index: i,
                    language: s.tags?.language || `audio${i}`,
                    name: s.tags?.title || `Audio ${i + 1}`,
                    codec: canCopyAudio ? (s.codec_name || 'aac') : 'aac',
                    playlistUrl: '720p.m3u8'
                });
            }

            // Write a simple master playlist pointing to the single quality
            const masterContent = [
                '#EXTM3U',
                '#EXT-X-VERSION:3',
                '',
                '#EXT-X-STREAM-INF:BANDWIDTH=2900000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
                '720p.m3u8',
                '',
            ].join('\n');
            fs.writeFileSync(playlistPath, masterContent);

        } else {
            // ══════════════════════════════════════════════════════════════════
            // SLOW PATH: full re-encode (only for incompatible codecs like VP9, AV1, etc.)
            // ══════════════════════════════════════════════════════════════════
            console.log(`🐢 [FFmpeg] Using SLOW PATH (re-encode) — source codec "${videoCodec}" is not HLS-compatible`);

            let fpsNum = 24;
            let fpsValue = '24';
            const frameRateStr = (videoStream?.r_frame_rate && videoStream.r_frame_rate !== '0/0')
                ? videoStream.r_frame_rate
                : (videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== '0/0' ? videoStream.avg_frame_rate : null);
            if (frameRateStr) {
                const [num, den] = frameRateStr.split('/').map(Number);
                if (num && den) { fpsNum = num / den; fpsValue = frameRateStr; }
            }
            const gopSize = Math.round(fpsNum * 2);

            await new Promise((resolve, reject) => {
                let stallTimeout: NodeJS.Timeout;
                let hardTimeout: NodeJS.Timeout;
                let lastTimemark = '';
                let lastTimemarkAt = Date.now();
                let watchdog: NodeJS.Timeout;

                const cmd = ffmpeg(resolvedInputPath)
                    .renice(19)
                    .inputOptions(['-analyzeduration', '100M', '-probesize', '100M', '-nostdin']);

                const cleanup = () => { clearTimeout(stallTimeout); clearTimeout(hardTimeout); clearInterval(watchdog); };

                const resetStall = () => {
                    clearTimeout(stallTimeout);
                    stallTimeout = setTimeout(() => { cleanup(); cmd.kill('SIGKILL'); reject(new Error('[Timeout] Re-encode atascado 20 min.')); }, 20 * 60 * 1000);
                };

                watchdog = setInterval(() => {
                    if (lastTimemark && Date.now() - lastTimemarkAt > 10 * 60 * 1000) {
                        cleanup(); cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] FFmpeg congelado en ${lastTimemark} por 10 min.`));
                    }
                }, 60 * 1000);

                hardTimeout = setTimeout(() => { cleanup(); cmd.kill('SIGKILL'); reject(new Error('[Timeout] Re-encode excedió 4 horas.')); }, 4 * 60 * 60 * 1000);

                cmd
                    .outputOptions([
                        '-map', '0:v:0', '-map', '0:a?',
                        '-c:v', 'h264',
                        '-preset', 'veryfast',
                        '-threads', '0',  // Use all available CPU threads
                        '-profile:v', 'main',
                        '-level', '4.0',
                        '-vf', 'scale=w=1280:h=720:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2',
                        '-pix_fmt', 'yuv420p',
                        '-r', fpsValue,
                        '-g', gopSize.toString(),
                        '-keyint_min', gopSize.toString(),
                        '-sc_threshold', '0',
                        '-b:v', '2500k', '-maxrate', '3500k', '-bufsize', '5000k',
                        '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
                        '-hls_time', '6',
                        '-hls_list_size', '0',
                        '-hls_playlist_type', 'vod',
                        '-hls_flags', 'independent_segments',
                        '-hls_segment_type', 'mpegts',
                        '-hls_segment_filename', path.join(resolvedOutputFolder, '720p_%03d.ts'),
                        '-max_muxing_queue_size', '1024',
                    ])
                    .output(path.join(resolvedOutputFolder, '720p.m3u8'))
                    .on('start', () => {
                        resetStall();
                        try {
                            const proc = (cmd as any)._ffmpegProc;
                            if (proc?.pid) execSync(`ionice -c 3 -p ${proc.pid}`, { stdio: 'ignore' });
                        } catch {}
                    })
                    .on('progress', (p) => {
                        resetStall();
                        if (p.timemark && p.timemark !== lastTimemark) { lastTimemark = p.timemark; lastTimemarkAt = Date.now(); }
                        if (p.percent && onProgress) onProgress(Math.round(p.percent));
                    })
                    .on('end', () => { cleanup(); if (onProgress) onProgress(100); resolve(true); })
                    .on('error', (err, _stdout, stderr) => { cleanup(); reject(new Error(`FFmpeg encode error: ${err.message}${stderr ? `\n${stderr}` : ''}`)); })
                    .run();
            });

            for (let i = 0; i < audioStreams.length; i++) {
                const s = audioStreams[i];
                audioTracks.push({ index: i, language: s.tags?.language || `audio${i}`, name: s.tags?.title || `Audio ${i + 1}`, codec: 'aac', playlistUrl: '720p.m3u8' });
            }

            const masterContent = [
                '#EXTM3U', '#EXT-X-VERSION:3', '',
                '#EXT-X-STREAM-INF:BANDWIDTH=2900000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2"',
                '720p.m3u8', '',
            ].join('\n');
            fs.writeFileSync(playlistPath, masterContent);
        }

        return { path: playlistPath, audioTracks };
    }

    /**
     * Generates a single thumbnail poster for a video
     */
    static generateThumbnail(
        inputPath: string,
        outputFolder: string
    ): Promise<{ path: string }> {
        return new Promise((resolve, reject) => {
            if (!fs.existsSync(outputFolder)) {
                fs.mkdirSync(outputFolder, { recursive: true });
            }

            let timeout: NodeJS.Timeout;
            const cmd = ffmpeg(inputPath).renice(19);

            timeout = setTimeout(() => {
                cmd.kill('SIGKILL');
                reject(new Error(`[Timeout] La extracción de portada se atascó o tardó más de 2 minutos.`));
            }, 2 * 60 * 1000);

            const filename = 'poster.jpg';
            cmd
                .screenshots({
                    count: 1,
                    folder: outputFolder,
                    filename: filename,
                    size: '1280x720',
                })
                .on('end', () => {
                    clearTimeout(timeout);
                    resolve({ path: path.join(outputFolder, filename) });
                })
                .on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
        });
    }

    /**
     * Extract embedded subtitles from video containers (MKV, MP4, etc.)
     * Converts any subtitle format (SRT, ASS, SSA, SUB) to WebVTT (.vtt)
     * Returns metadata for each extracted subtitle track.
     */
    static async extractSubtitles(
        inputPath: string,
        outputFolder: string
    ): Promise<{ language: string; label: string; filePath: string; isDefault: boolean; isForced: boolean }[]> {
        const resolvedInput = path.resolve(inputPath);
        const resolvedOutput = path.resolve(outputFolder);

        if (!fs.existsSync(resolvedOutput)) {
            fs.mkdirSync(resolvedOutput, { recursive: true });
        }

        // Get metadata to find subtitle streams
        const metadata = await this.getMetadata(resolvedInput);
        const subtitleStreams = metadata.streams.filter(s => s.codec_type === 'subtitle');

        if (subtitleStreams.length === 0) {
            console.log('📝 [FFmpeg] No embedded subtitles found');
            return [];
        }

        console.log(`📝 [FFmpeg] Found ${subtitleStreams.length} embedded subtitle track(s)`);

        const results: { language: string; label: string; filePath: string; isDefault: boolean; isForced: boolean }[] = [];

        for (let i = 0; i < subtitleStreams.length; i++) {
            const stream = subtitleStreams[i];
            const lang = stream.tags?.language || `und`;
            const title = stream.tags?.title || `Subtítulo ${i + 1} (${lang})`;
            const isDefault = stream.disposition?.default === 1;
            const isForced = stream.disposition?.forced === 1;
            const codec = stream.codec_name || '';

            // Skip image-based subtitles (PGS, DVB, VOBSUB) — cannot convert to text
            const imageBased = ['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle', 'pgssub'];
            if (imageBased.includes(codec)) {
                console.log(`📝 [FFmpeg] Skipping image-based subtitle track ${i} (${codec})`);
                continue;
            }

            const outFileName = `sub_${i}_${lang}.vtt`;
            const outFilePath = path.join(resolvedOutput, outFileName);

            try {
                await new Promise<void>((resolve, reject) => {
                    let timeout: NodeJS.Timeout;
                    const cmd = ffmpeg(resolvedInput).renice(19);

                    timeout = setTimeout(() => {
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] La extracción de subtítulos se atascó o tardó más de 5 minutos.`));
                    }, 5 * 60 * 1000);

                    cmd
                        .inputOptions([
                            '-analyzeduration', '100M',
                            '-probesize', '100M',
                            '-nostdin'
                        ])
                        .outputOptions([
                            `-map 0:s:${i}`,
                            '-c:s webvtt'
                        ])
                        .output(outFilePath)
                        .on('error', (err, _stdout, stderr) => {
                            clearTimeout(timeout);
                            if (stderr) console.warn(`FFmpeg Subtitle STDERR:\n${stderr}`);
                            reject(err);
                        })
                        .on('end', () => {
                            clearTimeout(timeout);
                            resolve();
                        })
                        .run();
                });

                // Verify the file was created and has content
                if (fs.existsSync(outFilePath) && fs.statSync(outFilePath).size > 10) {
                    results.push({
                        language: lang,
                        label: title,
                        filePath: outFilePath,
                        isDefault,
                        isForced
                    });
                    console.log(`📝 [FFmpeg] Extracted subtitle: ${title} (${lang}) → ${outFileName}`);
                } else {
                    console.warn(`📝 [FFmpeg] Subtitle track ${i} extraction produced empty file, skipping`);
                    // Clean up empty file
                    if (fs.existsSync(outFilePath)) fs.unlinkSync(outFilePath);
                }
            } catch (err: any) {
                console.warn(`📝 [FFmpeg] Failed to extract subtitle track ${i} (${codec}): ${err.message}`);
                // Non-fatal — continue with other tracks
                if (fs.existsSync(outFilePath)) fs.unlinkSync(outFilePath);
            }
        }

        console.log(`📝 [FFmpeg] Successfully extracted ${results.length}/${subtitleStreams.length} subtitle track(s)`);
        return results;
    }
}
