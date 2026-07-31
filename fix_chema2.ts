import { prisma } from './src/shared/config/prisma';
import fs from 'fs';

async function main() {
    console.log("🧹 Iniciando limpieza de la serie china '倾城绝恋' (ID 69601)...");
    
    // 1. Encontrar la serie china
    const wrongSeries = await prisma.content.findFirst({
        where: { tmdbId: "69601", type: 'SERIES' },
        include: { seasons: { include: { episodes: true } } }
    });

    if (wrongSeries) {
        console.log(`✅ Serie china encontrada en DB con ID: ${wrongSeries.id}. Eliminando...`);
        
        const episodeIds = wrongSeries.seasons.flatMap((s: any) => s.episodes.map((e: any) => e.id));
        if (episodeIds.length > 0) {
            await prisma.videoFile.deleteMany({ where: { episodeId: { in: episodeIds } } });
        }
        await prisma.content.delete({ where: { id: wrongSeries.id } });
        console.log("✅ Serie china eliminada.");
    }

    // 2. Limpiar cualquier VideoFile atascado en PENDING o QUEUED de la carpeta antigua
    await prisma.videoFile.deleteMany({
        where: { originalPath: { contains: '69601_El chema' } }
    });

    // 3. Renombrar la carpeta al ID CORRECTO
    const oldPath = '/home/media/series/69601_El chema';
    const newPath = '/home/media/series/69205_El chema'; // <-- EL ID REAL!

    if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log(`✅ Carpeta renombrada a '69205_El chema'.`);
    } else if (fs.existsSync(newPath)) {
        console.log(`ℹ️ La carpeta ya se llama '69205_El chema'.`);
    }

    console.log("\n🚀 Todo listo. Ahora sí, lanza el escáner final: npx tsx escanear_series.ts");
}

main().catch(console.error).finally(() => process.exit(0));
