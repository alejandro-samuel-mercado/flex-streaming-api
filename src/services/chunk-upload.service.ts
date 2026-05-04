import fs from 'fs';
import path from 'path';
import { env } from '../shared/config/env';

export class ChunkUploadService {
  private static readonly TEMP_DIR = path.join(env.UPLOAD_DIR, 'chunks');

  /**
   * Saves a single chunk to a temporary file
   */
  static async saveChunk(fileId: string, chunkIndex: number, chunkData: Buffer) {
    const chunkDir = path.join(this.TEMP_DIR, fileId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkPath = path.join(chunkDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, chunkData);
    return chunkPath;
  }

  /**
   * Merges all chunks into a final file
   */
  static async mergeChunks(fileId: string, fileName: string, totalChunks: number) {
    const chunkDir = path.join(this.TEMP_DIR, fileId);
    const finalDir = path.join(env.UPLOAD_DIR, 'videos');
    if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir, { recursive: true });

    const finalPath = path.join(finalDir, `${Date.now()}_${fileName}`);
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`Chunk ${i} missing for file ${fileId}`);
      }

      await new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(chunkPath);
        readStream.pipe(writeStream, { end: false });
        readStream.on('end', () => {
          fs.unlinkSync(chunkPath);
          resolve(true);
        });
        readStream.on('error', reject);
      });
    }

    writeStream.end();

    return new Promise<string>((resolve, reject) => {
      writeStream.on('finish', () => {
        // Clean up chunk directory
        fs.rmSync(chunkDir, { recursive: true, force: true });
        resolve(finalPath);
      });
      writeStream.on('error', reject);
    });
  }

  /**
   * Deletes chunk directories older than maxAgeMs (default: 24 hours).
   * Call this periodically to prevent disk from filling up with abandoned uploads.
   */
  static cleanupStaleChunks(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    if (!fs.existsSync(this.TEMP_DIR)) return 0;

    let cleaned = 0;
    const now = Date.now();

    try {
      const entries = fs.readdirSync(this.TEMP_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dirPath = path.join(this.TEMP_DIR, entry.name);
        try {
          const stat = fs.statSync(dirPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            fs.rmSync(dirPath, { recursive: true, force: true });
            cleaned++;
            console.log(`🧹 [ChunkUpload] Cleaned stale chunk dir: ${entry.name}`);
          }
        } catch {
          // Skip if we can't stat
        }
      }
    } catch {
      // TEMP_DIR might not exist yet
    }

    return cleaned;
  }
}
