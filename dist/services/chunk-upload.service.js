"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUploadService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../shared/config/env");
class ChunkUploadService {
    static TEMP_DIR = path_1.default.join(env_1.env.UPLOAD_DIR, 'chunks');
    /**
     * Saves a single chunk to a temporary file
     */
    static async saveChunk(fileId, chunkIndex, chunkData) {
        const chunkDir = path_1.default.join(this.TEMP_DIR, fileId);
        if (!fs_1.default.existsSync(chunkDir)) {
            fs_1.default.mkdirSync(chunkDir, { recursive: true });
        }
        const chunkPath = path_1.default.join(chunkDir, `chunk_${chunkIndex}`);
        fs_1.default.writeFileSync(chunkPath, chunkData);
        return chunkPath;
    }
    /**
     * Merges all chunks into a final file
     */
    static async mergeChunks(fileId, fileName, totalChunks) {
        const chunkDir = path_1.default.join(this.TEMP_DIR, fileId);
        const finalDir = path_1.default.join(env_1.env.UPLOAD_DIR, 'videos');
        if (!fs_1.default.existsSync(finalDir))
            fs_1.default.mkdirSync(finalDir, { recursive: true });
        const finalPath = path_1.default.join(finalDir, `${Date.now()}_${fileName}`);
        const writeStream = fs_1.default.createWriteStream(finalPath);
        for (let i = 0; i < totalChunks; i++) {
            const chunkPath = path_1.default.join(chunkDir, `chunk_${i}`);
            if (!fs_1.default.existsSync(chunkPath)) {
                throw new Error(`Chunk ${i} missing for file ${fileId}`);
            }
            await new Promise((resolve, reject) => {
                const readStream = fs_1.default.createReadStream(chunkPath);
                readStream.pipe(writeStream, { end: false });
                readStream.on('end', () => {
                    fs_1.default.unlinkSync(chunkPath);
                    resolve(true);
                });
                readStream.on('error', reject);
            });
        }
        writeStream.end();
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                // Clean up chunk directory
                fs_1.default.rmSync(chunkDir, { recursive: true, force: true });
                resolve(finalPath);
            });
            writeStream.on('error', reject);
        });
    }
    /**
     * Deletes chunk directories older than maxAgeMs (default: 24 hours).
     * Call this periodically to prevent disk from filling up with abandoned uploads.
     */
    static cleanupStaleChunks(maxAgeMs = 24 * 60 * 60 * 1000) {
        if (!fs_1.default.existsSync(this.TEMP_DIR))
            return 0;
        let cleaned = 0;
        const now = Date.now();
        try {
            const entries = fs_1.default.readdirSync(this.TEMP_DIR, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const dirPath = path_1.default.join(this.TEMP_DIR, entry.name);
                try {
                    const stat = fs_1.default.statSync(dirPath);
                    if (now - stat.mtimeMs > maxAgeMs) {
                        fs_1.default.rmSync(dirPath, { recursive: true, force: true });
                        cleaned++;
                        console.log(`🧹 [ChunkUpload] Cleaned stale chunk dir: ${entry.name}`);
                    }
                }
                catch {
                    // Skip if we can't stat
                }
            }
        }
        catch {
            // TEMP_DIR might not exist yet
        }
        return cleaned;
    }
}
exports.ChunkUploadService = ChunkUploadService;
//# sourceMappingURL=chunk-upload.service.js.map