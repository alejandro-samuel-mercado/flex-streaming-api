import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export class FFmpegService {
  /**
   * Get file metadata (streams, duration, etc.)
   */
  static async getMetadata(inputPath: string): Promise<ffmpeg.FfprobeData> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata);
      });
    });
  }

  /**
   * Generates HLS (.m3u8 and .ts segments) from an input video file using fluent-ffmpeg.
   * This generates multiple resolutions based on the PROMPT MAESTRO specifications.
   */
  static async generateHLS(
    inputPath: string,
    outputFolder: string,
    onProgress?: (percent: number) => void
  ): Promise<{ path: string; audioTracks: any[] }> {
    // Ensure absolute paths
    const resolvedInputPath = path.resolve(inputPath);
    const resolvedOutputFolder = path.resolve(outputFolder);

    // Ensure output directory exists
    if (!fs.existsSync(resolvedOutputFolder)) {
      fs.mkdirSync(resolvedOutputFolder, { recursive: true });
    }

    // Get metadata to find audio tracks
    const metadata = await this.getMetadata(resolvedInputPath);
    const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
    const audioTracks: any[] = [];

    const playlistPath = path.join(resolvedOutputFolder, 'master.m3u8');
    const profiles = [
      { name: '360p', resolution: '640:360', bitrate: '800k', bandwidth: 1400000 },
      { name: '720p', resolution: '1280:720', bitrate: '2500k', bandwidth: 2800000 },
      { name: '1080p', resolution: '1920:1080', bitrate: '5000k', bandwidth: 5600000 }
    ];

    let totalProgress = 0;
    let lastReportedProgress = 0;
    const totalSteps = profiles.length + audioStreams.length;
    const taskProgress: number[] = new Array(totalSteps).fill(0);
    const tasks: Promise<boolean>[] = [];

    const reportProgress = () => {
      if (!onProgress) return;
      const overallPercent = taskProgress.reduce((sum, p) => sum + p, 0) / totalSteps;
      const currentProgress = Math.round(overallPercent);
      if (currentProgress > lastReportedProgress) {
        lastReportedProgress = currentProgress;
        onProgress(currentProgress);
      }
    };

    // 1. Process Video Profiles (Parallel)
    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      const taskIndex = i;
      console.log(`🎬 [FFmpeg] Processing Video ${profile.name}...`);
      
      tasks.push(new Promise((resolve, reject) => {
        ffmpeg(resolvedInputPath)
          .outputOptions([
            '-preset ultrafast',
            '-threads 0',
            '-profile:v main',
            `-vf scale=w=${profile.resolution.split(':')[0]}:h=${profile.resolution.split(':')[1]}:force_original_aspect_ratio=decrease`,
            '-an', // No audio in video variants (HLS best practice for multi-audio)
            '-c:v h264',
            '-crf 20',
            '-g 48',
            '-keyint_min 48',
            '-sc_threshold 0',
            `-b:v ${profile.bitrate}`,
            `-maxrate ${profile.bitrate}`,
            '-bufsize 5000k',
            '-hls_time 10',
            '-hls_playlist_type vod',
            '-hls_segment_filename', path.join(resolvedOutputFolder, `${profile.name}_%03d.ts`)
          ])
          .output(path.join(resolvedOutputFolder, `${profile.name}.m3u8`))
          .on('progress', (progress) => {
            if (progress.percent) {
              taskProgress[taskIndex] = progress.percent;
              reportProgress();
            }
          })
          .on('end', () => {
            taskProgress[taskIndex] = 100;
            reportProgress();
            resolve(true);
          })
          .on('error', (err) => {
            console.error(`Error during FFmpeg profile ${profile.name}: ${err.message}`);
            reject(err);
          })
          .run();
      }));
    }

    // 2. Process Audio Streams (Parallel)
    for (let i = 0; i < audioStreams.length; i++) {
      const stream = audioStreams[i];
      const taskIndex = profiles.length + i;
      const lang = stream.tags?.language || `audio${i}`;
      const title = stream.tags?.title || `Audio ${i + 1} (${lang})`;
      
      console.log(`🔊 [FFmpeg] Extracting Audio ${title}...`);
      
      tasks.push(new Promise((resolve, reject) => {
        ffmpeg(resolvedInputPath)
          .outputOptions([
            `-map 0:a:${i}`,
            '-vn', // Disable video
            '-sn', // Disable subtitles
            '-c:a aac',
            '-b:a 128k',
            '-hls_time 10',
            '-hls_playlist_type vod',
            '-hls_segment_filename', path.join(resolvedOutputFolder, `audio_${i}_%03d.ts`)
          ])
          .output(path.join(resolvedOutputFolder, `audio_${i}.m3u8`))
          .on('progress', (progress) => {
            if (progress.percent) {
              taskProgress[taskIndex] = progress.percent;
              reportProgress();
            }
          })
          .on('end', () => {
            audioTracks.push({
              index: i,
              language: lang,
              name: title,
              codec: 'aac',
              playlistUrl: `audio_${i}.m3u8`
            });
            taskProgress[taskIndex] = 100;
            reportProgress();
            resolve(true);
          })
          .on('error', (err) => {
            console.error(`❌ [FFmpeg] Audio extraction error (track ${i}):`, err.message);
            reject(err);
          })
          .run();
      }));
    }

    await Promise.all(tasks);

    // 3. Generate Master Playlist with Audio Groups
    let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n\n';
    
    // Add Audio Media Tags
    audioTracks.forEach((track, idx) => {
      masterContent += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${track.name}",LANGUAGE="${track.language}",DEFAULT=${idx === 0 ? 'YES' : 'NO'},AUTOSELECT=YES,URI="${track.playlistUrl}"\n`;
    });
    
    masterContent += '\n';

    // Add Video Variants linked to the audio group
    profiles.forEach(p => {
      const res = p.resolution.replace(':', 'x');
      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${res},AUDIO="audio"\n${p.name}.m3u8\n`;
    });

    fs.writeFileSync(playlistPath, masterContent);
    return { path: playlistPath, audioTracks };
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

  /**
   * Extract embedded subtitles from video containers (MKV, MP4, etc.)
   * Converts any subtitle format (SRT, ASS, SSA, SUB) to WebVTT (.vtt)
   * Returns metadata for each extracted subtitle track.
   */
  static async extractSubtitles(
    inputPath: string,
    outputFolder: string
  ): Promise<{ language: string; label: string; filePath: string; isDefault: boolean; isForced: boolean }[]> {
    const resolvedInput = path.resolve(inputPath);
    const resolvedOutput = path.resolve(outputFolder);

    if (!fs.existsSync(resolvedOutput)) {
      fs.mkdirSync(resolvedOutput, { recursive: true });
    }

    // Get metadata to find subtitle streams
    const metadata = await this.getMetadata(resolvedInput);
    const subtitleStreams = metadata.streams.filter(s => s.codec_type === 'subtitle');

    if (subtitleStreams.length === 0) {
      console.log('📝 [FFmpeg] No embedded subtitles found');
      return [];
    }

    console.log(`📝 [FFmpeg] Found ${subtitleStreams.length} embedded subtitle track(s)`);

    const results: { language: string; label: string; filePath: string; isDefault: boolean; isForced: boolean }[] = [];

    for (let i = 0; i < subtitleStreams.length; i++) {
      const stream = subtitleStreams[i];
      const lang = stream.tags?.language || `und`;
      const title = stream.tags?.title || `Subtítulo ${i + 1} (${lang})`;
      const isDefault = stream.disposition?.default === 1;
      const isForced = stream.disposition?.forced === 1;
      const codec = stream.codec_name || '';

      // Skip image-based subtitles (PGS, DVB, VOBSUB) — cannot convert to text
      const imageBased = ['hdmv_pgs_subtitle', 'dvb_subtitle', 'dvd_subtitle', 'pgssub'];
      if (imageBased.includes(codec)) {
        console.log(`📝 [FFmpeg] Skipping image-based subtitle track ${i} (${codec})`);
        continue;
      }

      const outFileName = `sub_${i}_${lang}.vtt`;
      const outFilePath = path.join(resolvedOutput, outFileName);

      try {
        await new Promise<void>((resolve, reject) => {
          ffmpeg(resolvedInput)
            .outputOptions([
              `-map 0:s:${i}`,
              '-c:s webvtt'
            ])
            .output(outFilePath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run();
        });

        // Verify the file was created and has content
        if (fs.existsSync(outFilePath) && fs.statSync(outFilePath).size > 10) {
          results.push({
            language: lang,
            label: title,
            filePath: outFilePath,
            isDefault,
            isForced
          });
          console.log(`📝 [FFmpeg] Extracted subtitle: ${title} (${lang}) → ${outFileName}`);
        } else {
          console.warn(`📝 [FFmpeg] Subtitle track ${i} extraction produced empty file, skipping`);
          // Clean up empty file
          if (fs.existsSync(outFilePath)) fs.unlinkSync(outFilePath);
        }
      } catch (err: any) {
        console.warn(`📝 [FFmpeg] Failed to extract subtitle track ${i} (${codec}): ${err.message}`);
        // Non-fatal — continue with other tracks
        if (fs.existsSync(outFilePath)) fs.unlinkSync(outFilePath);
      }
    }

    console.log(`📝 [FFmpeg] Successfully extracted ${results.length}/${subtitleStreams.length} subtitle track(s)`);
    return results;
  }
}
