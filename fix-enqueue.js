const fs = require('fs');
let content = fs.readFileSync('src/modules/media-scanner/media-scanner.service.ts', 'utf8');

const target = `  private static async _createVideoAndEnqueue(contentId: string, filePath: string, contentType: 'MOVIE' | 'SERIES'): Promise<void> {
    const fileName = path.basename(filePath);`;

const replacement = `  private static creatingVideos = new Map<string, Promise<void>>();

  private static async _createVideoAndEnqueue(contentId: string, filePath: string, contentType: 'MOVIE' | 'SERIES'): Promise<void> {
    const lockKey = \`video-\${filePath}\`;
    if (this.creatingVideos.has(lockKey)) {
        return this.creatingVideos.get(lockKey);
    }

    const resolveVideo = async () => {
        const existing = await prisma.videoFile.findFirst({ where: { originalPath: filePath } });
        if (existing) {
            console.log(\`⏭️  [MediaScanner] Skipping duplicate enqueue for \${filePath}\`);
            return;
        }

        const fileName = path.basename(filePath);`;

content = content.replace(target, replacement);

const target2 = `    await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    console.log(\`[MediaScanner] 🎥 Queued video for \${contentType}: \${fileName}\`);
  }`;

const replacement2 = `    await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    console.log(\`[MediaScanner] 🎥 Queued video for \${contentType}: \${fileName}\`);
    };

    const promise = resolveVideo().finally(() => this.creatingVideos.delete(lockKey));
    this.creatingVideos.set(lockKey, promise);
    return promise;
  }`;

content = content.replace(target2, replacement2);
fs.writeFileSync('src/modules/media-scanner/media-scanner.service.ts', content);
console.log('Fixed');
