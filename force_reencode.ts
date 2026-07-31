import { FFmpegService } from './src/services/ffmpeg.service';
import { prisma } from './src/shared/config/prisma';
import fs from 'fs';
import path from 'path';

async function main() {
    const searchString = process.argv[2];
    if (!searchString) {
        console.error("❌ Error: Debes pasar el nombre de la película como argumento.");
        process.exit(1);
    }
    
    // Find the video in the database by looking at originalPath
    const video = await prisma.videoFile.findFirst({
        where: { 
            originalPath: { contains: searchString, mode: 'insensitive' }
        }
    });

    if (!video) {
        console.log(`❌ No se encontró ningún archivo en la base de datos que contenga '${searchString}'.`);
        console.log(`⚠️ IMPORTANTE: Si acabas de borrar el archivo de la base de datos, primero debes volver a correr el escáner (escanear_peliculas.ts) para que lo registre, y una vez que aparezca en el panel, corres este comando.`);
        return;
    }

    // Check if the file still exists at the originalPath, or if it was moved to videos_subidos
    let actualInputPath = video.originalPath;
    if (!fs.existsSync(actualInputPath)) {
        const fileName = path.basename(video.originalPath);
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
    let outputFolder = video.hlsPath;
    if (!outputFolder) {
        if (video.contentId) {
            outputFolder = path.resolve(process.env.HLS_PATH || '/home/peliplus_gran_disco/hls', video.contentId);
        } else {
            console.log("Error: hlsPath es nulo en la base de datos y no se pudo deducir.");
            return;
        }
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
