"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FFmpegService = void 0;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("../shared/config/env");
// Initialize FFmpeg and FFprobe paths from environment configuration
if (env_1.env.FFMPEG_PATH)
    fluent_ffmpeg_1.default.setFfmpegPath(env_1.env.FFMPEG_PATH);
if (env_1.env.FFPROBE_PATH)
    fluent_ffmpeg_1.default.setFfprobePath(env_1.env.FFPROBE_PATH);
class FFmpegService {
    /**
     * Get file metadata (streams, duration, etc.)
     */
    static async getMetadata(inputPath) {
        return new Promise((resolve, reject) => {
            fluent_ffmpeg_1.default.ffprobe(inputPath, (err, metadata) => {
                if (err)
                    reject(err);
                else
                    resolve(metadata);
            });
        });
    }
    /**
     * Generates HLS (.m3u8 and .ts segments) from an input video file using fluent-ffmpeg.
     * This generates multiple resolutions based on the PROMPT MAESTRO specifications.
     */
    static async generateHLS(inputPath, outputFolder, onProgress) {
        // Ensure absolute paths
        const resolvedInputPath = path_1.default.resolve(inputPath);
        const resolvedOutputFolder = path_1.default.resolve(outputFolder);
        // Ensure output directory exists
        if (!fs_1.default.existsSync(resolvedOutputFolder)) {
            fs_1.default.mkdirSync(resolvedOutputFolder, { recursive: true });
        }
        console.log(`🎬 [FFmpeg] Output Folder: ${resolvedOutputFolder}`);
        // Get metadata to find audio tracks
        const metadata = await this.getMetadata(resolvedInputPath);
        const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
        const audioTracks = [];
        const playlistPath = path_1.default.join(resolvedOutputFolder, 'master.m3u8');
        const profiles = [
            { name: '1080p', resolution: '1920:1080', bitrate: '5000k', maxrate: '7500k', bufsize: '10000k', bandwidth: 8400000 }
        ];
        // Detect source framerate for proper GOP alignment — preserve exact fraction for max FPS fidelity
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        let fpsNum = 24; // numeric fps for GOP calculation
        let fpsValue = '24'; // exact value passed to FFmpeg -r flag
        // Some videos have '0/0' in r_frame_rate, so we fallback to avg_frame_rate
        const frameRateStr = (videoStream?.r_frame_rate && videoStream.r_frame_rate !== '0/0')
            ? videoStream.r_frame_rate
            : ((videoStream?.avg_frame_rate && videoStream.avg_frame_rate !== '0/0') ? videoStream.avg_frame_rate : null);
        if (frameRateStr) {
            const [num, den] = frameRateStr.split('/').map(Number);
            if (num && den) {
                fpsNum = num / den; // e.g. 23.976, 29.97, 25, 30, 60
                fpsValue = frameRateStr; // pass exact fraction e.g. "24000/1001"
            }
        }
        // GOP = 2 seconds worth of frames (clean keyframe interval for HLS)
        const gopSize = Math.round(fpsNum * 2);
        console.log(`🎬 [FFmpeg] Source FPS: ${fpsNum.toFixed(3)} (${fpsValue}), GOP size: ${gopSize} (2s intervals)`);
        let lastReportedProgress = 0;
        const totalSteps = profiles.length + audioStreams.length;
        const taskProgress = new Array(totalSteps).fill(0);
        const reportProgress = () => {
            if (!onProgress)
                return;
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
                let stallTimeout;
                let hardTimeout;
                let lastTimemark = '';
                let lastTimemarkAt = Date.now();
                let timemarkWatchdog;
                const cmd = (0, fluent_ffmpeg_1.default)(resolvedInputPath)
                    .renice(5)
                    .inputOptions([
                    '-analyzeduration', '100M',
                    '-probesize', '100M',
                    '-nostdin'
                ]);
                const cleanup = () => {
                    clearTimeout(stallTimeout);
                    clearTimeout(hardTimeout);
                    clearInterval(timemarkWatchdog);
                };
                const resetStallTimeout = () => {
                    if (stallTimeout)
                        clearTimeout(stallTimeout);
                    stallTimeout = setTimeout(() => {
                        cleanup();
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] El proceso se atascó (20 min sin actividad). Cancelado automáticamente.`));
                    }, 20 * 60 * 1000);
                };
                // Watchdog: mata FFmpeg si el timemark no avanza en 10 minutos
                // (FFmpeg puede seguir emitiendo eventos pero sin progresar realmente)
                timemarkWatchdog = setInterval(() => {
                    if (lastTimemark && Date.now() - lastTimemarkAt > 10 * 60 * 1000) {
                        console.warn(`[FFmpeg] ⚠️ Watchdog: timemark congelado en ${lastTimemark} por 10 min. Cancelando.`);
                        cleanup();
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] FFmpeg sin progreso real por 10 min (congelado en ${lastTimemark}). Cancelado.`));
                    }
                }, 60 * 1000);
                hardTimeout = setTimeout(() => {
                    cleanup();
                    cmd.kill('SIGKILL');
                    reject(new Error(`[Timeout] El proceso excedió el tiempo máximo permitido (4 horas). Cancelado automáticamente.`));
                }, 4 * 60 * 60 * 1000);
                const opts = [
                    '-preset', 'veryfast',
                    '-threads', '2',
                    '-profile:v', 'main',
                    '-level', '4.0',
                    '-vf', `scale=w=${profile.resolution.split(':')[0]}:h=${profile.resolution.split(':')[1]}:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
                    '-c:v', 'h264',
                    '-pix_fmt', 'yuv420p',
                    '-fps_mode', 'cfr',
                    '-r', fpsValue,
                    '-g', gopSize.toString(),
                    '-keyint_min', gopSize.toString(),
                    '-sc_threshold', '0',
                    '-b:v', profile.bitrate,
                    '-maxrate', profile.maxrate,
                    '-bufsize', profile.bufsize,
                    '-max_muxing_queue_size', '1024',
                    '-hls_time', '30',
                    '-hls_playlist_type', 'vod',
                    '-hls_flags', 'independent_segments',
                    '-hls_segment_type', 'mpegts',
                    '-hls_segment_filename', path_1.default.join(resolvedOutputFolder, `${profile.name}_%03d.ts`)
                ];
                if (hasMultipleAudio) {
                    opts.unshift('-map', '0:v:0', '-an');
                }
                else {
                    opts.unshift('-map', '0:v:0', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k');
                }
                cmd
                    .outputOptions(opts)
                    .output(path_1.default.join(resolvedOutputFolder, `${profile.name}.m3u8`))
                    .on('start', () => resetStallTimeout())
                    .on('progress', (progress) => {
                    resetStallTimeout();
                    // Actualizar timemark para el watchdog
                    if (progress.timemark && progress.timemark !== lastTimemark) {
                        lastTimemark = progress.timemark;
                        lastTimemarkAt = Date.now();
                    }
                    if (progress.percent) {
                        taskProgress[taskIndex] = progress.percent;
                        reportProgress();
                    }
                })
                    .on('end', () => {
                    cleanup();
                    taskProgress[taskIndex] = 100;
                    reportProgress();
                    resolve(true);
                })
                    .on('error', (err, _stdout, stderr) => {
                    cleanup();
                    const errorMessage = `FFmpeg Error [${profile.name}]: ${err.message}${stderr ? `\nSTDERR: ${stderr}` : ''}`;
                    console.error(errorMessage);
                    reject(new Error(errorMessage));
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
                let stallTimeout;
                let hardTimeout;
                let lastTimemark = '';
                let lastTimemarkAt = Date.now();
                let timemarkWatchdog;
                const cmd = (0, fluent_ffmpeg_1.default)(resolvedInputPath)
                    .renice(5)
                    .inputOptions([
                    '-analyzeduration', '100M',
                    '-probesize', '100M',
                    '-nostdin'
                ]);
                const cleanup = () => {
                    clearTimeout(stallTimeout);
                    clearTimeout(hardTimeout);
                    clearInterval(timemarkWatchdog);
                };
                const resetStallTimeout = () => {
                    if (stallTimeout)
                        clearTimeout(stallTimeout);
                    stallTimeout = setTimeout(() => {
                        cleanup();
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] La extracción de audio se atascó (20 min sin actividad).`));
                    }, 20 * 60 * 1000);
                };
                // Watchdog: mata FFmpeg si el timemark no avanza en 10 minutos
                timemarkWatchdog = setInterval(() => {
                    if (lastTimemark && Date.now() - lastTimemarkAt > 10 * 60 * 1000) {
                        console.warn(`[FFmpeg] ⚠️ Watchdog audio: timemark congelado en ${lastTimemark} por 10 min. Cancelando.`);
                        cleanup();
                        cmd.kill('SIGKILL');
                        reject(new Error(`[Timeout] Audio FFmpeg sin progreso real por 10 min (congelado en ${lastTimemark}). Cancelado.`));
                    }
                }, 60 * 1000);
                hardTimeout = setTimeout(() => {
                    cleanup();
                    cmd.kill('SIGKILL');
                    reject(new Error(`[Timeout] La extracción de audio excedió las 4 horas permitidas.`));
                }, 4 * 60 * 60 * 1000);
                cmd
                    .outputOptions([
                    '-vn',
                    '-map', `0:a:${i}`,
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-ac', '2',
                    '-hls_time', '6',
                    '-hls_playlist_type', 'vod',
                    '-hls_segment_filename', path_1.default.join(resolvedOutputFolder, `audio_${lang}_%03d.ts`)
                ])
                    .output(path_1.default.join(resolvedOutputFolder, `audio_${lang}.m3u8`))
                    .on('start', () => resetStallTimeout())
                    .on('progress', (progress) => {
                    resetStallTimeout();
                    // Actualizar timemark para el watchdog
                    if (progress.timemark && progress.timemark !== lastTimemark) {
                        lastTimemark = progress.timemark;
                        lastTimemarkAt = Date.now();
                    }
                    if (progress.percent) {
                        taskProgress[taskIndex] = progress.percent;
                        reportProgress();
                    }
                })
                    .on('end', () => {
                    cleanup();
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
                    cleanup();
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
        }
        else {
            // No separate audio tracks — audio is muxed into the video variant
            profiles.forEach(p => {
                const res = p.resolution.replace(':', 'x');
                masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${res},CODECS="avc1.4d401f,mp4a.40.2"\n${p.name}.m3u8\n`;
            });
        }
        fs_1.default.writeFileSync(playlistPath, masterContent);
        return { path: playlistPath, audioTracks };
    }
    /**
     * Generates a single thumbnail poster for a video
     */
    static generateThumbnail(inputPath, outputFolder) {
        return new Promise((resolve, reject) => {
            if (!fs_1.default.existsSync(outputFolder)) {
                fs_1.default.mkdirSync(outputFolder, { recursive: true });
            }
            let timeout;
            const cmd = (0, fluent_ffmpeg_1.default)(inputPath).renice(5);
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
                resolve({ path: path_1.default.join(outputFolder, filename) });
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
    static async extractSubtitles(inputPath, outputFolder) {
        const resolvedInput = path_1.default.resolve(inputPath);
        const resolvedOutput = path_1.default.resolve(outputFolder);
        if (!fs_1.default.existsSync(resolvedOutput)) {
            fs_1.default.mkdirSync(resolvedOutput, { recursive: true });
        }
        // Get metadata to find subtitle streams
        const metadata = await this.getMetadata(resolvedInput);
        const subtitleStreams = metadata.streams.filter(s => s.codec_type === 'subtitle');
        if (subtitleStreams.length === 0) {
            console.log('📝 [FFmpeg] No embedded subtitles found');
            return [];
        }
        console.log(`📝 [FFmpeg] Found ${subtitleStreams.length} embedded subtitle track(s)`);
        const results = [];
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
            const outFilePath = path_1.default.join(resolvedOutput, outFileName);
            try {
                await new Promise((resolve, reject) => {
                    let timeout;
                    const cmd = (0, fluent_ffmpeg_1.default)(resolvedInput).renice(5);
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
                        if (stderr)
                            console.warn(`FFmpeg Subtitle STDERR:\n${stderr}`);
                        reject(err);
                    })
                        .on('end', () => {
                        clearTimeout(timeout);
                        resolve();
                    })
                        .run();
                });
                // Verify the file was created and has content
                if (fs_1.default.existsSync(outFilePath) && fs_1.default.statSync(outFilePath).size > 10) {
                    results.push({
                        language: lang,
                        label: title,
                        filePath: outFilePath,
                        isDefault,
                        isForced
                    });
                    console.log(`📝 [FFmpeg] Extracted subtitle: ${title} (${lang}) → ${outFileName}`);
                }
                else {
                    console.warn(`📝 [FFmpeg] Subtitle track ${i} extraction produced empty file, skipping`);
                    // Clean up empty file
                    if (fs_1.default.existsSync(outFilePath))
                        fs_1.default.unlinkSync(outFilePath);
                }
            }
            catch (err) {
                console.warn(`📝 [FFmpeg] Failed to extract subtitle track ${i} (${codec}): ${err.message}`);
                // Non-fatal — continue with other tracks
                if (fs_1.default.existsSync(outFilePath))
                    fs_1.default.unlinkSync(outFilePath);
            }
        }
        console.log(`📝 [FFmpeg] Successfully extracted ${results.length}/${subtitleStreams.length} subtitle track(s)`);
        return results;
    }
}
exports.FFmpegService = FFmpegService;
//# sourceMappingURL=ffmpeg.service.js.map