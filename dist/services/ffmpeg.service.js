"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FFmpegService = void 0;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
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
        // Ensure output directory exists
        if (!fs_1.default.existsSync(outputFolder)) {
            fs_1.default.mkdirSync(outputFolder, { recursive: true });
        }
        // Get metadata to find audio tracks
        const metadata = await this.getMetadata(inputPath);
        const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
        const audioTracks = [];
        const playlistPath = path_1.default.join(outputFolder, 'master.m3u8');
        const profiles = [
            { name: '360p', resolution: '640:360', bitrate: '800k', bandwidth: 1400000 },
            { name: '720p', resolution: '1280:720', bitrate: '2500k', bandwidth: 2800000 },
            { name: '1080p', resolution: '1920:1080', bitrate: '5000k', bandwidth: 5600000 }
        ];
        let totalProgress = 0;
        const totalSteps = profiles.length + audioStreams.length;
        const progressPerStep = 100 / totalSteps;
        // 1. Process Video Profiles (Video Only or Video + Default Audio)
        for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            console.log(`🎬 [FFmpeg] Processing Video ${profile.name}...`);
            await new Promise((resolve, reject) => {
                (0, fluent_ffmpeg_1.default)(inputPath)
                    .outputOptions([
                    '-preset superfast',
                    '-profile:v main',
                    `-vf scale=w=${profile.resolution.split(':')[0]}:h=${profile.resolution.split(':')[1]}:force_original_aspect_ratio=decrease`,
                    '-an', // No audio in video variants (HLS best practice for multi-audio)
                    '-c:v h264',
                    '-crf 20',
                    '-g 48',
                    '-keyint_min 48',
                    '-sc_threshold 0',
                    `-b:v ${profile.bitrate}`,
                    `-maxrate ${profile.bitrate}`,
                    '-bufsize 5000k',
                    '-hls_time 10',
                    '-hls_playlist_type vod',
                    '-hls_segment_filename', path_1.default.join(outputFolder, `${profile.name}_%03d.ts`)
                ])
                    .output(path_1.default.join(outputFolder, `${profile.name}.m3u8`))
                    .on('progress', (progress) => {
                    if (onProgress && progress.percent) {
                        const currentProgress = totalProgress + (progress.percent * progressPerStep / 100);
                        onProgress(Math.round(currentProgress));
                    }
                })
                    .on('end', () => {
                    totalProgress += progressPerStep;
                    resolve(true);
                })
                    .on('error', (err) => {
                    console.error(`Error during FFmpeg profile ${profile.name}: ${err.message}`);
                    reject(err);
                })
                    .run();
            });
        }
        // 2. Process Audio Streams
        for (let i = 0; i < audioStreams.length; i++) {
            const stream = audioStreams[i];
            const lang = stream.tags?.language || `audio${i}`;
            const title = stream.tags?.title || `Audio ${i + 1} (${lang})`;
            console.log(`🔊 [FFmpeg] Extracting Audio ${title}...`);
            await new Promise((resolve, reject) => {
                (0, fluent_ffmpeg_1.default)(inputPath)
                    .outputOptions([
                    `-map 0:a:${i}`,
                    '-c:a aac',
                    '-b:a 128k',
                    '-hls_time 10',
                    '-hls_playlist_type vod',
                    '-hls_segment_filename', path_1.default.join(outputFolder, `audio_${i}_%03d.ts`)
                ])
                    .output(path_1.default.join(outputFolder, `audio_${i}.m3u8`))
                    .on('end', () => {
                    audioTracks.push({
                        index: i,
                        language: lang,
                        name: title,
                        codec: 'aac',
                        playlistUrl: `audio_${i}.m3u8`
                    });
                    totalProgress += progressPerStep;
                    resolve(true);
                })
                    .on('error', reject)
                    .run();
            });
        }
        // 3. Generate Master Playlist with Audio Groups
        let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
        // Add Audio Media Tags
        audioTracks.forEach((track, idx) => {
            masterContent += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${track.name}",LANGUAGE="${track.language}",DEFAULT=${idx === 0 ? 'YES' : 'NO'},AUTOSELECT=YES,URI="${track.playlistUrl}"\n`;
        });
        masterContent += '\n';
        // Add Video Variants linked to the audio group
        profiles.forEach(p => {
            const res = p.resolution.replace(':', 'x');
            masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${res},AUDIO="audio"\n${p.name}.m3u8\n`;
        });
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
            const filename = 'poster.jpg';
            (0, fluent_ffmpeg_1.default)(inputPath)
                .screenshots({
                count: 1,
                folder: outputFolder,
                filename: filename,
                size: '1280x720',
            })
                .on('end', () => resolve({ path: path_1.default.join(outputFolder, filename) }))
                .on('error', reject);
        });
    }
}
exports.FFmpegService = FFmpegService;
//# sourceMappingURL=ffmpeg.service.js.map