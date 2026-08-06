import 'dotenv/config';
import { prisma } from './src/shared/config/prisma';
import { videoQueue } from './src/shared/config/queue';

async function reprocesarSeries() {
    // Permite pasar el nombre de la serie como argumento, ej: npx tsx reprocesar_series.ts "Soy Luna"
    const args = process.argv.slice(2);
    const seriesTitle = args.join(' ').trim();

    console.log("🔍 Buscando episodios de series para reprocesar...");

    let whereClause: any = {
        type: 'EPISODE',
        status: { in: ['COMPLETED', 'READY', 'FAILED', 'QUEUED'] } // Excluimos PROCESSING para no pisar
    };

    if (seriesTitle) {
        console.log(`Filtro activado: Buscando series que contengan "${seriesTitle}" en su título...`);
        whereClause.content = {
            translations: { some: { title: { contains: seriesTitle, mode: 'insensitive' } } }
        };
    }

    const videoFiles = await prisma.videoFile.findMany({
        where: whereClause,
        include: {
            content: { include: { translations: true } },
            episode: true
        }
    });

    if (videoFiles.length === 0) {
        console.log("❌ No se encontraron episodios para reprocesar con esos criterios.");
        return;
    }

    console.log(`Encontrados ${videoFiles.length} episodios. Añadiendo a la cola de procesamiento (esto tomará unos 30 seg por episodio)...`);

    let encolados = 0;

    for (const vf of videoFiles) {
        const title = vf.content?.translations?.[0]?.title || 'Serie desconocida';
        
        // 1. Enviar el trabajo a BullMQ
        await videoQueue.add('process-video', {
            videoFileId: vf.id,
            contentId: vf.episodeId || vf.contentId,
            type: 'EPISODE',
            videoPath: vf.originalPath
        });

        // 2. Necesitamos poner el VideoFile en QUEUED obligatoriamente, de lo contrario 
        // el Worker lo saltará al ver que dice "COMPLETED" (línea 130 de video.worker.ts).
        // Esto NO altera ni borra la Serie, su título, descripción o fijados.
        if (vf.status !== 'QUEUED') {
            await prisma.videoFile.update({
                where: { id: vf.id },
                data: { status: 'QUEUED' }
            });
        }

        encolados++;
        console.log(`✅ [${title} - T${vf.episode?.seasonNumber}E${vf.episode?.episodeNumber}] Encolado: ${vf.originalPath}`);
    }

    console.log(`\n🎉 Completado. Se enviaron ${encolados} episodios a la cola del servidor de Series.`);
}

reprocesarSeries().catch(console.error).finally(() => process.exit(0));
