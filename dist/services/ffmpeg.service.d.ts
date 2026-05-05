import ffmpeg from 'fluent-ffmpeg';
export declare class FFmpegService {
    /**
     * Get file metadata (streams, duration, etc.)
     */
    static getMetadata(inputPath: string): Promise<ffmpeg.FfprobeData>;
    /**
     * Generates HLS (.m3u8 and .ts segments) from an input video file using fluent-ffmpeg.
     * This generates multiple resolutions based on the PROMPT MAESTRO specifications.
     */
    static generateHLS(inputPath: string, outputFolder: string, onProgress?: (percent: number) => void): Promise<{
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