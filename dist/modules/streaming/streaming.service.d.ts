import fs from 'fs';
export declare class StreamingService {
    /**
     * Generates a signed streaming token for a content item.
     * Uses HMAC signed URLs instead of JWT for better security.
     */
    static requestAccess(_userId: string, contentId: string, ip: string, episodeId?: string): Promise<{
        token: string;
        expiresIn: number;
        videoFileId: string;
        masterPlaylist: string | null;
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
    static serveSegment(videoFileId: string, filePath: string, token: string, ip: string): Promise<{
        status: number;
        headers: Record<string, string>;
        stream: fs.ReadStream | null;
    }>;
    /**
     * Byte-range streaming for direct video files (fallback / dev mode).
     */
    static streamDirect(videoPath: string, range: string | undefined): {
        headers: Record<string, string>;
        status: number;
        stream: fs.ReadStream | null;
    };
}
//# sourceMappingURL=streaming.service.d.ts.map