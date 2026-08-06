import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
import { FFmpegService } from './src/services/ffmpeg.service';
import fs from 'fs';
import path from 'path';

async function reprocesarSeries() {
    let args = process.argv.slice(2);
    const isForce = args.includes('--force');
    if (isForce) {
        args = args.filter(a => a !== '--force');
    }
    const seriesTitle = args.join(' ').trim();

    console.log(`🔍 Buscando episodios de series para reprocesar silenciosamente (Desde 29 de Julio)...`);
    if (isForce) {
        console.log("⚠️ MODO FUERZA BRUTA (--force) ACTIVADO. Se re-codificará todo el video (SLOW PATH).");
    }

    let whereClause: any = {
        type: 'EPISODE',
        status: { in: ['COMPLETED', 'FAILED', 'QUEUED', 'PENDING', 'PROCESSING'] },
        createdAt: { gte: new Date('2026-07-29T00:00:00.000Z') }
    };

    if (seriesTitle) {
        whereClause.episode = {
            season: {
                content: {
                    translations: { some: { title: { contains: seriesTitle, mode: 'insensitive' } } }
                }
            }
        };
    }

    const videoFiles = await prisma.videoFile.findMany({
        where: whereClause,
        include: {
            episode: {
                include: {
                    season: {
                        include: {
                            content: { include: { translations: true } }
                        }
                    }
                }
            }
        }
    });

    if (videoFiles.length === 0) {
        console.log("❌ No se encontraron episodios.");
        return;
    }

    console.log(`Encontrados ${videoFiles.length} episodios. Procesando uno por uno sin tocar la base de datos...\n`);

    let procesados = 0;

    for (const vf of videoFiles) {
        const title = vf.episode?.season?.content?.translations?.[0]?.title || 'Serie desconocida';
        const seasonNum = vf.episode?.season?.number || '?';
        const epNum = vf.episode?.number || '?';
        
        console.log(`🎬 Procesando: [${title} - T${seasonNum}E${epNum}]`);
        console.log(`   Archivo: ${vf.originalPath}`);

        const outputFolder = vf.hlsPath || path.resolve(process.env.HLS_PATH || '/home/peliplus_gran_disco/hls', vf.episodeId || vf.contentId || 'unknown');

        if (fs.existsSync(outputFolder)) {
            try {
                fs.rmSync(outputFolder, { recursive: true, force: true });
                console.log(`   🗑️ Carpeta HLS anterior borrada.`);
            } catch (err: any) {}
        }

        try {
            await FFmpegService.generateHLS(
                vf.originalPath, 
                outputFolder, 
                (pct) => {
                    process.stdout.write(`\r   ⏳ Progreso FFmpeg: ${pct}%   `);
                }, 
                isForce, 
                'EPISODE'
            );
            console.log(`\n   ✅ HLS regenerado exitosamente.\n`);
            procesados++;
        } catch (err: any) {
            console.log(`\n   ❌ Error procesando: ${err.message}\n`);
        }
    }

    console.log(`🎉 Completado. Se re-procesaron ${procesados} episodios silenciosamente.`);
}

reprocesarSeries().catch(console.error).finally(() => process.exit(0));
