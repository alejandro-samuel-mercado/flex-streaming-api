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
}
//# sourceMappingURL=chunk-upload.service.d.ts.map