import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export class FFmpegService {
  /**
   * Generates HLS (.m3u8 and .ts segments) from an input video file using fluent-ffmpeg.
   * This generates multiple resolutions based on the PROMPT MAESTRO specifications.
   */
  static generateHLS(
    inputPath: string,
    outputFolder: string,
    onProgress?: (percent: number) => void
  ): Promise<{ path: string }> {
    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      const playlistPath = path.join(outputFolder, 'master.m3u8');

      // Setup simple 720p version for demo/Phase 2
      // In a full production system, we would map multiple variants (360p, 720p, 1080p, 4K)
      ffmpeg(inputPath)
        .outputOptions([
          '-preset superfast',
          '-profile:v main',
          '-vf scale=w=1280:h=720:force_original_aspect_ratio=decrease',
          '-c:a aac',
          '-ar 48000',
          '-b:a 128k',
          '-c:v h264',
          '-crf 20',
          '-g 48',
          '-keyint_min 48',
          '-sc_threshold 0',
          '-b:v 2500k',
          '-maxrate 2675k',
          '-bufsize 3750k',
          '-hls_time 10',
          '-hls_playlist_type vod',
          '-hls_segment_filename', path.join(outputFolder, '720p_%03d.ts')
        ])
        .output(path.join(outputFolder, '720p.m3u8'))
        .on('progress', (progress) => {
          if (onProgress && progress.percent) {
            onProgress(Math.round(progress.percent));
          }
        })
        .on('end', () => {
          // Generate simple master playlist pointing to 720p
          const masterPlaylist = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=1280x720\n720p.m3u8\n`;
          fs.writeFileSync(playlistPath, masterPlaylist);
          resolve({ path: playlistPath });
        })
        .on('error', (err) => {
          console.error(`Error during FFmpeg processing: ${err.message}`);
          reject(err);
        })
        .run();
    });
  }

  /**
   * Generates a single thumbnail poster for a video
   */
  static generateThumbnail(
    inputPath: string,
    outputFolder: string
  ): Promise<{ path: string }> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(outputFolder)) {
        fs.mkdirSync(outputFolder, { recursive: true });
      }

      const filename = 'poster.jpg';
      ffmpeg(inputPath)
        .screenshots({
          count: 1,
          folder: outputFolder,
          filename: filename,
          size: '1280x720',
        })
        .on('end', () => resolve({ path: path.join(outputFolder, filename) }))
        .on('error', reject);
    });
  }
}
