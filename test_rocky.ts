import { prisma } from './src/shared/config/prisma';

async function main() {
    const files = await prisma.videoFile.findMany({
        where: { originalPath: { contains: 'Rocky', mode: 'insensitive' } },
        include: { content: true }
    });
    
    if (files.length === 0) {
        console.log("❌ No hay ningún archivo de Rocky en la base de datos.");
    } else {
        files.forEach(f => {
            console.log(`\nRuta: ${f.originalPath}`);
            console.log(`Estado Video: ${f.status}`);
            console.log(`Pelicula creada: ${f.content ? f.content.translations?.[0]?.title ?? 'Sí, pero sin título' : 'No'}`);
            if (f.status === 'PENDING' || f.status === 'QUEUED') {
                console.log(`⚠️ ATENCIÓN: Está atascado en ${f.status}. Si reiniciaste el servidor, la cola de trabajo se borró pero la BD sigue pensando que está en cola.`);
            }
        });
    }
}
main().catch(console.error).finally(() => process.exit(0));
