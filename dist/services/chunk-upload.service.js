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
            const chunkBuffer = fs_1.default.readFileSync(chunkPath);
            writeStream.write(chunkBuffer);
            fs_1.default.unlinkSync(chunkPath); // Delete chunk after merge
        }
        writeStream.end();
        return new Promise((resolve, reject) => {
            writeStream.on('finish', () => {
                fs_1.default.rmdirSync(chunkDir); // Delete empty chunk dir
                resolve(finalPath);
            });
            writeStream.on('error', reject);
        });
    }
}
exports.ChunkUploadService = ChunkUploadService;
//# sourceMappingURL=chunk-upload.service.js.map