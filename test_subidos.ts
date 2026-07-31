import fs from 'fs';
import { prisma } from './src/shared/config/prisma';

async function main() {
    const dir = '/home/peliplus_gran_disco/videos_subidos';
    let files: string[] = [];
    try {
        files = fs.readdirSync(dir).filter(f => f.toLowerCase().includes('rocky') || f.toLowerCase().includes('callejero') || f.toLowerCase().includes('princesas'));
    } catch(e) {}
    console.log("Archivos encontrados en videos_subidos:");
    console.log(files);

    const filesEnMedia = fs.readdirSync('/home/media/peliculas').filter(f => f.toLowerCase().includes('rocky') || f.toLowerCase().includes('callejero') || f.toLowerCase().includes('princesas'));
    console.log("Archivos encontrados en /home/media/peliculas:");
    console.log(filesEnMedia);

    // Búsqueda profunda en la base de datos por todos los nombres que dio el usuario
    const dbFiles = await prisma.videoFile.findMany({
        where: {
            OR: [
                { originalPath: { contains: 'Rocky', mode: 'insensitive' } },
                { originalPath: { contains: 'callejero', mode: 'insensitive' } },
                { originalPath: { contains: 'princesas', mode: 'insensitive' } }
            ]
        },
        include: { content: { include: { translations: true } } }
    });

    console.log("\nRegistros en la base de datos:");
    dbFiles.forEach(f => {
        console.log(`- ${f.originalPath} | Estado: ${f.status} | Creado: ${f.createdAt.toISOString().split('T')[0]}`);
    });
}
main().catch(console.error).finally(() => process.exit(0));
