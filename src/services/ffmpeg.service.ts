import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
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
     * Generates HLS (.m3u8 and .ts segments) from an input video file using fluent-ffmpeg.
     * This generates multiple resolutions based on the PROMPT MAESTRO specifications.
     */
    static async generateHLS(
        inputPath: string,
        outputFolder: string,
        onProgress?: (percent: number) => void
    ): Promise<{ path: string; audioTracks: any[] }> {
        // Ensure absolute paths
        const resolvedInputPath = path.resolve(inputPath);
        const resolvedOutputFolder = path.resolve(outputFolder);

        // Ensure output directory exists
        if (!fs.existsSync(resolvedOutputFolder)) {
            fs.mkdirSync(resolvedOutputFolder, { recursive: true });
        }
        console.log(`🎬 [FFmpeg] Output Folder: ${resolvedOutputFolder}`);

        // Get metadata to find audio tracks
        const metadata = await this.getMetadata(resolvedInputPath);
        const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
        const audioTracks: any[] = [];

        const playlistPath = path.join(resolvedOutputFolder, 'master.m3u8');
        const profiles = [
            { name: '720p', resolution: '1280:720', bitrate: '2500k', maxrate: '3750k', bufsize: '5000k', bandwidth: 4200000 },
            { name: '1080p', resolution: '1920:1080', bitrate: '5000k', maxrate: '7500k', bufsize: '10000k', bandwidth: 8400000 }
        ];

        // Detect source framerate for proper GOP alignment — preserve exact fraction for max FPS fidelity
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        let fpsNum = 24;                // numeric fps for GOP calculation
        let fpsValue = '24';            // exact value passed to FFmpeg -r flag

        // Some videos have '0/0' in r_frame_rate, so we fallback to avg_frame_rate
        const frameRateStr = (videoStream?.r_frame_rate && videoStream.r_frame_rate !== '0/0')
            ? videoStream.r_frame_rate
            : ((videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== '0/0') ? videoStream.avg_frame_rate : null);

        if (frameRateStr) {
            const [num, den] = frameRateStr.split('/').map(Number);
            if (num && den) {
                fpsNum = num / den;         // e.g. 23.976, 29.97, 25, 30, 60
                fpsValue = frameRateStr;    // pass exact fraction e.g. "24000/1001"
            }
        }
        // GOP = 2 seconds worth of frames (clean keyframe interval for HLS)
        const gopSize = Math.round(fpsNum * 2);
        console.log(`🎬 [FFmpeg] Source FPS: ${fpsNum.toFixed(3)} (${fpsValue}), GOP size: ${gopSize} (2s intervals)`);

        let lastReportedProgress = 0;
        const totalSteps = profiles.length + audioStreams.length;
        const taskProgress: number[] = new Array(totalSteps).fill(0);


        const reportProgress = () => {
            if (!onProgress) return;
            const overallPercent = taskProgress.reduce((sum, p) => sum + p, 0) / totalSteps;
            const currentProgress = Math.round(overallPercent);
            if (currentProgress > lastReportedProgress) {
                lastReportedProgress = currentProgress;
                onProgress(currentProgress);
            }
        };

        // 1. Process Video Profiles (Sequential to save resources)
        const hasMultipleAudio = audioStreams.length > 0;
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            const taskIndex = i;
            console.log(`🎬 [FFmpeg] Processing Video ${profile.name}...`);

            await new Promise((resolve, reject) => {
                let stallTimeout: NodeJS.Timeout;
                let hardTimeout: NodeJS.Timeout;

                const cmd = ffmpeg(resolvedInputPath);

                const resetStallTimeout = () => {
                    if (stallTimeout) clearTimeout(stallTimeout);
                    stallTimeout = setTimeout(() => {
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] El proceso se atascó (20 min sin avanzar). Cancelado automáticamente.`));
                    }, 20 * 60 * 1000);
                };

                hardTimeout = setTimeout(() => {
                    cmd.kill('SIGKILL');
                    reject(new Error(`[Timeout] El proceso excedió el tiempo máximo permitido (4 horas). Cancelado automáticamente.`));
                }, 4 * 60 * 60 * 1000);

                const opts: string[] = [
                    '-preset', 'veryfast',
                    '-threads', '0',
                    '-profile:v', 'main',
                    '-level', '4.0',
                    '-vf', `scale=w=${profile.resolution.split(':')[0]}:h=${profile.resolution.split(':')[1]}:force_original_aspect_ratio=decrease`,
                    '-c:v', 'h264',
                    '-pix_fmt', 'yuv420p',
                    '-vsync', 'cfr',
                    '-r', fpsValue,
                    '-g', gopSize.toString(),
                    '-keyint_min', gopSize.toString(),
                    '-sc_threshold', '0',
                    '-b:v', profile.bitrate,
                    '-maxrate', profile.maxrate,
                    '-bufsize', profile.bufsize,
                    '-max_muxing_queue_size', '1024',
                    '-hls_time', '6',
                    '-hls_playlist_type', 'vod',
                    '-hls_segment_filename', path.join(resolvedOutputFolder, `${profile.name}_%03d.ts`)
                ];

                if (hasMultipleAudio) {
                    opts.unshift('-map', '0:v:0', '-an');
                } else {
                    opts.unshift('-map', '0:v:0', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k');
                }

                cmd
                    .outputOptions(opts)
                    .output(path.join(resolvedOutputFolder, `${profile.name}.m3u8`))
                    .on('start', () => resetStallTimeout())
                    .on('progress', (progress) => {
                        resetStallTimeout();
                        if (progress.percent) {
                            taskProgress[taskIndex] = progress.percent;
                            reportProgress();
                        }
                    })
                    .on('end', () => {
                        clearTimeout(stallTimeout);
                        clearTimeout(hardTimeout);
                        taskProgress[taskIndex] = 100;
                        reportProgress();
                        resolve(true);
                    })
                    .on('error', (err) => {
                        clearTimeout(stallTimeout);
                        clearTimeout(hardTimeout);
                        console.error(`Error during FFmpeg profile ${profile.name}: ${err.message}`);
                        reject(err);
                    })
                    .run();
            });
        }

        // 2. Process Audio Streams (Sequential to save resources)
        for (let i = 0; i < audioStreams.length; i++) {
            const stream = audioStreams[i];
            const taskIndex = profiles.length + i;
            const lang = stream.tags?.language || `audio${i}`;
            const title = stream.tags?.title || `Audio ${i + 1} (${lang})`;

            console.log(`🔊 [FFmpeg] Extracting Audio ${title}...`);

            await new Promise((resolve, reject) => {
                let stallTimeout: NodeJS.Timeout;
                let hardTimeout: NodeJS.Timeout;

                const cmd = ffmpeg(resolvedInputPath);

                const resetStallTimeout = () => {
                    if (stallTimeout) clearTimeout(stallTimeout);
                    stallTimeout = setTimeout(() => {
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] La extracción de audio se atascó (20 min sin avanzar).`));
                    }, 20 * 60 * 1000);
                };

                hardTimeout = setTimeout(() => {
                    cmd.kill('SIGKILL');
                    reject(new Error(`[Timeout] La extracción de audio excedió las 4 horas permitidas.`));
                }, 4 * 60 * 60 * 1000);

                cmd
                    .outputOptions([
                        '-vn',                    // No video
                        '-map', `0:a:${i}`,       // Select specific audio stream
                        '-c:a', 'aac',            // AAC encoding
                        '-b:a', '192k',           // 192kbps target
                        '-ac', '2',               // Stereo downmix for compatibility
                        '-hls_time', '6',
                        '-hls_playlist_type', 'vod',
                        '-hls_segment_filename', path.join(resolvedOutputFolder, `audio_${lang}_%03d.ts`)
                    ])
                    .output(path.join(resolvedOutputFolder, `audio_${lang}.m3u8`))
                    .on('start', () => resetStallTimeout())
                    .on('progress', (progress) => {
                        resetStallTimeout();
                        if (progress.percent) {
                            taskProgress[taskIndex] = progress.percent;
                            reportProgress();
                        }
                    })
                    .on('end', () => {
                        clearTimeout(stallTimeout);
                        clearTimeout(hardTimeout);
                        audioTracks.push({
                            index: i,
                            language: lang,
                            name: title,
                            codec: 'aac',
                            playlistUrl: `audio_${lang}.m3u8`
                        });
                        taskProgress[taskIndex] = 100;
                        reportProgress();
                        resolve(true);
                    })
                    .on('error', (err) => {
                        clearTimeout(stallTimeout);
                        clearTimeout(hardTimeout);
                        console.error(`Error during FFmpeg audio ${lang}: ${err.message}`);
                        reject(err);
                    })
                    .run();
            });
        }

        // 3. Generate Master Playlist with Audio Groups
        // HLS version 6 is required for alternate audio renditions (EXT-X-MEDIA)
        let masterContent = '#EXTM3U\n#EXT-X-VERSION:6\n\n';

        if (hasMultipleAudio) {
            // Add Audio Media Tags (only when audio is in separate tracks)
            audioTracks.forEach((track, idx) => {
                masterContent += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${track.name}",LANGUAGE="${track.language}",DEFAULT=${idx === 0 ? 'YES' : 'NO'},AUTOSELECT=YES,URI="${track.playlistUrl}"\n`;
            });
            masterContent += '\n';

            // Video variants with audio group reference
            // BANDWIDTH must include audio bitrate (192k = 192000 bps) per HLS spec
            const audioBandwidth = 192000;
            profiles.forEach(p => {
                const res = p.resolution.replace(':', 'x');
                const totalBandwidth = p.bandwidth + audioBandwidth;
                masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${totalBandwidth},RESOLUTION=${res},CODECS="avc1.4d401f,mp4a.40.2",AUDIO="audio"\n${p.name}.m3u8\n`;
            });
        } else {
            // No separate audio tracks — audio is muxed into the video variant
            profiles.forEach(p => {
                const res = p.resolution.replace(':', 'x');
                masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${res},CODECS="avc1.4d401f,mp4a.40.2"\n${p.name}.m3u8\n`;
            });
        }

        fs.writeFileSync(playlistPath, masterContent);
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
            const cmd = ffmpeg(inputPath);

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
                    const cmd = ffmpeg(resolvedInput);

                    timeout = setTimeout(() => {
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] La extracción de subtítulos se atascó o tardó más de 5 minutos.`));
                    }, 5 * 60 * 1000);

                    cmd
                        .outputOptions([
                            `-map 0:s:${i}`,
                            '-c:s webvtt'
                        ])
                        .output(outFilePath)
                        .on('end', () => {
                            clearTimeout(timeout);
                            resolve();
                        })
                        .on('error', (err) => {
                            clearTimeout(timeout);
                            reject(err);
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
