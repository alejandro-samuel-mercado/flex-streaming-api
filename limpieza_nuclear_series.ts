import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
import { videoQueue } from './src/shared/config/queue';
import fs from 'fs';
import path from 'path';

async function nukeSeries() {
    console.log("☢️ INICIANDO BORRADO MASIVO DE SERIES (Desde el 29 de Julio)...");

    // 1. Vaciar la cola de BullMQ para que nada nuevo intente procesarse
    console.log("🧹 Vaciando la cola de procesamiento (bullmq)...");
    try {
        await videoQueue.drain(); 
    } catch (e: any) {
        console.log("⚠️ Nota de cola:", e.message);
    }

    // 2. Buscar todos los episodios subidos desde el 29 de Julio
    const videoFiles = await prisma.videoFile.findMany({
        where: {
            type: 'EPISODE',
            createdAt: { gte: new Date('2026-07-29T00:00:00.000Z') }
        }
    });

    if (videoFiles.length === 0) {
        console.log("✅ No se encontraron episodios recientes para borrar.");
        return;
    }

    console.log(`🧨 Se van a destruir ${videoFiles.length} episodios (Archivos HLS y Base de Datos)...`);

    let borrados = 0;

    for (const vf of videoFiles) {
        // 3. Borrar archivos físicos HLS del disco duro
        const outputFolder = vf.hlsPath || path.resolve(process.env.HLS_PATH || '/home/peliplus_gran_disco/hls', vf.episodeId || vf.contentId || 'unknown');
        
        if (fs.existsSync(outputFolder)) {
            try {
                fs.rmSync(outputFolder, { recursive: true, force: true });
                process.stdout.write(`🗑️  Borrada carpeta HLS: ${outputFolder}\n`);
            } catch (err) {
                console.log(`❌ No se pudo borrar físicamente: ${outputFolder}`);
            }
        }

        borrados++;
    }

    console.log(`\n🎉 ¡COLA VACIADA Y DISCO LIMPIO! No se tocó la base de datos. Se procesaron ${borrados} episodios.`);
    console.log("👉 Ahora puedes usar tu script manual para reprocesarlas tranquilamente sin interrupciones del worker.");
}

nukeSeries().catch(console.error).finally(() => process.exit(0));
