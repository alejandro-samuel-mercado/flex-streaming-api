import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function debugVideo() {
    const videoId = 'cmr0pl8n40007whb0mx3ivd0a';
    const video = await prisma.videoFile.findUnique({
        where: { id: videoId },
        include: {
            content: { select: { translations: true } },
            episode: { include: { season: true } }
        }
    });

    if (!video) {
        console.log(`❌ No se encontró el video con ID ${videoId}`);
        process.exit(1);
    }

    console.log(`\n--- DEBUG INFO DEL VIDEO ---`);
    console.log(`ID: ${video.id}`);
    console.log(`Tipo: ${video.type}`);
    console.log(`Ruta original guardada: ${video.originalPath}`);
    console.log(`HLS Path (raíz): ${video.hlsPath}`);
    console.log(`Master Playlist URL: ${video.masterPlaylist}`);

    if (!video.hlsPath) {
        console.log(`❌ El video no tiene hlsPath configurado.`);
        process.exit(1);
    }

    // Probar si el directorio base existe
    if (!fs.existsSync(video.hlsPath)) {
        console.log(`❌ La carpeta raíz HLS no existe en el disco: ${video.hlsPath}`);
        
        // Let's try to look at parent directory
        const parentDir = path.dirname(video.hlsPath);
        if (fs.existsSync(parentDir)) {
            console.log(`ℹ️ Contenido de la carpeta padre (${parentDir}):`);
            console.log(fs.readdirSync(parentDir).slice(0, 10).join(', '));
        }
        process.exit(1);
    } else {
        console.log(`✅ La carpeta raíz HLS SÍ existe: ${video.hlsPath}`);
    }

    // Probar qué m3u8 busca
    const m3u8Filename = video.masterPlaylist ? path.basename(video.masterPlaylist.split('?')[0]) : 'master.m3u8';
    const expectedPath = path.resolve(video.hlsPath, m3u8Filename);
    console.log(`Buscando archivo exacto en: ${expectedPath}`);

    if (fs.existsSync(expectedPath)) {
        console.log(`✅ El archivo ${m3u8Filename} existe ahí.`);
    } else {
        console.log(`❌ El archivo ${m3u8Filename} NO existe ahí.`);
        console.log(`ℹ️ Contenido real de la carpeta ${video.hlsPath}:`);
        try {
            console.log(fs.readdirSync(video.hlsPath).join(', '));
        } catch (e) {
            console.log(`No se pudo leer la carpeta.`);
        }
    }

    process.exit(0);
}

debugVideo();
