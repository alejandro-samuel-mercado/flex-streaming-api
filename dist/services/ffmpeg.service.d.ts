import ffmpeg from 'fluent-ffmpeg';
export declare class FFmpegService {
    /**
     * Get file metadata (streams, duration, etc.)
     */
    static getMetadata(inputPath: string): Promise<ffmpeg.FfprobeData>;
    /**
     * Generates HLS (.m3u8 and .ts segments) from an input video file.
     *
     * FAST PATH (95% of cases): If the source video is already H.264/H.265 and audio is AAC/MP3,
     * it uses `-c copy` (stream copy / remux). This is near-instant and CPU-free.
     *
     * SLOW PATH (fallback): Only re-encodes if the source codec is not HLS-compatible
     * (e.g. VP9, AV1, HEVC with incompatible profile, etc.).
     */
    static generateHLS(inputPath: string, outputFolder: string, onProgress?: (percent: number) => void, forceReencode?: boolean, contentType?: 'MOVIE' | 'EPISODE'): Promise<{
        path: string;
        audioTracks: any[];
    }>;
    /**
     * Generates a single thumbnail poster for a video
     */
    static generateThumbnail(inputPath: string, outputFolder: string): Promise<{
        path: string;
    }>;
    /**
     * Extract embedded subtitles from video containers (MKV, MP4, etc.)
     * Converts any subtitle format (SRT, ASS, SSA, SUB) to WebVTT (.vtt)
     * Returns metadata for each extracted subtitle track.
     */
    static extractSubtitles(inputPath: string, outputFolder: string): Promise<{
        language: string;
        label: string;
        filePath: string;
        isDefault: boolean;
        isForced: boolean;
    }[]>;
}
//# sourceMappingURL=ffmpeg.service.d.ts.map