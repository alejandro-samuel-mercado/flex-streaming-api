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
}
//# sourceMappingURL=ffmpeg.service.d.ts.map