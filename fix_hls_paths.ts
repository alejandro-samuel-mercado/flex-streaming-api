import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findM3u8(dirPath: string, depth = 0): Promise<string | null> {
    if (depth > 2) return null;
    let entries: string[];
    try { entries = await fs.promises.readdir(dirPath); }
    catch { return null; }

    for (const name of entries) {
        if (name === 'index.m3u8' || name === 'video.m3u8' || name === 'master.m3u8') {
            return path.join(dirPath, name);
        }
    }

    if (depth < 2) {
        for (const name of entries) {
            const sub = path.join(dirPath, name);
            try {
                const stat = await fs.promises.stat(sub);
                if (stat.isDirectory()) {
                    const found = await findM3u8(sub, depth + 1);
                    if (found) return found;
                }
            } catch { /* skip */ }
        }
    }
    return null;
}

async function run() {
    console.log('🔍 Buscando videos con hlsPath incorrecto...');
    const videos = await prisma.videoFile.findMany({
        where: {
            status: 'COMPLETED',
            hlsPath: { not: null }
        }
    });

    let fixedCount = 0;

    for (const video of videos) {
        if (!video.hlsPath) continue;
        
        let rootPath = video.hlsPath;
        if (!path.isAbsolute(rootPath)) continue; // Ignorar rutas relativas viejas si las hay

        const m3u8Filename = video.masterPlaylist ? path.basename(video.masterPlaylist) : 'index.m3u8';
        const expectedFile = path.join(rootPath, m3u8Filename);
        
        // Si el archivo ya existe en esa ruta exacta, está bien
        if (fs.existsSync(expectedFile)) {
            continue;
        }

        // Si no existe, búscalo en subcarpetas
        console.log(`⚠️ Archivo no encontrado en: ${expectedFile}`);
        const foundPath = await findM3u8(rootPath);
        
        if (foundPath) {
            const correctHlsPath = path.dirname(foundPath);
            if (correctHlsPath !== rootPath) {
                console.log(`✅ Archivo encontrado en subcarpeta. Actualizando hlsPath a: ${correctHlsPath}`);
                await prisma.videoFile.update({
                    where: { id: video.id },
                    data: { hlsPath: correctHlsPath }
                });
                fixedCount++;
            }
        } else {
            console.log(`❌ No se encontró ningún archivo m3u8 dentro de: ${rootPath}`);
        }
    }

    console.log(`\n🎉 Finalizado. Se corrigieron ${fixedCount} videos.`);
    process.exit(0);
}

run();
