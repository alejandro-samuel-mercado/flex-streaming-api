import fs from 'fs';
export declare class StreamingService {
    /**
     * Generates a signed streaming token for a content item.
     * Uses HMAC signed URLs instead of JWT for better security.
     */
    static requestAccess(_userId: string, role: string, contentId: string, ip: string, episodeId?: string): Promise<{
        token: string;
        expiresIn: number;
        videoFileId: string;
        masterPlaylist: string | null;
        streamBaseUrl: string;
        qualities: {
            resolution: string;
            width: number;
            height: number;
            bitrate: number;
        }[];
        audioTracks: {
            language: string;
            label: string;
            isDefault: boolean;
        }[];
        subtitleTracks: {
            language: string;
            label: string;
            url: string;
            isDefault: boolean;
        }[];
    }>;
    static recordView(contentId: string): Promise<void>;
    /**
     * Serve HLS segments with token validation.
     */
    static serveSegment(videoFileId: string, filePath: string, token: string, ip: string, audioIndex?: number | null): Promise<{
        status: number;
        headers: Record<string, string>;
        stream: NodeJS.ReadableStream | null;
    }>;
    /**
     * Byte-range streaming for direct video files (fallback / dev mode).
     */
    static streamDirect(videoPath: string, range: string | undefined): {
        headers: Record<string, string>;
        status: number;
        stream: fs.ReadStream | null;
    };
    /**
     * Spawns FFmpeg to remux an HLS playlist into a fragmented MP4 piped to stdout.
     * Sets CWD to the playlist directory so relative segment paths resolve correctly.
     * Logs stderr for debugging.
     */
    private static spawnFfmpegMp4;
    /**
     * Finds the HLS master playlist by scanning known HLS directories for a
     * folder whose name ends with a prefix of the given contentId.
     * Then spawns FFmpeg to mux the HLS stream into an MP4 on the fly.
     *
     * HLS folders are named like: "titulo-de-pelicula--cmrp2fj3"
     * where "cmrp2fj3" is the first 8 chars of the content ID.
     */
    static downloadHlsAsMp4(contentId?: string, episodeId?: string): Promise<{
        status: number;
        stream: any;
        error?: string;
    }>;
}
//# sourceMappingURL=streaming.service.d.ts.map