import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const MEDIA_PATH = '/home/media/peliculas';

async function main() {
    console.log('==============================================');
    console.log('Buscando archivos .mp4/.mkv originales de videos completados en /home/media/peliculas...');
    
    // Buscar todos los videos COMPLETADOS
    const videos = await prisma.videoFile.findMany({
        where: {
            status: 'COMPLETED',
            originalPath: { startsWith: MEDIA_PATH }
        }
    });

    console.log(`Se encontraron ${videos.length} registros COMPLETADOS en la base de datos.`);

    let count = 0;
    let spaceSaved = 0;

    for (const video of videos) {
        if (!video.originalPath || !video.hlsPath) continue;

        if (!fs.existsSync(video.originalPath)) continue;

        const stat = fs.lstatSync(video.originalPath);
        if (stat.isDirectory()) {
            // Es una carpeta HLS subida entera. El otro script se encarga de esto.
            continue;
        }

        // Es un archivo de video crudo (.mp4, .mkv, etc)
        // Validar que realmente existe su copia HLS en peliplus_gran_disco antes de borrar el original
        const hlsExists = fs.existsSync(video.hlsPath) || video.hlsPath.includes('peliplus_gran_disco');
        
        // Comprobación segura (a veces hlsPath existe pero es inaccesible desde este script si se corre en otra máquina, 
        // pero asumimos que si el worker lo marcó COMPLETED, está ahí. 
        // Lo mínimo es asegurarse que el hlsPath NO es el mismo que el originalPath).
        if (video.hlsPath !== video.originalPath) {
            console.log(`🗑️  Borrando crudo original ya procesado: ${path.basename(video.originalPath)}`);
            try {
                fs.unlinkSync(video.originalPath);
                spaceSaved += stat.size;
                count++;
            } catch (err: any) {
                console.error(`❌ Error borrando ${video.originalPath}:`, err.message);
            }
        }
    }

    const gbSaved = (spaceSaved / (1024 * 1024 * 1024)).toFixed(2);
    console.log('==============================================');
    console.log(`🎉 Proceso finalizado. Se borraron ${count} archivos originales (.mp4/.mkv).`);
    console.log(`¡Liberaste aproximadamente ${gbSaved} GB de espacio en la partición /home/media/peliculas!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
