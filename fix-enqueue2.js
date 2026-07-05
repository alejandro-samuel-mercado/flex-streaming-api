const fs = require('fs');
let content = fs.readFileSync('src/modules/media-scanner/media-scanner.service.ts', 'utf8');

const target2 = `    await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    console.log(\`📦 [MediaScanner] Enqueued \${fileName} → \${contentType === 'SERIES' ? 'Episode ' + episodeId : 'Content ' + contentId}\`);
  }`;

const replacement2 = `    await prisma.videoFile.update({ where: { id: videoFile.id }, data: { processingJobId: job.id } });
    console.log(\`📦 [MediaScanner] Enqueued \${fileName} → \${contentType === 'SERIES' ? 'Episode ' + episodeId : 'Content ' + contentId}\`);
    };

    const promise = resolveVideo().finally(() => this.creatingVideos.delete(lockKey));
    this.creatingVideos.set(lockKey, promise);
    return promise;
  }`;

content = content.replace(target2, replacement2);
fs.writeFileSync('src/modules/media-scanner/media-scanner.service.ts', content);
console.log('Fixed2');
