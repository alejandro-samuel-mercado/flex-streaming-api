import { prisma } from './src/shared/config/prisma';

async function main() {
    const files = await prisma.videoFile.findMany({
        where: { originalPath: { contains: 'Guardianes', mode: 'insensitive' } },
        include: { qualities: true }
    });
    
    files.forEach(f => {
        console.log(`Pelicula: ${f.originalPath}`);
        console.log(`Estado: ${f.status}`);
        console.log(`Cualidades: ${f.qualities.length}`);
        if (f.qualities.length > 0) {
            console.log(`Primer calidad codec: ${f.qualities[0].codec}`);
        }
    });
}
main().catch(console.error).finally(() => process.exit(0));
