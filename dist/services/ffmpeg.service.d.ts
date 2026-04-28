export declare class FFmpegService {
    /**
     * Generates HLS (.m3u8 and .ts segments) from an input video file using fluent-ffmpeg.
     * This generates multiple resolutions based on the PROMPT MAESTRO specifications.
     */
    static generateHLS(inputPath: string, outputFolder: string, onProgress?: (percent: number) => void): Promise<{
        path: string;
    }>;
    /**
     * Generates a single thumbnail poster for a video
     */
    static generateThumbnail(inputPath: string, outputFolder: string): Promise<{
        path: string;
    }>;
}
//# sourceMappingURL=ffmpeg.service.d.ts.map