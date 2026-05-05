export declare class ChunkUploadService {
    private static readonly TEMP_DIR;
    /**
     * Saves a single chunk to a temporary file
     */
    static saveChunk(fileId: string, chunkIndex: number, chunkData: Buffer): Promise<string>;
    /**
     * Merges all chunks into a final file
     */
    static mergeChunks(fileId: string, fileName: string, totalChunks: number): Promise<string>;
    /**
     * Deletes chunk directories older than maxAgeMs (default: 24 hours).
     * Call this periodically to prevent disk from filling up with abandoned uploads.
     */
    static cleanupStaleChunks(maxAgeMs?: number): number;
}
//# sourceMappingURL=chunk-upload.service.d.ts.map