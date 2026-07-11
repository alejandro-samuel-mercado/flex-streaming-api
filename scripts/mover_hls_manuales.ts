import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const OLD_PATH = '/home/media/peliculas';
const NEW_PATH = '/home/peliplus_gran_disco/hls/peliculas_manuales';

async function main() {
    console.log('==============================================');
    console.log('Iniciando traslado de carpetas HLS subidas manualmente...');
    console.log(`Origen: ${OLD_PATH}`);
    console.log(`Destino: ${NEW_PATH}`);
    
    const videos = await prisma.videoFile.findMany({
        where: {
            status: 'COMPLETED',
            hlsPath: { startsWith: OLD_PATH }
        }
    });

    console.log(`Se encontraron ${videos.length} videos en la base de datos con ruta en ${OLD_PATH}.`);

    if (videos.length === 0) {
        console.log('No hay nada que mover.');
        return;
    }

    if (!fs.existsSync(NEW_PATH)) {
        fs.mkdirSync(NEW_PATH, { recursive: true });
    }

    let count = 0;
    for (const video of videos) {
        if (!video.hlsPath) continue;

        const folderName = path.basename(video.hlsPath);
        const sourcePath = video.hlsPath;
        const targetPath = path.join(NEW_PATH, folderName);

        if (fs.existsSync(sourcePath) && fs.lstatSync(sourcePath).isDirectory()) {
            console.log(`\n⏳ Moviendo: ${folderName}...`);
            try {
                // Movemos físicamente. Si el volumen es distinto, renameSync puede fallar con EXDEV
                // pero si 'mv' es requerido por cruzar particiones, usamos fs.cpSync y luego rmSync
                try {
                    fs.renameSync(sourcePath, targetPath);
                } catch (renameErr: any) {
                    if (renameErr.code === 'EXDEV') {
                        console.log(`  Cruza particiones. Copiando y eliminando (esto tomará un momento)...`);
                        fs.cpSync(sourcePath, targetPath, { recursive: true });
                        fs.rmSync(sourcePath, { recursive: true, force: true });
                    } else {
                        throw renameErr;
                    }
                }

                // Actualizamos DB
                await prisma.videoFile.update({
                    where: { id: video.id },
                    data: {
                        hlsPath: targetPath,
                        originalPath: video.originalPath?.startsWith(OLD_PATH) ? targetPath : video.originalPath
                    }
                });
                console.log(`✅ Movido a ${targetPath} y base de datos actualizada.`);
                count++;
            } catch (err: any) {
                console.error(`❌ Error moviendo ${folderName}:`, err.message);
            }
        } else {
            console.log(`⚠️ Ignorado: ${sourcePath} no existe o no es una carpeta.`);
        }
    }
    console.log('==============================================');
    console.log(`🎉 Proceso finalizado. Se movieron ${count} carpetas exitosamente.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
