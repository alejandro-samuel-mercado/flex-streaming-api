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
        fs.rmdirSync(chunkDir); // Delete empty chunk dir
        resolve(finalPath);
      });
      writeStream.on('error', reject);
    });
  }
}
