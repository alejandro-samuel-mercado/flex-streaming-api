import { prisma } from './src/shared/config/prisma';
import { MediaScannerService } from './src/modules/media-scanner/media-scanner.service';

async function main() {
  console.log('--- DB STATUS ---');
  const counts = await prisma.videoFile.groupBy({
    by: ['status'],
    _count: true
  });
  console.log(counts);

  console.log('--- SCANNING SERIES FOLDER ---');
  const files = await MediaScannerService.scanDirectories(undefined, '/home/media/series');
  const newFiles = files.filter(f => !f.alreadyImported);
  console.log(`Total: ${files.length}, New: ${newFiles.length}`);
  
  if (newFiles.length === 0 && files.length > 0) {
    console.log('Sample file that is already imported:');
    console.log(files[0].filePath);
    const dbEntry = await prisma.videoFile.findFirst({
      where: { originalPath: files[0].filePath }
    });
    console.log('DB Entry for this file:', dbEntry);
  }
}

main().finally(() => prisma.$disconnect());
