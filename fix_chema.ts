import { prisma } from './src/shared/config/prisma';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log("🧹 Iniciando limpieza de la serie 'Hielo' (El Chema incorrecto)...");
    
    // 1. Encontrar la serie incorrecta
    const wrongSeries = await prisma.content.findFirst({
        where: { tmdbId: "68735", type: 'SERIES' },
        include: { episodes: true }
    });

    if (wrongSeries) {
        console.log(`✅ Serie encontrada en DB con ID: ${wrongSeries.id}. Eliminando...`);
        
        // Eliminar VideoFiles asociados a los episodios
        for (const ep of wrongSeries.episodes) {
            await prisma.videoFile.deleteMany({ where: { episodeId: ep.id } });
        }
        
        // Eliminar Episodios
        await prisma.episode.deleteMany({ where: { contentId: wrongSeries.id } });
        
        // Eliminar Traducciones
        await prisma.contentTranslation.deleteMany({ where: { contentId: wrongSeries.id } });
        
        // Eliminar Calidades
        await prisma.videoQuality.deleteMany({ where: { contentId: wrongSeries.id } });
        
        // Eliminar la serie principal
        await prisma.content.delete({ where: { id: wrongSeries.id } });
        console.log("✅ Serie 'Hielo' eliminada de la base de datos por completo.");
    } else {
        console.log("ℹ️ No se encontró la serie 'Hielo' en la BD. Posiblemente ya la borraste.");
    }

    // 2. Renombrar la carpeta en el disco
    const oldPath = '/home/media/series/68735_El chema';
    const newPath = '/home/media/series/69601_El chema';

    if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log(`✅ Carpeta renombrada de '68735_El chema' a '69601_El chema'.`);
    } else if (fs.existsSync(newPath)) {
        console.log(`ℹ️ La carpeta ya se llama '69601_El chema'. No hay que hacer nada.`);
    } else {
        console.log(`⚠️ No se encontró la carpeta en ${oldPath}. Por favor verifica la ruta manual.`);
    }

    console.log("\n🚀 Todo listo. Ahora solo ejecuta: npx tsx escanear_series.ts");
}

main().catch(console.error).finally(() => process.exit(0));
