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

    // Check if the file still exists at the originalPath, or if it was moved to videos_subidos
    let actualInputPath = video.originalPath;
    if (!fs.existsSync(actualInputPath)) {
        const fileName = require('path').basename(video.originalPath);
        const alternatePath = `/home/peliplus_gran_disco/videos_subidos/${fileName}`;
        if (fs.existsSync(alternatePath)) {
            actualInputPath = alternatePath;
        } else {
            console.log(`Error: No se encuentra el mp4 ni en ${video.originalPath} ni en ${alternatePath}`);
            return;
        }
    }

    console.log(`🎬 Forzando re-codificación LENTA para: ${actualInputPath}`);
    
    // Wipe the old HLS folder
    const outputFolder = video.hlsPath;
    if (!outputFolder) {
        console.log("Error: hlsPath es nulo en la base de datos.");
        return;
    }

    if (fs.existsSync(outputFolder)) {
        fs.rmSync(outputFolder, { recursive: true, force: true });
        console.log("🗑️ Carpeta HLS anterior borrada.");
    }
    
    // Force re-encode using the actual path where the file is now
    await FFmpegService.generateHLS(actualInputPath, outputFolder, (pct) => {
        process.stdout.write(`\r⏳ Progreso: ${pct}%   `);
    }, true); // true = forceReencode

    console.log("\n✅ ¡Película recodificada perfectamente con cortes de 6.000s!");
}

main().catch(console.error).finally(() => process.exit(0));
