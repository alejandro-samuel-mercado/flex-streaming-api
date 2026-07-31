import { FFmpegService } from './src/services/ffmpeg.service';
import { prisma } from './src/shared/config/prisma';
import fs from 'fs';

async function main() {
    const contentId = 'cms6jhmg';
    
    // Find the video in the database by looking at originalPath
    const video = await prisma.videoFile.findFirst({
        where: { 
            originalPath: { contains: 'kimetsu', mode: 'insensitive' },
            type: 'MOVIE' 
        }
    });

    if (!video) {
        // Fallback: let's try just listing the first few movies to see what we have
        const allMovies = await prisma.videoFile.findMany({ where: { type: 'MOVIE' }, take: 5, select: { originalPath: true, contentId: true } });
        console.log("No se encontró 'kimetsu'. Muestra de películas en DB:", allMovies);
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
