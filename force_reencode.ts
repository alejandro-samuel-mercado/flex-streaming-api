import { FFmpegService } from './src/services/ffmpeg.service';
import { prisma } from './src/shared/config/prisma';
import fs from 'fs';

async function main() {
    const contentId = 'cms6jhmg';
    
    // Find the video in the database
    const video = await prisma.videoFile.findFirst({
        where: { originalPath: { contains: 'kimetsu' }, type: 'MOVIE' }
    });

    if (!video) {
        console.log("No se encontró el video en la base de datos.");
        return;
    }

    console.log(`🎬 Forzando re-codificación LENTA para: ${video.originalPath}`);
    
    // Wipe the old HLS folder
    const outputFolder = video.outputPath;
    if (fs.existsSync(outputFolder)) {
        fs.rmSync(outputFolder, { recursive: true, force: true });
        console.log("🗑️ Carpeta HLS anterior borrada.");
    }
    
    // Force re-encode
    await FFmpegService.generateHLS(video.originalPath, outputFolder, (pct) => {
        process.stdout.write(`\r⏳ Progreso: ${pct}%   `);
    }, true); // true = forceReencode

    console.log("\n✅ ¡Película recodificada perfectamente con cortes de 6.000s!");
}

main().catch(console.error).finally(() => process.exit(0));
