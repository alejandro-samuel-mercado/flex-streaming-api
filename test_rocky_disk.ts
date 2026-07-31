import fs from 'fs';
import { prisma } from './src/shared/config/prisma';

async function main() {
    const dir = '/home/media/peliculas';
    const files = fs.readdirSync(dir).filter(f => f.toLowerCase().includes('rocky'));
    console.log("Archivos de Rocky encontrados en el disco duro:");
    console.log(files);

    const rejections = await prisma.rejectedImport.findMany({
        where: { fileName: { contains: 'Rocky', mode: 'insensitive' } }
    });
    
    if (rejections.length > 0) {
        console.log("\n❌ Películas de Rocky RECHAZADAS por el sistema (errores TMDB):");
        rejections.forEach(r => console.log(`- ${r.fileName}: ${r.reason}`));
    } else {
        console.log("\n✅ No hay películas de Rocky en la lista de rechazadas.");
    }
}
main().catch(console.error).finally(() => process.exit(0));
